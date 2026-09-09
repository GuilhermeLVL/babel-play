/**
 * Z1 — ADAPTADOR ÚNICO de composição de rodada.
 *
 * Antes, a seleção de palavras vivia no cliente: `cartoesDaFonte` filtrava em JS sobre o deck
 * inteiro, que `fetchDeck()` rebaixava a cada fim de rodada. Não havia filtro de dificuldade, e a
 * proveniência ("por que esta palavra apareceu?") não existia.
 *
 * O adaptador é UM contrato que os 9 jogos consomem. Nenhum jogo chama a API.
 *
 * RECORTE HONESTO: dificuldade é propriedade do CARTÃO. Dos 9 jogos, 4 são de modalidade
 * `palavra` (memory, wordsearch, blitz, termo) e recebem o filtro; os 5 de frase/frase-áudio
 * jogam sobre falas de sessão, que não têm dificuldade por palavra. O adaptador serve os 9 e diz,
 * por jogo, se o filtro se aplica — em vez de fingir que sim e devolver um chip inerte.
 */
import { beforeEach,describe, expect, it, vi } from 'vitest'

import {
aceitaFiltroDeDificuldade, type CartaoParaCompor,   compor, type Composicao,
composicaoLocal, filtroParaComposicao,
  type PedidoDeComposicao,   pedidoHttpDaComposicao, recortarPelaComposicao, TETO_DA_QUERY_DA_COMPOSICAO,
} from '../src/core/minigames/composicao'
import { type CartaoFiltravel,FILTRO_PADRAO, type FiltroDaPratica } from '../src/core/minigames/filtro'

const CARTOES: CartaoParaCompor[] = [
  { id: 'c1', word: 'water', back: 'água', sentence: null, cefrLevel: 'A1', cefrSource: 'wordlist', occurrences: 9, difficultyScore: 0.12, dueAt: 1, srcLang: 'en', tgtLang: 'pt', clozePrompt: null, clozeAnswer: null },
  { id: 'c2', word: 'leverage', back: 'alavancagem', sentence: null, cefrLevel: 'B2', cefrSource: 'wordlist', occurrences: 3, difficultyScore: 0.5, dueAt: 2, srcLang: 'en', tgtLang: 'pt', clozePrompt: null, clozeAnswer: null },
  { id: 'c3', word: 'incomprehensible', back: 'incompreensível', sentence: null, cefrLevel: null, cefrSource: 'ausente', occurrences: 1, difficultyScore: 0.88, dueAt: 3, srcLang: 'en', tgtLang: 'pt', clozePrompt: null, clozeAnswer: null },
]

const PEDIDO: PedidoDeComposicao = { jogo: 'memory', fonte: { id: 'baralho' }, limite: 8 }

beforeEach(() => { vi.unstubAllGlobals() })

describe('aceitaFiltroDeDificuldade — o recorte é declarado, não presumido', () => {
  it('vale para os 4 jogos de palavra', () => {
    for (const j of ['memory', 'wordsearch', 'blitz', 'termo'] as const) {
      expect(aceitaFiltroDeDificuldade(j)).toBe(true)
    }
  })

  it('NÃO vale para os 5 de frase — falas não têm dificuldade por palavra', () => {
    for (const j of ['scramble', 'karaoke', 'escuta', 'ditado', 'conectores'] as const) {
      expect(aceitaFiltroDeDificuldade(j)).toBe(false)
    }
  })
})

describe('composicaoLocal — o fallback', () => {
  it('filtra por faixa usando o MESMO corte do servidor', () => {
    const r = composicaoLocal(CARTOES, { ...PEDIDO, dificuldade: ['dificil'] })
    expect(r.itens.map((i) => i.word)).toEqual(['incomprehensible'])
  })

  it('marca a origem como fallback-local — a UI precisa saber que não veio do servidor', () => {
    const r = composicaoLocal(CARTOES, PEDIDO)
    expect(r.origemDaComposicao).toBe('fallback-local')
    expect(r.itens.every((i) => i.proveniencia.origemDaComposicao === 'fallback-local')).toBe(true)
  })

  it('todo item carrega proveniência completa', () => {
    const [i] = composicaoLocal(CARTOES, PEDIDO).itens
    expect(i.proveniencia).toMatchObject({
      origem: 'baralho', nivelFonte: expect.any(String), porQueSelecionado: expect.any(String),
    })
    expect(['facil', 'medio', 'dificil', null]).toContain(i.proveniencia.faixa)
  })

  it('cartão sem difficulty_score não é descartado — ele é a maioria do deck em migração', () => {
    const semScore = [{ ...CARTOES[0], difficultyScore: null }]
    expect(composicaoLocal(semScore, PEDIDO).itens).toHaveLength(1)
  })
})

