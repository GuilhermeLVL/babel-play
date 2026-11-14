/**
 * AUDITORIA DE ACESSO POR PLANO (14/11/2026) — o servidor DE VERDADE (`criarApp`, modo público, JWT), com UM espião
 * na saída de rede: toda chamada que não é ao próprio app é "provedor pago" e é contada.
 *
 * O que se prova, numa tabela só (os testes por rota já existem; este cruza todas com o mesmo critério):
 *   1. Quem NÃO PAGOU — Grátis, checkout iniciado e não pago (`trialing`), plano vencido, estornado — chama cada rota
 *      paga de IA e recebe recusa (402/403/404, ou o tutor "indisponível"), com ZERO chamadas a provedor. Inclui o
 *      cabeçalho da nuvem de alívio (`x-nuvem-alivio: 1`), que sem a flag não abre nada.
 *   2. Controle positivo: o MESMO pedido de um assinante chega ao provedor — então a recusa acima é do plano, e não
 *      de corpo inválido ou de provedor não configurado.
 *   3. A cota é POR CONTA: A esgotada (402 do mês, 429 do dia) não fecha nada para B; e o uso de A aparece no
 *      `/api/me/uso` de A e não no de B.
 *   4. Dado alheio (IDOR): B não pole nem resume a sessão de A (404, sem provedor, sem consumir cota).
 *   5. O ORÇAMENTO GLOBAL é compartilhado (documentado): o gasto de um pagante fecha a nuvem de todos (503). Sem
 *      `TETO_USD_MES_<PLANO>` (desligado por padrão) não há teto em dólar por conta antes desse corte.
 */
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from 'vitest'

import { type AppDeTeste, subirApp } from '../caracterizacao/_app'

let s: AppDeTeste
let subs: any
let counters: any
let quota: any
let flags: any
let sessions: any
let gastoDeIa: any
let esquecerAdmissao: () => Promise<void>
let esquecerRegistro: () => void
let esvaziarCacheDeTraducao: () => void

const DIA = 86_400_000
const fetchOriginal = globalThis.fetch
const chamadasAoProvedor: string[] = []

/** O espião da rede: o app de teste passa; o resto é provedor, contado e respondido como um LLM que deu certo. */
function espiarRede(base: string) {
  chamadasAoProvedor.length = 0
  globalThis.fetch = (async (u: unknown, init?: RequestInit) => {
    const url = String(u instanceof Request ? u.url : u)
    if (url.startsWith(base)) return fetchOriginal(u as any, init)
    chamadasAoProvedor.push(url)
    return new Response(
      JSON.stringify({
        choices: [{ message: { content: 'olá mundo' } }],
        usage: { prompt_tokens: 40, completion_tokens: 10 },
        text: 'hello world',
      }),
      { status: 200, headers: { 'content-type': 'application/json' } },
    )
  }) as typeof fetch
}

const ENVS: Record<string, string> = {
  IA_PROVEDORES_ARQUIVO: 'ops/ia-provedores.openrouter.json',
  OPENROUTER_API_KEY: 'chave-falsa-da-auditoria',
}
const envAntes: Record<string, string | undefined> = {}

/** As rotas pagas de IA, com um corpo VÁLIDO de cada (o controle positivo usa os mesmos). */
function rotasPagas(sessaoDoDono: string): Array<{ nome: string; caminho: string; corpo?: unknown; raw?: Buffer }> {
  return [
    { nome: 'tradução gerenciada', caminho: '/api/ai/mt', corpo: { text: 'hello world', src: 'en', tgt: 'pt' } },
    {
      nome: 'outras formas (Nuance)',
      caminho: '/api/ai/mt/alternativas',
      corpo: { text: 'see you later', src: 'en', tgt: 'pt', traducaoAtual: 'até mais' },
    },
    { nome: 'polir a sessão', caminho: '/api/ai/mt/polir', corpo: { sessionId: sessaoDoDono, bloco: 0 } },
    { nome: 'voz natural', caminho: '/api/ai/tts', corpo: { texto: 'Good morning', idioma: 'en' } },
    { nome: 'transcrição de nuvem', caminho: '/api/ai/stt', raw: Buffer.alloc(4_000, 1) },
    {
      nome: 'glossário (gravar)',
      caminho: '/api/ai/glossario',
      corpo: { termo: 'deadline', traducao: 'prazo', src: 'en', tgt: 'pt' },
    },
    {
      nome: 'assistente: expressões',
      caminho: '/api/ai/assistente/expressoes',
      corpo: { frase: 'Good luck tonight, break a leg!', lang: 'en', langDaPessoa: 'pt-BR' },
    },
    {
      nome: 'assistente: correção',
      caminho: '/api/ai/assistente/correcao',
      corpo: { minhaFala: 'he don’t like coffee', lang: 'en', langDaPessoa: 'pt-BR' },
    },
    {
      nome: 'parceiro de leitura',
      caminho: '/api/ai/leitura/parceiro',
      corpo: {
        modo: 'explicar',
        livro: { origem: 'proprio' },
        tituloDoCapitulo: 'Prologue',
        selecao: 'From ancient grudge break to new mutiny',
        trechos: [
          { id: 'p1', texto: 'From ancient grudge break to new mutiny, where civil blood makes civil hands unclean.' },
        ],
        nivel: 'B1',
        idiomaDoLivro: 'en',
        idiomaDaPessoa: 'pt-BR',
      },
    },
    {
      nome: 'BYOK sem credencial',
      caminho: '/api/ai/llm/chat/completions',
      corpo: { messages: [{ role: 'user', content: 'hi' }] },
    },
  ]
}

