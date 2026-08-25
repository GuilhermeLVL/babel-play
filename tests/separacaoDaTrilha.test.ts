/**
 * A ESCOLHA "MINHAS GRAVAÇÕES **OU** TRILHA" PRECISA SER EXCLUSIVA — e não era.
 *
 * Duas coisas estavam erradas ao mesmo tempo:
 *
 *  1. **A fonte `baralho` devolvia o acervo INTEIRO**, incluindo as palavras importadas da trilha.
 *     As duas opções não eram alternativas: uma continha a outra. Oferecer a escolha binária que o
 *     produto promete seria mentir no primeiro clique.
 *
 *  2. **A fonte `trilha` não devolvia NADA.** Ela filtrava por
 *     `sourceSessionId === SESSAO_DA_TRILHA(lang)`, e essa coluna é NULL para cartão da trilha:
 *     `bulkAdd` sanea `session_id` contra as sessões reais do dono, e `trilha:en` não é uma delas.
 *     O próprio repositório documenta esse defeito (`origemDe()`, `vocab.ts:158-160`) — a correção
 *     foi aplicada ao GRAVAR a ocorrência, e o filtro do cliente nunca foi atualizado. Consequência
 *     medida: as palavras que a pessoa errava na trilha nunca voltavam para ela, `nivelSugerido`
 *     devolvia A1 para sempre e o painel anunciava 0%.
 *
 * O que este arquivo trava é a **partição**: todo cartão tem exatamente uma casa. É a propriedade
 * que faz a escolha binária ser verdadeira.
 */
import { describe, it, expect } from 'vitest'
import { cartoesDaFonte, SESSAO_DA_TRILHA } from '../src/core/minigames/source'
import { cartoesDaTrilha } from '../src/core/learning/trilha'
import type { VocabCard } from '../src/types'
import type { DadoTrilha } from '../src/core/learning/trilha'

function carta(p: Partial<VocabCard> & { id: string; word: string }): VocabCard {
  return {
    phonetics: '', translation: `t-${p.word}`, explanation: '',
    srcLang: 'en', tgtLang: 'pt', frequency: 'medium',
    leitnerBox: 1, leitnerDueAt: new Date(0).toISOString(),
    fsrsState: 'New', fsrsStability: 0, fsrsDifficulty: 5,
    fsrsPredictedRetention: 0, fsrsDueAt: new Date(0).toISOString(), inDeck: true,
    ...p,
  } as VocabCard
}

const DECK = [
  carta({ id: 'g1', word: 'house', sourceSessionId: 'sessao-1' }),
  carta({ id: 'g2', word: 'bread', sourceSessionId: 'sessao-1' }),
  carta({ id: 'g3', word: 'table', sourceSessionId: 'sessao-2' }),
  carta({ id: 'm1', word: 'window' }),                                   // manual, sem sessão
  carta({ id: 't1', word: 'garden', daTrilha: true, cefrLevel: 'A1' }),
  carta({ id: 't2', word: 'bottle', daTrilha: true, cefrLevel: 'B1' }),
]

describe('a partição do baralho', () => {
  it('"minhas gravações" NÃO inclui a trilha', () => {
    const t = cartoesDaFonte(DECK, { id: 'baralho', lang: 'en' })
    const ids = t.usaveis.map(c => c.id)

    expect(ids).not.toContain('t1')
    expect(ids).not.toContain('t2')
    expect(ids).toEqual(expect.arrayContaining(['g1', 'g2', 'g3', 'm1']))
  })

  it('"trilha" inclui SÓ a trilha — e agora inclui de verdade', () => {
    const t = cartoesDaFonte(DECK, { id: 'trilha', lang: 'en' })
    expect(t.usaveis.map(c => c.id).sort()).toEqual(['t1', 't2'])
  })

  it('a partição é COMPLETA — nenhum cartão fica sem casa', () => {
    const gravacoes = cartoesDaFonte(DECK, { id: 'baralho', lang: 'en' })
    const trilha = cartoesDaFonte(DECK, { id: 'trilha', lang: 'en' })

    const cobertos = new Set([
      ...gravacoes.usaveis.map(c => c.id), ...gravacoes.fora.map(f => f.card.id), ...gravacoes.outroIdioma.map(c => c.id),
      ...trilha.usaveis.map(c => c.id), ...trilha.fora.map(f => f.card.id), ...trilha.outroIdioma.map(c => c.id),
    ])
    expect(cobertos.size).toBe(DECK.length)
  })

  it('e é EXCLUSIVA — nenhum cartão aparece nas duas', () => {
    const daGravacao = new Set(cartoesDaFonte(DECK, { id: 'baralho', lang: 'en' }).usaveis.map(c => c.id))
    const daTrilha = cartoesDaFonte(DECK, { id: 'trilha', lang: 'en' }).usaveis.map(c => c.id)

    expect(daTrilha.some(id => daGravacao.has(id)), 'um cartão está nas duas fontes').toBe(false)
  })

  it('a trilha respeita o nível escolhido', () => {
    expect(cartoesDaFonte(DECK, { id: 'trilha', lang: 'en', nivel: 'A1' }).usaveis.map(c => c.id)).toEqual(['t1'])
    expect(cartoesDaFonte(DECK, { id: 'trilha', lang: 'en', nivel: 'B1' }).usaveis.map(c => c.id)).toEqual(['t2'])
  })
})

