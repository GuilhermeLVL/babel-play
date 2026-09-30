/**
 * B4 (Fase B, 29/09/2026) — A DEGRADAÇÃO SUAVE PELO ORÇAMENTO E PELA DEMANDA.
 *
 * Antes desta política só havia o corte duro: o `portaoDaNuvem` fecha a nuvem a 100% do orçamento
 * (do mês ou do dia), e até lá toda chamada ia para o primeiro da cascata — o modelo da nuance de
 * quem paga, o mais caro. A regra do dono:
 *
 *   - a 70% do orçamento, QUEM PAGA desce para o degrau mais barato SÓ quando o balde do primeiro
 *     provedor está abaixo de 20% (a demanda apertou: é quando o caro ia recusar de qualquer jeito);
 *   - a 90%, TODOS começam no degrau mais barato;
 *   - degradado, o `max_tokens` cai para 75% — só em modelo SEM raciocínio: num gpt-oss o
 *     pensamento sai do mesmo teto, e cortar produziria a resposta vazia que o `llmClient` explica;
 *   - o corte duro continua no `portaoDaNuvem` (a 100%, 503 e o aparelho assume).
 *
 * Testado com o orçamento FORÇADO (o gasto do mês gravado direto no banco) a 70% e a 90%.
 */
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'

import { admitirNoBalde, esquecerAdmissao } from '../../server/ai/admissao'
import { esquecerDisjuntores } from '../../server/ai/disjuntor'
import { ehModeloDeRaciocinio } from '../../server/ai/parametrosDoProvedor'
import {
  decidirCusto,
  FATOR_DE_SAIDA_ECONOMICA,
  LIMIAR_DE_TODOS,
  LIMIAR_DO_PAGANTE,
  SALDO_BAIXO_DO_PRIMEIRO,
} from '../../server/ai/politicaDeCusto'
import type { Provedor } from '../../server/ai/provedores'
import { esquecerRegistro } from '../../server/ai/registroDeProvedores'
import { asUserId } from '../../server/lib/authContext'
import { type EphemeralDb, setupEphemeralDb } from '../harness/ephemeralDb'

const perna = (model: string, fornecedor: string, entrada: number, saida: number): Provedor => ({
  rotulo: 'llm-primario',
  base: `https://${fornecedor}.exemplo/v1`,
  apiKey: 'k',
  model,
  fornecedor,
  preco: { entrada, saida },
})
const NUANCE = perna('openai/gpt-oss-120b', 'deepinfra', 0.04, 0.2)
const BARATA = perna('google/gemma-4-26b-a4b-it', 'deepinfra', 0.01, 0.03)
const RESERVA = perna('openai/gpt-oss-120b', 'groq', 0.15, 0.6)
const CASCATA = [NUANCE, BARATA, RESERVA]
const base = { pernas: CASCATA, tokensEntrada: 100, tokensSaida: 400 }
const ordem = (pernas: Provedor[]) => pernas.map((p) => `${p.fornecedor}:${p.model}`)

describe('os números da regra', () => {
  it('70%, 90%, 20% do balde e 75% da saída — os do dono', () => {
    expect([LIMIAR_DO_PAGANTE, LIMIAR_DE_TODOS, SALDO_BAIXO_DO_PRIMEIRO, FATOR_DE_SAIDA_ECONOMICA]).toEqual([
      0.7, 0.9, 0.2, 0.75,
    ])
  })

  it('raciocínio: gpt-oss e os pensadores conhecidos; Gemma e Llama não', () => {
    for (const m of [
      'openai/gpt-oss-120b',
      'gpt-oss-20b',
      '@cf/openai/gpt-oss-20b',
      'deepseek-ai/DeepSeek-R1',
      'Qwen/QwQ-32B',
    ])
      expect(ehModeloDeRaciocinio(m), m).toBe(true)
    for (const m of ['google/gemma-4-26b-a4b-it', 'meta-llama/Llama-3.3-70B-Instruct'])
      expect(ehModeloDeRaciocinio(m), m).toBe(false)
  })
})

