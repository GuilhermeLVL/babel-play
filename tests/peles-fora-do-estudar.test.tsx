// @vitest-environment jsdom
/**
 * AS PELES DE CARTÃO FORA DO ESTUDAR (spec 5.2.4): "aplica no Estudar, na Biblioteca e nos jogos
 * que mostram cartões". Até aqui só o Estudar vestia a pele.
 *
 *  · Vocabulário → a gaveta da palavra: o bloco "Na sua memória" (o estado FSRS do cartão) veste a
 *    pele equipada no estado da palavra.
 * A Memória de antes (`MemoryGame`) também vestia a pele na carta virada; o jogo saiu com o desenho de
 * antes, e a Memória de agora não desenha cartão de palavra com pele.
 */
import { cleanup, render, screen } from '@testing-library/react'
import React from 'react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import type { VocabCard } from '../src/types'
import { prepararDialogoNoJsdom } from './_dialogoNoJsdom'

prepararDialogoNoJsdom()

vi.mock('../src/data/api', () => ({
  fetchMemoriaDoCartao: vi.fn(async () => null),
  fetchOcorrencias: vi.fn(async () => []),
  fetchSessionTranscript: vi.fn(),
  updateCard: vi.fn(),
}))
vi.mock('../src/lib/dictionary', () => ({
  lookup: vi.fn(async () => null),
  forvoUrl: () => '#',
  wiktionaryUrl: () => '#',
}))

const { default: GavetaDaPalavra } = await import('../src/components/views/vocab/GavetaDaPalavra')

beforeEach(() => localStorage.clear())
afterEach(cleanup)

describe('pele de cartão na gaveta da palavra (Vocabulário)', () => {
  it('o bloco "Na sua memória" veste a pele no estado da palavra', () => {
    localStorage.setItem('babel.pele_cartao', 'padrao')
    const cartao = {
      id: 'c1',
      word: 'cat',
      translation: 'gato',
      srcLang: 'en',
      fsrsState: 'New',
      inDeck: true,
    } as unknown as VocabCard
    render(
      <GavetaDaPalavra
        cartao={cartao}
        velocidade={1}
        aoTrocarVelocidade={() => {}}
        aoFalar={() => {}}
        aoFechar={() => {}}
        aoMudar={() => {}}
        aoExcluir={() => {}}
        aoExercitar={() => {}}
        aoRevisar={() => {}}
      />,
    )
    const bloco = screen.getByText('Na sua memória').closest('section')!
    expect(bloco.className).toMatch(/pele-padrao/)
    expect(bloco.className).toMatch(/cartao-nova/)
  })
})
