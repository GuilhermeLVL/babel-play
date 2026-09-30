/**
 * B2 (Fase B, 29/09/2026) — O CUSTO É DE QUEM RESPONDEU: POR PROVEDOR:MODELO, COM CACHE E MÍNIMO.
 *
 * Três erros na conta de antes, cada um com o seu tamanho:
 *
 *   1. PREÇO GLOBAL POR MODELO. `custoDeLlm('openai/gpt-oss-120b', …)` custava US$ 0,15/0,60 por 1M
 *      — o preço da Groq — venha a resposta de onde vier. O mesmo modelo custa US$ 0,037/0,17 na
 *      DeepInfra (deepinfra.com, 29/09/2026): com a cascata barata, o orçamento superestimaria o
 *      gasto ~4× e fecharia a nuvem antes da hora; no sentido contrário, subestimaria;
 *   2. CACHE DE PROMPT IGNORADO. A Groq cobra 50% da entrada nos tokens servidos do cache
 *      (console.groq.com/docs/prompt-caching). O prefixo fixo dos prompts existe para isso, e o
 *      orçamento cobrava como se nenhum token viesse do cache;
 *   3. MÍNIMO DO STT GLOBAL. Todo STT era cobrado com o mínimo de 10 s da Groq, inclusive num
 *      provedor que fatura por segundo sem mínimo — e é esse mínimo que o B6 vai usar para mandar
 *      o clipe curto para quem cobra por segundo.
 *
 * E a regra que amarra os três: o custo sai da perna que DE FATO respondeu. Com o primário em 429,
 * quem entrega é a reserva, e é o preço dela que entra no orçamento, na métrica e no Langfuse.
 */
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'

import { esquecerAdmissao } from '../../server/ai/admissao'
import { esvaziarCacheDeTraducao } from '../../server/ai/cacheDeTraducao'
import { esquecerDisjuntores } from '../../server/ai/disjuntor'
import { esquecerRegistro } from '../../server/ai/registroDeProvedores'
import { asUserId } from '../../server/lib/authContext'
import { type EphemeralDb, setupEphemeralDb } from '../harness/ephemeralDb'

let h: EphemeralDb
let orc: typeof import('../../server/lib/orcamentoDeIa')
let mtTranslateProxy: (req: any, res: any) => Promise<void>
let tutorChat: (req: any, res: any) => Promise<void>
let stt: (req: any, res: any) => Promise<void>
let gasto: any
let subs: any
let metricas: typeof import('../../server/http/metricas')
let promClient: typeof import('prom-client')

const ENVS = [
  'IA_PROVEDORES',
  'GROQ_API_KEY',
  'DEEPINFRA_API_KEY',
  'AI_PRECOS_MODELOS',
  'LLM_API_KEY',
  'STT_API_KEY',
  'GROQ_BASE_URL',
] as const
const mes = () => new Date().toISOString().slice(0, 7)
const USUARIO = asUserId('custo-pro')

beforeAll(async () => {
  h = await setupEphemeralDb()
  process.env.AUTH_REQUIRED = '1'
  orc = await h.load('../../server/lib/orcamentoDeIa')
  ;({ mtTranslateProxy } = await h.load<any>('../../server/ai/mtProxy'))
  ;({ tutorChat } = await h.load<any>('../../server/routes/tutor'))
  ;({ sttTranscribeProxy: stt } = await h.load<any>('../../server/ai/sttProxy'))
  ;({ gastoDeIaRepo: gasto } = await h.load<any>('../../server/db/repositories/gastoDeIa'))
  ;({ subscriptionsRepo: subs } = await h.load<any>('../../server/db/repositories/subscriptions'))
  metricas = await h.load('../../server/http/metricas')
  promClient = await import('prom-client')
  metricas.esquecerMetricas()
  metricas.handlerDeMetricas() // liga as métricas, como o app faz com METRICS_ENABLED=1
  await subs.upsert(USUARIO, { plan: 'pro', status: 'active' })
})
afterAll(async () => {
  metricas.esquecerMetricas()
  delete process.env.AUTH_REQUIRED
  for (const e of ENVS) process.env[e] = ''
  await h.cleanup()
})
beforeEach(() => {
  /* '' e não `delete`: o dotenv repõe a variável apagada a partir do .env de quem roda. */
  for (const e of ENVS) process.env[e] = ''
  esvaziarCacheDeTraducao()
})
afterEach(() => {
  vi.unstubAllGlobals()
  esquecerDisjuntores()
  esquecerAdmissao()
  esquecerRegistro()
})

