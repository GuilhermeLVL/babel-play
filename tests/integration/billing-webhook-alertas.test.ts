/**
 * O WEBHOOK QUE FALHA TEM DE CHEGAR A ALGUÉM (auditoria de 15/10/2026, correção de alto valor 1).
 *
 * 1. `billing_webhook_token_invalido` era `warn` fora de `AVISOS_QUE_ALERTAM`: um token errado — ou
 *    a troca do token feita pela metade — derrubava a fila do Asaas (15 falhas seguidas a param) sem
 *    ninguém saber. Agora o aviso vai aos destinos externos (Sentry).
 * 2. O corpo "fora da forma" respondia 200 SEM log e sem registro: se o Asaas mudasse o payload, os
 *    eventos sumiam sem rastro. Continua 200 (corpo estranho não é motivo para o Asaas reentregar para
 *    sempre), mas agora sai um `log('error')` com o tipo do evento e os ids — e nenhum dado pessoal do
 *    corpo (nome, CPF, e-mail do pagador).
 */
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from 'vitest'

import { type EphemeralDb, setupEphemeralDb } from '../harness/ephemeralDb'

let h: EphemeralDb
let asaasWebhookRouter: any
let logger: any

const SEGREDO = 'segredo-webhook-alertas'

function handler(): (req: any, res: any) => Promise<void> {
  const camada = asaasWebhookRouter.stack.find((l: any) => l.route?.path === '/' && l.route?.methods?.post)
  return camada.route.stack[0].handle
}
function mockRes(): any {
  const r: any = { statusCode: 200, body: undefined }
  r.status = (c: number) => {
    r.statusCode = c
    return r
  }
  r.json = (b: any) => {
    r.body = b
    return r
  }
  return r
}
const req = (body: unknown, token: string | undefined = SEGREDO) => ({
  body,
  header: (k: string) => (k.toLowerCase() === 'asaas-access-token' ? token : undefined),
})

beforeAll(async () => {
  h = await setupEphemeralDb()
  process.env.AUTH_REQUIRED = '1'
  process.env.ASAAS_WEBHOOK_TOKEN = SEGREDO
  ;({ asaasWebhookRouter } = (await h.load('../../server/routes/billing')) as any)
  logger = await h.load('../../server/lib/logger')
})
afterAll(async () => {
  delete process.env.AUTH_REQUIRED
  delete process.env.ASAAS_WEBHOOK_TOKEN
  await h.cleanup()
})
afterEach(() => vi.restoreAllMocks())

describe('o token inválido alerta', () => {
  it('billing_webhook_token_invalido está entre os avisos que chegam ao Sentry', () => {
    expect(logger.AVISOS_QUE_ALERTAM.has('billing_webhook_token_invalido')).toBe(true)
  })

  it('o token errado chega ao destino externo, e a resposta segue 401', async () => {
    const recebidos: Array<Record<string, unknown>> = []
    const tirar = logger.registrarSinkDeErro((e: Record<string, unknown>) => recebidos.push(e))
    vi.spyOn(console, 'warn').mockImplementation(() => {})
    try {
      const res = mockRes()
      await handler()(req({ id: 'evt_token', event: 'PAYMENT_CONFIRMED' }, 'token-errado'), res)
      expect(res.statusCode).toBe(401)
    } finally {
      tirar()
    }
    expect(recebidos.map((e) => e.event)).toContain('billing_webhook_token_invalido')
  })
})

describe('o corpo fora da forma deixa rastro', () => {
  it('responde 200 e registra log(error) com o tipo e os ids, sem dado pessoal', async () => {
    const recebidos: Array<Record<string, unknown>> = []
    const tirar = logger.registrarSinkDeErro((e: Record<string, unknown>) => recebidos.push(e))
    const erros = vi.spyOn(console, 'error').mockImplementation(() => {})
    const corpo = {
      // `id` curto demais: a forma recusa (min 4) — como se o Asaas tivesse mudado o payload.
      id: 'e1',
      event: 'PAYMENT_CONFIRMED',
      payment: {
        id: 'pay_fora_da_forma',
        subscription: 'sub_fora_da_forma',
        value: 'dezenove e noventa',
        customer: 'cus_123',
        name: 'Fulana de Tal',
        cpfCnpj: '24971563792',
        email: 'fulana@exemplo.com',
      },
    }
    try {
      const res = mockRes()
      await handler()(req(corpo), res)
      expect(res.statusCode).toBe(200)
      expect(res.body).toMatchObject({ ok: false, motivo: 'corpo fora da forma' })
    } finally {
      tirar()
    }
    const doEvento = recebidos.filter((e) => e.event === 'billing_webhook_corpo_fora_da_forma')
    expect(doEvento, 'o erro chega ao destino externo').toHaveLength(1)
    expect(doEvento[0].level).toBe('error')
    const texto = JSON.stringify(doEvento[0])
    expect(texto).toContain('PAYMENT_CONFIRMED')
    expect(texto).toContain('pay_fora_da_forma')
    expect(texto).toContain('sub_fora_da_forma')
    for (const pessoal of ['Fulana', '24971563792', 'fulana@exemplo.com', 'dezenove']) {
      expect(texto, `sem "${pessoal}" no log`).not.toContain(pessoal)
    }
    const linhas = erros.mock.calls.map((c) => String(c[0])).join('\n')
    expect(linhas).toContain('billing_webhook_corpo_fora_da_forma')
    expect(linhas).not.toContain('Fulana')
  })
})
