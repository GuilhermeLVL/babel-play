/**
 * COTAS QUE VALEM DE VERDADE (Fase 2 do lançamento — OWASP LLM10).
 *
 * Duas mudanças de política, cada uma com o seu porquê:
 *
 *  1. A cota de nuvem FALHA FECHADA. Ela degradava aberta ("nunca bloquear pagante por falha de
 *     contador"), e isso fazia de uma falha do banco um cheque em branco contra a chave do dono:
 *     com o contador fora, nenhuma cota valia. Agora a falha vira 503 com motivo, e o cliente cai
 *     nos modelos locais — o usuário perde qualidade por alguns minutos, o dono não perde dinheiro.
 *
 *  2. O teto de TOKENS por plano é APLICADO. Antes só se contava depois da resposta. Agora a
 *     chamada reserva uma estimativa conservadora ANTES (entrada + `max_tokens`) e acerta pelo
 *     número real do provedor depois.
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
let mtTranslateProxy: any
let tutorChat: any

const janela = () => new Date().toISOString().slice(0, 7)

function mockRes(): any {
  const r: any = { statusCode: 200, body: undefined, headersSent: false }
  r.status = (c: number) => ((r.statusCode = c), r)
  r.json = (b: any) => ((r.body = b), (r.headersSent = true), r)
  return r
}
const respostaOk = (texto: string, entrada = 40, saida = 10) => ({
  ok: true,
  json: async () => ({
    choices: [{ message: { content: texto } }],
    usage: { prompt_tokens: entrada, completion_tokens: saida },
  }),
})

beforeAll(async () => {
  h = await setupEphemeralDb()
  process.env.AUTH_REQUIRED = '1'
  quota = await h.load('../../server/lib/usageQuota')
  ;({ usageCountersRepo: repo } = (await h.load('../../server/db/repositories/usageCounters')) as any)
  ;({ subscriptionsRepo: subs } = (await h.load('../../server/db/repositories/subscriptions')) as any)
  ;({ mtTranslateProxy } = (await h.load('../../server/ai/mtProxy')) as any)
  ;({ tutorChat } = (await h.load('../../server/routes/tutor')) as any)
})
afterAll(async () => {
  delete process.env.AUTH_REQUIRED
  await h.cleanup()
})
afterEach(() => {
  vi.restoreAllMocks()
  vi.unstubAllGlobals()
  delete process.env.GROQ_API_KEY
  delete process.env.PREMIUM_MONTHLY_LLM_TOKENS
  esquecerDisjuntores()
})

async function pro(id: string) {
  const u = asUserId(id)
  await subs.upsert(u, { plan: 'premium', status: 'active' })
  return u
}

/* O cache de tradução (Fase 2 do lançamento) é do processo: sem esvaziar, a frase repetida de um
   caso seria servida do cache no seguinte, e o provedor que o caso encena nem seria chamado. */
beforeEach(() => esvaziarCacheDeTraducao())

