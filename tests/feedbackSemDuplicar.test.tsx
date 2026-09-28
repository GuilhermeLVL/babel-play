// @vitest-environment jsdom
/**
 * UM NÍVEL, UMA FESTA.
 *
 * A subida de nível era festejada duas vezes — o efeito de nível do `useRecompensas` (som +
 * rajada) e a festa do modal de resgate. (A outra metade deste arquivo, "um acerto, uma vibração",
 * virou a varredura de `comemoracao-jogos.test.ts`: os jogos agora só falam com o motor.)
 */
import { act, renderHook } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('../src/lib/soundFx', () => ({ play: vi.fn() }))
vi.mock('../src/lib/effects', () => ({ emitBurst: vi.fn() }))
vi.mock('../src/lib/juice', () => ({ comemorar: vi.fn() }))
vi.mock('../src/lib/conquistas', () => ({
  montarContextoDeConquistas: () => null,
  verificarConquistas: () => Promise.resolve([]),
}))

import { emitBurst } from '../src/lib/effects'
import { useRecompensas } from '../src/lib/estado/useRecompensas'
import { EMPTY_PROGRESS } from '../src/lib/progress'
import { play } from '../src/lib/soundFx'

describe('subida de nível', () => {
  beforeEach(() => {
    localStorage.clear()
    vi.mocked(play).mockClear()
    vi.mocked(emitBurst).mockClear()
  })

  it('vira UMA entrada no modal, sem som e rajada paralelos', () => {
    localStorage.setItem('babel.nivel_visto', '2')
    const deps = (level: number) => ({
      metrics: null,
      recordes: [],
      progress: { ...EMPTY_PROGRESS, available: true, level },
      setVersaoDasMetricas: vi.fn(),
      setTheme: vi.fn(),
      setFonte: vi.fn(),
      setMenuPosition: vi.fn(),
      setIsStudioOpen: vi.fn(),
    })
    const { result, rerender } = renderHook((p: { level: number }) => useRecompensas(deps(p.level)), {
      initialProps: { level: 2 },
    })
    act(() => rerender({ level: 3 }))
    expect(result.current.filaDeRecompensas.filter((r) => r.tipo === 'nivel')).toHaveLength(1)
    expect(vi.mocked(play).mock.calls.filter((c) => c[0] === 'levelUp')).toHaveLength(0)
    expect(vi.mocked(emitBurst).mock.calls.filter((c) => c[2] === 'levelUp')).toHaveLength(0)
  })
})