async function pedir(
  token: string,
  r: { caminho: string; corpo?: unknown; raw?: Buffer },
  headers: Record<string, string> = {},
) {
  return r.raw
    ? s.chamar('POST', r.caminho, { token, raw: r.raw, headers: { 'content-type': 'audio/wav', ...headers } })
    : s.chamar('POST', r.caminho, { token, body: r.corpo, headers })
}

const FALAS = Array.from({ length: 6 }, (_, idx) => ({
  idx,
  sourceLang: 'en',
  targetLang: 'pt',
  source: 'system',
  sourceText: `I would like a coffee number ${idx}, please.`,
  translatedText: `Eu gostaria de um café número ${idx}, por favor.`,
}))
async function criarSessao(dono: string): Promise<string> {
  const { asUserId } = await s.load('../../server/lib/authContext')
  const sessao = await sessions.createWithUtterances(
    asUserId(dono),
    { title: 'Série', kind: 'live', sourceLang: 'en', targetLang: 'pt' },
    FALAS,
  )
  return sessao.id
}

beforeAll(async () => {
  for (const [k, v] of Object.entries(ENVS)) {
    envAntes[k] = process.env[k]
    process.env[k] = v
  }
  s = await subirApp({ modo: 'publico', adultoPorPadrao: true })
  ;({ subscriptionsRepo: subs } = await s.load('../../server/db/repositories/subscriptions'))
  ;({ usageCountersRepo: counters } = await s.load('../../server/db/repositories/usageCounters'))
  ;({ sessionsRepo: sessions } = await s.load('../../server/db/repositories/sessions'))
  ;({ gastoDeIaRepo: gastoDeIa } = await s.load('../../server/db/repositories/gastoDeIa'))
  quota = await s.load('../../server/lib/usageQuota')
  flags = await s.load('../../server/lib/flags')
  ;({ esquecerAdmissao } = await s.load('../../server/ai/admissao'))
  ;({ esquecerRegistro } = await s.load('../../server/ai/registroDeProvedores'))
  ;({ esvaziarCacheDeTraducao } = await s.load('../../server/ai/cacheDeTraducao'))
  // As rotas atrás de flag ficam LIGADAS: a recusa medida tem de ser a do plano, não a da flag.
  for (const f of ['ia_de_estudo', 'assistente_ao_vivo', 'parceiro_de_leitura', 'voz_natural']) {
    await flags.definirFlag(f, { habilitada: true }, 'auditoria')
  }
}, 60_000)

afterAll(async () => {
  globalThis.fetch = fetchOriginal
  await s.encerrar()
  for (const [k, v] of Object.entries(envAntes)) {
    if (v === undefined) delete process.env[k]
    else process.env[k] = v
  }
})

beforeEach(() => {
  espiarRede(s.base)
  esvaziarCacheDeTraducao()
})
afterEach(async () => {
  globalThis.fetch = fetchOriginal
  await esquecerAdmissao()
  esquecerRegistro()
})

async function contaCom(sub: string, assinatura: Record<string, unknown> | null): Promise<string> {
  const { asUserId } = await s.load('../../server/lib/authContext')
  const token = await s.token(sub)
  if (assinatura) await subs.upsert(asUserId(sub), assinatura)
  return token
}

/** Quem NÃO pagou, nas quatro formas em que isso aparece no banco. */
const NAO_PAGANTES: Array<[string, Record<string, unknown> | null]> = [
  ['Grátis (sem assinatura)', null],
  ['checkout iniciado e não pago (trialing)', { plan: 'pro4', status: 'trialing', provider: 'asaas' }],
  ['plano pago VENCIDO', { plan: 'plus', status: 'active', currentPeriodEnd: Date.now() - DIA }],
  ['estornado', { plan: 'plus', status: 'canceled', currentPeriodEnd: Date.now() - 1000, cancelAtPeriodEnd: 0 }],
]

