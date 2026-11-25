// @vitest-environment jsdom
/**
 * `polimento-movimento` 8.5: o "reduzir movimento" do sistema vale por padrão. Sem escolha guardada e
 * com o sistema pedindo menos movimento, as animações nascem desligadas (sem `animations-on`), e o
 * movimento rico fica `contido`. Escolha explícita da pessoa vence o sistema.
 */
import { afterEach, describe, expect, it, vi } from 'vitest'

import { instalarMarcaDeMovimento, movimentoRico } from '../src/lib/movimento/animar'
import { animacoesLigadasPorPadrao } from '../src/lib/movimento/padraoDeAnimacoes'

function sistema(reduz: boolean) {
  vi.stubGlobal('matchMedia', (q: string) => ({
    matches: /reduce/.test(q) ? reduz : false,
    media: q,
    addEventListener: () => undefined,
    removeEventListener: () => undefined,
  }))
  ;(window as unknown as { matchMedia: unknown }).matchMedia = globalThis.matchMedia
}

/** Faz o que `useAparencia` faz com o estado: as duas classes do corpo. */
function aplicar(ligadas: boolean) {
  document.body.className = ''
  document.body.classList.toggle('animations-off', !ligadas)
  document.body.classList.toggle('animations-on', ligadas)
}

afterEach(() => {
  vi.unstubAllGlobals()
  document.body.className = ''
  delete document.documentElement.dataset.movimento
})

describe('padrão das animações', () => {
  it('sem escolha, segue o sistema', () => {
    expect(animacoesLigadasPorPadrao(null, true)).toBe(false)
    expect(animacoesLigadasPorPadrao(undefined, false)).toBe(true)
  })
  it('a escolha guardada vence o sistema nos dois sentidos', () => {
    expect(animacoesLigadasPorPadrao('true', true)).toBe(true)
    expect(animacoesLigadasPorPadrao('false', false)).toBe(false)
  })
})

describe('data-movimento com o sistema pedindo menos movimento', () => {
  it('sem escolha explícita fica contido', () => {
    sistema(true)
    aplicar(animacoesLigadasPorPadrao(null, true))
    const desinstalar = instalarMarcaDeMovimento()
    expect(document.documentElement.dataset.movimento).toBe('contido')
    expect(movimentoRico()).toBe(false)
    desinstalar()
  })
  it('quem ligou as animações de propósito vê o movimento rico', () => {
    sistema(true)
    aplicar(animacoesLigadasPorPadrao('true', true))
    const desinstalar = instalarMarcaDeMovimento()
    expect(document.documentElement.dataset.movimento).toBe('rico')
    desinstalar()
  })
  it('sem pedido do sistema e sem escolha, é rico', () => {
    sistema(false)
    aplicar(animacoesLigadasPorPadrao(null, false))
    const desinstalar = instalarMarcaDeMovimento()
    expect(document.documentElement.dataset.movimento).toBe('rico')
    desinstalar()
  })
})
