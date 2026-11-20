/**
 * A EXPLICAÇÃO DA FRASE NO DEEPSEEK (decisão do dono, 25/10/2026; `docs/auditoria/eval-ia-paga-v1.md`).
 *
 * O que se prova, com o registro REAL (`ops/ia-provedores.openrouter.json`):
 *   - a explicação tem ordem própria: `deepseek/deepseek-v4.1-flash` primeiro, o `openai/gpt-oss-120b` de reserva
 *     (pagante, nuance) e depois os demais como antes; na amostra do Grátis (rápida), o DeepSeek primeiro também;
 *   - tutor, corretor, resumo, alternativas, polimento e tradução seguem com as pernas de antes (sem o DeepSeek);
 *   - o corpo enviado ao OpenRouter na explicação: modelo DeepSeek, raciocínio desligado, Novita e Google fora,
 *     retenção zero, `json_schema` estrito + `require_parameters`, e a instrução de menor no system;
 *   - DeepSeek fora do ar: a explicação cai no gpt-oss (raciocínio "low" de sempre) e entrega.
 */
import { resolve } from 'node:path'

import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'

import { esquecerAdmissao } from '../../server/ai/admissao'
import { esquecerDisjuntores } from '../../server/ai/disjuntor'
import { decidirCusto } from '../../server/ai/politicaDeCusto'
import { esquecerRegistro, pernasDaFuncao } from '../../server/ai/registroDeProvedores'
import { asUserId } from '../../server/lib/authContext'
import { type EphemeralDb, setupEphemeralDb } from '../harness/ephemeralDb'

const ARQUIVO = resolve(__dirname, '../../ops/ia-provedores.openrouter.json')
const DEEPSEEK = 'deepseek/deepseek-v4.1-flash'
const GPT_OSS = 'openai/gpt-oss-120b'
const GEMMA = 'google/gemma-4-26b-a4b-it'
const LLAMA = 'meta-llama/llama-3.3-70b-instruct'
const ENVS = ['IA_PROVEDORES', 'IA_PROVEDORES_ARQUIVO', 'OPENROUTER_API_KEY', 'LLM_API_KEY', 'GROQ_API_KEY'] as const

const envDoRegistro = () =>
  ({ IA_PROVEDORES_ARQUIVO: ARQUIVO, OPENROUTER_API_KEY: 'chave-openrouter-falsa' }) as NodeJS.ProcessEnv
const modelos = (f: Parameters<typeof pernasDaFuncao>[0], nivel?: 'rapida' | 'nuance' | 'polimento'): string[] =>
  pernasDaFuncao(f, nivel ? { nivel } : {}, envDoRegistro()).map((p) => p.model)

describe('a cascata do registro real', () => {
  afterEach(() => esquecerRegistro())

  it('explicação do pagante (nuance): DeepSeek, depois o gpt-oss, depois os demais como antes', () => {
    expect(modelos('explicacao', 'nuance')).toEqual([DEEPSEEK, GPT_OSS, GEMMA, LLAMA])
  })

  it('explicação da amostra do Grátis (rápida): DeepSeek primeiro; o gpt-oss (nuance) nunca chega à rápida', () => {
    expect(modelos('explicacao', 'rapida')).toEqual([DEEPSEEK, GEMMA, LLAMA])
  })

  it('orçamento a 70/90%: a política de custo põe a perna mais BARATA primeiro também na explicação (Gemma)', () => {
    const pernas = pernasDaFuncao('explicacao', { nivel: 'nuance' }, envDoRegistro())
    const base = { pernas, tokensEntrada: 2_000, tokensSaida: 1_200 }
    // A 90%, todo mundo; a 70%, o pagante com o primeiro balde baixo.
    const a90 = decidirCusto({ ...base, nivel: 'nuance', fracaoDoOrcamento: 0.9, fracaoDoPrimeiroBalde: 1 })
    const a70 = decidirCusto({ ...base, nivel: 'nuance', fracaoDoOrcamento: 0.7, fracaoDoPrimeiroBalde: 0.1 })
    for (const d of [a90, a70]) expect(d.pernas.map((p) => p.model)).toEqual([GEMMA, DEEPSEEK, GPT_OSS, LLAMA])
    // Abaixo disso, a ordem da explicação: o DeepSeek primeiro.
    const normal = decidirCusto({ ...base, nivel: 'nuance', fracaoDoOrcamento: 0.5, fracaoDoPrimeiroBalde: 1 })
    expect(normal.pernas[0].model).toBe(DEEPSEEK)
  })

  it('as outras funções seguem com as pernas de antes, sem o DeepSeek', () => {
    for (const f of ['tutor', 'corretor', 'resumo'] as const) {
      expect(modelos(f, 'nuance'), f).toEqual([GPT_OSS, GEMMA, LLAMA])
      expect(modelos(f, 'rapida'), f).toEqual([GEMMA, LLAMA])
    }
    for (const f of ['traducao', 'alternativas', 'polimento'] as const) {
      expect(modelos(f, 'nuance'), f).toEqual([GPT_OSS, GEMMA, LLAMA])
      expect(modelos(f, 'polimento'), f).toEqual([GPT_OSS, GEMMA, LLAMA])
      expect(modelos(f, 'rapida'), f).toEqual([GEMMA, LLAMA])
    }
  })
})

