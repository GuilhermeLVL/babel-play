/**
 * IA DE ESTUDO (planos v4, etapa 2, Task 3) — `POST /api/ai/resumir`, o resumo da sessão que vira cartões.
 *
 * O que se prova:
 *   - flag `ia_de_estudo` desligada: 404 `recurso_indisponivel` antes de ler corpo, plano ou sessão;
 *   - a sessão é lida PELO DONO: sessão de outra pessoa e sessão inexistente dão o MESMO 404 `sessao_inexistente`,
 *     sem provedor e sem contar uso (nada vaza, nem a existência);
 *   - sessão com menos de 4 falas finais: 400 `sessao_curta`, sem provedor e sem contar uso;
 *   - Plus: 200 com 3 pontos e os cartões JÁ FILTRADOS (o candidato que `avaliarFrase`/`LIMITES_DO_BULK_ADD`
 *     reprovam não chega à resposta), a frase do cartão é a da sessão, e `resumos_mes` conta;
 *   - Grátis: a amostra é 1 resumo por semana; o 2º é 402 `amostra_acabou`, sem provedor;
 *   - resposta malformada: 502 `resposta_invalida` e o uso CONSUMIDO; provedor fora: 502 e o uso estornado;
 *   - as falas vão ao prompt delimitadas e, se passarem do teto de entrada, só as ÚLTIMAS que cabem;
 *   - menor (idade não declarada conta como menor) recebe a instrução de segurança; adulto não;
 *   - retenção zero: provedor sem `retencao: 'zdr'` nunca é chamado.
 */
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'

import { esquecerAdmissao } from '../../server/ai/admissao'
import { esquecerDisjuntores } from '../../server/ai/disjuntor'
import { FUNCOES_DE_IA } from '../../server/ai/funcoesDeIa'
import { esquecerRegistro } from '../../server/ai/registroDeProvedores'
import { asUserId } from '../../server/lib/authContext'
import { avaliarFrase, LIMITES_DO_BULK_ADD } from '../../src/core/learning/quality'
import { AMOSTRA_DE_IA } from '../../src/core/planos'
import { type EphemeralDb, setupEphemeralDb } from '../harness/ephemeralDb'

const OPENROUTER = {
  id: 'openrouter',
  formato: 'openai',
  base: 'https://openrouter.ai/api/v1',
  chave: 'OPENROUTER_API_KEY',
  retencao: 'zdr',
  roteamento: { data_collection: 'deny', zdr: true, ignore: ['google-ai-studio', 'google-vertex'] },
  modelos: [
    { id: 'google/gemma-4-26b-a4b-it', funcoes: ['traducao', 'tutor'], preco: { entrada: 0.0675, saida: 0.225 } },
  ],
}
const SEM_ZDR = {
  id: 'semzdr',
  formato: 'openai',
  base: 'https://semzdr.exemplo/v1',
  chave: 'SEMZDR_API_KEY',
  retencao: 'desconhecida',
  modelos: [{ id: 'modelo-que-guarda', funcoes: ['tutor'], preco: { entrada: 0.01, saida: 0.01 } }],
}
const ENVS = [
  'IA_PROVEDORES',
  'OPENROUTER_API_KEY',
  'SEMZDR_API_KEY',
  'DEEPINFRA_API_KEY',
  'LLM_API_KEY',
  'GROQ_API_KEY',
] as const

const PAGANTE = asUserId('resumir-plus')
const OUTRA = asUserId('resumir-outra-pessoa')
const mes = () => new Date().toISOString().slice(0, 7)

let h: EphemeralDb
let resumirProxy: (req: any, res: any) => Promise<void>
let counters: any
let flags: any
let sessions: any
let estudo: typeof import('../../server/lib/iaDeEstudo')
let usageQuota: any
let idades: any

interface Chamada {
  url: string
  system: string
  user: string
  maxTokens: number
}

function mockRes(): any {
  const r: any = { statusCode: 200, body: undefined, headersSent: false, headers: {} as Record<string, string> }
  r.status = (c: number) => ((r.statusCode = c), r)
  r.json = (b: any) => ((r.body = b), (r.headersSent = true), r)
  r.setHeader = (k: string, v: string) => ((r.headers[k.toLowerCase()] = v), r)
  return r
}

