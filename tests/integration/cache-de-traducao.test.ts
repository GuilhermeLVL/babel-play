/**
 * CACHE DE TRADUÇÃO NO SERVIDOR (Fase 2 do lançamento — não pagar duas vezes pela mesma frase).
 *
 * Legenda de vídeo, aula gravada e conversa repetem frase o tempo todo ("Thank you.", "Okay, so…").
 * O cliente já tinha um cache POR ABA; o servidor não tinha nenhum, e cada aba, cada sessão e cada
 * usuário pagava de novo a mesma tradução. A chave é o hash da frase NORMALIZADA + par de idiomas
 * + natureza (fala/texto e o contexto da fala) + MODELO — o Pro (modelo maior) não recebe a
 * tradução do modelo menor, nem o contrário. Entrada com TTL e LRU com teto de tamanho.
 */
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from 'vitest'

import { criarCacheDeTraducao } from '../../server/ai/cacheDeTraducao'
import { esquecerDisjuntores } from '../../server/ai/disjuntor'
import { asUserId } from '../../server/lib/authContext'
import { type EphemeralDb, setupEphemeralDb } from '../harness/ephemeralDb'

let h: EphemeralDb
let mtTranslateProxy: any
let subs: any
let counters: any
let esvaziar: () => Promise<void>

const mes = () => new Date().toISOString().slice(0, 7)

function mockRes(): any {
  const r: any = { statusCode: 200, body: undefined, headersSent: false }
  r.status = (c: number) => ((r.statusCode = c), r)
  r.json = (b: any) => ((r.body = b), (r.headersSent = true), r)
  return r
}
const respostaOk = (texto: string) => ({
  ok: true,
  json: async () => ({
    choices: [{ message: { content: texto } }],
    usage: { prompt_tokens: 30, completion_tokens: 5 },
  }),
})

beforeAll(async () => {
  h = await setupEphemeralDb()
  process.env.AUTH_REQUIRED = '1'
  ;({ mtTranslateProxy } = (await h.load('../../server/ai/mtProxy')) as any)
  ;({ esvaziarCacheDeTraducao: esvaziar } = (await h.load('../../server/ai/cacheDeTraducao')) as any)
  ;({ subscriptionsRepo: subs } = (await h.load('../../server/db/repositories/subscriptions')) as any)
  ;({ usageCountersRepo: counters } = (await h.load('../../server/db/repositories/usageCounters')) as any)
})
afterAll(async () => {
  delete process.env.AUTH_REQUIRED
  await h.cleanup()
})
afterEach(async () => {
  vi.unstubAllGlobals()
  vi.useRealTimers()
  delete process.env.GROQ_API_KEY
  delete process.env.LLM_MODEL_GRANDE
  esquecerDisjuntores()
  await esvaziar()
})

async function comPlano(id: string, plan: 'pro' | 'essencial') {
  const u = asUserId(id)
  await subs.upsert(u, { plan, status: 'active' })
  return u
}