describe('compor — servidor com fallback', () => {
  it('usa o servidor quando ele responde', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => new Response(JSON.stringify({
      total: 1,
      itens: [{ cardId: 'c9', word: 'harvest', back: 'colheita', proveniencia: { origem: 'trilha', faixa: 'medio', nivelFonte: 'wordlist', porQueSelecionado: 'estrategia:equilibrado' } }],
    }), { status: 200, headers: { 'content-type': 'application/json' } })))

    const r = await compor(PEDIDO, CARTOES)
    expect(r.origemDaComposicao).toBe('servidor')
    expect(r.itens.map((i) => i.word)).toEqual(['harvest'])
  })

  it('REDE CAÍDA ⇒ cai para local, com a origem marcada — nunca rodada vazia', async () => {
    // A aplicação é local-first: uma falha de rede não pode virar tela quebrada nem lista vazia
    // silenciosa. O comportamento é DEFINIDO, não acidental.
    vi.stubGlobal('fetch', vi.fn(async () => { throw new Error('offline') }))
    const r = await compor(PEDIDO, CARTOES)
    expect(r.origemDaComposicao).toBe('fallback-local')
    expect(r.itens.length).toBeGreaterThan(0)
  })

  it('resposta 500 ⇒ cai para local do mesmo jeito', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => new Response('erro', { status: 500 })))
    const r = await compor(PEDIDO, CARTOES)
    expect(r.origemDaComposicao).toBe('fallback-local')
  })

  it('resposta malformada ⇒ cai para local em vez de propagar lixo aos jogos', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => new Response('{"itens":"nao é array"}', { status: 200, headers: { 'content-type': 'application/json' } })))
    const r = await compor(PEDIDO, CARTOES)
    expect(r.origemDaComposicao).toBe('fallback-local')
  })

  /**
   * O FILTRO FACETADO VIAJA (auditoria de 2026-09-07, A17). Antes o campo era montado, tipado e
   * validado nas duas pontas e nunca serializado aqui — o servidor recebia o pedido antigo.
   */
  it('com `filtro` no pedido, a URL leva o filtro em JSON e mantém fonte/lang como proveniência', async () => {
    const espia = vi.fn(async () => new Response(JSON.stringify({ total: 0, itens: [] }), { status: 200, headers: { 'content-type': 'application/json' } }))
    vi.stubGlobal('fetch', espia)
    const filtro = { fontes: ['baralho' as const], baralhos: ['deckA'], recorte: { pedindoRevisao: true } }
    await compor({ ...PEDIDO, fonte: { id: 'baralho', lang: 'en' }, filtro }, CARTOES)
    const [url, init] = (espia.mock.calls as unknown as Array<[string, RequestInit]>)[0]
    expect(init.method).toBeUndefined()
    const query = new URL(url, 'http://x').searchParams
    expect(JSON.parse(query.get('filtro')!)).toEqual(filtro)
    expect(query.get('fonte')).toBe('baralho')
    expect(query.get('lang')).toBe('en')
  })

  it('sem `filtro` no pedido, a URL não ganha o parâmetro', async () => {
    const espia = vi.fn(async () => new Response(JSON.stringify({ total: 0, itens: [] }), { status: 200, headers: { 'content-type': 'application/json' } }))
    vi.stubGlobal('fetch', espia)
    await compor(PEDIDO, CARTOES)
    expect(String((espia.mock.calls as unknown as Array<[unknown]>)[0][0])).not.toContain('filtro')
  })

  it('acima do teto da query, o MESMO pedido vai por POST com os mesmos campos no corpo', async () => {
    const espia = vi.fn(async () => new Response(JSON.stringify({ total: 0, itens: [] }), { status: 200, headers: { 'content-type': 'application/json' } }))
    vi.stubGlobal('fetch', espia)
    const dificeisIds = Array.from({ length: 200 }, (_, i) => `id-${String(i).padStart(36, '0')}`)
    const filtro = { fontes: ['baralho' as const], recorte: { dificeisIds } }
    const pedido = pedidoHttpDaComposicao({ ...PEDIDO, filtro })
    expect(pedido.corpo).toBeDefined()
    expect(pedido.caminho).toBe('/api/vocab/para-jogo')
    const r = await compor({ ...PEDIDO, filtro }, CARTOES)
    expect(r.origemDaComposicao).toBe('servidor')
    const [url, init] = (espia.mock.calls as unknown as Array<[string, RequestInit]>)[0]
    expect(url).toBe('/api/vocab/para-jogo')
    expect(init.method).toBe('POST')
    const corpo = JSON.parse(String(init.body))
    expect(JSON.parse(corpo.filtro)).toEqual(filtro)
    expect(corpo.fonte).toBe('baralho')
    expect(corpo.limite).toBe(String(PEDIDO.limite))
  })

  it('abaixo do teto, o pedido continua GET — o teto é o único critério', () => {
    const pequeno = pedidoHttpDaComposicao({ ...PEDIDO, filtro: { fontes: ['baralho'], baralhos: ['a'] } })
    expect(pequeno.corpo).toBeUndefined()
    expect(pequeno.caminho.startsWith('/api/vocab/para-jogo?')).toBe(true)
    expect(pequeno.caminho.length).toBeLessThanOrEqual(TETO_DA_QUERY_DA_COMPOSICAO + '/api/vocab/para-jogo?'.length)
  })

  it('jogo de FRASE não manda filtro de dificuldade ao servidor', async () => {
    const espia = vi.fn(async () => new Response(JSON.stringify({ total: 0, itens: [] }), { status: 200, headers: { 'content-type': 'application/json' } }))
    vi.stubGlobal('fetch', espia)
    await compor({ jogo: 'ditado', fonte: { id: 'baralho' }, limite: 5, dificuldade: ['dificil'] }, CARTOES)
    const url = String((espia.mock.calls as unknown as Array<[unknown]>)[0][0])
    expect(url).not.toContain('dificuldade')
  })
})