function provedor(resposta: (c: Chamada) => { status?: number; texto?: string }): Chamada[] {
  const chamadas: Chamada[] = []
  vi.stubGlobal('fetch', async (u: unknown, init: any) => {
    const corpo = JSON.parse(init.body) as { max_tokens: number; messages: Array<{ role: string; content: string }> }
    const c = {
      url: String(u),
      maxTokens: corpo.max_tokens,
      system: corpo.messages.find((m) => m.role === 'system')?.content ?? '',
      user: corpo.messages.find((m) => m.role === 'user')?.content ?? '',
    }
    chamadas.push(c)
    const r = resposta(c)
    if (r.status && r.status !== 200)
      return { ok: false, status: r.status, headers: new Headers(), text: async () => 'falhou' }
    return {
      ok: true,
      json: async () => ({
        choices: [{ message: { content: r.texto ?? '' } }],
        usage: { prompt_tokens: 900, completion_tokens: 400 },
      }),
    }
  })
  return chamadas
}

/** As falas de uma sessão de série em inglês, traduzida para o português. A 4ª é uma fala cortada. */
const FALAS = [
  { sourceText: 'We should grab a coffee sometime.', translatedText: 'A gente devia tomar um café qualquer dia.' },
  { sourceText: 'I am running late for the meeting.', translatedText: 'Estou atrasado para a reunião.' },
  { sourceText: 'Honestly, it was a piece of cake.', translatedText: 'Sinceramente, foi moleza.' },
  { sourceText: 'that was the thing and then we', translatedText: 'aquilo era a coisa e então nós' },
  { sourceText: 'Let me know when you are free.', translatedText: 'Me avisa quando estiver livre.' },
]

const PONTOS = ['Combinaram um café.', 'Alguém estava atrasado para a reunião.', 'A tarefa foi fácil.']
const BONS = [
  { fala: 1, palavra: 'grab a coffee', verso: 'tomar um café' },
  { fala: 3, palavra: 'piece of cake', verso: 'moleza' },
]
const RUINS = [
  { fala: 4, palavra: 'thing', verso: 'coisa' }, // a fala cortada: avaliarFrase reprova
  { fala: 2, palavra: 'a', verso: 'um' }, // curta demais para o bulk-add
  { fala: 2, palavra: 'x'.repeat(LIMITES_DO_BULK_ADD.max + 1), verso: 'longa' }, // longa demais
  { fala: 2, palavra: 'unicorn', verso: 'unicórnio' }, // não está na fala
  { fala: 99, palavra: 'coffee', verso: 'café' }, // fala inexistente
  { fala: 5, palavra: 'free', verso: 'livre', extra: 'campo a mais' },
]
const OK = JSON.stringify({ pontos: PONTOS, cartoes: [...RUINS.slice(0, 3), BONS[0], ...RUINS.slice(3), BONS[1]] })

async function criarSessao(
  dono: ReturnType<typeof asUserId>,
  falas: Array<{ sourceText: string; translatedText: string }> = FALAS,
): Promise<string> {
  const s = await sessions.createWithUtterances(
    dono,
    { title: 'Série', kind: 'live', sourceLang: 'en', targetLang: 'pt' },
    falas.map((f, idx) => ({ idx, sourceLang: 'en', targetLang: 'pt', source: 'system', ...f })),
  )
  return s.id
}

async function pedir(userId: ReturnType<typeof asUserId>, body: Record<string, unknown>) {
  const res = mockRes()
  await resumirProxy({ userId, body, requestId: 'r-resumir', header: () => undefined, headers: {} }, res)
  return res
}

const contador = async (userId: ReturnType<typeof asUserId>, metrica: string, janela: string) =>
  (await counters.get(userId, metrica, janela)) ?? 0
const semana = async (userId: ReturnType<typeof asUserId>) =>
  usageQuota.janelaDaSemana(await usageQuota.janelaDoDia(userId))

