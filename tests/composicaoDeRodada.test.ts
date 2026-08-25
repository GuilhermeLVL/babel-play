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
import { describe, it, expect, vi, beforeEach } from 'vitest'
import {
  compor, aceitaFiltroDeDificuldade, composicaoLocal,
  type PedidoDeComposicao, type CartaoParaCompor,
} from '../src/core/minigames/composicao'

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

  it('jogo de FRASE não manda filtro de dificuldade ao servidor', async () => {
    const espia = vi.fn(async () => new Response(JSON.stringify({ total: 0, itens: [] }), { status: 200, headers: { 'content-type': 'application/json' } }))
    vi.stubGlobal('fetch', espia)
    await compor({ jogo: 'ditado', fonte: { id: 'baralho' }, limite: 5, dificuldade: ['dificil'] }, CARTOES)
    const url = String((espia.mock.calls as unknown as Array<[unknown]>)[0][0])
    expect(url).not.toContain('dificuldade')
  })
})
