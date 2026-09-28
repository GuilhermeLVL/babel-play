// @vitest-environment jsdom
/**
 * A BARRA DE MAESTRIA (recompensas v2, Task 3.2): no fim da rodada e na antessala.
 *
 * Mostra "Prata · 140/220", anima o ganho da rodada (+N) e, ao cruzar o limiar, comemora pelo
 * motor (`celebrar({ tipo: 'maestria' })`) e enfileira a recompensa do nível — que o
 * `useRecompensas` transforma numa entrada do modal de resgate.
 */
import { act, render, renderHook, screen } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('../src/lib/comemoracao', async (orig) => ({
  ...((await orig()) as object),
  celebrar: vi.fn(),
}))
vi.mock('../src/components/Toast', () => ({ toast: { info: vi.fn(), warn: vi.fn(), ok: vi.fn(), error: vi.fn() } }))
vi.mock('../src/lib/conquistas', () => ({
  montarContextoDeConquistas: () => null,
  verificarConquistas: () => Promise.resolve([]),
}))

const { celebrar } = await import('../src/lib/comemoracao')
const {
  default: BarraDeMaestria,
  subidasDeMaestria,
  ATRASO_DO_GANHO_MS,
} = await import('../src/components/maestria/BarraDeMaestria')
const { EVENTO_MAESTRIA_SUBIU } = await import('../src/lib/filaDeRecompensas')
const { useRecompensas } = await import('../src/lib/estado/useRecompensas')
const { EMPTY_PROGRESS } = await import('../src/lib/progress')

beforeEach(() => {
  vi.useFakeTimers()
  vi.mocked(celebrar).mockClear()
  localStorage.clear()
})
afterEach(() => {
  vi.useRealTimers()
})

describe('BarraDeMaestria', () => {
  it('mostra o nível, os pontos e o próximo limiar: "Prata · 140/220"', () => {
    render(<BarraDeMaestria jogo="memory" pontos={140} />)
    expect(screen.getByText('Prata · 140/220')).toBeTruthy()
    expect(screen.getByRole('progressbar').getAttribute('aria-valuenow')).toBe('140')
    expect(celebrar).not.toHaveBeenCalled()
  })

  it('sem nível ainda e no topo: os rótulos certos', () => {
    const { unmount } = render(<BarraDeMaestria jogo="memory" pontos={12} />)
    expect(screen.getByText('Rumo ao Bronze · 12/30')).toBeTruthy()
    unmount()
    render(<BarraDeMaestria jogo="memory" pontos={640} />)
    expect(screen.getByText('Mestre · 640')).toBeTruthy()
  })

  it('anima o ganho da rodada (+N) sem comemorar quando não cruza o limiar', () => {
    render(<BarraDeMaestria jogo="memory" pontos={140} ganho={23} />)
    expect(screen.getByText('+23')).toBeTruthy()
    act(() => {
      vi.advanceTimersByTime(ATRASO_DO_GANHO_MS + 10)
    })
    expect(screen.getByText('Prata · 163/220')).toBeTruthy()
    expect(celebrar).not.toHaveBeenCalled()
  })

  it('ao cruzar o limiar: celebra a maestria e enfileira a recompensa do nível', () => {
    const ouvido = vi.fn()
    window.addEventListener(EVENTO_MAESTRIA_SUBIU, ouvido)
    render(<BarraDeMaestria jogo="memory" pontos={210} ganho={23} />)
    expect(celebrar).not.toHaveBeenCalled()
    act(() => {
      vi.advanceTimersByTime(ATRASO_DO_GANHO_MS + 10)
    })
    expect(celebrar).toHaveBeenCalledWith({ tipo: 'maestria', jogo: 'memory', nivel: 3 })
    expect(ouvido).toHaveBeenCalledTimes(1)
    expect((ouvido.mock.calls[0][0] as CustomEvent).detail).toEqual({ jogo: 'memory', nivel: 3 })
    expect(screen.getByText('Ouro · 233/400')).toBeTruthy()
    window.removeEventListener(EVENTO_MAESTRIA_SUBIU, ouvido)
  })

  it('subidasDeMaestria lista cada nível cruzado', () => {
    expect(subidasDeMaestria(0, 29)).toEqual([])
    expect(subidasDeMaestria(29, 30)).toEqual([1])
    expect(subidasDeMaestria(90, 230)).toEqual([2, 3])
  })
})

describe('useRecompensas — a subida de maestria entra na fila', () => {
  it('uma entrada por nível, sem repetir', () => {
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
    const subir = () =>
      act(() => {
        window.dispatchEvent(new CustomEvent(EVENTO_MAESTRIA_SUBIU, { detail: { jogo: 'memory', nivel: 3 } }))
      })
    subir()
    subir()
    expect(result.current.filaDeRecompensas).toHaveLength(1)
    expect(result.current.filaDeRecompensas[0]).toMatchObject({ tipo: 'maestria', jogo: 'memory', nivel: 3, seeds: 60 })
  })
})
