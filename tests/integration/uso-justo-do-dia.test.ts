/**
 * O USO JUSTO DO DIA (C4 da change `planos-v2`, ADR 0011) — "sem limite no dia a dia", com ~2 h de
 * nuvem por dia LOCAL da pessoa; passando disso a legenda segue no aparelho.
 *
 * O que se prova aqui:
 *   - a janela do dia é `AAAA-MM-DD` no fuso GRAVADO da pessoa (ou `America/Sao_Paulo`);
 *   - a reserva confere o MÊS e depois o DIA; se o dia recusa, o mês é DEVOLVIDO (a fala que não
 *     aconteceu não sai do mês de ninguém); o estorno e o acerto voltam para a janela do dia da reserva;
 *   - a recusa é 429 `uso_justo_do_dia` com `Retry-After` — nunca 402, que vira oferta de venda —, na
 *     transcrição, na tradução e no tutor, sem chamar o provedor e sem deixar reserva pendurada;
 *   - plano sem teto diário (Grátis, self-host) não conta nada por dia;
 *   - `/api/me/uso` diz `hoje`.
 */
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'

import { esvaziarCacheDeTraducao } from '../../server/ai/cacheDeTraducao'
import { esquecerDisjuntores } from '../../server/ai/disjuntor'
import { asUserId } from '../../server/lib/authContext'
import { type EphemeralDb, setupEphemeralDb } from '../harness/ephemeralDb'
import { wavPcm } from '../harness/wav'

let h: EphemeralDb
let quota: any
let repo: any
let subs: any
let estado: any
let adm: any
let mtTranslateProxy: any
let sttTranscribeProxy: any
let tutorChat: any

const mes = () => new Date().toISOString().slice(0, 7)
/** O dia de hoje em São Paulo (o fuso padrão de quem não gravou outro). */
const hojeEmSP = () => new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Sao_Paulo' }).format(new Date())

function mockRes(): any {
  const r: any = { statusCode: 200, body: undefined, headersSent: false, headers: {} as Record<string, string> }
  r.status = (c: number) => ((r.statusCode = c), r)
  r.json = (b: any) => ((r.body = b), (r.headersSent = true), r)
  r.setHeader = (n: string, v: string) => {
    r.headers[n.toLowerCase()] = v
  }
  return r
}
const respostaMt = (texto: string, entrada = 40, saida = 10) =>
  new Response(
    JSON.stringify({
      choices: [{ message: { content: texto } }],
      usage: { prompt_tokens: entrada, completion_tokens: saida },
    }),
    { status: 200, headers: { 'content-type': 'application/json' } },
  )
const respostaStt = () =>
  new Response(JSON.stringify({ text: 'olá mundo', language: 'portuguese', duration: 2 }), {
    status: 200,
    headers: { 'content-type': 'application/json' },
  })

const ENVS = [
  'GROQ_API_KEY',
  'GROQ_BASE_URL',
  'PREMIUM_DAILY_STT_SECONDS',
  'PREMIUM_DAILY_LLM_TOKENS',
  'PREMIUM_MONTHLY_STT_SECONDS',
  'PREMIUM_MONTHLY_LLM_TOKENS',
]

beforeAll(async () => {
  h = await setupEphemeralDb()
  process.env.AUTH_REQUIRED = '1'
  quota = await h.load('../../server/lib/usageQuota')
  ;({ usageCountersRepo: repo } = (await h.load('../../server/db/repositories/usageCounters')) as any)
  ;({ subscriptionsRepo: subs } = (await h.load('../../server/db/repositories/subscriptions')) as any)
  ;({ estadoDaContaRepo: estado } = (await h.load('../../server/db/repositories/estadoDaConta')) as any)
  adm = await h.load('../../server/ai/admissao')
  ;({ mtTranslateProxy } = (await h.load('../../server/ai/mtProxy')) as any)
  ;({ sttTranscribeProxy } = (await h.load('../../server/ai/sttProxy')) as any)
  ;({ tutorChat } = (await h.load('../../server/routes/tutor')) as any)
})
afterAll(async () => {
  delete process.env.AUTH_REQUIRED
  await h.cleanup()
})
beforeEach(() => {
  esvaziarCacheDeTraducao()
  adm.esquecerAdmissao()
  // IP público literal: `assertPublicUrl` resolve DNS de verdade, e o provedor não é assunto aqui.
  process.env.GROQ_BASE_URL = 'http://203.0.113.20/v1'
})
afterEach(() => {
  vi.restoreAllMocks()
  vi.unstubAllGlobals()
  vi.useRealTimers()
  // '' e não `delete`: o dotenv devolveria a variável do .env de quem roda.
  for (const e of ENVS) process.env[e] = ''
  esquecerDisjuntores()
})

async function premium(id: string) {
  const u = asUserId(id)
  await subs.upsert(u, { plan: 'premium', status: 'active' })
  return u
}

