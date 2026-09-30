// @vitest-environment jsdom
/**
 * O TEXTO DO MODO DESEMPENHO NOS AJUSTES DA CAPTURA (A6c). O perfil leve liga o modo sozinho, e ali ele
 * guarda UMA prévia no começo de cada frase (A6b): "Legenda só no fim de cada frase" deixava de ser
 * verdade. Ligado sozinho, o texto diz o que acontece e que dá para escolher; quando a pessoa escolhe,
 * volta o texto de sempre, com a promessa que o pipeline cumpre (nenhum parcial).
 */
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import React from 'react'
import { afterEach, describe, expect, it, vi } from 'vitest'

import ModoDesempenho from '../src/components/views/captura/ModoDesempenho'

afterEach(cleanup)

const interruptor = () => screen.getByRole('switch', { name: 'Modo desempenho' })

describe('ModoDesempenho', () => {
  it('ligado SOZINHO neste aparelho: a prévia no começo e a legenda no fim, e que dá para escolher', () => {
    const { container } = render(<ModoDesempenho ligado escolhido={false} aoTrocar={vi.fn()} />)
    expect(container.textContent).toMatch(/Ligado sozinho neste aparelho/)
    expect(container.textContent).toMatch(/prévia no começo de cada frase e a legenda no fim/)
    expect(container.textContent).toMatch(/Ligue ou desligue para escolher/)
    expect(container.textContent).not.toMatch(/só no fim/)
    expect(interruptor().getAttribute('aria-checked')).toBe('true')
  })

  it('ligado pela PESSOA: a promessa de sempre, "Legenda só no fim de cada frase"', () => {
    const { container } = render(<ModoDesempenho ligado escolhido aoTrocar={vi.fn()} />)
    expect(container.textContent).toMatch(/Legenda só no fim de cada frase/)
    expect(container.textContent).not.toMatch(/Ligado sozinho/)
    expect(interruptor().getAttribute('aria-checked')).toBe('true')
  })

  it.each([
    ['desligado sem escolha', false],
    ['desligado pela pessoa', true],
  ])('%s: o texto de sempre (o que ligar faz)', (_nome, escolhido) => {
    const { container } = render(<ModoDesempenho ligado={false} escolhido={escolhido} aoTrocar={vi.fn()} />)
    expect(container.textContent).toMatch(/Legenda só no fim de cada frase/)
    expect(container.textContent).not.toMatch(/Ligado sozinho/)
    expect(interruptor().getAttribute('aria-checked')).toBe('false')
  })

  it('o toque no interruptor é a escolha: chama `aoTrocar`', () => {
    const aoTrocar = vi.fn()
    render(<ModoDesempenho ligado escolhido={false} aoTrocar={aoTrocar} />)
    fireEvent.click(interruptor())
    expect(aoTrocar).toHaveBeenCalledTimes(1)
  })
})