describe('decidirCusto (pura)', () => {
  it('abaixo de 70%: a cascata do nível como veio', () => {
    const d = decidirCusto({ ...base, nivel: 'nuance', fracaoDoOrcamento: 0.69, fracaoDoPrimeiroBalde: 0 })
    expect(d.degradacao).toBe('nenhuma')
    expect(d.pernas).toEqual(CASCATA)
    expect(d.fatorDeSaida).toBe(1)
  })

  it('a 70%, o pagante com o primeiro balde folgado continua na nuance', () => {
    const d = decidirCusto({ ...base, nivel: 'nuance', fracaoDoOrcamento: 0.75, fracaoDoPrimeiroBalde: 0.5 })
    expect(d.degradacao).toBe('nenhuma')
    expect(d.pernas).toEqual(CASCATA)
  })

  it('a 70%, o pagante com o primeiro balde abaixo de 20% começa no degrau mais barato', () => {
    const d = decidirCusto({ ...base, nivel: 'nuance', fracaoDoOrcamento: 0.7, fracaoDoPrimeiroBalde: 0.19 })
    expect(d.degradacao).toBe('orcamento_70')
    expect(ordem(d.pernas)).toEqual([
      'deepinfra:google/gemma-4-26b-a4b-it',
      'deepinfra:openai/gpt-oss-120b',
      'groq:openai/gpt-oss-120b',
    ])
    expect(d.fatorDeSaida).toBe(0.75)
  })

  it('a 70%, a rápida (quem não paga) não muda: a regra dos 70% é do pagante', () => {
    const d = decidirCusto({ ...base, nivel: 'rapida', fracaoDoOrcamento: 0.8, fracaoDoPrimeiroBalde: 0 })
    expect(d.degradacao).toBe('nenhuma')
    expect(d.pernas).toEqual(CASCATA)
  })

  it('a 90%, todo nível começa no degrau mais barato, com o balde como estiver', () => {
    for (const nivel of ['rapida', 'nuance', 'polimento'] as const) {
      const d = decidirCusto({ ...base, nivel, fracaoDoOrcamento: 0.9, fracaoDoPrimeiroBalde: 1 })
      expect(d.degradacao, nivel).toBe('orcamento_90')
      expect(ordem(d.pernas)[0], nivel).toBe('deepinfra:google/gemma-4-26b-a4b-it')
    }
  })

  it('o degrau mais barato é pelo PREÇO de fornecedor:modelo do pedido, não pela posição', () => {
    const carissima = perna('m-cara', 'x', 5, 20)
    const d = decidirCusto({
      pernas: [carissima, RESERVA, NUANCE],
      tokensEntrada: 100,
      tokensSaida: 400,
      nivel: 'rapida',
      fracaoDoOrcamento: 0.95,
      fracaoDoPrimeiroBalde: 1,
    })
    expect(ordem(d.pernas)).toEqual(['deepinfra:openai/gpt-oss-120b', 'x:m-cara', 'groq:openai/gpt-oss-120b'])
  })

  it('uma perna só: a ordem não muda, mas a saída econômica vale', () => {
    const d = decidirCusto({
      ...base,
      pernas: [BARATA],
      nivel: 'rapida',
      fracaoDoOrcamento: 0.92,
      fracaoDoPrimeiroBalde: 1,
    })
    expect(d.pernas).toEqual([BARATA])
    expect(d.fatorDeSaida).toBe(0.75)
  })
})

/* ─────────────────────────── na rota, com o orçamento forçado ─────────────────────────── */

let h: EphemeralDb
let mtTranslateProxy: (req: any, res: any) => Promise<void>
let tutorChat: (req: any, res: any) => Promise<void>
let gasto: any
let subs: any
let cache: any

const PAGANTE = asUserId('custo-pagante')
const ENVS = ['IA_PROVEDORES', 'DEEPINFRA_API_KEY', 'GROQ_API_KEY', 'AI_BUDGET_USD_MONTH', 'AI_BUDGET_USD_DAY'] as const
const mes = () => new Date().toISOString().slice(0, 7)

const REGISTRO = {
  provedores: [
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
          niveis: ['nuance'],
          preco: { entrada: 0.04, saida: 0.2 },
          limites: { rpm: 10 },
        },
        { id: 'google/gemma-4-26b-a4b-it', funcoes: ['traducao', 'tutor'], preco: { entrada: 0.01, saida: 0.03 } },
      ],
    },
    {
      id: 'groq',
      formato: 'openai',
      base: 'https://groq.exemplo/openai/v1',
      chave: 'GROQ_API_KEY',
      retencao: 'zdr',
      modelos: [{ id: 'openai/gpt-oss-120b', funcoes: ['traducao', 'tutor'], preco: { entrada: 0.15, saida: 0.6 } }],
    },
  ],
}