describe('a janela do dia', () => {
  it('é o dia LOCAL: São Paulo sem fuso gravado; o fuso gravado quando há', async () => {
    vi.useFakeTimers({ toFake: ['Date'] })
    vi.setSystemTime(new Date('2026-09-30T23:30:00Z')) // 20h30 em São Paulo, 08h30 do dia 1º em Tóquio
    const sp = await premium('dia-sp')
    const tokyo = await premium('dia-tokyo')
    await estado.gravarFuso(tokyo, 'Asia/Tokyo', Date.now(), 0)
    expect(await quota.janelaDoDia(sp)).toBe('2026-09-30')
    expect(await quota.janelaDoDia(tokyo)).toBe('2026-10-01')
  })
})

describe('segundos de STT: o mês, depois o dia', () => {
  it('2 h no dia (a matriz): cabe até o teto, e o que passa é recusado com motivo `dia`', async () => {
    const u = await premium('stt-dia')
    const r1 = await quota.reservarSegundosDeStt(u, 7_000)
    expect(r1).toEqual({ cabe: true, dia: hojeEmSP() })
    const r2 = await quota.reservarSegundosDeStt(u, 300)
    expect(r2).toEqual({ cabe: false, recusa: 'dia' })
    expect(await repo.get(u, quota.METRIC_STT_SEGUNDOS_DIA, hojeEmSP())).toBe(7_000)
  })

  it('o dia recusou: o MÊS reservado para a mesma fala é devolvido', async () => {
    process.env.PREMIUM_DAILY_STT_SECONDS = '10'
    const u = await premium('stt-devolve')
    expect((await quota.reservarSegundosDeStt(u, 8)).cabe).toBe(true)
    expect(await quota.reservarSegundosDeStt(u, 5)).toEqual({ cabe: false, recusa: 'dia' })
    expect(await repo.get(u, quota.METRIC_STT_SEGUNDOS, mes())).toBe(8)
  })

  it('o mês recusa primeiro, e aí o dia nem é tocado', async () => {
    process.env.PREMIUM_MONTHLY_STT_SECONDS = '5'
    const u = await premium('stt-mes')
    expect(await quota.reservarSegundosDeStt(u, 6)).toEqual({ cabe: false, recusa: 'mes' })
    expect(await repo.get(u, quota.METRIC_STT_SEGUNDOS_DIA, hojeEmSP())).toBe(0)
  })

  it('o estorno volta para o mês E para o dia da reserva', async () => {
    const u = await premium('stt-estorno')
    const r = await quota.reservarSegundosDeStt(u, 30)
    await quota.estornarSegundosDeStt(u, 30, 'plano', r.dia)
    expect(await repo.get(u, quota.METRIC_STT_SEGUNDOS, mes())).toBe(0)
    expect(await repo.get(u, quota.METRIC_STT_SEGUNDOS_DIA, r.dia)).toBe(0)
  })

  it('o contador do dia fora do ar: devolve o mês e falha FECHADA (503 na rota)', async () => {
    const u = await premium('stt-dia-fora')
    const original = repo.reserve.bind(repo)
    vi.spyOn(repo, 'reserve').mockImplementation(async (...args: any[]) => {
      if (args[1] === quota.METRIC_STT_SEGUNDOS_DIA) throw new Error('banco indisponível')
      return original(...args)
    })
    await expect(quota.reservarSegundosDeStt(u, 20)).rejects.toBeInstanceOf(quota.ContadorIndisponivel)
    expect(await repo.get(u, quota.METRIC_STT_SEGUNDOS, mes())).toBe(0)
  })

  it('Grátis e self-host não contam nada por dia', async () => {
    expect(quota.capSegundosDoDia('free')).toBe(Infinity)
    expect(quota.capSegundosDoDia('selfhost')).toBe(Infinity)
    expect(quota.capTokensDoDia('free')).toBe(Infinity)
    expect(quota.capSegundosDoDia('premium')).toBe(7_200)
    expect(quota.capTokensDoDia('premium')).toBe(300_000)
    process.env.PREMIUM_DAILY_STT_SECONDS = '3600'
    expect(quota.capSegundosDoDia('premium')).toBe(3_600)
  })
})

describe('tokens de LLM: o mês, depois o dia', () => {
  it('o dia recusa e devolve o mês; o acerto volta para o mês e para o dia', async () => {
    process.env.PREMIUM_DAILY_LLM_TOKENS = '1000'
    const u = await premium('tk-dia')
    const r = await quota.reservarTokensDeLlm(u, 800)
    expect(r).toEqual({ cabe: true, dia: hojeEmSP() })
    expect(await quota.reservarTokensDeLlm(u, 300)).toEqual({ cabe: false, recusa: 'dia' })
    expect(await repo.get(u, quota.METRIC_LLM_TOKENS, mes())).toBe(800)

    await quota.acertarTokensDeLlm(u, 800, 250, 'plano', r.dia)
    expect(await repo.get(u, quota.METRIC_LLM_TOKENS, mes())).toBe(250)
    expect(await repo.get(u, quota.METRIC_LLM_TOKENS_DIA, r.dia)).toBe(250)
  })
})

