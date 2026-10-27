/**
 * O PARCEIRO DE LEITURA — `POST /api/ai/leitura/parceiro` (L4 de `docs/specs/2026-10-26-livros-e-leitura.md`).
 *
 * O que se prova:
 *   - a flag `parceiro_de_leitura` nasce DESLIGADA na migração; desligada, 404 sem provedor, sem contador e sem ler o
 *     plano (mesmo com corpo inválido);
 *   - quem pode: Grátis e convidado 402 `sem_plano`; Plus e o teste de 14 dias, 200;
 *   - a saída estruturada (`json_schema` estrito `parceiro_de_leitura`): a citação que não está no trecho sai; a
 *     pergunta sem citação válida vira "não está neste trecho"; citação inventada no texto é 502;
 *   - o CACHE compartilhado: o mesmo pedido sobre um livro PD, por OUTRA pessoa, não chama o provedor nem conta no dia;
 *     a pergunta livre e o livro trazido nunca entram no cache;
 *   - as COTAS: o teto do dia (429 `teto_do_parceiro`) e a subcota do mês (402 `cota_do_parceiro`), sem provedor;
 *     resposta inválida consome, provedor fora do ar estorna;
 *   - MENOR: livro que a vitrine não mostraria é 403 `livro_fora_da_faixa`; o que ela mostra vai com a instrução de
 *     segurança, o complemento de leitura e a ficha SEM o sensível; adulto recebe a ficha inteira (sem spoiler);
 *   - o livro TRAZIDO: só a seleção e até 2 trechos (1.500 caracteres), senão 413; sem título no prompt;
 *   - o corpo é estrito; retenção zero; e o log não leva o texto da pessoa.
 */
import { sql } from 'drizzle-orm'
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'

import { esquecerAdmissao } from '../../server/ai/admissao'
import { esquecerDisjuntores } from '../../server/ai/disjuntor'
import { esquecerRegistro } from '../../server/ai/registroDeProvedores'
import { asUserId } from '../../server/lib/authContext'
import { AVISO_DA_FICHA, type FichaDoLivro } from '../../src/core/livros/ficha'
import { hashDoTrecho } from '../../src/core/livros/manifesto'
import {
  FRACAO_DA_COTA_DO_PARCEIRO,
  PARCEIRO_DIA_DOS_PAGOS,
  PLAN_MATRIX,
  PLANO_CONVIDADO,
  PLANO_DO_TESTE,
} from '../../src/core/planos'
import { NAO_ESTA_NO_TRECHO } from '../../src/lib/estudo/promptDoParceiro'
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

/* O catálogo dos testes: um livro livre (menor vê), um "a revisar" (menor não vê). */
const LIVRE = {
  id: 'pg-teste-livre',
  titulo: 'Romeo and Juliet',
  autoria: 'William Shakespeare',
  idioma: 'en',
  classificacao: 'livre' as const,
}
const A_REVISAR = { ...LIVRE, id: 'pg-teste-revisar', titulo: 'Livro a revisar', classificacao: null }
const item = (texto: string, extra: Partial<{ spoiler: boolean; sensivel: boolean }> = {}) => ({
  texto,
  spoiler: false,
  sensivel: false,
  ...extra,
})
const FICHA: FichaDoLivro = {
  versao: 1,
  livroId: LIVRE.id,
  titulo: LIVRE.titulo,
  idioma: 'en',
  geradaEm: '2026-10-26',
  procedencia: { geradoPor: 'teste', revisadoPor: 'teste', aviso: AVISO_DA_FICHA, removidosNaRevisao: 0 },
  autorEContexto: [item('Shakespeare escreveu a peça por volta de 1595.')],
  porQueImporta: [item('É uma das histórias de amor mais conhecidas.')],
  temas: [{ nome: 'Ódio entre famílias', ...item('A briga antiga entre Montecchio e Capuleto.') }],
  personagens: [],
  curiosidades: [
    item('CURIOSIDADE-COMUM: as primeiras falas do casal formam um soneto.'),
    item('CURIOSIDADE-SENSIVEL: os duelos por honra eram comuns.', { sensivel: true }),
    item('CURIOSIDADE-SPOILER: o final é trágico.', { spoiler: true }),
  ],
  vocabulario: [],
  notasDeEpoca: [],
  perguntas: [],
  leiaTambem: [],
  avisoDeConteudo: null,
}

const TRECHOS = [
  { id: 'p1', texto: 'Two households, both alike in dignity, in fair Verona, where we lay our scene.' },
  { id: 'p2', texto: 'From ancient grudge break to new mutiny, where civil blood makes civil hands unclean.' },
]
const SELECAO = 'From ancient grudge break to new mutiny'
const corpoBase = (extra: Record<string, unknown> = {}) => ({
  modo: 'explicar',
  livro: { origem: 'catalogo', id: LIVRE.id },
  tituloDoCapitulo: 'Prologue',
  selecao: SELECAO,
  trechos: TRECHOS,
  nivel: 'B1',
  idiomaDoLivro: 'en',
  idiomaDaPessoa: 'pt-BR',
  ...extra,
})
const RESPOSTA_BOA = {
  texto: 'O trecho diz que uma briga antiga volta a explodir entre as duas famílias.',
  pontos: ['grudge = rancor antigo', 'mutiny = revolta'],
  citacoes: [
    { trechoId: 'selecao', exato: 'From ancient grudge' },
    { trechoId: 'p1', exato: 'texto que não está no trecho' },
  ],
  naoEstaNoTrecho: false,
}

