// @vitest-environment jsdom
/**
 * UM ACERTO, UMA VIBRAÇÃO E UMA RAJADA.
 *
 * `playJuicedHit`/`playJuicedError` (lib/gameFeel) já fazem som, vibração, partículas e tremor.
 * Seis jogos chamavam `triggerHaptic` e `emitBurst` logo antes delas: dois pulsos no celular e
 * duas rajadas por acerto. E a subida de nível era festejada duas vezes — o efeito de nível do
 * `useRecompensas` (som + rajada) e o `comemorar` do modal de resgate.
 */
import { readFileSync } from 'node:fs'
import { join } from 'node:path'

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

const JOGOS = ['MemoryGame', 'WordSearchGame', 'ConectoresGame', 'EscutaGame', 'ScrambleGame', 'DitadoGame']

describe('feedback de acerto e erro nos jogos', () => {
  for (const jogo of JOGOS) {
    it(`${jogo}: nada de vibração ou rajada extra colada ao playJuiced*`, () => {
      const linhas = readFileSync(join(__dirname, '../src/components/minigames', `${jogo}.tsx`), 'utf8').split('\n')
      linhas.forEach((linha, i) => {
        if (!/playJuiced(Hit|Error)\(/.test(linha)) return
        // O bloco do acerto/erro: as linhas desde a abertura do `if`/`else` até a chamada.
        let j = i - 1
        while (j >= 0 && !/\{\s*$/.test(linhas[j])) j--
        const bloco = linhas.slice(j + 1, i).join('\n')
        expect(bloco, `${jogo}:${i + 1}`).not.toMatch(/triggerHaptic\(|emitBurst\(/)
      })
    })
  }
})

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