/* ─────────────────────────── a conta, pura ─────────────────────────── */

describe('custoDeLlm: o preço é de provedor:modelo, e o cache custa menos', () => {
  it('o mesmo gpt-oss-120b custa diferente na Groq e na DeepInfra', () => {
    expect(orc.custoDeLlm('openai/gpt-oss-120b', 1_000_000, 1_000_000, { fornecedor: 'groq' })).toBeCloseTo(0.75, 9)
    expect(orc.custoDeLlm('openai/gpt-oss-120b', 1_000_000, 1_000_000, { fornecedor: 'deepinfra' })).toBeCloseTo(
      0.037 + 0.17,
      9,
    )
  })

  it('sem fornecedor (ou um sem preço próprio), vale o preço do modelo de antes', () => {
    expect(orc.custoDeLlm('openai/gpt-oss-120b', 1_000_000, 1_000_000)).toBeCloseTo(0.75, 9)
    expect(orc.custoDeLlm('openai/gpt-oss-120b', 1_000_000, 1_000_000, { fornecedor: 'outro' })).toBeCloseTo(0.75, 9)
  })

  it('tokens de entrada servidos do cache custam o preço de cache (Groq: 50% da entrada)', () => {
    // 1M de entrada, metade do cache: 0,5 × 0,15 + 0,5 × 0,075.
    expect(orc.custoDeLlm('openai/gpt-oss-120b', 1_000_000, 0, { fornecedor: 'groq', emCache: 500_000 })).toBeCloseTo(
      0.1125,
      9,
    )
  })

  it('sem preço de cache conhecido, o cache custa a entrada inteira — o erro para mais', () => {
    expect(
      orc.custoDeLlm('openai/gpt-oss-120b', 1_000_000, 0, { fornecedor: 'deepinfra', emCache: 1_000_000 }),
    ).toBeCloseTo(0.037, 9)
  })

  it('cache maior que a entrada (provedor que conta errado) não vira custo negativo', () => {
    const c = orc.custoDeLlm('openai/gpt-oss-120b', 100, 0, { fornecedor: 'groq', emCache: 10_000 })
    expect(c).toBeCloseTo((100 * 0.075) / 1_000_000, 12)
  })

  it('o preço DECLARADO no registro vence a tabela embutida', () => {
    const preco = { entrada: 2, entradaEmCache: 1, saida: 4 }
    expect(orc.custoDeLlm('openai/gpt-oss-120b', 1_000_000, 1_000_000, { fornecedor: 'groq', preco })).toBeCloseTo(6, 9)
  })

  it('AI_PRECOS_MODELOS aceita provedor:modelo (e o só-modelo continua valendo)', () => {
    process.env.AI_PRECOS_MODELOS = JSON.stringify({
      'deepinfra:openai/gpt-oss-120b': { entrada: 0.05, entradaEmCache: 0.01, saida: 0.2 },
      'meu/modelo': { entrada: 1, saida: 2 },
    })
    expect(
      orc.custoDeLlm('openai/gpt-oss-120b', 1_000_000, 0, { fornecedor: 'deepinfra', emCache: 1_000_000 }),
    ).toBeCloseTo(0.01, 9)
    expect(orc.custoDeLlm('meu/modelo', 1_000_000, 1_000_000, { fornecedor: 'qualquer' })).toBeCloseTo(3, 9)
  })
})

describe('custoDeStt: o mínimo faturado é do provedor', () => {
  it('Groq: 10 s por pedido, como sempre', () => {
    expect(orc.custoDeStt('whisper-large-v3-turbo', 2, { fornecedor: 'groq' })).toBeCloseTo((0.04 * 10) / 3600, 12)
    expect(orc.minimoFaturadoDoStt('whisper-large-v3-turbo', { fornecedor: 'groq' })).toBe(10)
  })

  it('um provedor que fatura por segundo SEM mínimo paga só a duração', () => {
    const preco = { hora: 3.6, minimoFaturadoS: 0 }
    expect(orc.custoDeStt('whisper-x', 2, { fornecedor: 'cloudflare', preco })).toBeCloseTo(0.002, 12)
    expect(orc.minimoFaturadoDoStt('whisper-x', { preco })).toBe(0)
  })

  it('mínimo não declarado cai nos 10 s — o erro para mais', () => {
    expect(orc.minimoFaturadoDoStt('whisper-x', { preco: { hora: 1 } })).toBe(10)
  })
})