/**
 * O FILTRO FACETADO chegando ao adaptador — `recortarPelaComposicao` ganha a alternativa
 * `{ filtro }` (SEMPRE completa, mas só com elegíveis) e `composicaoLocal` passa a respeitar
 * `PedidoDeComposicao.filtro` no fallback offline (a paridade de graça).
 */
describe('filtroParaComposicao — a escolha vira a forma de fio', () => {
  it('FILTRO_PADRAO vira um fio sem nada preenchido', () => {
    const fio = filtroParaComposicao(FILTRO_PADRAO)
    expect(fio.fontes).toEqual(['baralho', 'sessao'])
    expect(fio.baralhos).toBeUndefined()
    expect(fio.sessoes).toBeUndefined()
    expect(fio.recorte).toBeUndefined()
    expect(fio.midia).toBeUndefined()
  })

  it('recorte.dificeis vira dificeisIds — o servidor não conhece o ranking sozinho', () => {
    const f: FiltroDaPratica = { ...FILTRO_PADRAO, recorte: { dificeis: true } }
    const fio = filtroParaComposicao(f, ['c1', 'c2'])
    expect(fio.recorte?.dificeisIds).toEqual(['c1', 'c2'])
  })

  it('niveis e mídia atravessam quando preenchidos', () => {
    const f: FiltroDaPratica = { ...FILTRO_PADRAO, recorte: { niveis: ['A1'] }, midia: { comTraducao: true } }
    const fio = filtroParaComposicao(f)
    expect(fio.recorte?.niveis).toEqual(['A1'])
    expect(fio.midia).toEqual({ comTraducao: true })
  })
})

