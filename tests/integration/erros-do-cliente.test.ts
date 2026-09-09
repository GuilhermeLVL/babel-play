/**
 * ERROS DO CLIENTE (E4) — o funil que tira o erro do navegador do console e o põe no diário.
 *
 * Os contratos presos: campos em allowlist com teto de tamanho (nada de payload do usuário no
 * diário), avalanche contida por usuário (laço de erro no cliente não vira incidente no servidor),
 * e o formato que chega ao logger é o mesmo dos erros de servidor — um leitor só para os dois.
 *
 * O ARQUIVO MUDOU DE FORMA NA FASE 5, e o motivo é o assunto do teste. O teto por usuário deixou de
 * ser um `Map` no heap e passou a ser contado no banco (`server/routes/erros.ts`), porque com N
 * instâncias o `Map` dava teto de 10 × N. Um teto que vive no banco não pode ser exercitado
 * chamando o handler direto pelo `router.stack`: ele agora é um middleware, e precisa de um banco.
 * Então aqui o router é montado num Express de verdade, sobre o banco efêmero, e as requisições
 * entram por HTTP — que é como elas entram em produção.
 */
import express from 'express'
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from 'vitest'

import { asUserId } from '../../server/lib/authContext'
import { type EphemeralDb, setupEphemeralDb } from '../harness/ephemeralDb'

let h: EphemeralDb
let base: string
let fechar: () => Promise<void>
/** O usuário que o middleware falso injeta na próxima requisição. */
let usuarioAtual = 'u-erros'

beforeAll(async () => {
  h = await setupEphemeralDb()
  const { errosRouter } = await h.load<{ errosRouter: express.Router }>('../../server/routes/erros')

  const app = express()
  app.use(express.json())
  /* O `authMiddleware` real não entra aqui: o que esta rota precisa dele é só `req.userId`, que é
     a chave do teto (`chaveDoRequest`). Injetar direto mantém o teste sobre a ROTA. */
  app.use((req, _res, next) => {
    ;(req as express.Request & { userId: unknown }).userId = asUserId(usuarioAtual)
    ;(req as express.Request & { requestId: string }).requestId = 'req-x'
    next()
  })
  app.use('/api/erros-do-cliente', errosRouter)

  const servidor = await new Promise<import('node:http').Server>((r) => {
    const s = app.listen(0, '127.0.0.1', () => r(s))
  })
  const addr = servidor.address()
  base = `http://127.0.0.1:${typeof addr === 'object' && addr ? addr.port : 0}`
  fechar = () => new Promise<void>((r) => servidor.close(() => r()))
})

afterAll(async () => {
  await fechar()
  await h.cleanup()
})
afterEach(() => vi.restoreAllMocks())

const valido = { id: 'e-abc123', tipo: 'render', mensagem: 'Cannot read properties of undefined' }

async function reportar(body: unknown, usuario = 'u-erros'): Promise<Response> {
  usuarioAtual = usuario
  return await fetch(`${base}/api/erros-do-cliente`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  })
}

describe('POST /api/erros-do-cliente', () => {
  it('relatório válido vira linha de ERRO no logger, com o id visível', async () => {
    const spy = vi.spyOn(console, 'error').mockImplementation(() => {})
    const r = await reportar(valido, 'u-log')
    expect(r.status).toBe(202)
    const linha = spy.mock.calls.map((c) => String(c[0])).find((l) => l.includes('erro_do_cliente'))
    expect(linha, 'o evento chega ao mesmo funil dos erros de servidor').toBeTruthy()
    expect(linha).toContain('e-abc123')
  })

  it('payload fora da forma → 400 (mensagem gigante não entra no diário)', async () => {
    const r = await reportar({ ...valido, mensagem: 'x'.repeat(5_000) }, 'u-forma')
    expect(r.status).toBe(400)
  })

  it('id fora do formato → 400 (o id aparece em tela e em log; formato é contrato)', async () => {
    const r = await reportar({ ...valido, id: '<script>alert(1)</script>' }, 'u-id')
    expect(r.status).toBe(400)
  })

  it('AVALANCHE: acima do teto por usuário, aceita (202) mas NÃO loga', async () => {
    const spy = vi.spyOn(console, 'error').mockImplementation(() => {})
    for (let i = 0; i < 30; i++) {
      await reportar({ ...valido, id: `e-avalanche-${i}` }, 'u-avalanche')
    }
    const logadas = spy.mock.calls.filter((c) => String(c[0]).includes('e-avalanche')).length
    expect(logadas, 'um cliente em laço de erro não pode inundar o diário').toBeLessThanOrEqual(10)
    // E a resposta continua 202: o cliente não deve reagir a reporte recusado.
    const r = await reportar({ ...valido, id: 'e-avalanche-final' }, 'u-avalanche')
    expect(r.status).toBe(202)
  })

  it('o teto é POR USUÁRIO: quem não gastou nada continua sendo ouvido', async () => {
    const spy = vi.spyOn(console, 'error').mockImplementation(() => {})
    for (let i = 0; i < 15; i++) await reportar({ ...valido, id: `e-barulhento-${i}` }, 'u-barulhento')
    await reportar({ ...valido, id: 'e-silencioso-1' }, 'u-silencioso')
    expect(spy.mock.calls.map((c) => String(c[0])).some((l) => l.includes('e-silencioso-1'))).toBe(true)
  })

  it('a contagem vai para o BANCO, no balde próprio — é isso que a torna comum às instâncias', async () => {
    const { usageCountersRepo } = await h.load<any>('../../server/db/repositories/usageCounters')
    const { METRIC_RATELIMIT_ERROS } = await h.load<any>('../../server/lib/rateLimitStore')
    await reportar({ ...valido, id: 'e-contado-1' }, 'u-contado')
    await reportar({ ...valido, id: 'e-contado-2' }, 'u-contado')
    /* O balde é `rl:<janela>`, com a janela de 60 s (`rateLimitStore.ts`). O teste não recalcula a
       fórmula: pergunta pelo balde de agora, que é onde as duas requisições acabaram de cair. */
    const balde = `rl:${Math.floor(Date.now() / 60_000)}`
    expect(await usageCountersRepo.get(asUserId('u:u-contado'), METRIC_RATELIMIT_ERROS, balde)).toBe(2)
  })
})