const PAGANTE = asUserId('parceiro-plus')
const GRATIS = asUserId('parceiro-gratis')
const mes = () => new Date().toISOString().slice(0, 7)

let h: EphemeralDb
let parceiroProxy: (req: any, res: any) => Promise<void>
let counters: any
let flags: any
let usageQuota: any
let idades: any
let subscriptions: any
let fichas: any
let manifestos: any
let banco: any
let cacheRepo: any
let hashesDosTrechos: string[] = []
let flagDaMigracao: { habilitada: boolean; atualizadoPor: string | null } | undefined

interface Chamada {
  url: string
  modelo: string
  system: string
  user: string
  maxTokens: number
  esquema?: string
  estrito?: boolean
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
    const corpo = JSON.parse(init.body)
    const c: Chamada = {
      url: String(u),
      modelo: corpo.model,
      maxTokens: corpo.max_tokens,
      system: corpo.messages.find((m: any) => m.role === 'system')?.content ?? '',
      user: corpo.messages.find((m: any) => m.role === 'user')?.content ?? '',
      esquema: corpo.response_format?.json_schema?.name,
      estrito: corpo.response_format?.json_schema?.strict,
    }
    chamadas.push(c)
    const r = resposta(c)
    if (r.status && r.status !== 200)
      return { ok: false, status: r.status, headers: new Headers(), text: async () => 'falhou' }
    return {
      ok: true,
      json: async () => ({
        choices: [{ message: { content: r.texto ?? '' } }],
        usage: { prompt_tokens: 900, completion_tokens: 100 },
      }),
    }
  })
  return chamadas
}

async function pedir(userId: ReturnType<typeof asUserId>, body: unknown = corpoBase()) {
  const res = mockRes()
  await parceiroProxy({ userId, body, requestId: 'r-parceiro', header: () => undefined, headers: {} }, res)
  return res
}

const contador = async (userId: ReturnType<typeof asUserId>, metrica: string, janela: string) =>
  (await counters.get(userId, metrica, janela)) ?? 0
const doDia = async (userId: ReturnType<typeof asUserId>) =>
  contador(userId, usageQuota.METRIC_PARCEIRO_DIA, await usageQuota.janelaDoDia(userId))

async function assinante(id: string, adulto = true) {
  const quem = asUserId(id)
  await subscriptions.upsert(quem, { plan: 'plus', status: 'active' })
  if (adulto) await idades.declarar(quem, '1990-01-01')
  return quem
}

beforeAll(async () => {
  h = await setupEphemeralDb()
  process.env.AUTH_REQUIRED = '1'
  ;({ parceiroProxy } = await h.load<any>('../../server/ai/parceiro'))
  ;({ usageCountersRepo: counters } = await h.load<any>('../../server/db/repositories/usageCounters'))
  ;({ idadesRepo: idades } = await h.load<any>('../../server/db/repositories/idades'))
  ;({ subscriptionsRepo: subscriptions } = await h.load<any>('../../server/db/repositories/subscriptions'))
  flags = await h.load<any>('../../server/lib/flags')
  usageQuota = await h.load<any>('../../server/lib/usageQuota')
  fichas = await h.load<any>('../../server/ai/leitura/fichas')
  manifestos = await h.load<any>('../../server/ai/leitura/manifestos')
  banco = await h.load<any>('../../server/db/db')
  ;({ cacheDoParceiroRepo: cacheRepo } = await h.load<any>('../../server/db/repositories/cacheDoParceiro'))
  hashesDosTrechos = await Promise.all(TRECHOS.map((t) => hashDoTrecho(t.texto)))
  flagDaMigracao = (await flags.listarFlagsCruas()).find((f: { chave: string }) => f.chave === 'parceiro_de_leitura')
  await subscriptions.upsert(PAGANTE, { plan: 'plus', status: 'active' })
  await idades.declarar(PAGANTE, '1990-01-01')
})
afterAll(async () => {
  delete process.env.AUTH_REQUIRED
  for (const e of ENVS) process.env[e] = ''
  fichas.trocarCatalogoParaTeste(null, null)
  manifestos.trocarManifestosParaTeste(null)
  await h.cleanup()
})
beforeEach(async () => {
  for (const e of ENVS) process.env[e] = ''
  process.env.IA_PROVEDORES = JSON.stringify({ provedores: [OPENROUTER] })
  process.env.OPENROUTER_API_KEY = 'chave-openrouter-falsa'
  fichas.trocarCatalogoParaTeste([LIVRE, A_REVISAR], { [LIVRE.id]: FICHA })
  /* O manifesto dos dois livros de teste: os parágrafos de TRECHOS são "do livro". */
  manifestos.trocarManifestosParaTeste({ [LIVRE.id]: hashesDosTrechos, [A_REVISAR.id]: hashesDosTrechos })
  await flags.definirFlag('parceiro_de_leitura', { habilitada: true }, 'teste')
})
afterEach(async () => {
  vi.unstubAllGlobals()
  esquecerDisjuntores()
  await esquecerAdmissao()
  esquecerRegistro()
})