describe('1. quem não pagou não alcança provedor pago em nenhuma rota', () => {
  NAO_PAGANTES.forEach(([quem, assinatura], i) => {
    it(`${quem}: toda rota paga recusa, e o provedor não é chamado`, async () => {
      const sub = `nao-pagante-${i}`
      const token = await contaCom(sub, assinatura)
      const sessao = await criarSessao(sub)
      const respostas: Record<string, string> = {}
      for (const r of rotasPagas(sessao)) {
        for (const [rotulo, headers] of [
          ['', {}],
          [' +alívio', { 'x-nuvem-alivio': '1' }],
        ] as const) {
          const res = await pedir(token, r, headers)
          const corpo = (await res.json().catch(() => ({}))) as { code?: string }
          respostas[r.nome + rotulo] = `${res.status} ${corpo.code ?? '-'}`
        }
      }
      const tutor = await s.post(
        '/api/tutor/chat',
        { funcao: 'tutor', messages: [{ role: 'user', content: 'hi' }] },
        token,
      )
      const corpoTutor = (await tutor.json()) as { text: string | null; reason?: string }

      expect(chamadasAoProvedor, JSON.stringify(respostas)).toEqual([])
      /* A recusa é a do PLANO (o código diz qual), e não de corpo inválido nem de provedor ausente. O 402 sem `code`
         da tradução e da transcrição é o do entitlement (`entitlement: managedCloud*`); o alívio do Grátis existe,
         mas com a flag `nuvem_alivio` desligada (o padrão) é 503 `alivio_desligado`. O BYOK usa a chave da PRÓPRIA
         pessoa: sem credencial cadastrada é 400, e não há custo nosso. */
      expect(respostas).toEqual({
        'tradução gerenciada': '402 -',
        'tradução gerenciada +alívio': '503 alivio_desligado',
        'outras formas (Nuance)': '402 exige_nuance',
        'outras formas (Nuance) +alívio': '402 exige_nuance',
        'polir a sessão': '402 exige_nuance',
        'polir a sessão +alívio': '402 exige_nuance',
        'voz natural': '402 exige_voz_natural',
        'voz natural +alívio': '402 exige_voz_natural',
        'transcrição de nuvem': '402 -',
        'transcrição de nuvem +alívio': '503 alivio_desligado',
        'glossário (gravar)': '402 exige_nuance',
        'glossário (gravar) +alívio': '402 exige_nuance',
        'assistente: expressões': '402 sem_plano',
        'assistente: expressões +alívio': '402 sem_plano',
        'assistente: correção': '402 sem_plano',
        'assistente: correção +alívio': '402 sem_plano',
        'parceiro de leitura': '402 sem_plano',
        'parceiro de leitura +alívio': '402 sem_plano',
        'BYOK sem credencial': '400 -',
        'BYOK sem credencial +alívio': '400 -',
      })
      expect(corpoTutor.text).toBeNull()
      expect(corpoTutor.reason).toBe('managed_requires_plan')
    })
  })
})

describe('2. controle positivo: o assinante chega ao provedor pelo mesmo pedido', () => {
  it('Plus: tradução e tutor respondem da nuvem (o espião vê as chamadas)', async () => {
    const token = await contaCom('pagante-controle', {
      plan: 'plus',
      status: 'active',
      currentPeriodEnd: Date.now() + 30 * DIA,
    })
    const mt = await pedir(token, rotasPagas('x')[0])
    expect(mt.status).toBe(200)
    const tutor = await s.post(
      '/api/tutor/chat',
      { funcao: 'tutor', messages: [{ role: 'user', content: 'hi' }] },
      token,
    )
    expect(tutor.status).toBe(200)
    expect(((await tutor.json()) as { text: string | null }).text).toBeTruthy()
    expect(chamadasAoProvedor.length).toBeGreaterThanOrEqual(2)
  })
})

