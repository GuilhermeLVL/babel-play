// @vitest-environment jsdom
/**
 * A OFERTA DO MODELO PRECISO na Captura: a captura roda no Whisper e o Parakeet cabe no aparelho, mas
 * sem cópia. A linha oferece baixar em segundo plano (só no clique) e mostra o progresso.
 */
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import React from 'react'
import { afterEach, describe, expect, it, vi } from 'vitest'

import ModelPrepPanel from '../src/components/ModelPrepPanel'

afterEach(cleanup)

const ESTADO = { whisper: null, mt: null, fromCache: true, error: null, done: true }

describe('ModelPrepPanel: oferta do preciso', () => {
  it('mostra a frase com o tamanho e o botão chama aoBaixar', () => {
    const aoBaixar = vi.fn()
    render(<ModelPrepPanel state={ESTADO} ofertaDoPreciso={{ mb: 672, aoBaixar, progresso: null }} />)
    const botao = screen.getByRole('button', { name: /Baixar o modelo preciso \(672 MB\) para as próximas capturas/ })
    fireEvent.click(botao)
    expect(aoBaixar).toHaveBeenCalledTimes(1)
  })

  it('com progresso, mostra a barra com aria-valuenow e esconde o botão', () => {
    render(<ModelPrepPanel state={ESTADO} ofertaDoPreciso={{ mb: 672, aoBaixar: () => {}, progresso: 0.4 }} />)
    expect(screen.getByRole('progressbar').getAttribute('aria-valuenow')).toBe('40')
    expect(screen.queryByRole('button', { name: /Baixar o modelo preciso/ })).toBeNull()
  })

  it('sem oferta, nada aparece', () => {
    render(<ModelPrepPanel state={ESTADO} />)
    expect(screen.queryByText(/modelo preciso/)).toBeNull()
  })
})
