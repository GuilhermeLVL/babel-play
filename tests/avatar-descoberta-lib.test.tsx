// @vitest-environment jsdom
import { act, cleanup, renderHook } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import {
  consumirAbaDoPerfil,
  DICA_DO_INTERPRETE,
  jaViu,
  pedirAbaDoPerfil,
  useDicaUmaVez,
} from '../src/lib/avatar/descoberta'

beforeEach(() => localStorage.clear())
afterEach(() => {
  cleanup()
  vi.restoreAllMocks()
})

describe('a dica de uma vez só', () => {
  it('aparece na primeira vez e some para sempre depois de dispensada', () => {
    const a = renderHook(() => useDicaUmaVez(DICA_DO_INTERPRETE))
    expect(a.result.current.visivel).toBe(true)
    act(() => a.result.current.dispensar())
    expect(a.result.current.visivel).toBe(false)
    expect(jaViu(DICA_DO_INTERPRETE)).toBe(true)
    const b = renderHook(() => useDicaUmaVez(DICA_DO_INTERPRETE))
    expect(b.result.current.visivel).toBe(false)
  })
  it('armazenamento bloqueado: não quebra, a dica aparece e dispensar some nesta tela', () => {
    vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => {
      throw new Error('bloqueado')
    })
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw new Error('bloqueado')
    })
    const a = renderHook(() => useDicaUmaVez(DICA_DO_INTERPRETE))
    expect(a.result.current.visivel).toBe(true)
    act(() => a.result.current.dispensar())
    expect(a.result.current.visivel).toBe(false)
  })
})

describe('a aba pedida ao Perfil', () => {
  it('vale uma entrada só', () => {
    expect(consumirAbaDoPerfil()).toBeNull()
    pedirAbaDoPerfil('avatar')
    expect(consumirAbaDoPerfil()).toBe('avatar')
    expect(consumirAbaDoPerfil()).toBeNull()
  })
})