beforeAll(async () => {
  h = await setupEphemeralDb()
  process.env.AUTH_REQUIRED = '1'
  ;({ resumirProxy } = await h.load<any>('../../server/ai/resumir'))
  ;({ usageCountersRepo: counters } = await h.load<any>('../../server/db/repositories/usageCounters'))
  ;({ sessionsRepo: sessions } = await h.load<any>('../../server/db/repositories/sessions'))
  ;({ idadesRepo: idades } = await h.load<any>('../../server/db/repositories/idades'))
  flags = await h.load<any>('../../server/lib/flags')
  estudo = await h.load<any>('../../server/lib/iaDeEstudo')
  usageQuota = await h.load<any>('../../server/lib/usageQuota')
  const { subscriptionsRepo } = await h.load<any>('../../server/db/repositories/subscriptions')
  await subscriptionsRepo.upsert(PAGANTE, { plan: 'plus', status: 'active' })
})
afterAll(async () => {
  delete process.env.AUTH_REQUIRED
  for (const e of ENVS) process.env[e] = ''
  await h.cleanup()
})
beforeEach(async () => {
  for (const e of ENVS) process.env[e] = ''
  process.env.IA_PROVEDORES = JSON.stringify({ provedores: [OPENROUTER] })
  process.env.OPENROUTER_API_KEY = 'chave-openrouter-falsa'
  await flags.definirFlag('ia_de_estudo', { habilitada: true }, 'teste')
})
afterEach(async () => {
  vi.unstubAllGlobals()
  esquecerDisjuntores()
  await esquecerAdmissao()
  esquecerRegistro()
})

describe('a flag e o corpo', () => {
  it('flag desligada: 404 recurso_indisponivel, mesmo com corpo inválido, sem provedor', async () => {
    await flags.definirFlag('ia_de_estudo', { habilitada: false }, 'teste')
    const chamadas = provedor(() => ({ texto: OK }))
    for (const corpo of [{ sessionId: await criarSessao(PAGANTE) }, {}]) {
      const res = await pedir(PAGANTE, corpo)
      expect(res.statusCode).toBe(404)
      expect(res.body?.code).toBe('recurso_indisponivel')
    }
    expect(chamadas).toHaveLength(0)
  })

  it('corpo inválido: 400 invalido', async () => {
    const chamadas = provedor(() => ({ texto: OK }))
    for (const corpo of [{}, { sessionId: '' }, { sessionId: 'x'.repeat(200) }, { sessionId: 3 }]) {
      const res = await pedir(PAGANTE, corpo)
      expect(res.statusCode, JSON.stringify(corpo).slice(0, 40)).toBe(400)
      expect(res.body?.code).toBe('invalido')
    }
    expect(chamadas).toHaveLength(0)
  })
})

describe('a sessão é do dono', () => {
  it('sessão de OUTRA pessoa: 404 sessao_inexistente, igual à inexistente; sem provedor e sem contar uso', async () => {
    const alheia = await criarSessao(OUTRA)
    const chamadas = provedor(() => ({ texto: OK }))
    const antes = await contador(PAGANTE, estudo.METRIC_RESUMOS_MES, mes())
    const res = await pedir(PAGANTE, { sessionId: alheia })
    const inexistente = await pedir(PAGANTE, { sessionId: 'sessao-que-nao-existe' })
    expect(res.statusCode).toBe(404)
    expect(res.body?.code).toBe('sessao_inexistente')
    expect(inexistente.statusCode).toBe(404)
    expect(res.body).toEqual(inexistente.body)
    expect(JSON.stringify(res.body)).not.toContain('coffee')
    expect(chamadas).toHaveLength(0)
    expect(await contador(PAGANTE, estudo.METRIC_RESUMOS_MES, mes())).toBe(antes)
  })

  it('sessão com menos de 4 falas finais: 400 sessao_curta, sem provedor e sem contar uso', async () => {
    const curta = await criarSessao(PAGANTE, [
      ...FALAS.slice(0, 3),
      { sourceText: '   ', translatedText: '' }, // fala vazia não conta
    ])
    const chamadas = provedor(() => ({ texto: OK }))
    const antes = await contador(PAGANTE, estudo.METRIC_RESUMOS_MES, mes())
    const res = await pedir(PAGANTE, { sessionId: curta })
    expect(res.statusCode).toBe(400)
    expect(res.body?.code).toBe('sessao_curta')
    expect(chamadas).toHaveLength(0)
    expect(await contador(PAGANTE, estudo.METRIC_RESUMOS_MES, mes())).toBe(antes)
  })
})

