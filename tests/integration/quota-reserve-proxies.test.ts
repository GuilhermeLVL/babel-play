/**
 * SaaS — os proxies RESERVAM antes de chamar o provedor e ESTORNAM se ele falhar (P0-1).
 *
 * O teste que importa é o de concorrência: ele mede quantas vezes o upstream foi
 * REALMENTE chamado. Antes da correção, 20 requisições simultâneas contra um teto de 5
 * resultavam em 20 chamadas pagas (docs/audit/04-scalability.md §3).
 */
import { describe, it, expect, beforeAll, afterAll, afterEach, vi } from 'vitest'
import { setupEphemeralDb, type EphemeralDb } from '../harness/ephemeralDb'
import { asUserId } from '../../server/lib/authContext'

let h: EphemeralDb
let mt: any
let stt: any
let subs: any
let counters: any

beforeAll(async () => {
  h = await setupEphemeralDb()
  ;({ mtTranslateProxy: mt } = await h.load('../../server/ai/mtProxy'))
  ;({ sttTranscribeProxy: stt } = await h.load('../../server/ai/sttProxy'))
  ;({ subscriptionsRepo: subs } = await h.load('../../server/db/repositories/subscriptions'))
  ;({ usageCountersRepo: counters } = await h.load('../../server/db/repositories/usageCounters'))
})
afterAll(async () => { await h.cleanup() })
afterEach(() => {
  delete process.env.AUTH_REQUIRED
  delete process.env.PRO_MONTHLY_MANAGED_CALLS
  vi.restoreAllMocks()
})

function fakeRes() {
  const r: any = { statusCode: 200, body: undefined, headersSent: false }
  r.status = (c: number) => { r.statusCode = c; return r }
  r.json = (b: any) => { r.body = b; r.headersSent = true; return r }
  return r
}
const janela = () => new Date().toISOString().slice(0, 7)
const usado = (u: any) => counters.get(u, 'managed_calls', janela())

/** Resposta OK do Groq no formato OpenAI. */
const okGroq = () => ({
  ok: true, status: 200,
  json: async () => ({ choices: [{ message: { content: 'olá' } }] }),
  text: async () => '',
})

describe('mtProxy — reserva e estorno', () => {
  it('sucesso consome exatamente 1 da quota', async () => {
    process.env.AUTH_REQUIRED = '1'
    process.env.PRO_MONTHLY_MANAGED_CALLS = '10'
    const u = asUserId('mtp-ok')
    await subs.upsert(u, { plan: 'pro', status: 'active' })
    process.env.GROQ_API_KEY = 'k'
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(okGroq() as any)

    const res = fakeRes()
    await mt({ userId: u, body: { text: 'hi', tgt: 'pt' } } as any, res)

    expect(res.statusCode).toBe(200)
    expect(await usado(u)).toBe(1)
  })

  it('provedor falhou → a reserva é ESTORNADA (usuário não perde a vaga)', async () => {
    process.env.AUTH_REQUIRED = '1'
    process.env.PRO_MONTHLY_MANAGED_CALLS = '10'
    const u = asUserId('mtp-falha')
    await subs.upsert(u, { plan: 'pro', status: 'active' })
    process.env.GROQ_API_KEY = 'k'
    vi.spyOn(globalThis, 'fetch').mockResolvedValue({
      ok: false, status: 500, text: async () => 'upstream caiu',
    } as any)

    const res = fakeRes()
    await mt({ userId: u, body: { text: 'hi', tgt: 'pt' } } as any, res)

    expect(res.statusCode).toBe(502)
    expect(await usado(u)).toBe(0) // estornado
  })

  it('exceção de rede → a reserva é ESTORNADA', async () => {
    process.env.AUTH_REQUIRED = '1'
    process.env.PRO_MONTHLY_MANAGED_CALLS = '10'
    const u = asUserId('mtp-rede')
    await subs.upsert(u, { plan: 'pro', status: 'active' })
    process.env.GROQ_API_KEY = 'k'
    vi.spyOn(globalThis, 'fetch').mockRejectedValue(new Error('ECONNRESET'))

    const res = fakeRes()
    await mt({ userId: u, body: { text: 'hi', tgt: 'pt' } } as any, res)

    expect(res.statusCode).toBe(502)
    expect(await usado(u)).toBe(0)
  })

  /** O teste do dinheiro: o cenário exato medido na auditoria. */
  it('20 requisições SIMULTÂNEAS contra teto 5 → 5 aceitas e só 5 chamadas ao provedor', async () => {
    process.env.AUTH_REQUIRED = '1'
    process.env.PRO_MONTHLY_MANAGED_CALLS = '5'
    const u = asUserId('mtp-corrida')
    await subs.upsert(u, { plan: 'pro', status: 'active' })
    process.env.GROQ_API_KEY = 'k'
    const fetchSpy = vi.spyOn(globalThis, 'fetch').mockResolvedValue(okGroq() as any)

    const respostas = await Promise.all(Array.from({ length: 20 }, () => {
      const res = fakeRes()
      return mt({ userId: u, body: { text: 'hi', tgt: 'pt' } } as any, res).then(() => res)
    }))

    expect(respostas.filter((r) => r.statusCode === 200)).toHaveLength(5)
    expect(respostas.filter((r) => r.statusCode === 402)).toHaveLength(15)
    expect(fetchSpy).toHaveBeenCalledTimes(5) // ← dinheiro: 5 chamadas pagas, não 20
    expect(await usado(u)).toBe(5)
  })
})

describe('sttProxy — reserva e estorno', () => {
  it('BYOK (chave do usuário) NÃO consome a quota gerenciada', async () => {
    process.env.AUTH_REQUIRED = '1'
    process.env.PRO_MONTHLY_MANAGED_CALLS = '10'
    const u = asUserId('sttp-byok')
    await subs.upsert(u, { plan: 'pro', status: 'active' })

    const { credentialsRepo } = await h.load('../../server/db/repositories/credentials') as any
    const cred = await credentialsRepo.create(u, {
      // example.com é reservado pela IANA e sempre resolve — `assertPublicUrl` faz DNS real.
      label: 'minha', kind: 'openai', baseUrl: 'https://example.com/v1', secret: 'sk-do-usuario',
    })
    vi.spyOn(globalThis, 'fetch').mockResolvedValue({
      ok: true, status: 200, json: async () => ({ text: 'oi' }), text: async () => '',
    } as any)

    const res = fakeRes()
    await stt({
      userId: u, body: Buffer.from([1, 2, 3]),
      header: (n: string) => (n === 'x-credential-id' ? cred.id : undefined),
    } as any, res)

    expect(res.statusCode).toBe(200)
    expect(await usado(u)).toBe(0) // a chave é do usuário — não é uso gerenciado
  })

  it('gerenciado: provedor falhou → reserva ESTORNADA', async () => {
    process.env.AUTH_REQUIRED = '1'
    process.env.PRO_MONTHLY_MANAGED_CALLS = '10'
    const u = asUserId('sttp-falha')
    await subs.upsert(u, { plan: 'pro', status: 'active' })
    process.env.GROQ_API_KEY = 'k'
    vi.spyOn(globalThis, 'fetch').mockResolvedValue({
      ok: false, status: 503, text: async () => 'indisponível',
    } as any)

    const res = fakeRes()
    await stt({ userId: u, body: Buffer.from([1, 2, 3]), header: () => undefined } as any, res)

    expect(res.statusCode).toBe(502)
    expect(await usado(u)).toBe(0)
  })
})
