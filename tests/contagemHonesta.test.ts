/**
 * F1 — O NÚMERO QUE A TELA MOSTRA TEM DE SER O NÚMERO QUE EXISTE.
 *
 * O defeito que estes testes travam: a faixa "Praticar" exibia `{jogaveis.length} prontas`, e
 * `jogaveis` é a COMPOSIÇÃO DA RODADA, pedida ao servidor com `limite: 200` fixo
 * (Play.tsx:995). Ao lado, "N em outro idioma" e "N para revisar" vinham da triagem local sobre
 * o baralho INTEIRO, sem teto. Três números lado a lado, um deles numa base diferente.
 *
 * Com 1.902 cartões jogáveis, a tela dizia "200 prontas". O total real do servidor
 * (`composicao.total`) já existia no contrato e nunca era renderizado.
 *
 * Num produto cuja doutrina escrita é "a UI não exibe falsa precisão" (openspec/project.md),
 * exibir um artefato de paginação como se fosse um fato sobre o acervo é o defeito mais grave
 * possível — corrói justamente o diferencial.
 */
import { describe, it, expect } from 'vitest'
import { composicaoLocal, contagemDaFonte, type CartaoParaCompor, type PedidoDeComposicao } from '../src/core/minigames/composicao'
import { triarCartoes, pistasDaTriagem } from '../src/core/learning/quality'
import { estadoDoJogo } from '../src/core/minigames/estadoDosJogos'
import type { VocabCard } from '../src/types'

/** Gera N cartões válidos e distintos — o ponto é o VOLUME, não o conteúdo. */
const muitosCartoes = (n: number): CartaoParaCompor[] =>
  Array.from({ length: n }, (_, i) => ({
    id: `c${i}`, word: `word${i}`, back: `palavra${i}`, sentence: null,
    cefrLevel: 'A2', cefrSource: 'wordlist', occurrences: 1 + (i % 5),
    difficultyScore: (i % 100) / 100, dueAt: i, srcLang: 'en', tgtLang: 'pt',
    clozePrompt: null, clozeAnswer: null,
  })) as CartaoParaCompor[]

const PEDIDO: PedidoDeComposicao = { jogo: 'memory', fonte: { id: 'baralho' }, limite: 200 }

describe('a composição já sabe o total — o teto é do recorte, não do acervo', () => {
  it('com 1.902 cartões e limite 200, `total` é 1902 e `itens` é 200', () => {
    const c = composicaoLocal(muitosCartoes(1902), PEDIDO)
    expect(c.itens).toHaveLength(200)
    expect(c.total).toBe(1902)
    // A prova do defeito: são números DIFERENTES, e a UI mostrava o errado.
    expect(c.total).not.toBe(c.itens.length)
  })
})

describe('contagemDaFonte — decide qual número vai para a tela', () => {
  it('devolve o TOTAL da fonte, nunca o tamanho do recorte', () => {
    const c = composicaoLocal(muitosCartoes(1902), PEDIDO)
    const r = contagemDaFonte(c, 1902)
    expect(r.total).toBe(1902)
    expect(r.naRodada).toBe(200)
  })

  it('marca `recortado` quando a rodada é um pedaço de um conjunto maior', () => {
    const r = contagemDaFonte(composicaoLocal(muitosCartoes(1902), PEDIDO), 1902)
    expect(r.recortado).toBe(true)
  })

  it('NÃO marca `recortado` quando a rodada cabe inteira', () => {
    const c = composicaoLocal(muitosCartoes(12), { ...PEDIDO, limite: 200 })
    const r = contagemDaFonte(c, 12)
    expect(r.recortado).toBe(false)
    expect(r.total).toBe(12)
    expect(r.naRodada).toBe(12)
  })

  it('sem composição, cai no acervo local — e continua sendo o total, não um teto', () => {
    const r = contagemDaFonte(null, 1902)
    expect(r.total).toBe(1902)
    expect(r.naRodada).toBe(0)
    expect(r.recortado).toBe(false)
  })

  it('o total do SERVIDOR vence o local: é ele que conhece a fonte inteira', () => {
    // O servidor compôs 200 de 1.902; o cliente só tinha 300 cartões em memória.
    const doServidor = { ...composicaoLocal(muitosCartoes(300), PEDIDO), total: 1902, origemDaComposicao: 'servidor' as const }
    const r = contagemDaFonte(doServidor, 300)
    expect(r.total).toBe(1902)
  })

  it('nunca devolve total menor que a rodada — seria um número impossível na tela', () => {
    const incoerente = { ...composicaoLocal(muitosCartoes(500), PEDIDO), total: 3 }
    const r = contagemDaFonte(incoerente, 500)
    expect(r.total).toBeGreaterThanOrEqual(r.naRodada)
  })
})