describe('a cota do parceiro na matriz', () => {
  it('só os pagos (e o plano do teste) têm o parceiro; Grátis e convidado não; self-host sem teto', () => {
    expect(PLAN_MATRIX.free.quotas.parceiroDia).toBe(0)
    for (const p of ['plus', 'familia', 'pro4', 'premium', 'essencial', 'aovivo'] as const)
      expect(PLAN_MATRIX[p].quotas.parceiroDia, p).toBe(PARCEIRO_DIA_DOS_PAGOS)
    expect(PLAN_MATRIX[PLANO_DO_TESTE].quotas.parceiroDia).toBeGreaterThan(0)
    expect(PLAN_MATRIX.selfhost.quotas.parceiroDia).toBeNull()
    expect(PLANO_CONVIDADO.quotas.parceiroDia).toBe(0)
    expect(PLANO_CONVIDADO.quotas.parceiroTokensMes).toBe(0)
  })

  it('a subcota de tokens é 20% da tokensMes em todo plano que tem o parceiro', () => {
    for (const [p, def] of Object.entries(PLAN_MATRIX)) {
      const { tokensMes, parceiroTokensMes, parceiroDia } = def.quotas
      if (tokensMes === null) expect(parceiroTokensMes, p).toBeNull()
      else if (parceiroDia === 0) expect(parceiroTokensMes, p).toBe(0)
      else expect(parceiroTokensMes, p).toBe(tokensMes * FRACAO_DA_COTA_DO_PARCEIRO)
    }
  })
})

describe('a flag parceiro_de_leitura', () => {
  it('nasce DESLIGADA na migração', () => {
    expect(flagDaMigracao).toMatchObject({ habilitada: false, atualizadoPor: 'semente' })
  })

  it('desligada é 404 recurso_indisponivel, sem provedor, sem contador e sem ler o plano (mesmo com corpo inválido)', async () => {
    await flags.definirFlag('parceiro_de_leitura', { habilitada: false }, 'teste')
    const chamadas = provedor(() => ({ texto: JSON.stringify(RESPOSTA_BOA) }))
    const entitlements = await h.load<any>('../../server/lib/entitlements')
    const espia = vi.spyOn(entitlements, 'resolverPlano')
    try {
      for (const corpo of [corpoBase(), { lixo: true }]) {
        const res = await pedir(PAGANTE, corpo)
        expect(res.statusCode).toBe(404)
        expect(res.body?.code).toBe('recurso_indisponivel')
      }
      expect(chamadas).toHaveLength(0)
      expect(espia).not.toHaveBeenCalled()
      expect(await doDia(PAGANTE)).toBe(0)
    } finally {
      espia.mockRestore()
    }
  })
})

describe('quem pode', () => {
  it('Grátis é 402 sem_plano, sem provedor e sem contador', async () => {
    const chamadas = provedor(() => ({ texto: JSON.stringify(RESPOSTA_BOA) }))
    const res = await pedir(GRATIS)
    expect(res.statusCode).toBe(402)
    expect(res.body?.code).toBe('sem_plano')
    expect(chamadas).toHaveLength(0)
    expect(await doDia(GRATIS)).toBe(0)
  })

  it('convidado: 402 sem_plano', async () => {
    const entitlements = await h.load<any>('../../server/lib/entitlements')
    const espia = vi.spyOn(entitlements, 'resolverPlano').mockResolvedValue({ plano: 'convidado', teste: null })
    try {
      const chamadas = provedor(() => ({ texto: JSON.stringify(RESPOSTA_BOA) }))
      const res = await pedir(asUserId('parceiro-convidado'))
      expect(res.statusCode).toBe(402)
      expect(chamadas).toHaveLength(0)
    } finally {
      espia.mockRestore()
    }
  })

  it('o teste de 14 dias tem o parceiro', async () => {
    const quem = asUserId('parceiro-em-teste')
    await idades.declarar(quem, '1990-01-01')
    const entitlements = await h.load<any>('../../server/lib/entitlements')
    const espia = vi
      .spyOn(entitlements, 'resolverPlano')
      .mockResolvedValue({ plano: 'plus', teste: { terminaEm: Date.now() + 86_400_000 } })
    try {
      provedor(() => ({ texto: JSON.stringify(RESPOSTA_BOA) }))
      const res = await pedir(quem, corpoBase({ selecao: 'in fair Verona' }))
      expect(res.statusCode).toBe(200)
    } finally {
      espia.mockRestore()
    }
  })
})

