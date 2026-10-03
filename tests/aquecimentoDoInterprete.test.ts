/**
 * O AQUECIMENTO ao abrir o intérprete (task 4.3): libera o áudio da voz da nuvem antes do primeiro toque,
 * sem enviar áudio nem texto. Só com a chave `vozPorFrase` ligada; desligada, nada muda.
 */
import { describe, expect, it, vi } from 'vitest'

import { aquecerInterprete } from '../src/lib/voz/aquecimentoDoInterprete'

describe('aquecerInterprete', () => {
  it('com a chave ligada, destrava a voz da nuvem uma vez e avisa que aqueceu', () => {
    const destravar = vi.fn()
    expect(aquecerInterprete({ ligado: () => true, destravar })).toBe(true)
    expect(destravar).toHaveBeenCalledTimes(1)
  })

  it('com a chave desligada, não faz nada', () => {
    const destravar = vi.fn()
    expect(aquecerInterprete({ ligado: () => false, destravar })).toBe(false)
    expect(destravar).not.toHaveBeenCalled()
  })

  it('se destravar quebra, o intérprete abre do mesmo jeito', () => {
    const destravar = vi.fn(() => {
      throw new Error('sem Audio')
    })
    expect(() => aquecerInterprete({ ligado: () => true, destravar })).not.toThrow()
  })

  it('por padrão a chave é a `vozPorFrase` do /diagnostico (desligada de fábrica)', () => {
    expect(aquecerInterprete()).toBe(false)
  })
})