/**
 * A FIXTURE ANTERIOR ERA CEGA POR CONSTRUÇÃO — e o conserto vale mais que o teste.
 *
 * `muitosCartoes` dá `back` a TODOS os cartões e `srcLang: 'en'` a TODOS. Sobre esse material a
 * régua de qualidade não tem o que reprovar e o filtro de idioma não tem o que separar: o teste
 * media a paginação num mundo onde o defeito medido em produção não pode existir.
 *
 * O baralho real é o oposto: **1.200 dos 2.147 cartões não têm tradução** e dois idiomas convivem.
 * Foi essa mistura que produziu o "923 prontas" que virava 5 na Memória — os 200 slots do servidor
 * eram gastos com cartões sem tradução, ordenados por vencimento, e o jogo de par ficava sem par.
 *
 * O que este bloco trava é a ARITMÉTICA, não a paginação: o jogo de par nunca pode oferecer mais
 * do que existe COM TRADUÇÃO, e o número da faixa tem de bater com o que a rodada entrega.
 */
describe('a aritmética sobre um baralho sujo, como o real', () => {
  const carta = (p: Partial<VocabCard> & { id: string; word: string }): VocabCard => ({
    phonetics: '', translation: '', explanation: '', srcLang: 'en', tgtLang: 'pt',
    frequency: 'medium', leitnerBox: 1, leitnerDueAt: new Date(0).toISOString(),
    fsrsState: 'New', fsrsStability: 0, fsrsDifficulty: 5, fsrsPredictedRetention: 0,
    fsrsDueAt: new Date(0).toISOString(), inDeck: true, ...p,
  } as VocabCard)

  /* 60 cartões nas proporções medidas: 20 inglês com tradução, 20 inglês só com frase,
     20 português (outra rodada). Sem dígitos nas traduções — `pistaUtil` os rejeita, e foi
     assim que um teste anterior deste projeto passou a comparar zero com zero. */
  const NOMES = ['house', 'bread', 'table', 'window', 'garden', 'bottle', 'candle', 'bridge',
    'river', 'forest', 'mountain', 'island', 'street', 'market', 'letter', 'summer',
    'winter', 'flower', 'silver', 'golden']
  const TRADUCOES = ['casa', 'pão', 'mesa', 'janela', 'jardim', 'garrafa', 'vela', 'ponte',
    'rio', 'floresta', 'montanha', 'ilha', 'rua', 'mercado', 'carta', 'verão',
    'inverno', 'flor', 'prata', 'dourado']

  const SUJO: VocabCard[] = [
    ...NOMES.map((w, i) => carta({ id: `t${i}`, word: w, translation: TRADUCOES[i] })),
    ...NOMES.map((w, i) => carta({ id: `f${i}`, word: `${w}s`, translation: '', sentence: `I saw the ${w}s there.` })),
    ...NOMES.map((w, i) => carta({ id: `p${i}`, word: TRADUCOES[i], translation: NOMES[i], srcLang: 'pt', tgtLang: 'en' })),
  ]

  it('a fixture é MESMO suja — sem isto o resto compara zero com zero', () => {
    const t = triarCartoes(SUJO, { lang: 'en' })
    const pistas = pistasDaTriagem(t)
    expect(pistas.comTraducao.length).toBe(20)
    expect(pistas.soComFrase.length).toBeGreaterThan(0)
    expect(t.outroIdioma.length).toBe(20)
  })

  it('o jogo de par NUNCA oferece mais do que existe com tradução', () => {
    /* A desigualdade que a tela quebrou: ela anunciava as usáveis (com frase inclusas) e a
       Memória só monta com par de verdade. Aqui as duas contas voltam a ser compatíveis. */
    const t = triarCartoes(SUJO, { lang: 'en' })
    const memoria = estadoDoJogo('memory', {
      cartas: t.usaveis, frases: [], temAudio: false, temVoz: false, fonteId: 'baralho', lang: 'en',
    })
    expect(memoria.disponiveis).toBeLessThanOrEqual(pistasDaTriagem(t).comTraducao.length)
  })

  it('e os cartões de outro idioma não entram na conta de jeito nenhum', () => {
    const t = triarCartoes(SUJO, { lang: 'en' })
    expect(t.usaveis.some(c => c.srcLang === 'pt')).toBe(false)
  })

  it('a faixa fecha: usáveis = com tradução + só com frase', () => {
    const t = triarCartoes(SUJO, { lang: 'en' })
    const { comTraducao, soComFrase } = pistasDaTriagem(t)
    expect(comTraducao.length + soComFrase.length).toBe(t.usaveis.length)
  })
})