describe('Plus: a saída estruturada', () => {
  it('200 com o esquema estrito, a citação conferida, a ficha do SERVIDOR no prompt e as cotas contadas', async () => {
    const quem = await assinante('parceiro-ok')
    const chamadas = provedor(() => ({ texto: JSON.stringify(RESPOSTA_BOA) }))
    const res = await pedir(quem, corpoBase({ selecao: 'where we lay our scene' }))
    expect(res.statusCode).toBe(200)
    expect(res.body.origem).toBe('modelo')
    expect(res.body.textoConferido).toBe(true)
    expect(res.body.restanteHoje).toBe(PARCEIRO_DIA_DOS_PAGOS - 1)
    expect(res.body.aviso).toMatch(/Gerado por IA/)
    /* A citação de `p1` que não está no trecho SAIU; a da seleção também (o texto citado não está na seleção nova). */
    expect(res.body.resposta.citacoes).toEqual([])
    expect(res.body.resposta.pontos).toEqual(RESPOSTA_BOA.pontos)
    expect(res.headers['x-ia-modelo']).toBe('google/gemma-4-26b-a4b-it')
    expect(chamadas).toHaveLength(1)
    expect(chamadas[0].esquema).toBe('parceiro_de_leitura')
    expect(chamadas[0].maxTokens).toBeLessThanOrEqual(900)
    /* O título e a autoria são os do catálogo (não do corpo); a ficha vai sem spoiler. */
    expect(chamadas[0].user).toContain('Romeo and Juliet')
    expect(chamadas[0].user).toContain('CURIOSIDADE-COMUM')
    expect(chamadas[0].user).toContain('CURIOSIDADE-SENSIVEL')
    expect(chamadas[0].user).not.toContain('CURIOSIDADE-SPOILER')
    expect(chamadas[0].system).not.toContain('PÚBLICO MENOR')
    expect(await doDia(quem)).toBe(1)
    expect(await contador(quem, 'llm_tokens', mes())).toBe(1000)
    expect(await contador(quem, usageQuota.METRIC_PARCEIRO_TOKENS_MES, mes())).toBe(1000)
  })

  it('a citação que está no trecho passa (espaços e aspas tipográficas à parte)', async () => {
    const quem = await assinante('parceiro-citacao')
    provedor(() => ({
      texto: JSON.stringify({
        ...RESPOSTA_BOA,
        citacoes: [{ trechoId: 'p2', exato: 'civil blood   makes civil hands' }],
      }),
    }))
    const res = await pedir(quem, corpoBase({ selecao: 'civil hands unclean' }))
    expect(res.statusCode).toBe(200)
    expect(res.body.resposta.citacoes).toEqual([{ trechoId: 'p2', exato: 'civil blood makes civil hands' }])
  })

  it('pergunta: sem citação válida é "não está neste trecho"; com citação, a resposta; e nunca vai ao cache', async () => {
    const quem = await assinante('parceiro-pergunta')
    const pergunta = corpoBase({ modo: 'pergunta', selecao: undefined, pergunta: 'Onde a peça se passa?' })
    const primeiras = provedor(() => ({
      texto: JSON.stringify({ texto: 'Em Paris.', pontos: [], citacoes: [], naoEstaNoTrecho: false }),
    }))
    let res = await pedir(quem, pergunta)
    expect(res.statusCode).toBe(200)
    expect(primeiras).toHaveLength(1)
    expect(res.body.resposta).toEqual({ texto: NAO_ESTA_NO_TRECHO, pontos: [], citacoes: [], naoEstaNoTrecho: true })

    const chamadas = provedor(() => ({
      texto: JSON.stringify({
        texto: 'Em Verona.',
        pontos: [],
        citacoes: [{ trechoId: 'p1', exato: 'in fair Verona' }],
        naoEstaNoTrecho: false,
      }),
    }))
    res = await pedir(quem, pergunta)
    expect(res.body.resposta.texto).toBe('Em Verona.')
    res = await pedir(quem, pergunta)
    expect(res.body.origem).toBe('modelo')
    expect(chamadas).toHaveLength(2)
    expect(chamadas[0].user).toContain('Onde a peça se passa?')
  })

  it('citação inventada (entre aspas, fora do texto) no texto principal é 502 resposta_invalida, com o uso CONSUMIDO', async () => {
    const quem = await assinante('parceiro-inventada')
    provedor(() => ({
      texto: JSON.stringify({
        ...RESPOSTA_BOA,
        texto: 'Como diz o livro, "the lovers die together at the end of the play" e isso é trágico.',
      }),
    }))
    const res = await pedir(quem)
    expect(res.statusCode).toBe(502)
    expect(res.body?.code).toBe('resposta_invalida')
    expect(await doDia(quem)).toBe(1)
  })

  it('fora do formato: 502 resposta_invalida (consome); provedor fora do ar: 502 e TUDO estornado', async () => {
    const quem = await assinante('parceiro-fora')
    provedor(() => ({ texto: 'Desculpe, não consigo.' }))
    let res = await pedir(quem)
    expect(res.statusCode).toBe(502)
    expect(res.body?.code).toBe('resposta_invalida')
    expect(await doDia(quem)).toBe(1)

    const outro = await assinante('parceiro-fora-do-ar')
    provedor(() => ({ status: 500 }))
    res = await pedir(outro)
    expect(res.statusCode).toBe(502)
    expect(res.body?.code).toBe('provedor_indisponivel')
    expect(await doDia(outro)).toBe(0)
    expect(await contador(outro, 'llm_tokens', mes())).toBe(0)
    expect(await contador(outro, usageQuota.METRIC_PARCEIRO_TOKENS_MES, mes())).toBe(0)
  })
})

