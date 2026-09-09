/**
 * TODA LINHA DE LOG EMITIDA DENTRO DE UM REQUEST CARREGA O `requestId` — sem o chamador saber.
 *
 * O NÚMERO QUE MOTIVOU ISTO, medido em 2026-09-09 varrendo `server/**` + `server.ts` com os
 * comentários descontados: das **45** chamadas de `log()`, **23 não passavam `requestId`**. E a
 * lista de quem não passava explica por que pedir disciplina não resolveria — `storageQuota.ts`
 * (4), `usageQuota.ts` (5), `bootStatus.ts` (3), `entitlements.ts`,
 * `db/repositories/credentials.ts`: nenhuma dessas funções tem um `Request` em mãos. O parâmetro
 * teria de atravessar a assinatura da camada inteira só para carregar telemetria.
 *
 * A correção é o `AsyncLocalStorage` aberto por `requestIdMiddleware` e lido dentro de `log()`
 * (server/lib/requestId.ts + server/lib/logger.ts). Este teste exercita o caminho DE VERDADE —
 * servidor Express numa porta efêmera, o middleware real, e uma função de domínio que só recebe
 * uma string, como as 23 acima — em vez de conferir que a linha existe no arquivo.
 *
 * A CONCORRÊNCIA É O CASO QUE IMPORTA. A alternativa barata (uma variável de módulo com "o id
 * atual") passa num teste sequencial e mente com dois requests em voo, atribuindo a linha ao
 * request errado. Por isso o terceiro caso dispara as duas requisições ao mesmo tempo, com o lado
 * lento segurando o contexto enquanto o rápido termina.
 */
import type { Server } from 'node:http'

import express from 'express'
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from 'vitest'

import { log } from '../../server/lib/logger'
import { comRequestId, requestIdMiddleware } from '../../server/lib/requestId'

/**
 * O papel das 23 chamadas sem `requestId`: uma função de domínio, longe do HTTP, que recebe só o
 * que precisa para trabalhar e mesmo assim precisa aparecer correlacionada no diário.
 */
async function funcaoDeDominioProfunda(atraso: number): Promise<void> {
  await new Promise((r) => setTimeout(r, atraso))
  log('warn', { event: 'dominio_profundo' })
}

let servidor: Server
let base: string

beforeAll(async () => {
  const app = express()
  app.use(requestIdMiddleware)
  app.get('/fundo', async (req, res) => {
    const atraso = Number(req.query.atraso ?? 0)
    await funcaoDeDominioProfunda(atraso)
    res.json({ ok: true })
  })
  app.get('/explicito', (_req, res) => {
    log('warn', { event: 'explicito', requestId: 'id-escolhido-a-mao' })
    res.json({ ok: true })
  })
  await new Promise<void>((r) => {
    servidor = app.listen(0, '127.0.0.1', () => r())
  })
  const addr = servidor.address()
  base = `http://127.0.0.1:${typeof addr === 'object' && addr ? addr.port : 0}`
})

afterAll(async () => {
  await new Promise<void>((r) => servidor.close(() => r()))
})

afterEach(() => vi.restoreAllMocks())

/** As linhas JSON que o `log()` escreveu no console durante o espião. */
function linhas(espiao: ReturnType<typeof vi.spyOn>): Array<Record<string, unknown>> {
  return espiao.mock.calls.map((c: unknown[]) => JSON.parse(c[0] as string) as Record<string, unknown>)
}

describe('requestId implícito no logger', () => {
  it('preenche o id numa função de domínio que NUNCA o recebeu', async () => {
    const espiao = vi.spyOn(console, 'warn').mockImplementation(() => {})
    const r = await fetch(`${base}/fundo`)
    const doHeader = r.headers.get('x-request-id')
    expect(doHeader).toBeTruthy()

    const [linha] = linhas(espiao)
    expect(linha.event).toBe('dominio_profundo')
    // O MESMO id do header: é isso que permite ao usuário reportar um problema e o operador achar
    // exatamente aquele request no diário.
    expect(linha.requestId).toBe(doHeader)
  })

  it('respeita o id vindo de fora (x-request-id), para encadear com proxy/CDN', async () => {
    const espiao = vi.spyOn(console, 'warn').mockImplementation(() => {})
    await fetch(`${base}/fundo`, { headers: { 'x-request-id': 'do-proxy-123' } })
    expect(linhas(espiao)[0].requestId).toBe('do-proxy-123')
  })

  it('dois requests EM VOO ao mesmo tempo não trocam de id', async () => {
    const espiao = vi.spyOn(console, 'warn').mockImplementation(() => {})
    // O lento entra primeiro e só loga depois de o rápido ter entrado, logado e saído: com uma
    // variável de módulo no lugar do AsyncLocalStorage, o lento sairia com o id do rápido.
    const [lento, rapido] = await Promise.all([
      fetch(`${base}/fundo?atraso=60`, { headers: { 'x-request-id': 'lento' } }),
      fetch(`${base}/fundo?atraso=0`, { headers: { 'x-request-id': 'rapido' } }),
    ])
    expect(lento.status).toBe(200)
    expect(rapido.status).toBe(200)
    const ids = linhas(espiao).map((l) => l.requestId)
    expect(ids).toHaveLength(2)
    // O rápido loga primeiro; a ordem é o que prova que os contextos se cruzaram no tempo.
    expect(ids).toEqual(['rapido', 'lento'])
  })

  it('o EXPLÍCITO ganha do implícito — quem carimba um id próprio continua mandando', async () => {
    const espiao = vi.spyOn(console, 'warn').mockImplementation(() => {})
    const r = await fetch(`${base}/explicito`, { headers: { 'x-request-id': 'do-middleware' } })
    expect(r.headers.get('x-request-id')).toBe('do-middleware')
    expect(linhas(espiao)[0].requestId).toBe('id-escolhido-a-mao')
  })

  it('FORA de um request não inventa id — boot, cron e worker não têm requisição nenhuma', () => {
    const espiao = vi.spyOn(console, 'warn').mockImplementation(() => {})
    log('warn', { event: 'no_boot' })
    expect(linhas(espiao)[0]).not.toHaveProperty('requestId')
  })

  it('`comRequestId` correlaciona trabalho fora do HTTP sem subir servidor', async () => {
    const espiao = vi.spyOn(console, 'warn').mockImplementation(() => {})
    await comRequestId('tarefa-de-fundo', () => funcaoDeDominioProfunda(0))
    expect(linhas(espiao)[0].requestId).toBe('tarefa-de-fundo')
  })

  it('a redação do erro continua valendo com o id implícito por cima', async () => {
    // F5 acabou de ligar `redigirErro` nos campos `error`/`stack`; o id implícito não pode ter
    // passado por cima disso — as duas coisas mexem no mesmo objeto de saída.
    const espiao = vi.spyOn(console, 'error').mockImplementation(() => {})
    await comRequestId('com-segredo', () => {
      log('error', { event: 'falhou', error: 'Failed query: insert into "t"\nparams: 2,cpf-do-usuario' })
    })
    const linha = linhas(espiao)[0]
    expect(linha.requestId).toBe('com-segredo')
    expect(String(linha.error)).toContain('[redigido]')
    expect(String(linha.error)).not.toContain('cpf-do-usuario')
  })
})
