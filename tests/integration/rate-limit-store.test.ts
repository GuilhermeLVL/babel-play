/**
 * Rate-limit compartilhado entre réplicas + isolado por tenant (P1-2 e P1-3).
 *
 * Antes: MemoryStore com `keyGenerator` padrão (por IP). Duas consequências medidas —
 *  P1-2: atrás de proxy reverso todos os tenants dividem o mesmo contador, então um
 *        usuário que dispara 70 chamadas faz OUTRO, que não consumiu nada, levar 429.
 *  P1-3: o contador vive no heap do processo, então o teto efetivo vira 60/min × réplicas.
 */
import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import { setupEphemeralDb, type EphemeralDb } from '../harness/ephemeralDb'

let h: EphemeralDb
let makeStore: any
let chaveDoRequest: any

beforeAll(async () => {
  h = await setupEphemeralDb()
  ;({ createDbRateLimitStore: makeStore, chaveDoRequest } = await h.load('../../server/lib/rateLimitStore'))
})
afterAll(async () => { await h.cleanup() })

const store = (windowMs = 60_000) => {
  const s = makeStore()
  s.init({ windowMs })
  return s
}

describe('chaveDoRequest — P1-2 (isolamento entre tenants)', () => {
  it('usa o userId, não o IP: dois tenants no MESMO IP têm chaves distintas', () => {
    const a = chaveDoRequest({ userId: 'user-a', ip: '10.0.0.1' } as any)
    const b = chaveDoRequest({ userId: 'user-b', ip: '10.0.0.1' } as any)
    expect(a).not.toBe(b)
    expect(a).toContain('user-a')
  })

  it('o MESMO tenant vindo de IPs diferentes tem a mesma chave', () => {
    expect(chaveDoRequest({ userId: 'user-a', ip: '10.0.0.1' } as any))
      .toBe(chaveDoRequest({ userId: 'user-a', ip: '203.0.113.9' } as any))
  })

  it('sem userId (rota fora do auth) cai no IP, sem quebrar', () => {
    const k = chaveDoRequest({ ip: '203.0.113.9' } as any)
    expect(typeof k).toBe('string')
    expect(k.length).toBeGreaterThan(0)
  })
})

describe('store no banco — P1-3 (sobrevive a réplicas)', () => {
  it('increment conta de 1 em 1 e devolve o total', async () => {
    const s = store()
    expect((await s.increment('k1')).totalHits).toBe(1)
    expect((await s.increment('k1')).totalHits).toBe(2)
    expect((await s.increment('k1')).totalHits).toBe(3)
  })

  it('chaves diferentes não se misturam', async () => {
    const s = store()
    await s.increment('k2')
    await s.increment('k2')
    expect((await s.increment('k3')).totalHits).toBe(1)
  })

  it('devolve resetTime no futuro', async () => {
    const s = store()
    const r = await s.increment('k4')
    expect(r.resetTime).toBeInstanceOf(Date)
    expect(r.resetTime.getTime()).toBeGreaterThan(Date.now())
  })

  /** O teste que prova o P1-3: duas instâncias = duas réplicas. */
  it('DUAS instâncias sobre o mesmo banco compartilham o contador', async () => {
    const replica1 = store()
    const replica2 = store()

    await replica1.increment('compartilhada')
    await replica1.increment('compartilhada')
    // A réplica 2 nunca viu esta chave — mas o contador é do banco, não do heap.
    expect((await replica2.increment('compartilhada')).totalHits).toBe(3)
  })

  it('localKeys=false — declara que o contador NÃO é local ao processo', () => {
    expect(store().localKeys).toBe(false)
  })

  it('resetKey zera a contagem', async () => {
    const s = store()
    await s.increment('k5')
    await s.increment('k5')
    await s.resetKey('k5')
    expect((await s.increment('k5')).totalHits).toBe(1)
  })

  it('decrement devolve uma unidade (usado em skipFailedRequests)', async () => {
    const s = store()
    await s.increment('k6')
    await s.increment('k6')
    await s.decrement('k6')
    expect((await s.increment('k6')).totalHits).toBe(2)
  })

  it('janela nova começa do zero (o balde é por intervalo)', async () => {
    const s = store(1) // janela de 1ms: a próxima chamada já cai noutro balde
    await s.increment('k7')
    await new Promise((r) => setTimeout(r, 5))
    expect((await s.increment('k7')).totalHits).toBe(1)
  })
})