describe('plano pago (Plus)', () => {
  it('200 com 3 pontos e os cartões já filtrados; a frase é a da sessão; conta o resumo do mês', async () => {
    const id = await criarSessao(PAGANTE)
    const chamadas = provedor(() => ({ texto: OK }))
    const antes = await contador(PAGANTE, estudo.METRIC_RESUMOS_MES, mes())
    const res = await pedir(PAGANTE, { sessionId: id, lang: 'pt-BR' })
    expect(res.statusCode).toBe(200)
    expect(res.body).toEqual({
      pontos: PONTOS,
      cartoes: [
        {
          word: 'grab a coffee',
          back: 'tomar um café',
          sentence: FALAS[0].sourceText,
          srcLang: 'en',
          tgtLang: 'pt-BR',
        },
        { word: 'piece of cake', back: 'moleza', sentence: FALAS[2].sourceText, srcLang: 'en', tgtLang: 'pt-BR' },
      ],
      origem: 'plano',
      restanteNaAmostra: null,
    })
    for (const c of res.body.cartoes) {
      expect(c.word.length).toBeGreaterThanOrEqual(LIMITES_DO_BULK_ADD.min)
      expect(c.word.length).toBeLessThanOrEqual(LIMITES_DO_BULK_ADD.max)
      expect(avaliarFrase(c.sentence).serve).toBe(true)
    }
    expect(chamadas).toHaveLength(1)
    expect(chamadas[0].maxTokens).toBeLessThanOrEqual(FUNCOES_DE_IA.resumo.maxTokens)
    /* As falas do BANCO, delimitadas como dado. */
    expect(chamadas[0].user).toContain('1. [inglês] <<<We should grab a coffee sometime.>>>')
    expect(chamadas[0].user).toContain('= <<<Me avisa quando estiver livre.>>>')
    expect(await contador(PAGANTE, estudo.METRIC_RESUMOS_MES, mes())).toBe(antes + 1)
  })

  it('sem `lang`: os versos ficam no idioma das traduções da sessão', async () => {
    const id = await criarSessao(PAGANTE)
    const chamadas = provedor(() => ({ texto: OK }))
    const res = await pedir(PAGANTE, { sessionId: id })
    expect(res.statusCode).toBe(200)
    expect(res.body.cartoes[0].tgtLang).toBe('pt')
    expect(chamadas[0].system).toMatch(/Idioma de quem estuda: português/)
  })

  it('falas acima do teto de entrada: vão só as ÚLTIMAS que cabem', async () => {
    const muitas = Array.from({ length: 400 }, (_, i) => ({
      sourceText: `Line number ${i} of a very long episode with plenty of dialogue.`,
      translatedText: `Linha número ${i} de um episódio muito longo com bastante diálogo.`,
    }))
    const id = await criarSessao(PAGANTE, muitas)
    const chamadas = provedor(() => ({ texto: JSON.stringify({ pontos: PONTOS, cartoes: [] }) }))
    const res = await pedir(PAGANTE, { sessionId: id })
    expect(res.statusCode).toBe(200)
    expect(res.body.cartoes).toEqual([])
    expect(chamadas[0].user.length).toBeLessThanOrEqual(FUNCOES_DE_IA.resumo.tetoEntrada)
    expect(chamadas[0].user).toContain('Line number 399 ')
    expect(chamadas[0].user).not.toContain('Line number 0 ')
  })
})

