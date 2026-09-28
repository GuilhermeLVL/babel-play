/**
 * PALAVRAS QUE O ALUNO JÁ SABE — o predicado do degrau M0 (`harness-adaptativo.md` §1.2).
 *
 * O que estes casos prendem:
 *  - SALVAR não é SABER: só o cartão maduro no SRS conta (FSRS em `Review` com estabilidade de
 *    uma semana; Leitner legado da caixa 3 em diante). `New`, `Learning` e `Relearning` não;
 *  - a lista de frequência só conta ABAIXO do nível do aluno (o explícito, ou o estimado pelo
 *    próprio caderno); sem nível nenhum, a trilha não diz nada;
 *  - palavra funcional (artigo, pronome, auxiliar) é conhecida de saída;
 *  - a comparação ignora caixa, acento, pontuação e flexão simples ("Cats" = "cat").
 */
import { describe, expect, it } from 'vitest'

import {
  cartaoMaduro,
  criarPalavrasConhecidas,
  formasDaPalavra,
  nivelEstimadoDoAluno,
} from '../src/core/harness/palavrasConhecidas'
import { routeMt } from '../src/core/harness/roteadorDeTraducao'
import type { DadoTrilha } from '../src/core/learning/trilha'

const maduro = { fsrsState: 'Review' as const, fsrsStability: 12, inDeck: true }

const trilha: Pick<DadoTrilha, 'niveis'> = {
  niveis: {
    A1: [['house', 'casa'], ['water', 'água'], ['dog', 'cachorro'], ['cat', 'gato'], ['red', 'vermelho']],
    A2: [['kitchen', 'cozinha'], ['travel', 'viajar']],
    B1: [['achieve', 'alcançar']],
  },
}

describe('cartaoMaduro: salvar não é saber', () => {
  it('FSRS em Review com estabilidade ≥ 7 dias é maduro', () => {
    expect(cartaoMaduro(maduro)).toBe(true)
    expect(cartaoMaduro({ fsrsState: 'Review', stability: 7 })).toBe(true)
  })

  it('New, Learning e Relearning não contam, nem Review de estabilidade curta', () => {
    expect(cartaoMaduro({ ...maduro, fsrsState: 'New' })).toBe(false)
    expect(cartaoMaduro({ ...maduro, fsrsState: 'Learning' })).toBe(false)
    expect(cartaoMaduro({ ...maduro, fsrsState: 'Relearning' })).toBe(false)
    expect(cartaoMaduro({ ...maduro, fsrsStability: 3 })).toBe(false)
  })

  it('Leitner legado (sem estabilidade): caixa 3 em diante', () => {
    expect(cartaoMaduro({ fsrsState: 'New', fsrsStability: 0, leitnerBox: 3 })).toBe(true)
    expect(cartaoMaduro({ fsrsState: 'New', fsrsStability: 0, leitnerBox: 2 })).toBe(false)
  })

  it('cartão tirado das rodadas (inDeck = false) não conta', () => {
    expect(cartaoMaduro({ ...maduro, inDeck: false })).toBe(false)
  })
})

describe('criarPalavrasConhecidas: o caderno', () => {
  it('só as maduras do idioma pedido; cartão sem idioma gravado entra', () => {
    const k = criarPalavrasConhecidas({
      idioma: 'en-US',
      nivel: null,
      cartoes: [
        { word: 'Kitchen', srcLang: 'en', ...maduro },
        { word: 'travel', srcLang: 'en', ...maduro, fsrsState: 'Learning' },
        { word: 'achieve', ...maduro },
        { word: 'cocina', srcLang: 'es', ...maduro },
      ],
    })
    expect(k.conhece('kitchen')).toBe(true)
    expect(k.conhece('KITCHEN,')).toBe(true)
    expect(k.conhece('travel')).toBe(false)
    expect(k.conhece('achieve')).toBe(true)
    expect(k.conhece('cocina')).toBe(false)
  })

  it('flexão simples: plural, -ed, -ing e consoante dobrada', () => {
    const k = criarPalavrasConhecidas({
      idioma: 'en',
      nivel: null,
      cartoes: ['cat', 'stop', 'city', 'bake'].map((word) => ({ word, ...maduro })),
    })
    for (const w of ['cats', 'stopped', 'stopping', 'cities', 'baked', 'baking']) expect(k.conhece(w), w).toBe(true)
    expect(k.conhece('catalog')).toBe(false)
  })

  it('acento e caixa não importam (pt)', () => {
    const k = criarPalavrasConhecidas({ idioma: 'pt', nivel: null, cartoes: [{ word: 'Água', ...maduro }] })
    expect(k.conhece('agua')).toBe(true)
    expect(k.conhece('águas')).toBe(true)
  })
})

