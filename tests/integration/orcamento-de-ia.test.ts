/**
 * CHAVE DE EMERGÊNCIA E ORÇAMENTO GLOBAL DE IA (Fase 2 do lançamento — OWASP LLM10).
 *
 * As cotas por usuário limitam UM assinante. Nada limitava a SOMA: mil assinantes dentro da cota,
 * um bug de cliente em laço ou uma chave vazada podiam levar a fatura do mês a qualquer valor. Duas
 * travas globais, as duas antes de qualquer chamada ao provedor:
 *
 *   - `AI_ENABLED=0` desliga toda IA de nuvem na hora (incidente, fatura estranha);
 *   - `AI_BUDGET_USD_MONTH` é o teto em dólares do mês. O gasto é estimado por chamada a partir de
 *     tokens e segundos com os preços oficiais (configuráveis por env). A 80% sai um alerta no log
 *     (evento próprio, para virar alerta de verdade depois); a 100% a nuvem desliga sozinha até o
 *     mês virar, com mensagem clara, e o cliente cai nos modelos locais.
 */
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'

import { esvaziarCacheDeTraducao } from '../../server/ai/cacheDeTraducao'
import { esquecerDisjuntores } from '../../server/ai/disjuntor'
import { asUserId } from '../../server/lib/authContext'
import { type EphemeralDb, setupEphemeralDb } from '../harness/ephemeralDb'
import { wavPcm } from '../harness/wav'

let h: EphemeralDb
let orc: any
let repo: any
let subs: any
let mtTranslateProxy: any
let tutorChat: any
let sttTranscribeProxy: any

const ENVS = ['AI_ENABLED', 'AI_BUDGET_USD_MONTH', 'AI_PRECOS_MODELOS', 'GROQ_API_KEY'] as const
const mes = () => new Date().toISOString().slice(0, 7)

function mockRes(): any {
  const r: any = { statusCode: 200, body: undefined, headersSent: false }
  r.status = (c: number) => ((r.statusCode = c), r)
  r.json = (b: any) => ((r.body = b), (r.headersSent = true), r)
  return r
}
const respostaOk = (texto: string, entrada = 1000, saida = 1000) => ({
  ok: true,
  json: async () => ({
    choices: [{ message: { content: texto } }],
    usage: { prompt_tokens: entrada, completion_tokens: saida },
  }),
})
const eventosNoLog = (espiao: { mock: { calls: unknown[][] } }) =>
  espiao.mock.calls.map((c) => {
    try {
      return JSON.parse(String(c[0])).event as string
    } catch {
      return ''
    }
  })

beforeAll(async () => {
  h = await setupEphemeralDb()
  process.env.AUTH_REQUIRED = '1'
  orc = await h.load('../../server/lib/orcamentoDeIa')
  ;({ gastoDeIaRepo: repo } = (await h.load('../../server/db/repositories/gastoDeIa')) as any)
  ;({ subscriptionsRepo: subs } = (await h.load('../../server/db/repositories/subscriptions')) as any)
  ;({ mtTranslateProxy } = (await h.load('../../server/ai/mtProxy')) as any)
  ;({ tutorChat } = (await h.load('../../server/routes/tutor')) as any)
  ;({ sttTranscribeProxy } = (await h.load('../../server/ai/sttProxy')) as any)
})
afterAll(async () => {
  delete process.env.AUTH_REQUIRED
  for (const e of ENVS) delete process.env[e]
  await h.cleanup()
})
afterEach(async () => {
  vi.restoreAllMocks()
  vi.unstubAllGlobals()
  for (const e of ENVS) delete process.env[e]
  esquecerDisjuntores()
  await repo.zerar(mes())
})

async function pro(id: string) {
  const u = asUserId(id)
  await subs.upsert(u, { plan: 'pro', status: 'active' })
  return u
}

/* O cache de tradução (Fase 2 do lançamento) é do processo: sem esvaziar, a frase repetida de um
   caso seria servida do cache no seguinte, e o provedor que o caso encena nem seria chamado. */
beforeEach(() => esvaziarCacheDeTraducao())

describe('AI_ENABLED=0 — a chave de emergência', () => {
  it('tradução, tutor e transcrição respondem 503 ia_desligada sem tocar no provedor', async () => {
    process.env.GROQ_API_KEY = 'chave'
    process.env.AI_ENABLED = '0'
    const u = await pro('emerg')
    const chamadas: string[] = []
    vi.stubGlobal('fetch', async (url: any) => (chamadas.push(String(url)), respostaOk('oi')))

    const mt = mockRes()
    await mtTranslateProxy({ userId: u, body: { text: 'hello', tgt: 'pt' }, requestId: 'r' }, mt)
    const tutor = mockRes()
    await tutorChat({ userId: u, body: { messages: [{ role: 'user', content: 'oi' }] }, requestId: 'r' }, tutor)
    const stt = mockRes()
    await sttTranscribeProxy({ userId: u, body: wavPcm(2), header: () => undefined, requestId: 'r' }, stt)

    for (const r of [mt, tutor, stt]) {
      expect(r.statusCode).toBe(503)
      expect(r.body?.code).toBe('ia_desligada')
      expect(r.body?.error).toMatch(/modelos locais/)
    }
    expect(chamadas).toEqual([])
  })
})