describe('a fonte "sessão" sem gravação escolhida', () => {
  it('devolve VAZIO, não o baralho inteiro', () => {
    /* O fallback silencioso: sem `sessionId` a função caía no ramo `else` e entregava tudo. Uma
       tela que pergunta "qual gravação?" e joga com o acervo inteiro enquanto ninguém respondeu
       é pior que uma tela vazia — ela parece funcionar. */
    const t = cartoesDaFonte(DECK, { id: 'sessao', lang: 'en' })
    expect(t.usaveis).toEqual([])
  })

  it('com gravação escolhida, recorta por ela', () => {
    const t = cartoesDaFonte(DECK, { id: 'sessao', lang: 'en', sessionId: 'sessao-1' })
    expect(t.usaveis.map(c => c.id).sort()).toEqual(['g1', 'g2'])
  })
})

describe('os cartões sintéticos da trilha', () => {
  const FALSA: DadoTrilha = {
    lang: 'en', fonte: 'teste', versao: '1',
    niveis: { A2: [['bridge', 'ponte'], ['candle', 'vela']] },
  }

  it('nascem marcados como da trilha, e por isso passam pelo filtro da fonte', () => {
    const cartoes = cartoesDaTrilha(FALSA, 'A2') as unknown as VocabCard[]
    expect(cartoes.every(c => c.daTrilha === true)).toBe(true)

    const t = cartoesDaFonte(cartoes, { id: 'trilha', lang: 'en', nivel: 'A2' })
    expect(t.usaveis).toHaveLength(2)
  })

  it('e NÃO aparecem em "minhas gravações"', () => {
    const cartoes = cartoesDaTrilha(FALSA, 'A2') as unknown as VocabCard[]
    expect(cartoesDaFonte(cartoes, { id: 'baralho', lang: 'en' }).usaveis).toEqual([])
  })

  it('continuam escrevendo o id sintético — é o que o servidor decompõe para gravar a origem', () => {
    /* `SESSAO_DA_TRILHA` sobrevive como convenção de ESCRITA. Se alguém apagar isso achando que é
       resíduo, `origemDe()` perde como classificar a ocorrência e a procedência some de novo. */
    const cartoes = cartoesDaTrilha(FALSA, 'A2')
    expect(cartoes.every(c => c.sourceSessionId === SESSAO_DA_TRILHA('en'))).toBe(true)
  })
})

describe('o defeito original, travado', () => {
  it('filtrar por sourceSessionId NÃO encontra a trilha — é por isso que o campo existe', () => {
    /* Reproduz a comparação antiga sobre um cartão como o banco realmente devolve (session_id
       NULL, procedência em `daTrilha`). Se alguém reintroduzir aquele filtro, este teste mostra
       exatamente por que ele não funciona. */
    const comoOBancoDevolve = carta({ id: 't3', word: 'candle', daTrilha: true })

    expect(comoOBancoDevolve.sourceSessionId).toBeUndefined()
    expect(comoOBancoDevolve.sourceSessionId === SESSAO_DA_TRILHA('en')).toBe(false)
    expect(comoOBancoDevolve.daTrilha).toBe(true)
  })
})