describe('Grátis: a amostra é 1 resumo por semana', () => {
  it('o 1º é 200 com origem amostra; o 2º é 402 amostra_acabou, sem provedor', async () => {
    const quem = asUserId('resumir-gratis')
    const id = await criarSessao(quem)
    const chamadas = provedor(() => ({ texto: OK }))
    const primeiro = await pedir(quem, { sessionId: id })
    expect(primeiro.statusCode).toBe(200)
    expect(primeiro.body.origem).toBe('amostra')
    expect(primeiro.body.restanteNaAmostra).toBe(AMOSTRA_DE_IA.resumosSemana - 1)
    expect(primeiro.body.pontos).toHaveLength(3)
    const segundo = await pedir(quem, { sessionId: id })
    expect(segundo.statusCode).toBe(402)
    expect(segundo.body?.code).toBe('amostra_acabou')
    expect(chamadas).toHaveLength(1)
    expect(await contador(quem, estudo.METRIC_AMOSTRA_RESUMOS_SEMANA, await semana(quem))).toBe(1)
    /* A amostra não gasta cota de plano. */
    expect(await contador(quem, 'llm_tokens', mes())).toBe(0)
  })
})

describe('resposta malformada e provedor fora', () => {
  for (const [nome, texto] of [
    ['sem JSON', 'Não consigo resumir.'],
    ['2 pontos', JSON.stringify({ pontos: PONTOS.slice(0, 2), cartoes: [] })],
    ['campo a mais', JSON.stringify({ pontos: PONTOS, cartoes: [], oferta: 'assine' })],
  ] as const) {
    it(`${nome}: 502 resposta_invalida e o resumo CONSUMIDO`, async () => {
      const quem = asUserId(`resumir-malformada-${nome.replace(/\s/g, '-')}`)
      const id = await criarSessao(quem)
      provedor(() => ({ texto }))
      const res = await pedir(quem, { sessionId: id })
      expect(res.statusCode).toBe(502)
      expect(res.body?.code).toBe('resposta_invalida')
      expect(await contador(quem, estudo.METRIC_AMOSTRA_RESUMOS_SEMANA, await semana(quem))).toBe(1)
    })
  }

  it('provedor fora: 502 provedor_indisponivel e o resumo estornado', async () => {
    const quem = asUserId('resumir-provedor-fora')
    const id = await criarSessao(quem)
    provedor(() => ({ status: 500 }))
    const res = await pedir(quem, { sessionId: id })
    expect(res.statusCode).toBe(502)
    expect(res.body?.code).toBe('provedor_indisponivel')
    expect(await contador(quem, estudo.METRIC_AMOSTRA_RESUMOS_SEMANA, await semana(quem))).toBe(0)
  })
})

describe('menor e retenção zero', () => {
  it('MENOR (idade não declarada): o system enviado ao provedor leva a instrução de segurança', async () => {
    const quem = asUserId('resumir-menor')
    const id = await criarSessao(quem)
    const chamadas = provedor(() => ({ texto: OK }))
    await pedir(quem, { sessionId: id })
    expect(chamadas[0].system).toContain('PÚBLICO MENOR')
  })

  it('ADULTO declarado: sem a instrução de menor', async () => {
    const adulto = asUserId('resumir-adulto')
    await idades.declarar(adulto, '1990-01-01')
    const id = await criarSessao(adulto)
    const chamadas = provedor(() => ({ texto: OK }))
    await pedir(adulto, { sessionId: id })
    expect(chamadas[0].system).not.toContain('PÚBLICO MENOR')
  })

  it('provedor sem zdr nunca é chamado; só ele configurado dá 501', async () => {
    process.env.IA_PROVEDORES = JSON.stringify({ provedores: [SEM_ZDR, OPENROUTER] })
    process.env.SEMZDR_API_KEY = 'chave-falsa'
    const id = await criarSessao(PAGANTE)
    const chamadas = provedor(() => ({ texto: OK }))
    const res = await pedir(PAGANTE, { sessionId: id })
    expect(res.statusCode).toBe(200)
    expect(chamadas.every((c) => !c.url.includes('semzdr'))).toBe(true)

    esquecerRegistro()
    process.env.IA_PROVEDORES = JSON.stringify({ provedores: [SEM_ZDR] })
    process.env.OPENROUTER_API_KEY = ''
    const antes = chamadas.length
    const so = await pedir(PAGANTE, { sessionId: id })
    expect(so.statusCode).toBe(501)
    expect(chamadas).toHaveLength(antes)
  })
})
