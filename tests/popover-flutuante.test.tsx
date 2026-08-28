// @vitest-environment jsdom
import React from 'react'
import { afterEach, describe, expect, it } from 'vitest'
import { render, cleanup } from '@testing-library/react'
import PopoverFlutuante from '../src/components/PopoverFlutuante'

afterEach(cleanup)

describe('PopoverFlutuante', () => {
  it('nasce no body (portal), fora do ancestral que o renderiza', () => {
    // O ancestral com `transform` é o que deslocava o cartão para longe da palavra.
    const { container } = render(
      <div style={{ transform: 'translateZ(0)' }} data-ancestral>
        <PopoverFlutuante posicao={{ top: 120, left: 40 }} onEntrar={() => {}} onSair={() => {}}>
          <span>cartão</span>
        </PopoverFlutuante>
      </div>,
    )
    const ancestral = container.querySelector('[data-ancestral]')!
    expect(ancestral.textContent).toBe('')            // nada do cartão ficou dentro do ancestral
    const cartao = document.body.querySelector('.fixed') as HTMLElement
    expect(cartao.parentElement).toBe(document.body)  // filho direto do body
    expect(cartao.style.top).toBe('120px')
    expect(cartao.style.left).toBe('40px')
    expect(cartao.textContent).toBe('cartão')
  })
})