function mockRes(): any {
  const r: any = { statusCode: 200, body: undefined, headersSent: false, headers: {} }
  r.status = (c: number) => ((r.statusCode = c), r)
  r.json = (b: any) => ((r.body = b), (r.headersSent = true), r)
  r.setHeader = (n: string, v: string) => ((r.headers[n.toLowerCase()] = v), r)
  return r
}
/** O provedor falso: registra modelo e `max_tokens` de cada chamada, e responde. */
function provedorFalso() {
  const chamadas: Array<{ modelo: string; maxTokens: number }> = []
  vi.stubGlobal('fetch', async (_u: unknown, init: any) => {
    const corpo = JSON.parse(init.body)
    chamadas.push({ modelo: corpo.model, maxTokens: corpo.max_tokens })
    return {
      ok: true,
      json: async () => ({
        choices: [{ message: { content: `de ${corpo.model}` } }],
        usage: { prompt_tokens: 30, completion_tokens: 5 },
      }),
    }
  })
  return chamadas
}
/**
 * Força o gasto de um período (`AAAA-MM` ou `AAAA-MM-DD`) a `fracao` do teto: o gasto só sobe (o
 * repositório soma), então é o TETO que se ajusta ao que já foi gasto. Um fio acima da fração, para a
 * divisão em ponto flutuante não cair logo abaixo do limiar.
 */
async function forcarGasto(periodo: string, variavel: string, fracao: number) {
  /* Pelo menos US$ 1 gasto: com microdólares só, o arredondamento do portão (teto × 10⁶) fecharia. */
  if (!((await gasto.ler(periodo))?.microUsd >= 1_000_000)) await gasto.somar(periodo, 1_000_000)
  const gastoUsd = (await gasto.ler(periodo)).microUsd / 1_000_000
  process.env[variavel] = String(gastoUsd / (fracao >= 1 ? 1 : fracao + 0.0005))
}
const orcamentoEm = (fracao: number) => forcarGasto(mes(), 'AI_BUDGET_USD_MONTH', fracao)
/** Esvazia o balde do modelo da nuance até sobrar `sobra` de 10 pedidos. */
function baldeDaNuanceCom(sobra: number) {
  for (let i = 0; i < 10 - sobra; i++)
    admitirNoBalde({
      tipo: 'llm',
      provedor: 'deepinfra',
      modelo: 'openai/gpt-oss-120b',
      plano: 'pro',
      limites: { rpm: 10 },
    })
}
/* O pagante PEDE a nuance (D1 da Fase D: sem `nivel`, a legenda ao vivo fica na rápida, e a
   degradação que estes casos medem é a do degrau da nuance). */
const traduzir = async (texto: string) => {
  const res = mockRes()
  await mtTranslateProxy(
    { userId: PAGANTE, body: { text: texto, tgt: 'pt', nivel: 'nuance' }, requestId: 'r-custo' },
    res,
  )
  return res
}

