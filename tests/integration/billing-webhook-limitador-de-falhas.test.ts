/**
 * S26-12 (auditoria de segurança de 26/09/2026) — O 401 DO WEBHOOK ENTRA NO LIMITADOR DE FALHAS.
 *
 * O webhook do Asaas é montado ANTES do `authMiddleware` (o Asaas não tem JWT de ninguém) e, por
 * isso, antes também do limitador de falhas de autenticação do `/api`. Quem tentava adivinhar o
 * `asaas-access-token` só encontrava o teto de escrita por IP (120 por minuto): 172.800 palpites
 * por dia, por IP, sem nunca ser barrado por ERRAR. Agora o próprio router do webhook conta os 401
 * no mesmo balde das falhas de auth (30 por 15 minutos, por IP).
 *
 * O servidor aqui é o de verdade (`criarApp()`), porque a ordem de montagem é o que está em teste.
 */
import { afterAll, beforeAll, describe, expect, it } from 'vitest'

import { type AppDeTeste, subirApp } from '../caracterizacao/_app'

let s: AppDeTeste
const salvo: Record<string, string | undefined> = {}

const SEGREDO = 'segredo-webhook-limitador'
const WEBHOOK = '/api/billing/webhook/asaas'
const IP_ATACANTE = '198.51.100.40'
const IP_DO_ASAAS = '198.51.100.50'

/** Evento sem `externalReference`: auditado, sem efeito e sem consulta ao Asaas. */
const evento = (id: string) => ({ id, event: 'PAYMENT_CREATED', payment: { id: `pay_${id}` } })

async function falhasContadas(): Promise<number> {
  const { client } = await s.load('../../server/db/db')
  const r = await client.execute(
    `select coalesce(sum(count), 0) as n from usage_counters where metric = 'ratelimit:auth'`,
  )
  return Number(r.rows[0]?.n ?? 0)
}

beforeAll(async () => {
  for (const k of ['TRUST_PROXY', 'ASAAS_WEBHOOK_TOKEN', 'ASAAS_API_KEY']) salvo[k] = process.env[k]
  process.env.TRUST_PROXY = '1'
  process.env.ASAAS_WEBHOOK_TOKEN = SEGREDO
  // '' e não `delete`: o dotenv repõe a variável apagada.
  process.env.ASAAS_API_KEY = ''
  s = await subirApp({ modo: 'publico' })
}, 60_000)

afterAll(async () => {
  await s.encerrar()
  for (const [k, v] of Object.entries(salvo)) {
    if (v === undefined) delete process.env[k]
    else process.env[k] = v
  }
})

describe('webhook do Asaas × limitador de falhas de autenticação', () => {
  it('token certo nunca soma no balde de falhas', async () => {
    for (let i = 0; i < 5; i++) {
      const r = await s.chamar('POST', WEBHOOK, {
        body: evento(`evt_lim_ok_${i}`),
        headers: { 'asaas-access-token': SEGREDO, 'x-forwarded-for': IP_DO_ASAAS },
      })
      expect(r.status).toBe(200)
    }
    expect(await falhasContadas()).toBe(0)
  })

  it('token errado repetido do mesmo IP acaba em 429, no envelope de erro e com Retry-After', async () => {
    let primeira429 = 0
    let resposta429: Response | undefined
    for (let i = 1; i <= 40; i++) {
      const r = await s.chamar('POST', WEBHOOK, {
        body: evento(`evt_lim_x_${i}`),
        headers: { 'asaas-access-token': `palpite-${i}`, 'x-forwarded-for': IP_ATACANTE },
      })
      if (r.status === 429) {
        primeira429 = i
        resposta429 = r
        break
      }
      expect(r.status, `a tentativa ${i} ainda está dentro do teto`).toBe(401)
    }
    expect(primeira429, 'o teto é de 30 falhas').toBeGreaterThanOrEqual(31)
    expect(primeira429).toBeLessThanOrEqual(32)
    expect(resposta429?.headers.get('retry-after')).toMatch(/^\d+$/)
    expect((await resposta429?.json())?.code).toBe('muitas_falhas_de_autenticacao')
  }, 60_000)

  it('barrado, o atacante não passa nem com o token CERTO até a janela virar (o palpite seguinte não é avaliado)', async () => {
    const r = await s.chamar('POST', WEBHOOK, {
      body: evento('evt_lim_depois'),
      headers: { 'asaas-access-token': SEGREDO, 'x-forwarded-for': IP_ATACANTE },
    })
    expect(r.status).toBe(429)
  })

  it('o bloqueio é do IP que errou: o Asaas, de outro IP, continua entregando', async () => {
    const r = await s.chamar('POST', WEBHOOK, {
      body: evento('evt_lim_asaas'),
      headers: { 'asaas-access-token': SEGREDO, 'x-forwarded-for': IP_DO_ASAAS },
    })
    expect(r.status).toBe(200)
  })
})
