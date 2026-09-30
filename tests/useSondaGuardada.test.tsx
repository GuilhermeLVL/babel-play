// @vitest-environment jsdom
/**
 * As estimativas de download das telas usam a MESMA sonda guardada que a rota real da captura
 * (`useSondaGuardada`): sem ela, a tela prometia o base (209 MB) a quem a captura daria o small.
 */
import { renderHook, waitFor } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'

afterEach(() => {
  vi.resetModules()
  vi.doUnmock('../src/lib/dispositivo/sonda')
})

describe('useSondaGuardada', () => {
  it('devolve a sonda guardada assim que o módulo responde', async () => {
    const sonda = { sinais: { webGpu: { reserva: false } }, benchmark: { pontuacaoWasm: 1, pontuacaoWebgpu: 3 } }
    vi.doMock('../src/lib/dispositivo/sonda', () => ({ sondaGuardada: vi.fn(async () => sonda) }))
    const { useSondaGuardada } = await import('../src/lib/dispositivo/useSondaGuardada')
    const { result } = renderHook(() => useSondaGuardada())
    expect(result.current).toBeNull()
    await waitFor(() => expect(result.current).toBe(sonda))
  })

  it('sem sonda legível fica null (a estimativa conservadora), sem lançar', async () => {
    vi.doMock('../src/lib/dispositivo/sonda', () => ({ sondaGuardada: vi.fn(async () => Promise.reject(new Error('x'))) }))
    const { useSondaGuardada } = await import('../src/lib/dispositivo/useSondaGuardada')
    const { result } = renderHook(() => useSondaGuardada())
    await new Promise((r) => setTimeout(r, 20))
    expect(result.current).toBeNull()
  })
})
