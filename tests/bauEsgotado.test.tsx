// @vitest-environment jsdom
/**
 * COLEÇÃO COMPLETA: O BAÚ DIZ, EM VEZ DE SUMIR.
 *
 * Quando não há mais peça sorteável, o servidor responde `item: null` e não grava nada. O cliente
 * descartava a resposta em silêncio: a pessoa via o baú em rodadas anteriores e, de repente, nada
 * — sem saber que a coleção estava completa. Agora vira um aviso, uma vez por sessão.
 */
import { act, renderHook } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'

vi.mock('../src/components/Toast', () => ({ toast: { info: vi.fn(), warn: vi.fn(), ok: vi.fn(), error: vi.fn() } }))
vi.mock('../src/lib/conquistas', () => ({
  montarContextoDeConquistas: () => null,
  verificarConquistas: () => Promise.resolve([]),
}))

const { toast } = await import('../src/components/Toast')
const { EVENTO_DROP_GANHO } = await import('../src/components/RecompensaDesbloqueada')
const { useRecompensas } = await import('../src/lib/estado/useRecompensas')
const { EMPTY_PROGRESS } = await import('../src/lib/progress')

describe('baú com a coleção completa', () => {
  it('avisa uma vez, e não entra nada na fila de recompensas', () => {
    const { result } = renderHook(() =>
      useRecompensas({
        metrics: null,
        recordes: [],
        progress: EMPTY_PROGRESS,
        setVersaoDasMetricas: vi.fn(),
        setTheme: vi.fn(),
        setFonte: vi.fn(),
        setMenuPosition: vi.fn(),
        setIsStudioOpen: vi.fn(),
      }),
    )
    const esgotado = (roundId: string) =>
      act(() => {
        window.dispatchEvent(new CustomEvent(EVENTO_DROP_GANHO, { detail: { roundId, itemId: null, seeds: 0 } }))
      })
    esgotado('r1')
    esgotado('r2')
    expect(vi.mocked(toast.info)).toHaveBeenCalledTimes(1)
    expect(vi.mocked(toast.info).mock.calls[0][0]).toMatch(/coleção completa/i)
    expect(result.current.filaDeRecompensas).toHaveLength(0)
  })
})