describe('a degradação na rota, com o orçamento forçado', () => {
  beforeAll(async () => {
    h = await setupEphemeralDb()
    process.env.AUTH_REQUIRED = '1'
    ;({ mtTranslateProxy } = await h.load<any>('../../server/ai/mtProxy'))
    ;({ tutorChat } = await h.load<any>('../../server/routes/tutor'))
    ;({ gastoDeIaRepo: gasto } = await h.load<any>('../../server/db/repositories/gastoDeIa'))
    ;({ subscriptionsRepo: subs } = await h.load<any>('../../server/db/repositories/subscriptions'))
    cache = await h.load<any>('../../server/ai/cacheDeTraducao')
    await subs.upsert(PAGANTE, { plan: 'essencial', status: 'active' })
  })
  afterAll(async () => {
    delete process.env.AUTH_REQUIRED
    for (const e of ENVS) process.env[e] = ''
    await h.cleanup()
  })
  beforeEach(async () => {
    for (const e of ENVS) process.env[e] = ''
    process.env.IA_PROVEDORES = JSON.stringify(REGISTRO)
    process.env.DEEPINFRA_API_KEY = 'chave-deepinfra-falsa'
    process.env.GROQ_API_KEY = 'chave-groq-falsa'
    await cache.esvaziarCacheDeTraducao()
  })
  afterEach(() => {
    vi.unstubAllGlobals()
    esquecerAdmissao()
    esquecerDisjuntores()
    esquecerRegistro()
  })

  it('50%: o pagante na nuance, com o max_tokens inteiro', async () => {
    await orcamentoEm(0.5)
    const chamadas = provedorFalso()
    expect((await traduzir('good morning')).statusCode).toBe(200)
    expect(chamadas).toEqual([{ modelo: 'openai/gpt-oss-120b', maxTokens: 400 }])
  })

  it('70% com o balde da nuance folgado: continua na nuance', async () => {
    await orcamentoEm(0.7)
    const chamadas = provedorFalso()
    await traduzir('good afternoon')
    expect(chamadas[0].modelo).toBe('openai/gpt-oss-120b')
  })

  it('70% com o balde da nuance abaixo de 20%: o barato, com 75% da saída (ele não raciocina)', async () => {
    await orcamentoEm(0.7)
    baldeDaNuanceCom(1)
    const chamadas = provedorFalso()
    const res = await traduzir('good night')
    expect(res.statusCode).toBe(200)
    expect(res.body?.provenance?.origin).toBe('google/gemma-4-26b-a4b-it')
    expect(chamadas).toEqual([{ modelo: 'google/gemma-4-26b-a4b-it', maxTokens: 300 }])
  })

  it('90%: todos começam no barato, com o balde cheio', async () => {
    await orcamentoEm(0.9)
    const chamadas = provedorFalso()
    await traduzir('see you tomorrow')
    expect(chamadas).toEqual([{ modelo: 'google/gemma-4-26b-a4b-it', maxTokens: 300 }])
  })

  it('90% e o barato fora: a próxima perna é um modelo de raciocínio, e o max_tokens dela fica inteiro', async () => {
    await orcamentoEm(0.9)
    const chamadas: Array<{ modelo: string; maxTokens: number }> = []
    vi.stubGlobal('fetch', async (_u: unknown, init: any) => {
      const corpo = JSON.parse(init.body)
      chamadas.push({ modelo: corpo.model, maxTokens: corpo.max_tokens })
      if (corpo.model.startsWith('google/')) return { ok: false, status: 500, text: async () => 'fora' }
      return {
        ok: true,
        json: async () => ({
          choices: [{ message: { content: 'ok' } }],
          usage: { prompt_tokens: 1, completion_tokens: 1 },
        }),
      }
    })
    await traduzir('have a nice day')
    expect(chamadas).toEqual([
      { modelo: 'google/gemma-4-26b-a4b-it', maxTokens: 300 },
      { modelo: 'openai/gpt-oss-120b', maxTokens: 400 },
    ])
  })

  it('o tutor segue a mesma política a 90%', async () => {
    await orcamentoEm(0.9)
    const chamadas = provedorFalso()
    const res = mockRes()
    await tutorChat(
      { userId: PAGANTE, body: { messages: [{ role: 'user', content: 'o que é leverage?' }] }, requestId: 'r' },
      res,
    )
    expect(res.body?.text).toBe('de google/gemma-4-26b-a4b-it')
    expect(chamadas[0]).toEqual({ modelo: 'google/gemma-4-26b-a4b-it', maxTokens: Math.floor(900 * 0.75) })
  })

  it('100%: o corte duro continua no portão — 503 e nenhuma chamada', async () => {
    await orcamentoEm(1)
    const chamadas = provedorFalso()
    const res = await traduzir('bye bye')
    expect(res.statusCode).toBe(503)
    expect(res.body?.code).toBe('orcamento_esgotado')
    expect(chamadas).toHaveLength(0)
  })

  it('o teto do DIA também conta: 90% do dia degrada mesmo com o mês folgado', async () => {
    process.env.AI_BUDGET_USD_MONTH = '100000'
    await forcarGasto(new Date().toISOString().slice(0, 10), 'AI_BUDGET_USD_DAY', 0.9)
    const chamadas = provedorFalso()
    await traduzir('see you later')
    expect(chamadas[0].modelo).toBe('google/gemma-4-26b-a4b-it')
  })
})