describe('cache de tradução na rota', () => {
  it('a mesma frase (normalizada) paga UMA vez; a segunda sai do cache sem gastar cota', async () => {
    process.env.GROQ_API_KEY = 'chave'
    const u = await comPlano('cache-1', 'pro')
    let chamadas = 0
    vi.stubGlobal('fetch', async () => (chamadas++, respostaOk('Obrigado.')))

    const a = mockRes()
    await mtTranslateProxy({ userId: u, body: { text: 'Thank you.', src: 'en', tgt: 'pt' }, requestId: 'r' }, a)
    const b = mockRes()
    await mtTranslateProxy({ userId: u, body: { text: '  thank   YOU. ', src: 'en', tgt: 'pt' }, requestId: 'r' }, b)

    expect(chamadas).toBe(1)
    expect(b.statusCode).toBe(200)
    expect(b.body?.text).toBe('Obrigado.')
    expect(b.body?.cache).toBe(true)
    expect(await counters.get(u, 'managed_calls', mes())).toBe(1)
  })

  it('outro idioma de destino ou outra natureza (fala x texto) não reaproveita', async () => {
    process.env.GROQ_API_KEY = 'chave'
    const u = await comPlano('cache-2', 'pro')
    let chamadas = 0
    vi.stubGlobal('fetch', async () => (chamadas++, respostaOk('x')))
    await mtTranslateProxy({ userId: u, body: { text: 'hello', tgt: 'pt' }, requestId: 'r' }, mockRes())
    await mtTranslateProxy({ userId: u, body: { text: 'hello', tgt: 'es' }, requestId: 'r' }, mockRes())
    await mtTranslateProxy({ userId: u, body: { text: 'hello', tgt: 'pt', falada: true }, requestId: 'r' }, mockRes())
    expect(chamadas).toBe(3)
  })

  it('outro MODELO não reaproveita: o Pro com modelo maior não recebe a tradução do menor', async () => {
    process.env.GROQ_API_KEY = 'chave'
    process.env.LLM_MODEL_GRANDE = 'modelo-grande'
    const essencial = await comPlano('cache-ess', 'essencial')
    const pro = await comPlano('cache-pro', 'pro')
    const modelos: string[] = []
    vi.stubGlobal('fetch', async (_u: any, init: any) => (modelos.push(JSON.parse(init.body).model), respostaOk('y')))
    await mtTranslateProxy({ userId: essencial, body: { text: 'good night', tgt: 'pt' }, requestId: 'r' }, mockRes())
    await mtTranslateProxy({ userId: pro, body: { text: 'good night', tgt: 'pt' }, requestId: 'r' }, mockRes())
    expect(modelos).toHaveLength(2)
    expect(modelos[1]).toBe('modelo-grande')
  })
})

describe('o cache em si: TTL e teto de tamanho', () => {
  it('entrada vence depois do TTL', () => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date('2026-09-24T12:00:00Z'))
    const c = criarCacheDeTraducao({ ttlMs: 1_000, max: 10 })
    c.guardar('k', { texto: 't', modelo: 'm' })
    expect(c.ler('k')?.texto).toBe('t')
    vi.setSystemTime(new Date('2026-09-24T12:00:02Z'))
    expect(c.ler('k')).toBeNull()
  })

  it('acima do teto, sai o MENOS usado recentemente', () => {
    const c = criarCacheDeTraducao({ ttlMs: 60_000, max: 2 })
    c.guardar('a', { texto: '1', modelo: 'm' })
    c.guardar('b', { texto: '2', modelo: 'm' })
    c.ler('a') // "a" ficou recente
    c.guardar('c', { texto: '3', modelo: 'm' })
    expect(c.ler('b')).toBeNull()
    expect(c.ler('a')?.texto).toBe('1')
    expect(c.ler('c')?.texto).toBe('3')
  })

  it('a chave é um hash: a frase não fica em claro como chave', async () => {
    const { chaveDeTraducao } = await h.load<any>('../../server/ai/cacheDeTraducao')
    const k = chaveDeTraducao({ texto: 'segredo do usuário', src: 'pt', tgt: 'en', falada: false, modelo: 'm' })
    expect(k).toMatch(/^[0-9a-f]{64}$/)
  })

  /* B3: o `registro` (formal/informal, variante — Fase D) entra na chave; AUSENTE, a chave é a de
     antes, byte a byte: o L2 dura 30 dias, e mudar a chave de toda frase jogaria fora o cache inteiro. */
  it('sem registro, a chave é a de antes; com registro, outra', async () => {
    const { chaveDeTraducao } = await h.load<any>('../../server/ai/cacheDeTraducao')
    const { createHash } = await import('node:crypto')
    const c = { texto: 'Thank you.', src: 'en', tgt: 'pt', falada: false, modelo: 'm', versaoDoPrompt: 'v1' }
    const antes = createHash('sha256')
      .update(['thank you', 'en', 'pt', 'texto', '', 'm', 'v1'].join('\u0000'))
      .digest('hex')
    expect(chaveDeTraducao(c)).toBe(antes)
    expect(chaveDeTraducao({ ...c, registro: 'formal' })).not.toBe(antes)
    expect(chaveDeTraducao({ ...c, registro: 'formal' })).not.toBe(chaveDeTraducao({ ...c, registro: 'informal' }))
  })
})