describe('criarPalavrasConhecidas: frequência × nível', () => {
  it('nível B1 explícito: A1 e A2 conhecidas, B1 não', () => {
    const k = criarPalavrasConhecidas({ idioma: 'en', trilha, nivel: 'B1' })
    expect(k.conhece('house')).toBe(true)
    expect(k.conhece('kitchen')).toBe(true)
    expect(k.conhece('achieve')).toBe(false)
    expect(k.nivel).toBe('B1')
  })

  it('nível A1 (quem começa): nada da trilha é conhecido', () => {
    const k = criarPalavrasConhecidas({ idioma: 'en', trilha, nivel: 'A1' })
    expect(k.conhece('house')).toBe(false)
  })

  it('sem nível explícito, estima pelo caderno: A1 ≥ 80% maduro → nível A2', () => {
    const cartoes = ['house', 'water', 'dog', 'cat'].map((word) => ({ word, ...maduro }))
    expect(nivelEstimadoDoAluno(trilha, new Set(['house', 'water', 'dog', 'cat']))).toBe('A2')
    const k = criarPalavrasConhecidas({ idioma: 'en', trilha, cartoes })
    expect(k.nivel).toBe('A2')
    expect(k.conhece('red')).toBe(true) // A1 inteiro, mesmo a que não está no caderno
    expect(k.conhece('kitchen')).toBe(false)
  })

  it('cartões só salvos (não maduros) não sobem o nível estimado', () => {
    const cartoes = ['house', 'water', 'dog', 'cat'].map((word) => ({ word, ...maduro, fsrsState: 'New' as const }))
    const k = criarPalavrasConhecidas({ idioma: 'en', trilha, cartoes })
    expect(k.nivel).toBe('A1')
    expect(k.conhece('red')).toBe(false)
  })
})

describe('palavras funcionais', () => {
  it('artigos, pronomes e auxiliares são conhecidos sem caderno nem trilha', () => {
    const en = criarPalavrasConhecidas({ idioma: 'en', nivel: null })
    for (const w of ['the', 'a', 'I', 'you', 'is', 'are', "don't", 'would', 'of']) expect(en.conhece(w), w).toBe(true)
    expect(en.conhece('coffee')).toBe(false)
    const es = criarPalavrasConhecidas({ idioma: 'es', nivel: null })
    for (const w of ['el', 'la', 'los', 'yo', 'es', 'está', 'de']) expect(es.conhece(w), w).toBe(true)
    const fr = criarPalavrasConhecidas({ idioma: 'fr', nivel: null })
    for (const w of ['le', 'les', 'je', 'est', 'une']) expect(fr.conhece(w), w).toBe(true)
  })

  it('idioma sem lista: só o caderno responde', () => {
    const k = criarPalavrasConhecidas({ idioma: 'xx', nivel: null })
    expect(k.conhece('the')).toBe(false)
  })
})

describe('formasDaPalavra', () => {
  it('nunca corta abaixo de 3 letras', () => {
    expect(formasDaPalavra('is', 'en')).toEqual(['is'])
    expect(formasDaPalavra('bus', 'en')).toContain('bus')
  })
})

describe('routeMt M0 com o predicado', () => {
  it('frase só de palavras conhecidas → pular; com uma nova → traduz', () => {
    const k = criarPalavrasConhecidas({ idioma: 'en', trilha, nivel: 'B1' })
    const rota = (texto: string) =>
      routeMt({
        texto,
        palavrasConhecidas: k.conhece,
        ehToqueEmPalavra: false,
        parcial: false,
        pago: false,
        consentimento: false,
        disponibilidade: { tradutorNativo: false, opusMt: true, nuvem: false },
        origem: 'en',
        destino: 'pt',
        falada: false,
      }).degraus[0]
    expect(rota('The dog is in the kitchen.')).toEqual({ degrau: 'pular', motivo: 'todas-conhecidas' })
    expect(rota('The dog achieved it.')?.degrau).not.toBe('pular')
  })
})