describe('3. a cota é por conta', () => {
  it('A com a cota do MÊS esgotada: 402 quota_exceeded sem provedor; B, no mesmo plano, segue', async () => {
    const { asUserId } = await s.load('../../server/lib/authContext')
    const ativo = { plan: 'plus', status: 'active', currentPeriodEnd: Date.now() + 30 * DIA }
    const tokenA = await contaCom('cota-a', ativo)
    const tokenB = await contaCom('cota-b', ativo)
    await counters.increment(asUserId('cota-a'), quota.METRIC_MANAGED, quota.currentWindow(), quota.capForPlan('plus'))

    const a = await pedir(tokenA, rotasPagas('x')[0])
    expect(a.status).toBe(402)
    expect(((await a.json()) as { code: string }).code).toBe('quota_exceeded')
    expect(chamadasAoProvedor).toEqual([])

    const b = await pedir(tokenB, rotasPagas('x')[0])
    expect(b.status).toBe(200)
    expect(chamadasAoProvedor).toHaveLength(1)
  })

  it('A com o uso justo do DIA esgotado: 429 uso_justo_do_dia com Retry-After; B segue', async () => {
    const { asUserId } = await s.load('../../server/lib/authContext')
    const ativo = { plan: 'plus', status: 'active', currentPeriodEnd: Date.now() + 30 * DIA }
    const tokenA = await contaCom('dia-a', ativo)
    const tokenB = await contaCom('dia-b', ativo)
    const janela = await quota.janelaDoDia(asUserId('dia-a'))
    await counters.increment(asUserId('dia-a'), quota.METRIC_LLM_TOKENS_DIA, janela, quota.capTokensDoDia('plus'))

    const a = await pedir(tokenA, rotasPagas('x')[0])
    expect(a.status).toBe(429)
    expect(((await a.json()) as { code: string }).code).toBe('uso_justo_do_dia')
    expect(Number(a.headers.get('retry-after'))).toBeGreaterThan(0)
    expect(chamadasAoProvedor).toEqual([])

    expect((await pedir(tokenB, rotasPagas('x')[0])).status).toBe(200)
  })

  it('o uso de A aparece no /api/me/uso de A — e não no de B', async () => {
    const ativo = { plan: 'plus', status: 'active', currentPeriodEnd: Date.now() + 30 * DIA }
    const tokenA = await contaCom('uso-a', ativo)
    const tokenB = await contaCom('uso-b', ativo)
    expect((await pedir(tokenA, rotasPagas('x')[0])).status).toBe(200)
    const usoA = (await (await s.get('/api/me/uso', tokenA)).json()) as any
    const usoB = (await (await s.get('/api/me/uso', tokenB)).json()) as any
    expect(usoA).toMatchObject({ plano: 'plus', chamadas: { usado: 1 } })
    expect(usoA.tokensDeLlm.usado).toBeGreaterThan(0)
    expect(usoA.hoje.tokensDeLlm.usado).toBeGreaterThan(0)
    expect(usoB).toMatchObject({ plano: 'plus', chamadas: { usado: 0 }, tokensDeLlm: { usado: 0 } })
  })
})

describe('4. dado alheio (IDOR)', () => {
  it('B (pagante) não pole nem resume a sessão de A: 404 igual ao da sessão inexistente, sem provedor nem cota', async () => {
    const { asUserId } = await s.load('../../server/lib/authContext')
    const ativo = { plan: 'plus', status: 'active', currentPeriodEnd: Date.now() + 30 * DIA }
    await contaCom('idor-a', ativo)
    const tokenB = await contaCom('idor-b', ativo)
    const deA = await criarSessao('idor-a')
    for (const caminho of ['/api/ai/mt/polir', '/api/ai/resumir']) {
      const alheia = await s.post(caminho, { sessionId: deA, bloco: 0 }, tokenB)
      const inexistente = await s.post(caminho, { sessionId: 'sessao-que-nao-existe', bloco: 0 }, tokenB)
      expect(alheia.status, caminho).toBe(404)
      expect(await alheia.json()).toEqual(await inexistente.json())
    }
    expect(chamadasAoProvedor).toEqual([])
    expect(await counters.get(asUserId('idor-b'), quota.METRIC_MANAGED, quota.currentWindow())).toBe(0)
  })
})

describe('5. o orçamento global é um recurso COMPARTILHADO', () => {
  it('documentado: o gasto de UM pagante atinge AI_BUDGET_USD_DAY e fecha a nuvem de TODOS (503)', async () => {
    const antes = process.env.AI_BUDGET_USD_DAY
    process.env.AI_BUDGET_USD_DAY = '0.5'
    try {
      const ativo = { plan: 'plus', status: 'active', currentPeriodEnd: Date.now() + 30 * DIA }
      await contaCom('global-gastador', ativo)
      const tokenOutro = await contaCom('global-outro', ativo)
      const { registrarGastoDeIa } = await s.load('../../server/lib/orcamentoDeIa')
      // O gastador consome o orçamento do dia inteiro (dentro das cotas dele, que são em horas/tokens, não em US$).
      await registrarGastoDeIa(0.5, { userId: 'global-gastador', plano: 'plus' })
      const r = await pedir(tokenOutro, rotasPagas('x')[0])
      expect(r.status).toBe(503)
      expect(((await r.json()) as { code?: string; motivo?: string }).code ?? '').toMatch(/orcamento|portao|nuvem/)
      expect(chamadasAoProvedor).toEqual([])
    } finally {
      if (antes === undefined) delete process.env.AI_BUDGET_USD_DAY
      else process.env.AI_BUDGET_USD_DAY = antes
      await gastoDeIa.esquecer?.()
    }
  })
})