/* ─────────────────────────────── a rota, com o corpo enviado ─────────────────────────────── */

const PAGANTE = asUserId('explicacao-deepseek-plus')
const OK = JSON.stringify({
  porQue: 'É a despedida natural entre pessoas que vão se ver de novo.',
  gramatica: '"See" no presente; "later" é advérbio de tempo.',
  registro: 'Informal.',
  girias: [{ termo: 'later', sentido: 'até mais' }],
})

let h: EphemeralDb
let explicarProxy: (req: any, res: any) => Promise<void>
let flags: any

function mockRes(): any {
  const r: any = { statusCode: 200, body: undefined, headersSent: false, headers: {} as Record<string, string> }
  r.status = (c: number) => ((r.statusCode = c), r)
  r.json = (b: any) => ((r.body = b), (r.headersSent = true), r)
  r.setHeader = (k: string, v: string) => ((r.headers[k.toLowerCase()] = v), r)
  return r
}

/** Os corpos enviados ao provedor; `falhar(modelo)` decide se aquela perna cai. */
function provedor(falhar: (modelo: string) => boolean = () => false): any[] {
  const corpos: any[] = []
  vi.stubGlobal('fetch', async (_u: unknown, init: any) => {
    const corpo = JSON.parse(init.body)
    corpos.push(corpo)
    if (falhar(corpo.model)) return { ok: false, status: 500, headers: new Headers(), text: async () => 'falhou' }
    return {
      ok: true,
      json: async () => ({
        choices: [{ message: { content: OK } }],
        usage: { prompt_tokens: 300, completion_tokens: 200 },
      }),
    }
  })
  return corpos
}

async function pedir(userId: ReturnType<typeof asUserId>) {
  const res = mockRes()
  await explicarProxy(
    {
      userId,
      body: { texto: 'see you later', traducao: 'até mais', lang: 'en', langDaTraducao: 'pt' },
      requestId: 'r-explicacao-deepseek',
      header: () => undefined,
      headers: {},
    },
    res,
  )
  return res
}

