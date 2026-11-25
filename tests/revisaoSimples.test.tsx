// @vitest-environment jsdom
/**
 * "SÓ REVISÃO" (motor-anki-jogos 4.3): a palavra que nenhum jogo atende continua revisável, e a nota
 * vai para a mesma rota de memória dos outros jogos.
 */
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import React from 'react'
import { afterEach, describe, expect, it, vi } from 'vitest'

import RevisaoSimples from '../src/components/minigames/RevisaoSimples'
import type { VocabCard } from '../src/types'

const cartao = (word: string) => ({ id: `c-${word}`, word }) as unknown as VocabCard

afterEach(cleanup)

describe('RevisaoSimples', () => {
  it('grava a nota de cada palavra na memória e avança até concluir', async () => {
    const revisar = vi.fn(async () => cartao('x'))
    const aoFechar = vi.fn()
    render(<RevisaoSimples itens={[cartao('lonely'), cartao('odd')]} aoFechar={aoFechar} revisar={revisar} />)

    expect(screen.getByTestId('so-revisao-palavra').textContent).toBe('lonely')
    fireEvent.click(screen.getByText('Lembrei'))
    await waitFor(() => expect(screen.getByTestId('so-revisao-palavra').textContent).toBe('odd'))
    fireEvent.click(screen.getByText('Não lembrei'))
    await waitFor(() => expect(screen.getByText('Revisão concluída.')).toBeTruthy())

    expect(revisar).toHaveBeenNthCalledWith(1, 'c-lonely', 3, undefined, {
      origem: 'revisao',
      formato: 'lembrar',
    })
    expect(revisar).toHaveBeenNthCalledWith(2, 'c-odd', 1, undefined, { origem: 'revisao', formato: 'lembrar' })
  })

  it('se a nota não grava, avisa e não pula a palavra', async () => {
    const revisar = vi.fn(async () => {
      throw new Error('falha')
    })
    render(<RevisaoSimples itens={[cartao('lonely')]} aoFechar={() => {}} revisar={revisar} />)
    fireEvent.click(screen.getByText('Lembrei'))
    await waitFor(() => expect(screen.getByRole('alert')).toBeTruthy())
    expect(screen.getByTestId('so-revisao-palavra').textContent).toBe('lonely')
  })
})