/* ─────────────────────────── o custo da perna que respondeu ─────────────────────────── */

const REGISTRO = {
  provedores: [
    {
      id: 'groq',
      formato: 'openai',
      base: 'https://groq.exemplo/v1',
      chave: 'GROQ_API_KEY',
      retencao: 'zdr',
      modelos: [
        {
          id: 'openai/gpt-oss-120b',
          funcoes: ['traducao', 'tutor'],
          preco: { entrada: 0.15, entradaEmCache: 0.075, saida: 0.6 },
        },
      ],
    },
    {
      id: 'deepinfra',
      formato: 'openai',
      base: 'https://deepinfra.exemplo/v1/openai',
      chave: 'DEEPINFRA_API_KEY',
      retencao: 'zdr',
      modelos: [
        {
          id: 'openai/gpt-oss-120b',
          funcoes: ['traducao', 'tutor'],
          preco: { entrada: 0.04, entradaEmCache: 0.02, saida: 0.2 },
        },
      ],
    },
  ],
}
function registroDeclarado() {
  process.env.IA_PROVEDORES = JSON.stringify(REGISTRO)
  process.env.GROQ_API_KEY = 'chave-groq-falsa'
  process.env.DEEPINFRA_API_KEY = 'chave-deepinfra-falsa'
}
/** Groq em 429; DeepInfra entrega com 1.000 de entrada (400 do cache) e 500 de saída. */
function groqLimitadaDeepinfraEntrega() {
  vi.stubGlobal('fetch', async (url: any) => {
    if (String(url).includes('groq')) return { ok: false, status: 429, text: async () => 'limite' }
    return {
      ok: true,
      json: async () => ({
        choices: [{ message: { content: 'resposta da reserva' } }],
        usage: { prompt_tokens: 1000, prompt_tokens_details: { cached_tokens: 400 }, completion_tokens: 500 },
      }),
    }
  })
}
/** O que a DeepInfra cobra por essa chamada, pelo preço DELA: 600 × 0,04 + 400 × 0,02 + 500 × 0,2. */
const CUSTO_DA_RESERVA = (600 * 0.04 + 400 * 0.02 + 500 * 0.2) / 1_000_000

function mockRes(): any {
  const r: any = { statusCode: 200, body: undefined, headersSent: false }
  r.status = (c: number) => ((r.statusCode = c), r)
  r.json = (b: any) => ((r.body = b), (r.headersSent = true), r)
  r.setHeader = () => r
  return r
}
async function gastoDoMesMicro(): Promise<number> {
  return (await gasto.ler(mes()))?.microUsd ?? 0
}

describe('o orçamento soma o preço de QUEM RESPONDEU', () => {
  it('tradução: primário em 429, a reserva entrega — entra o preço da reserva, com o cache', async () => {
    registroDeclarado()
    groqLimitadaDeepinfraEntrega()
    const antes = await gastoDoMesMicro()
    const res = mockRes()
    await mtTranslateProxy({ userId: USUARIO, body: { text: 'hello there', tgt: 'pt' }, requestId: 'r-custo' }, res)
    expect(res.statusCode).toBe(200)
    expect((await gastoDoMesMicro()) - antes).toBe(Math.round(CUSTO_DA_RESERVA * 1_000_000))
  })

  it('tutor: a mesma regra', async () => {
    registroDeclarado()
    groqLimitadaDeepinfraEntrega()
    const antes = await gastoDoMesMicro()
    const res = mockRes()
    await tutorChat(
      { userId: USUARIO, body: { messages: [{ role: 'user', content: 'o que é leverage?' }] }, requestId: 'r-custo' },
      res,
    )
    expect(res.body?.text).toBe('resposta da reserva')
    expect((await gastoDoMesMicro()) - antes).toBe(Math.round(CUSTO_DA_RESERVA * 1_000_000))
  })

  it('a métrica de custo é rotulada por fornecedor e modelo — os do registro', async () => {
    registroDeclarado()
    groqLimitadaDeepinfraEntrega()
    await mtTranslateProxy({ userId: USUARIO, body: { text: 'good morning', tgt: 'pt' }, requestId: 'r-m' }, mockRes())
    const corpo = await promClient.register.metrics()
    const linha = corpo
      .split('\n')
      .find((l) => l.startsWith('ia_provedor_custo_usd_total{') && l.includes('fornecedor="deepinfra"'))
    expect(linha).toBeDefined()
    expect(linha).toContain('modelo="openai/gpt-oss-120b"')
    expect(linha).toContain('provedor="llm-reserva"')
    // A perna que falhou tem latência, com o fornecedor dela — e custo nenhum.
    expect(corpo).toMatch(/ia_provedor_latencia_ms_count\{[^}]*fornecedor="groq"/)
    expect(corpo).not.toMatch(/ia_provedor_custo_usd_total\{[^}]*fornecedor="groq"/)
  })

  it('rótulo fora do registro vira "outro": a cardinalidade não cresce com o que não foi declarado', () => {
    metricas.observarChamadaDeProvedor({
      provedor: 'llm-primario',
      funcao: 'traducao',
      ms: 10,
      custoUsd: 0.001,
      fornecedor: 'fornecedor-inventado',
      modelo: 'modelo-que-ninguem-declarou',
    })
    return promClient.register.metrics().then((corpo) => {
      expect(corpo).not.toContain('fornecedor-inventado')
      expect(corpo).not.toContain('modelo-que-ninguem-declarou')
      expect(corpo).toMatch(/ia_provedor_custo_usd_total\{[^}]*fornecedor="outro",modelo="outro"/)
    })
  })
})