describe('POST /api/ai/explicar no registro real', () => {
  beforeAll(async () => {
    h = await setupEphemeralDb()
    process.env.AUTH_REQUIRED = '1'
    ;({ explicarProxy } = await h.load<any>('../../server/ai/explicar'))
    flags = await h.load<any>('../../server/lib/flags')
    const { subscriptionsRepo } = await h.load<any>('../../server/db/repositories/subscriptions')
    await subscriptionsRepo.upsert(PAGANTE, { plan: 'plus', status: 'active' })
  })
  afterAll(async () => {
    delete process.env.AUTH_REQUIRED
    for (const e of ENVS) process.env[e] = ''
    await h.cleanup()
  })
  beforeEach(async () => {
    /* `delete`, não '': o `lerRegistro` lê `IA_PROVEDORES ?? arquivo`, e o texto vazio venceria o arquivo. */
    for (const e of ENVS) delete process.env[e]
    process.env.IA_PROVEDORES_ARQUIVO = ARQUIVO
    process.env.OPENROUTER_API_KEY = 'chave-openrouter-falsa'
    await flags.definirFlag('ia_de_estudo', { habilitada: true }, 'teste')
  })
  afterEach(async () => {
    vi.unstubAllGlobals()
    esquecerDisjuntores()
    await esquecerAdmissao()
    esquecerRegistro()
  })

  it('pagante: o corpo vai ao DeepSeek sem raciocínio, sem Novita nem Google, com o esquema estrito e a instrução de menor', async () => {
    const corpos = provedor()
    const res = await pedir(PAGANTE)
    expect(res.statusCode).toBe(200)
    expect(res.headers['x-ia-modelo']).toBe(DEEPSEEK)
    expect(corpos).toHaveLength(1)
    const c = corpos[0]
    expect(c.model).toBe(DEEPSEEK)
    expect(c.reasoning).toEqual({ enabled: false })
    expect(c.provider).toMatchObject({ data_collection: 'deny', zdr: true, require_parameters: true })
    expect(c.provider.ignore).toEqual(expect.arrayContaining(['google-ai-studio', 'google-vertex', 'novita']))
    expect(c.response_format?.type).toBe('json_schema')
    expect(c.response_format?.json_schema).toMatchObject({ name: 'explicacao', strict: true })
    expect(c.response_format?.json_schema?.schema).toBeTruthy()
    // Idade não declarada conta como menor: a instrução de segurança chega ao provedor.
    const system = c.messages.find((m: any) => m.role === 'system')?.content ?? ''
    expect(system).toContain('PÚBLICO MENOR')
  })

  it('amostra do Grátis: também o DeepSeek primeiro, sem raciocínio', async () => {
    const corpos = provedor()
    const res = await pedir(asUserId('explicacao-deepseek-gratis'))
    expect(res.statusCode).toBe(200)
    expect(res.body.origem).toBe('amostra')
    expect(corpos[0].model).toBe(DEEPSEEK)
    expect(corpos[0].reasoning).toEqual({ enabled: false })
  })

  it('DeepSeek fora do ar: cai no gpt-oss (raciocínio "low", roteamento de antes) e entrega', async () => {
    const corpos = provedor((m) => m === DEEPSEEK)
    const res = await pedir(PAGANTE)
    expect(res.statusCode).toBe(200)
    expect(res.headers['x-ia-modelo']).toBe(GPT_OSS)
    expect(corpos.map((c) => c.model)).toEqual([DEEPSEEK, GPT_OSS])
    const reserva = corpos[1]
    expect(reserva.reasoning).toEqual({ effort: 'low', exclude: true })
    // O ignore do registro (o Google e a Makora, decisão de 25/10/2026), sem o `novita` que só o DeepSeek leva.
    expect(reserva.provider.ignore).toEqual(['google-ai-studio', 'google-vertex', 'makora'])
    expect(reserva.provider).toMatchObject({ zdr: true, data_collection: 'deny', require_parameters: true })
    expect(reserva.response_format?.json_schema).toMatchObject({ name: 'explicacao', strict: true })
    expect(reserva.messages.find((m: any) => m.role === 'system')?.content).toContain('PÚBLICO MENOR')
  })

  it('amostra do Grátis com o DeepSeek fora: cai no Gemma, sem passar pelo gpt-oss (só da nuance)', async () => {
    const corpos = provedor((m) => m === DEEPSEEK)
    const res = await pedir(asUserId('explicacao-deepseek-gratis-fora'))
    expect(res.statusCode).toBe(200)
    expect(res.body.origem).toBe('amostra')
    expect(res.headers['x-ia-modelo']).toBe(GEMMA)
    expect(corpos.map((c) => c.model)).toEqual([DEEPSEEK, GEMMA])
  })

  it('DeepSeek estoura o tempo: o relógio dele é de 8 s (não 15), e o gpt-oss entrega dentro do prazo total', async () => {
    const chamadas: Array<{ modelo: string; t: number }> = []
    const t0 = Date.now()
    vi.stubGlobal('fetch', async (_u: unknown, init: any) => {
      const corpo = JSON.parse(init.body)
      chamadas.push({ modelo: corpo.model, t: Date.now() - t0 })
      if (corpo.model === DEEPSEEK)
        return new Promise((_, rejeitar) =>
          init.signal.addEventListener('abort', () => rejeitar(init.signal.reason), { once: true }),
        )
      return {
        ok: true,
        json: async () => ({
          choices: [{ message: { content: OK } }],
          usage: { prompt_tokens: 300, completion_tokens: 200 },
        }),
      }
    })
    const res = await pedir(PAGANTE)
    const total = Date.now() - t0
    expect(res.statusCode).toBe(200)
    expect(res.headers['x-ia-modelo']).toBe(GPT_OSS)
    expect(chamadas.map((c) => c.modelo)).toEqual([DEEPSEEK, GPT_OSS])
    expect(chamadas[1].t).toBeGreaterThanOrEqual(7_500)
    expect(chamadas[1].t).toBeLessThan(12_000)
    expect(total).toBeLessThan(30_000)
  }, 25_000)
})
