// @vitest-environment jsdom
import { renderHook } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { ATRASO_DA_INTENCAO_MS } from '../src/core/harness/aquecerNaIntencao'
import { useAquecerNaIntencao } from '../src/lib/captura/aquecerNaIntencao'

vi.mock('../src/lib/flags', () => ({ flagLigada: () => true }))
vi.mock('../src/lib/dispositivo/perfil', () => ({
  perfilDoDispositivo: () => ({
    tipo: 'desktop-com-gpu',
    leve: false,
    poucaMemoria: false,
    sinais: { isolado: true },
  }),
}))

describe('hook do aquecimento na intenção: desmontar a tela', () => {
  beforeEach(() => vi.useFakeTimers())
  afterEach(() => vi.useRealTimers())

  it('com a tela montada, 200 ms de permanência aquecem (controle)', () => {
    const preaquecer = vi.fn()
    const { result } = renderHook(() => useAquecerNaIntencao(preaquecer))
    result.current.ponteiroEntrou()
    vi.advanceTimersByTime(ATRASO_DA_INTENCAO_MS + 50)
    expect(preaquecer).toHaveBeenCalledTimes(1)
  })

  it('sair da tela dentro dos 200 ms cancela: nada sobe fora da captura', () => {
    const preaquecer = vi.fn()
    const { result, unmount } = renderHook(() => useAquecerNaIntencao(preaquecer))
    result.current.ponteiroEntrou()
    unmount()
    vi.advanceTimersByTime(ATRASO_DA_INTENCAO_MS * 3)
    expect(preaquecer).not.toHaveBeenCalled()
  })
})