describe('o cache compartilhado', () => {
  it('o mesmo pedido sobre o livro PD, por OUTRA pessoa, sai do cache: sem provedor e sem contar no dia', async () => {
    const a = await assinante('parceiro-cache-a')
    const b = await assinante('parceiro-cache-b')
    const corpo = corpoBase({ modo: 'curiosidade', selecao: 'Two households, both alike in dignity' })
    const chamadas = provedor(() => ({
      texto: JSON.stringify({
        texto: 'As primeiras falas do casal formam um soneto.',
        pontos: [],
        citacoes: [{ trechoId: 'selecao', exato: 'Two households' }],
        naoEstaNoTrecho: false,
      }),
    }))
    const r1 = await pedir(a, corpo)
    expect(r1.body.origem).toBe('modelo')
    const r2 = await pedir(b, corpo)
    expect(r2.statusCode).toBe(200)
    expect(r2.body.origem).toBe('cache')
    expect(r2.body.resposta).toEqual(r1.body.resposta)
    expect(r2.body.restanteHoje).toBe(PARCEIRO_DIA_DOS_PAGOS)
    expect(chamadas).toHaveLength(1)
    expect(await doDia(b)).toBe(0)
    expect(await contador(b, 'llm_tokens', mes())).toBe(0)
    /* Outro nível é outra chave. */
    await pedir(b, { ...corpo, nivel: 'A2' })
    expect(chamadas).toHaveLength(2)
  })

  it('o Grátis não lê o cache (402 antes de tudo)', async () => {
    const corpo = corpoBase({ modo: 'ideia', selecao: undefined })
    const a = await assinante('parceiro-cache-gratis')
    const chamadas = provedor(() => ({
      texto: JSON.stringify({ texto: 'Por que a briga é antiga?', pontos: [], citacoes: [], naoEstaNoTrecho: false }),
    }))
    await pedir(a, corpo)
    const res = await pedir(GRATIS, corpo)
    expect(res.statusCode).toBe(402)
    expect(chamadas).toHaveLength(1)
  })
})

describe('as cotas', () => {
  it('o teto do dia esgotado: 429 teto_do_parceiro, sem provedor', async () => {
    const quem = await assinante('parceiro-teto')
    await counters.increment(
      quem,
      usageQuota.METRIC_PARCEIRO_DIA,
      await usageQuota.janelaDoDia(quem),
      PARCEIRO_DIA_DOS_PAGOS,
    )
    const chamadas = provedor(() => ({ texto: JSON.stringify(RESPOSTA_BOA) }))
    const res = await pedir(quem, corpoBase({ selecao: 'both alike in dignity' }))
    expect(res.statusCode).toBe(429)
    expect(res.body?.code).toBe('teto_do_parceiro')
    expect(chamadas).toHaveLength(0)
  })

  it('a subcota do mês esgotada: 402 cota_do_parceiro, sem provedor, e o dia e a tokensMes intactos', async () => {
    const quem = await assinante('parceiro-subcota')
    await counters.increment(
      quem,
      usageQuota.METRIC_PARCEIRO_TOKENS_MES,
      mes(),
      PLAN_MATRIX.plus.quotas.parceiroTokensMes,
    )
    const chamadas = provedor(() => ({ texto: JSON.stringify(RESPOSTA_BOA) }))
    const res = await pedir(quem, corpoBase({ selecao: 'fair Verona' }))
    expect(res.statusCode).toBe(402)
    expect(res.body?.code).toBe('cota_do_parceiro')
    expect(chamadas).toHaveLength(0)
    expect(await doDia(quem)).toBe(0)
    expect(await contador(quem, 'llm_tokens', mes())).toBe(0)
  })
})

