/**
 * DOIS LIMITADORES, DOIS BALDES (auditoria de 2026-09-07, achado A27).
 *
 * `server.ts` monta dois `rateLimit`: um para rotas caras (60/min, protege recurso externo pago) e
 * outro para escrita (120/min, protege a memória do processo — `express.raw` bufferiza 120 MB por
 * upload num contêiner de 1 GB). Os dois criavam o store com a MESMA métrica, a mesma chave e a
 * mesma janela: o contador era um só.
 *
 * O efeito não é teórico. Salvar transcrição passa pelo limitador de escrita e incrementava o
 * mesmo balde do de IA: 60 salvamentos em um minuto — normal em quem está transcrevendo uma aula —
 * esgotavam a cota de tradução da pessoa. E o cabeçalho `RateLimit-Remaining` anunciava um número
 * que não correspondia a nenhum dos dois tetos.
 *
 * O teste é sobre o STORE, não sobre o Express: é o store que decide onde contar, e testá-lo
 * direto dispensa subir servidor para provar um fato de contabilidade.
 */
import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import { setupEphemeralDb, type EphemeralDb } from '../harness/ephemeralDb'

let h: EphemeralDb
let store: any

beforeAll(async () => {
  h = await setupEphemeralDb()
  store = await h.load('../../server/lib/rateLimitStore')
})
afterAll(async () => { await h?.cleanup?.() })

describe('limitadores independentes', () => {
  it('contar numa família não move o contador da outra', async () => {
    const caro = store.createDbRateLimitStore(store.METRIC_RATELIMIT_CARO)
    const escrita = store.createDbRateLimitStore(store.METRIC_RATELIMIT_ESCRITA)
    caro.init({ windowMs: 60_000 })
    escrita.init({ windowMs: 60_000 })

    const chave = 'u:limite-u1'
    // Dez escritas — o volume de quem está salvando uma transcrição longa.
    for (let i = 0; i < 10; i++) await escrita.increment(chave)

    const primeiraCara = await caro.increment(chave)
    expect(
      primeiraCara.totalHits,
      'a primeira chamada cara precisa contar 1, e não 11: era assim que 60 salvamentos esgotavam a cota de IA',
    ).toBe(1)

    const proximaEscrita = await escrita.increment(chave)
    expect(proximaEscrita.totalHits, 'e o balde de escrita segue o seu próprio caminho').toBe(11)
  })

  it('a mesma família continua somando — separar não pode virar não contar', async () => {
    const caro = store.createDbRateLimitStore(store.METRIC_RATELIMIT_CARO)
    caro.init({ windowMs: 60_000 })
    const chave = 'u:limite-u2'
    await caro.increment(chave)
    const segunda = await caro.increment(chave)
    expect(segunda.totalHits).toBe(2)
  })

  it('cada tenant tem o seu balde — o furo P1-2 continua fechado', async () => {
    const caro = store.createDbRateLimitStore(store.METRIC_RATELIMIT_CARO)
    caro.init({ windowMs: 60_000 })
    await caro.increment('u:limite-u3')
    await caro.increment('u:limite-u3')
    const outro = await caro.increment('u:limite-u4')
    expect(outro.totalHits, 'um usuário não pode gastar a cota do outro').toBe(1)
  })

  it('as duas métricas são nomes diferentes, e o prefixo comum permite podar a família', () => {
    expect(store.METRIC_RATELIMIT_CARO).not.toBe(store.METRIC_RATELIMIT_ESCRITA)
    expect(store.METRIC_RATELIMIT_CARO.startsWith(store.METRIC_RATELIMIT)).toBe(true)
    expect(store.METRIC_RATELIMIT_ESCRITA.startsWith(store.METRIC_RATELIMIT)).toBe(true)
  })
})