describe('falha fechada', () => {
  it('reserva de chamada com o banco fora LANÇA ContadorIndisponivel (não libera)', async () => {
    const u = await pro('ff-chamada')
    vi.spyOn(repo, 'reserve').mockRejectedValue(new Error('banco indisponível'))
    await expect(quota.reserveManagedCall(u)).rejects.toBeInstanceOf(quota.ContadorIndisponivel)
  })

  it('reserva de segundos de STT com o banco fora também falha fechada', async () => {
    const u = await pro('ff-stt')
    vi.spyOn(repo, 'reserve').mockRejectedValue(new Error('banco indisponível'))
    await expect(quota.reservarSegundosDeStt(u, 10)).rejects.toBeInstanceOf(quota.ContadorIndisponivel)
  })

  it('tradução: contador fora → 503 com motivo, e o provedor nem é chamado', async () => {
    process.env.GROQ_API_KEY = 'chave'
    const u = await pro('ff-mt')
    vi.spyOn(repo, 'reserve').mockRejectedValue(new Error('banco indisponível'))
    const chamadas: string[] = []
    vi.stubGlobal('fetch', async (url: any) => (chamadas.push(String(url)), respostaOk('oi')))
    const res = mockRes()
    await mtTranslateProxy({ userId: u, body: { text: 'hello', tgt: 'pt' }, requestId: 'r' }, res)
    expect(res.statusCode).toBe(503)
    expect(res.body?.code).toBe('contador_indisponivel')
    expect(chamadas).toEqual([])
  })

  it('transcrição: contador fora → 503 com motivo (o cliente cai no Whisper local)', async () => {
    process.env.GROQ_API_KEY = 'chave'
    const u = await pro('ff-stt-rota')
    const { sttTranscribeProxy } = await h.load<any>('../../server/ai/sttProxy')
    vi.spyOn(repo, 'reserve').mockRejectedValue(new Error('banco indisponível'))
    const chamadas: string[] = []
    vi.stubGlobal('fetch', async (url: any) => (chamadas.push(String(url)), respostaOk('oi')))
    const res = mockRes()
    await sttTranscribeProxy({ userId: u, body: wavPcm(2), header: () => undefined, requestId: 'r' }, res)
    expect(res.statusCode).toBe(503)
    expect(res.body?.code).toBe('contador_indisponivel')
    expect(chamadas).toEqual([])
  })

  it('tutor: contador fora → 503 com motivo', async () => {
    process.env.GROQ_API_KEY = 'chave'
    const u = await pro('ff-tutor')
    vi.spyOn(repo, 'reserve').mockRejectedValue(new Error('banco indisponível'))
    vi.stubGlobal('fetch', async () => respostaOk('oi'))
    const res = mockRes()
    await tutorChat({ userId: u, body: { messages: [{ role: 'user', content: 'oi' }] }, requestId: 'r' }, res)
    expect(res.statusCode).toBe(503)
    expect(res.body?.code).toBe('contador_indisponivel')
  })
})

describe('teto de tokens por plano', () => {
  it('o teto vem da matriz e aceita override por env', async () => {
    const { PLAN_MATRIX } = await h.load<any>('../../src/core/planos')
    expect(quota.capTokensParaPlano('premium')).toBe(PLAN_MATRIX.premium.quotas.tokensMes)
    process.env.PREMIUM_MONTHLY_LLM_TOKENS = '1234'
    expect(quota.capTokensParaPlano('premium')).toBe(1234)
  })

  it('reserva a estimativa, e o acerto devolve o que não foi gasto', async () => {
    process.env.PREMIUM_MONTHLY_LLM_TOKENS = '10000'
    const u = await pro('tk-acerto')
    expect(await quota.reservarTokensDeLlm(u, 3000)).toBe(true)
    expect(await repo.get(u, quota.METRIC_LLM_TOKENS, janela())).toBe(3000)
    await quota.acertarTokensDeLlm(u, 3000, 700)
    expect(await repo.get(u, quota.METRIC_LLM_TOKENS, janela())).toBe(700)
  })

  it('acima do teto a reserva recusa', async () => {
    process.env.PREMIUM_MONTHLY_LLM_TOKENS = '1000'
    const u = await pro('tk-teto')
    expect(await quota.reservarTokensDeLlm(u, 800)).toBe(true)
    expect(await quota.reservarTokensDeLlm(u, 800)).toBe(false)
  })

  it('tradução com o teto de tokens esgotado → 402 quota_exceeded, sem chamar o provedor', async () => {
    process.env.GROQ_API_KEY = 'chave'
    process.env.PREMIUM_MONTHLY_LLM_TOKENS = '100'
    const u = await pro('tk-mt')
    const chamadas: string[] = []
    vi.stubGlobal('fetch', async (url: any) => (chamadas.push(String(url)), respostaOk('oi')))
    const res = mockRes()
    await mtTranslateProxy({ userId: u, body: { text: 'hello there', tgt: 'pt' }, requestId: 'r' }, res)
    expect(res.statusCode).toBe(402)
    expect(res.body?.code).toBe('quota_exceeded')
    expect(chamadas).toEqual([])
    // A reserva de CHAMADA que já tinha sido feita foi estornada.
    expect(await repo.get(u, quota.METRIC_MANAGED, janela())).toBe(0)
  })

  it('tradução entregue: o contador fica com os tokens REAIS do provedor', async () => {
    process.env.GROQ_API_KEY = 'chave'
    const u = await pro('tk-real')
    vi.stubGlobal('fetch', async () => respostaOk('olá', 120, 30))
    const res = mockRes()
    await mtTranslateProxy({ userId: u, body: { text: 'hello', tgt: 'pt' }, requestId: 'r' }, res)
    expect(res.statusCode).toBe(200)
    expect(await repo.get(u, quota.METRIC_LLM_TOKENS, janela())).toBe(150)
  })
})