describe('menor (ECA Digital)', () => {
  it('idade não declarada: livro que a vitrine não mostraria é 403 livro_fora_da_faixa, sem provedor nem contador', async () => {
    const menor = await assinante('parceiro-menor-revisar', false)
    const chamadas = provedor(() => ({ texto: JSON.stringify(RESPOSTA_BOA) }))
    const res = await pedir(menor, corpoBase({ livro: { origem: 'catalogo', id: A_REVISAR.id } }))
    expect(res.statusCode).toBe(403)
    expect(res.body?.code).toBe('livro_fora_da_faixa')
    expect(chamadas).toHaveLength(0)
    expect(await doDia(menor)).toBe(0)
  })

  it('livro livre: a instrução de segurança, o complemento de leitura e a ficha SEM o sensível', async () => {
    const menor = await assinante('parceiro-menor-livre', false)
    const chamadas = provedor(() => ({ texto: JSON.stringify(RESPOSTA_BOA) }))
    const res = await pedir(menor, corpoBase({ selecao: 'Two households' }))
    expect(res.statusCode).toBe(200)
    expect(chamadas[0].system).toContain('PÚBLICO MENOR')
    expect(chamadas[0].system).toContain('CVV')
    expect(chamadas[0].system).toContain('adolescente')
    expect(chamadas[0].user).toContain('CURIOSIDADE-COMUM')
    expect(chamadas[0].user).not.toContain('CURIOSIDADE-SENSIVEL')
  })

  it('o adulto que lê "a revisar" pode (a vitrine mostra tudo ao adulto)', async () => {
    const adulto = await assinante('parceiro-adulto-revisar')
    provedor(() => ({ texto: JSON.stringify(RESPOSTA_BOA) }))
    const res = await pedir(adulto, corpoBase({ livro: { origem: 'catalogo', id: A_REVISAR.id }, selecao: 'Verona' }))
    expect(res.statusCode).toBe(200)
  })

  it('livro fora do catálogo é 404 livro_inexistente', async () => {
    provedor(() => ({ texto: JSON.stringify(RESPOSTA_BOA) }))
    const res = await pedir(PAGANTE, corpoBase({ livro: { origem: 'catalogo', id: 'pg-nao-existe' } }))
    expect(res.statusCode).toBe(404)
    expect(res.body?.code).toBe('livro_inexistente')
  })
})

describe('o livro trazido pela pessoa', () => {
  const proprio = (extra: Record<string, unknown> = {}) =>
    corpoBase({ livro: { origem: 'proprio' }, tituloDoCapitulo: undefined, ...extra })

  it('só a seleção e até 2 trechos (1.500 caracteres): passou disso, 413 contexto_grande_demais sem provedor', async () => {
    const chamadas = provedor(() => ({ texto: JSON.stringify(RESPOSTA_BOA) }))
    const tres = [...TRECHOS, { id: 'p3', texto: 'mais um parágrafo' }]
    for (const corpo of [proprio({ trechos: tres }), proprio({ trechos: [{ id: 'p1', texto: 'x'.repeat(1_490) }] })]) {
      const res = await pedir(PAGANTE, corpo)
      expect(res.statusCode).toBe(413)
      expect(res.body?.code).toBe('contexto_grande_demais')
    }
    expect(chamadas).toHaveLength(0)
  })

  it('dentro do teto: 200, sem título no prompt, sem ficha e NUNCA no cache', async () => {
    const quem = await assinante('parceiro-proprio')
    const chamadas = provedor(() => ({ texto: JSON.stringify(RESPOSTA_BOA) }))
    const corpo = proprio({ modo: 'analogia' })
    expect((await pedir(quem, corpo)).statusCode).toBe(200)
    expect((await pedir(quem, corpo)).body.origem).toBe('modelo')
    expect(chamadas).toHaveLength(2)
    expect(chamadas[0].user).toContain('trazido por quem lê')
    expect(chamadas[0].user).not.toContain('FICHA DO LIVRO')
  })
})

const linhasDoCache = async (): Promise<number> =>
  banco.linhas(await banco.db.execute(sql`select count(*)::int as n from cache_do_parceiro`))[0].n