describe('as rotas: 429 uso_justo_do_dia, sem venda e sem reserva pendurada', () => {
  it('transcrição: passou do dia → 429 com Retry-After, o provedor não é chamado e o mês volta', async () => {
    process.env.GROQ_API_KEY = 'chave'
    process.env.PREMIUM_DAILY_STT_SECONDS = '3'
    const u = await premium('rota-stt')
    let chamadas = 0
    vi.stubGlobal('fetch', async (url: unknown) => {
      if (/audio\/transcriptions$/.test(String(url))) chamadas++
      return respostaStt()
    })
    const req = () => ({ userId: u, body: wavPcm(2), header: () => undefined, requestId: 'r' })
    const primeira = mockRes()
    await sttTranscribeProxy(req(), primeira)
    expect(primeira.statusCode).toBe(200)

    const segunda = mockRes()
    await sttTranscribeProxy(req(), segunda)
    expect(segunda.statusCode).toBe(429)
    expect(segunda.body.code).toBe('uso_justo_do_dia')
    expect(Number(segunda.headers['retry-after'])).toBeGreaterThanOrEqual(1)
    expect(Number(segunda.headers['retry-after'])).toBeLessThanOrEqual(86_400)
    expect(chamadas).toBe(1)
    // Só a fala que aconteceu ficou no mês — segundos e chamadas.
    expect(await repo.get(u, quota.METRIC_STT_SEGUNDOS, mes())).toBe(2)
    expect(await repo.get(u, quota.METRIC_MANAGED, mes())).toBe(1)
  })

  it('tradução: tokens do dia acabaram → 429 uso_justo_do_dia, sem provedor, chamada estornada', async () => {
    process.env.GROQ_API_KEY = 'chave'
    process.env.PREMIUM_DAILY_LLM_TOKENS = '10'
    const u = await premium('rota-mt')
    const chamadas: string[] = []
    vi.stubGlobal('fetch', async (url: unknown) => (chamadas.push(String(url)), respostaMt('oi')))
    const res = mockRes()
    await mtTranslateProxy({ userId: u, body: { text: 'hello there', tgt: 'pt' }, requestId: 'r' }, res)
    expect(res.statusCode).toBe(429)
    expect(res.body.code).toBe('uso_justo_do_dia')
    expect(Number(res.headers['retry-after'])).toBeGreaterThanOrEqual(1)
    expect(chamadas.filter((c) => /chat\/completions$/.test(c))).toEqual([])
    expect(await repo.get(u, quota.METRIC_MANAGED, mes())).toBe(0)
    expect(await repo.get(u, quota.METRIC_LLM_TOKENS, mes())).toBe(0)
  })

  it('tutor: o mesmo 429, e nunca o 402 que vira oferta', async () => {
    process.env.GROQ_API_KEY = 'chave'
    process.env.PREMIUM_DAILY_LLM_TOKENS = '10'
    const u = await premium('rota-tutor')
    vi.stubGlobal('fetch', async () => respostaMt('oi'))
    const res = mockRes()
    await tutorChat(
      { userId: u, body: { messages: [{ role: 'user', content: 'oi, tudo bem?' }] }, requestId: 'r' },
      res,
    )
    expect(res.statusCode).toBe(429)
    expect(res.body.code).toBe('uso_justo_do_dia')
  })

  it('tradução entregue: os tokens REAIS ficam no mês e no dia', async () => {
    process.env.GROQ_API_KEY = 'chave'
    const u = await premium('rota-mt-real')
    vi.stubGlobal('fetch', async () => respostaMt('olá', 120, 30))
    const res = mockRes()
    await mtTranslateProxy({ userId: u, body: { text: 'hello', tgt: 'pt' }, requestId: 'r' }, res)
    expect(res.statusCode).toBe(200)
    expect(await repo.get(u, quota.METRIC_LLM_TOKENS, mes())).toBe(150)
    expect(await repo.get(u, quota.METRIC_LLM_TOKENS_DIA, hojeEmSP())).toBe(150)
  })
})

describe('GET /api/me/uso', () => {
  async function uso(userId: string) {
    const { meRouter } = await h.load<any>('../../server/routes/me')
    const camada = meRouter.stack.find((l: any) => l.route?.path === '/uso' && l.route.methods.get)
    const res = mockRes()
    await camada.route.stack[0].handle({ userId, header: () => undefined, query: {} }, res)
    return res.body
  }

  it('o Premium vê o dia: janela, fuso e os contadores com os tetos', async () => {
    const u = await premium('uso-hoje')
    await quota.reservarSegundosDeStt(u, 90)
    const corpo = await uso(u)
    expect(corpo.hoje).toEqual({
      janela: hojeEmSP(),
      fuso: 'America/Sao_Paulo',
      segundosDeAudio: { usado: 90, teto: 7_200 },
      tokensDeLlm: { usado: 0, teto: 300_000 },
    })
  })

  it('o Grátis não tem teto no dia: `hoje` é null (nada é contado ali)', async () => {
    const corpo = await uso(asUserId('uso-gratis'))
    expect(corpo.plano).toBe('free')
    expect(corpo.hoje).toBeNull()
  })
})