describe('custo estimado por chamada', () => {
  it('preços oficiais por padrão: gpt-oss-120b US$ 0,15/0,60, gpt-oss-20b US$ 0,075/0,30 por 1M', () => {
    expect(orc.custoDeLlm('openai/gpt-oss-120b', 1_000_000, 1_000_000)).toBeCloseTo(0.75, 6)
    expect(orc.custoDeLlm('openai/gpt-oss-20b', 1_000_000, 1_000_000)).toBeCloseTo(0.375, 6)
  })

  it('whisper-large-v3-turbo US$ 0,04 por hora, com mínimo de 10 s por requisição', () => {
    expect(orc.custoDeStt('whisper-large-v3-turbo', 3600)).toBeCloseTo(0.04, 6)
    expect(orc.custoDeStt('whisper-large-v3-turbo', 2)).toBeCloseTo((0.04 * 10) / 3600, 9)
  })

  it('preço configurável por env; modelo desconhecido usa um preço CONSERVADOR (mais caro)', () => {
    process.env.AI_PRECOS_MODELOS = JSON.stringify({ 'meu/modelo': { entrada: 1, saida: 2 } })
    expect(orc.custoDeLlm('meu/modelo', 1_000_000, 1_000_000)).toBeCloseTo(3, 6)
    expect(orc.custoDeLlm('nunca/visto', 1_000_000, 0)).toBeGreaterThan(0.15)
  })
})

describe('orçamento global do mês', () => {
  it('80% alerta uma vez; 100% desliga a nuvem com mensagem clara', async () => {
    process.env.AI_BUDGET_USD_MONTH = '1'
    const avisos = vi.spyOn(console, 'warn').mockImplementation(() => {})
    const erros = vi.spyOn(console, 'error').mockImplementation(() => {})

    await orc.registrarGastoDeIa(0.79)
    expect(eventosNoLog(avisos)).not.toContain('ia_orcamento_alerta_80')
    expect((await orc.portaoDaNuvem()).ok).toBe(true)

    await orc.registrarGastoDeIa(0.02)
    await orc.registrarGastoDeIa(0.01)
    expect(eventosNoLog(avisos).filter((e) => e === 'ia_orcamento_alerta_80')).toHaveLength(1)

    await orc.registrarGastoDeIa(0.2)
    expect(eventosNoLog(erros)).toContain('ia_orcamento_esgotado')
    const portao = await orc.portaoDaNuvem()
    expect(portao.ok).toBe(false)
    expect(portao.motivo).toBe('orcamento_esgotado')
    expect(portao.mensagem).toMatch(/volta no dia 1º/)
  })

  it('orçamento esgotado: a tradução responde 503 sem chamar o provedor', async () => {
    process.env.GROQ_API_KEY = 'chave'
    process.env.AI_BUDGET_USD_MONTH = '0.5'
    vi.spyOn(console, 'error').mockImplementation(() => {})
    await orc.registrarGastoDeIa(0.5)
    const u = await pro('orc-esgotado')
    const chamadas: string[] = []
    vi.stubGlobal('fetch', async (url: any) => (chamadas.push(String(url)), respostaOk('oi')))
    const res = mockRes()
    await mtTranslateProxy({ userId: u, body: { text: 'hello', tgt: 'pt' }, requestId: 'r' }, res)
    expect(res.statusCode).toBe(503)
    expect(res.body?.code).toBe('orcamento_esgotado')
    expect(chamadas).toEqual([])
  })

  it('o gasto de um mês não conta no seguinte', async () => {
    process.env.AI_BUDGET_USD_MONTH = '1'
    await repo.somar('2000-01', 50_000_000)
    expect((await orc.portaoDaNuvem()).ok).toBe(true)
  })

  it('uma tradução entregue soma o custo estimado dela ao gasto do mês', async () => {
    process.env.GROQ_API_KEY = 'chave'
    const u = await pro('orc-soma')
    vi.stubGlobal('fetch', async () => respostaOk('olá', 1000, 1000))
    await mtTranslateProxy({ userId: u, body: { text: 'hello', tgt: 'pt' }, requestId: 'r' }, mockRes())
    const estado = await orc.estadoDoOrcamento()
    expect(estado.gastoUsd).toBeCloseTo(0.00075, 6)
  })

  it('sem conseguir ler o gasto, a nuvem fecha (falha fechada)', async () => {
    process.env.AI_BUDGET_USD_MONTH = '10'
    vi.spyOn(console, 'error').mockImplementation(() => {})
    vi.spyOn(repo, 'ler').mockRejectedValue(new Error('banco fora'))
    const portao = await orc.portaoDaNuvem()
    expect(portao.ok).toBe(false)
    expect(portao.motivo).toBe('orcamento_indisponivel')
  })

  it('no modo público, sem AI_BUDGET_USD_MONTH, vale um teto padrão (não é ilimitado)', () => {
    expect(orc.tetoDoMesUsd()).toBeGreaterThan(0)
    expect(Number.isFinite(orc.tetoDoMesUsd())).toBe(true)
  })
})