describe('o texto conferido no manifesto', () => {
  const corpoComCitacao = () =>
    JSON.stringify({
      texto: 'Uma explicação do trecho.',
      pontos: [],
      citacoes: [{ trechoId: 'p2', exato: 'From ancient grudge break' }],
      naoEstaNoTrecho: false,
    })

  it('trecho FALSO com o id do catálogo: teto do livro trazido (2 trechos, 1.500 caracteres) e NENHUMA linha no cache', async () => {
    const quem = await assinante('parceiro-falso')
    const chamadas = provedor(() => ({ texto: corpoComCitacao() }))
    const falsos = Array.from({ length: 6 }, (_, i) => ({
      id: `f${i}`,
      texto: `Texto de outro livro, protegido. ${'x'.repeat(600)} ${i}`,
    }))
    const antes = await linhasDoCache()
    const corpo = corpoBase({ modo: 'observar', selecao: undefined, trechos: falsos })
    const res = await pedir(quem, corpo)
    expect(res.statusCode).toBe(200)
    expect(res.body.textoConferido).toBe(false)
    const enviados = [...chamadas[0].user.matchAll(/\[(f\d)\]/g)].map((m) => m[1])
    expect(enviados.length).toBeLessThanOrEqual(2)
    expect(chamadas[0].user.length).toBeLessThan(1_500 + 2_500) // o texto do livro cabe nos 1.500; o resto é o molde
    expect(await linhasDoCache()).toBe(antes)
    /* O mesmo pedido de novo: sem cache, outra chamada. */
    await pedir(quem, corpo)
    expect(chamadas).toHaveLength(2)
  })

  it('UM trecho falso no meio dos verdadeiros já tira o texto do conferido', async () => {
    const quem = await assinante('parceiro-misturado')
    provedor(() => ({ texto: corpoComCitacao() }))
    const antes = await linhasDoCache()
    const res = await pedir(
      quem,
      corpoBase({ modo: 'observar', selecao: undefined, trechos: [...TRECHOS, { id: 'p9', texto: 'inventado aqui' }] }),
    )
    expect(res.body.textoConferido).toBe(false)
    expect(await linhasDoCache()).toBe(antes)
  })

  it('trecho CONFERIDO: o teto do catálogo e uma linha no cache, com a citação cortada', async () => {
    const quem = await assinante('parceiro-conferido')
    provedor(() => ({ texto: corpoComCitacao() }))
    const antes = await linhasDoCache()
    const res = await pedir(quem, corpoBase({ modo: 'observar', selecao: undefined }))
    expect(res.body.textoConferido).toBe(true)
    expect(await linhasDoCache()).toBe(antes + 1)
  })

  it('adulto e menor com o MESMO pedido não dividem a linha do cache', async () => {
    const adulto = await assinante('parceiro-cache-adulto')
    const menor = await assinante('parceiro-cache-menor', false)
    const chamadas = provedor(() => ({ texto: corpoComCitacao() }))
    const corpo = corpoBase({ modo: 'ideia', selecao: 'in fair Verona, where we lay our scene' })
    const antes = await linhasDoCache()
    expect((await pedir(adulto, corpo)).body.origem).toBe('modelo')
    expect((await pedir(menor, corpo)).body.origem).toBe('modelo')
    expect(chamadas).toHaveLength(2)
    expect(chamadas[1].system).toContain('PÚBLICO MENOR')
    expect(await linhasDoCache()).toBe(antes + 2)
    /* Cada um acha a SUA linha depois. */
    expect((await pedir(menor, corpo)).body.origem).toBe('cache')
    expect(chamadas).toHaveLength(2)
  })

  it('acerto do cache com o contador fora do ar: a resposta sai sem o restanteHoje (nunca 503)', async () => {
    const a = await assinante('parceiro-contador-a')
    const b = await assinante('parceiro-contador-b')
    provedor(() => ({ texto: corpoComCitacao() }))
    const corpo = corpoBase({ modo: 'analogia', selecao: 'both alike in dignity' })
    await pedir(a, corpo)
    const espia = vi.spyOn(counters, 'get').mockRejectedValue(new Error('banco fora'))
    try {
      const res = await pedir(b, corpo)
      expect(res.statusCode).toBe(200)
      expect(res.body.origem).toBe('cache')
      expect('restanteHoje' in res.body).toBe(false)
    } finally {
      espia.mockRestore()
    }
  })

  it('o acerto marca usado_em no máximo uma vez por hora por linha', async () => {
    const a = await assinante('parceiro-acerto-a')
    provedor(() => ({ texto: corpoComCitacao() }))
    const corpo = corpoBase({ modo: 'explicar', selecao: 'where civil blood makes civil hands unclean' })
    await pedir(a, corpo)
    const espia = vi.spyOn(cacheRepo, 'marcarAcerto')
    try {
      await pedir(a, corpo)
      await pedir(a, corpo)
      expect(espia).not.toHaveBeenCalled()
      await banco.db.execute(sql`update cache_do_parceiro set usado_em = usado_em - 3600001`)
      await pedir(a, corpo)
      expect(espia).toHaveBeenCalledTimes(1)
    } finally {
      espia.mockRestore()
    }
  })
})

