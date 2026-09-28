// @vitest-environment jsdom
/**
 * AS PELES DE CARTÃO FORA DO ESTUDAR (spec 5.2.4): "aplica no Estudar, na Biblioteca e nos jogos
 * que mostram cartões". Até aqui só o Estudar vestia a pele.
 *
 *  · Vocabulário → a gaveta da palavra: o bloco "Na sua memória" (o estado FSRS do cartão) veste a
 *    pele equipada no estado da palavra;
 *  · Memória → a carta virada de uma palavra do baralho (com `cardId`) veste a pele no estado do
 *    cartão; par fechado e par errado continuam com a cor do jogo (é retorno, não enfeite).
 * Onde não se aplica (documentado): os demais jogos não desenham cartão de palavra — mostram
 * opções, letras ou frases; e item sem `cardId` (veio de uma fala) não é cartão do baralho.
 */
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import React from 'react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import type { MinigameItem } from '../src/core/minigames/types'
import type { VocabCard } from '../src/types'
import { prepararDialogoNoJsdom } from './_dialogoNoJsdom'

prepararDialogoNoJsdom()

vi.mock('../src/data/api', () => ({
  fetchMemoriaDoCartao: vi.fn(async () => null),
  fetchOcorrencias: vi.fn(async () => []),
  fetchSessionTranscript: vi.fn(),
  updateCard: vi.fn(),
}))
vi.mock('../src/lib/dictionary', () => ({ lookup: vi.fn(async () => null), forvoUrl: () => '#', wiktionaryUrl: () => '#' }))

const { default: MemoryGame } = await import('../src/components/minigames/MemoryGame')
const { default: GavetaDaPalavra } = await import('../src/components/views/vocab/GavetaDaPalavra')

beforeEach(() => localStorage.clear())
afterEach(cleanup)

describe('pele de cartão na Memória', () => {
  const items: MinigameItem[] = [
    { cardId: 'c1', prompt: 'gato', answer: 'cat', lang: 'en' },
    { cardId: 'c2', prompt: 'cão', answer: 'dog', lang: 'en' },
  ]

  it('a carta virada de uma palavra do baralho veste a pele no estado do cartão', () => {
    localStorage.setItem('babel.pele_cartao', 'padrao')
    render(
      <MemoryGame
        items={items}
        ageProfile="pro"
        onFinish={() => {}}
        onExit={() => {}}
        estadoDoCartao={(id) => (id === 'c1' ? 'dominada' : 'nova')}
      />,
    )
    const cartas = screen.getAllByRole('button').filter((b) => b.classList.contains('carta'))
    const alvo = cartas.find((b) => b.getAttribute('data-texto') === 'cat')!
    expect(alvo.className).not.toMatch(/pele-/) // de costas: o verso do jogo
    fireEvent.click(alvo)
    expect(alvo.className).toMatch(/pele-padrao/)
    expect(alvo.className).toMatch(/cartao-dominada/)
  })

  it('sem o estado do cartão (item de fala, ou quem chama não sabe), nada de pele', () => {
    render(<MemoryGame items={items} ageProfile="pro" onFinish={() => {}} onExit={() => {}} />)
    const alvo = screen.getAllByRole('button').find((b) => b.getAttribute('data-texto') === 'cat')!
    fireEvent.click(alvo)
    expect(alvo.className).not.toMatch(/pele-/)
  })
})

describe('pele de cartão na gaveta da palavra (Vocabulário)', () => {
  it('o bloco "Na sua memória" veste a pele no estado da palavra', () => {
    localStorage.setItem('babel.pele_cartao', 'padrao')
    const cartao = { id: 'c1', word: 'cat', translation: 'gato', srcLang: 'en', fsrsState: 'New', inDeck: true } as unknown as VocabCard
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
