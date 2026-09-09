/**
 * ERROS DO CLIENTE (E4) — o funil que tira o erro do navegador do console e o põe no diário.
 *
 * Os contratos presos: campos em allowlist com teto de tamanho (nada de payload do usuário no
 * diário), avalanche contida por usuário (laço de erro no cliente não vira incidente no servidor),
 * e o formato que chega ao logger é o mesmo dos erros de servidor — um leitor só para os dois.
 */
import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest'

import { asUserId } from '../../server/lib/authContext'

let errosRouter: any

function handler(): (req: any, res: any) => void {
  const camada = errosRouter.stack.find((l: any) => l.route?.path === '/' && l.route?.methods?.post)
  return camada.route.stack[0].handle
}
function mockRes(): any {
  const r: any = { statusCode: 200, body: undefined }
  r.status = (c: number) => { r.statusCode = c; return r }
  r.json = (b: any) => { r.body = b; return r }
  return r
}
const req = (body: unknown, u = 'u-erros') => ({ userId: asUserId(u), body, requestId: 'req-x' })

beforeAll(async () => {
  ;({ errosRouter } = await import('../../server/routes/erros'))
})
afterEach(() => vi.restoreAllMocks())

const valido = { id: 'e-abc123', tipo: 'render', mensagem: 'Cannot read properties of undefined' }

describe('POST /api/erros-do-cliente', () => {
  it('relatório válido vira linha de ERRO no logger, com o id visível', () => {
    const spy = vi.spyOn(console, 'error').mockImplementation(() => {})
    const res = mockRes()
    handler()(req(valido, 'u-log'), res)
    expect(res.statusCode).toBe(202)
    const linha = spy.mock.calls.map((c) => String(c[0])).find((l) => l.includes('erro_do_cliente'))
    expect(linha, 'o evento chega ao mesmo funil dos erros de servidor').toBeTruthy()
    expect(linha).toContain('e-abc123')
  })

  it('payload fora da forma → 400 (mensagem gigante não entra no diário)', () => {
    const res = mockRes()
    handler()(req({ ...valido, mensagem: 'x'.repeat(5_000) }), res)
    expect(res.statusCode).toBe(400)
  })

  it('id fora do formato → 400 (o id aparece em tela e em log; formato é contrato)', () => {
    const res = mockRes()
    handler()(req({ ...valido, id: '<script>alert(1)</script>' }), res)
    expect(res.statusCode).toBe(400)
  })

  it('AVALANCHE: acima do teto por usuário, aceita (202) mas NÃO loga', () => {
    const spy = vi.spyOn(console, 'error').mockImplementation(() => {})
    for (let i = 0; i < 30; i++) {
      handler()(req({ ...valido, id: `e-avalanche-${i}` }, 'u-avalanche'), mockRes())
    }
    const logadas = spy.mock.calls.filter((c) => String(c[0]).includes('u-avalanche') || String(c[0]).includes('e-avalanche')).length
    expect(logadas, 'um cliente em laço de erro não pode inundar o diário').toBeLessThanOrEqual(10)
    // E a resposta continua 202: o cliente não deve reagir a reporte recusado.
    const res = mockRes()
    handler()(req({ ...valido, id: 'e-avalanche-final' }, 'u-avalanche'), res)
    expect(res.statusCode).toBe(202)
  })
})