describe('concorrência nas cotas (PGlite; Postgres real com BANCO_DE_TESTE=postgres e TESTE_POSTGRES_URL)', () => {
  const pergunta = corpoBase({ modo: 'pergunta', selecao: undefined, pergunta: 'Onde a peça se passa?' })
  const certa = () =>
    JSON.stringify({
      texto: 'Em Verona.',
      pontos: [],
      citacoes: [{ trechoId: 'p1', exato: 'In fair Verona' }],
      naoEstaNoTrecho: false,
    })

  it('no último pedido do dia, 5 ao mesmo tempo: exatamente 1 passa e o contador não passa do teto', async () => {
    const quem = await assinante('parceiro-corrida-dia')
    const janela = await usageQuota.janelaDoDia(quem)
    await counters.increment(quem, usageQuota.METRIC_PARCEIRO_DIA, janela, PARCEIRO_DIA_DOS_PAGOS - 1)
    const chamadas = provedor(() => ({ texto: certa() }))
    const rs = await Promise.all(Array.from({ length: 5 }, () => pedir(quem, pergunta)))
    expect(rs.filter((r) => r.statusCode === 200)).toHaveLength(1)
    expect(rs.filter((r) => r.body?.code === 'teto_do_parceiro')).toHaveLength(4)
    expect(chamadas).toHaveLength(1)
    expect(await doDia(quem)).toBe(PARCEIRO_DIA_DOS_PAGOS)
  })

  it('com a subcota para UM pedido, 5 ao mesmo tempo: exatamente 1 passa e os outros são recusados (402 cota_do_parceiro ou 429 nuvem_ocupada)', async () => {
    const quem = await assinante('parceiro-corrida-subcota')
    /* A estimativa de UM pedido: a reserva que a subcota recebe (o provedor cai, e tudo é estornado). */
    const espia = vi.spyOn(counters, 'reserve')
    provedor(() => ({ status: 500 }))
    await pedir(quem, pergunta)
    const estimativa = espia.mock.calls.find((c) => c[1] === usageQuota.METRIC_PARCEIRO_TOKENS_MES)?.[4] as number
    espia.mockRestore()
    expect(estimativa).toBeGreaterThan(0)
    const teto = PLAN_MATRIX.plus.quotas.parceiroTokensMes as number
    await counters.increment(quem, usageQuota.METRIC_PARCEIRO_TOKENS_MES, mes(), teto - (estimativa + 10))
    const chamadas = provedor(() => ({ texto: certa() }))
    const rs = await Promise.all(Array.from({ length: 5 }, () => pedir(quem, pergunta)))
    expect(rs.filter((r) => r.statusCode === 200)).toHaveLength(1)
    /* A admissão (vagas em voo, atômicas no banco) vem ANTES da cota: no PGlite os pedidos se serializam e
       todos chegam à subcota (402); no Postgres de verdade eles se sobrepõem e parte é barrada antes (429
       `nuvem_ocupada`). Nos dois casos a recusa é fechada, e o que vale é: 1 passa, 1 chamada, cota no teto. */
    const recusas = rs.filter((r) => r.statusCode !== 200)
    expect(recusas).toHaveLength(4)
    for (const r of recusas) expect(['cota_do_parceiro', 'nuvem_ocupada']).toContain(r.body?.code)
    expect(chamadas).toHaveLength(1)
    expect(await contador(quem, usageQuota.METRIC_PARCEIRO_TOKENS_MES, mes())).toBeLessThanOrEqual(teto)
  })
})

describe('o corpo, a retenção zero e a telemetria', () => {
  it('campo a mais, modo sem seleção, pergunta fora do modo e id reservado: 400 invalido', async () => {
    const chamadas = provedor(() => ({ texto: JSON.stringify(RESPOSTA_BOA) }))
    for (const corpo of [
      corpoBase({ livroInteiro: 'tudo' }),
      corpoBase({ selecao: undefined }),
      corpoBase({ pergunta: 'oi?' }),
      corpoBase({ modo: 'pergunta' }),
      corpoBase({ trechos: [{ id: 'selecao', texto: 'x' }] }),
      corpoBase({ livro: { origem: 'catalogo', id: LIVRE.id, titulo: 'outro' } }),
      corpoBase({ nivel: 'Z9' }),
    ]) {
      const res = await pedir(PAGANTE, corpo)
      expect(res.statusCode, JSON.stringify(corpo).slice(0, 80)).toBe(400)
      expect(res.body?.code).toBe('invalido')
    }
    expect(chamadas).toHaveLength(0)
  })

  it('provedor sem retenção zero nunca é chamado', async () => {
    process.env.IA_PROVEDORES = JSON.stringify({ provedores: [SEM_ZDR] })
    process.env.SEMZDR_API_KEY = 'chave-falsa'
    esquecerRegistro()
    const chamadas = provedor(() => ({ texto: JSON.stringify(RESPOSTA_BOA) }))
    const res = await pedir(PAGANTE, corpoBase({ selecao: 'alike in dignity' }))
    expect(res.statusCode).toBe(501)
    expect(chamadas).toHaveLength(0)
  })

  it('o log não leva o texto do livro, a seleção nem a pergunta', async () => {
    const quem = await assinante('parceiro-log')
    const linhas: string[] = []
    const guardar = (...a: unknown[]) => void linhas.push(a.map(String).join(' '))
    const espias = [
      vi.spyOn(console, 'log').mockImplementation(guardar),
      vi.spyOn(console, 'warn').mockImplementation(guardar),
      vi.spyOn(console, 'error').mockImplementation(guardar),
    ]
    try {
      provedor(() => ({ texto: 'fora do formato' }))
      await pedir(quem, corpoBase({ modo: 'pergunta', selecao: undefined, pergunta: 'SEGREDO-DA-PERGUNTA?' }))
      provedor(() => ({ texto: JSON.stringify(RESPOSTA_BOA) }))
      await pedir(quem, corpoBase({ selecao: 'SEGREDO-DA-SELECAO in fair Verona' }))
    } finally {
      for (const e of espias) e.mockRestore()
    }
    const tudo = linhas.join('\n')
    expect(tudo).not.toContain('SEGREDO-DA-PERGUNTA')
    expect(tudo).not.toContain('SEGREDO-DA-SELECAO')
    expect(tudo).not.toContain('Two households')
  })
})