/* ─────────────────────────── o STT: o mínimo do provedor que atendeu ─────────────────────────── */

/** WAV PCM 16 kHz mono 16 bits com `segundos` de silêncio. */
function wav(segundos: number): Buffer {
  const taxa = 16_000
  const dados = Math.round(taxa * segundos) * 2
  const b = Buffer.alloc(44 + dados)
  b.write('RIFF', 0)
  b.writeUInt32LE(36 + dados, 4)
  b.write('WAVE', 8)
  b.write('fmt ', 12)
  b.writeUInt32LE(16, 16)
  b.writeUInt16LE(1, 20)
  b.writeUInt16LE(1, 22)
  b.writeUInt32LE(taxa, 24)
  b.writeUInt32LE(taxa * 2, 28)
  b.writeUInt16LE(2, 32)
  b.writeUInt16LE(16, 34)
  b.write('data', 36)
  b.writeUInt32LE(dados, 40)
  return b
}
const reqStt = (corpo: Buffer): any => ({
  userId: USUARIO,
  body: corpo,
  header: () => undefined,
  requestId: 'r-stt-custo',
})
function sttResponde() {
  vi.stubGlobal(
    'fetch',
    async () =>
      new Response(JSON.stringify({ text: 'olá', language: 'portuguese', duration: 2 }), {
        status: 200,
        headers: { 'content-type': 'application/json' },
      }),
  )
}

describe('STT: o custo usa o mínimo faturado DO PROVEDOR', () => {
  it('provedor declarado sem mínimo: 2 s de áudio custam 2 s', async () => {
    process.env.IA_PROVEDORES = JSON.stringify({
      provedores: [
        {
          id: 'stt-por-segundo',
          formato: 'openai',
          // IP público literal: `assertPublicUrl` resolve DNS de verdade, e o host não é assunto aqui.
          base: 'http://203.0.113.20/v1',
          chave: 'DEEPINFRA_API_KEY',
          retencao: 'zdr',
          modelos: [{ id: 'whisper-por-segundo', funcoes: ['stt'], preco: { hora: 3.6, minimoFaturadoS: 0 } }],
        },
      ],
    })
    process.env.DEEPINFRA_API_KEY = 'chave-stt-falsa'
    sttResponde()
    const antes = await gastoDoMesMicro()
    const res = mockRes()
    await stt(reqStt(wav(2)), res)
    expect(res.statusCode).toBe(200)
    expect((await gastoDoMesMicro()) - antes).toBe(Math.round(((2 * 3.6) / 3600) * 1_000_000))
  })

  it('legado na Groq: o mínimo de 10 s continua (é o que a Groq fatura)', async () => {
    process.env.STT_API_KEY = 'chave-stt-falsa'
    process.env.GROQ_BASE_URL = 'http://203.0.113.20/v1'
    sttResponde()
    const antes = await gastoDoMesMicro()
    await stt(reqStt(wav(2)), mockRes())
    expect((await gastoDoMesMicro()) - antes).toBe(Math.round(orc.custoDeStt('whisper-large-v3-turbo', 10) * 1_000_000))
  })
})