describe('recortarPelaComposicao com { filtro } — completa SÓ com elegíveis', () => {
  const usaveis: Array<{ id: string } & CartaoFiltravel> = [
    { id: 'a', daTrilha: false, cefrLevel: 'A1' },
    { id: 'b', daTrilha: false, cefrLevel: 'B2' },
    { id: 'c', daTrilha: false, cefrLevel: 'A1' },
  ]
  const servida: Composicao = {
    total: 1, origemDaComposicao: 'servidor',
    itens: [{ cardId: 'b', word: 'x', back: null, sentence: null, clozePrompt: null, clozeAnswer: null, proveniencia: { origem: 'baralho', origemRef: null, nivel: null, nivelFonte: '', dificuldade: null, faixa: null, ocorrencias: null, porQueSelecionado: '', origemDaComposicao: 'servidor' } }],
  }

  it('filtro vazio (FILTRO_PADRAO) ≡ completar:true antigo', () => {
    const r = recortarPelaComposicao(usaveis, servida, { filtro: FILTRO_PADRAO })
    expect(r.map((c) => c.id)).toEqual(['b', 'a', 'c'])
  })

  it('filtro restritivo: a ORDEM do servidor é respeitada (nunca capa nos servidos), só o COMPLEMENTO é filtrado', () => {
    const f: FiltroDaPratica = { ...FILTRO_PADRAO, recorte: { niveis: ['A1'] } }
    // 'b' veio do servidor e entra primeiro mesmo sendo B2 — o servidor já fez sua escolha, e
    // "nunca capa injustamente nos servidos" é justamente essa garantia. O que muda é o
    // COMPLEMENTO: só 'a' e 'c' (A1) entram atrás; nada fora do filtro é adicionado por trás.
    const r = recortarPelaComposicao(usaveis, servida, { filtro: f })
    expect(r.map((c) => c.id)).toEqual(['b', 'a', 'c'])
  })

  it('filtro restritivo cujo elegível não foi servido: o complemento ainda entra', () => {
    const f: FiltroDaPratica = { ...FILTRO_PADRAO, recorte: { niveis: ['B2'] } }
    // Nada em `usaveis` de nível B2 além de 'b', que já foi servido — o complemento fica vazio.
    const r = recortarPelaComposicao(usaveis, servida, { filtro: f })
    expect(r.map((c) => c.id)).toEqual(['b'])
  })

  it('sem composição, devolve o acervo intacto (como a forma antiga)', () => {
    const r = recortarPelaComposicao(usaveis, null, { filtro: FILTRO_PADRAO })
    expect(r).toHaveLength(3)
  })

  it('a forma antiga { completar } continua idêntica', () => {
    const comCompletar = recortarPelaComposicao(usaveis, servida, { completar: true })
    const semCompletar = recortarPelaComposicao(usaveis, servida, { completar: false })
    expect(comCompletar.map((c) => c.id)).toEqual(['b', 'a', 'c'])
    expect(semCompletar.map((c) => c.id)).toEqual(['b'])
  })
})

describe('composicaoLocal com filtro — a paridade de graça no fallback offline', () => {
  const cartoes: CartaoParaCompor[] = [
    { id: 'c1', word: 'water', back: 'água', sentence: 'I like water.', cefrLevel: 'A1', cefrSource: 'x', occurrences: 1, difficultyScore: 0.1, dueAt: 1, srcLang: 'en', tgtLang: 'pt', clozePrompt: null, clozeAnswer: null },
    { id: 'c2', word: 'leverage', back: null, sentence: null, cefrLevel: 'B2', cefrSource: 'x', occurrences: 1, difficultyScore: 0.5, dueAt: 2, srcLang: 'en', tgtLang: 'pt', clozePrompt: null, clozeAnswer: null },
  ]

  it('midia.comTraducao filtra offline exatamente como o predicado prevê', () => {
    const p: PedidoDeComposicao = {
      jogo: 'memory', fonte: { id: 'baralho' }, limite: 8,
      filtro: filtroParaComposicao({ ...FILTRO_PADRAO, midia: { comTraducao: true } }),
    }
    const r = composicaoLocal(cartoes, p)
    expect(r.itens.map((i) => i.cardId)).toEqual(['c1'])
  })

  it('sem filtro no pedido, nada muda', () => {
    const p: PedidoDeComposicao = { jogo: 'memory', fonte: { id: 'baralho' }, limite: 8 }
    expect(composicaoLocal(cartoes, p).itens).toHaveLength(2)
  })
})
