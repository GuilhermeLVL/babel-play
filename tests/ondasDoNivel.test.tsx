// @vitest-environment jsdom
/**
 * AS ONDAS DO NÍVEL COMO FOLHA ("Grátis sem travar", A2).
 *
 * Antes, o amostrador do waveform era um `setLevels` a cada 50 ms dentro da `LiveCapture` — a tela
 * de ~4 mil linhas re-renderizava INTEIRA 20 vezes por segundo só para mexer cinco barrinhas, e no
 * aparelho fraco isso sozinho travava a aba. Agora as barras são uma folha: leem o pico do nível de
 * um ref, têm o próprio laço e escrevem `style.height` direto no DOM. O que se prende aqui:
 *   · o pai NÃO re-renderiza quando o nível muda;
 *   · as alturas seguem o ref com a mesma conta de antes (nível × 120 %, piso de 18 %/20 %);
 *   · o laço para quando `ativo` vira falso (e ao desmontar);
 *   · no modo leve e com movimento reduzido o laço cai de 20 para 8 quadros por segundo.
 */
import { act, cleanup, render } from '@testing-library/react'
import React from 'react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import OndasDoNivel from '../src/components/views/captura/OndasDoNivel'
import { REDUZIR_EFEITOS_KEY } from '../src/lib/dispositivo/perfil'

beforeEach(() => {
  vi.useFakeTimers()
  // O jsdom se classifica como celular fraco (sem getDisplayMedia, sem GPU): fixa o modo cheio.
  localStorage.setItem(REDUZIR_EFEITOS_KEY, 'false')
})
afterEach(() => {
  cleanup()
  vi.useRealTimers()
  localStorage.clear()
  vi.unstubAllGlobals()
})

type Variante = 'computador' | 'celular'

function montar(opts: { ativo?: boolean; variante?: Variante } = {}) {
  const nivelRef = { current: 0 }
  const renders = { n: 0 }
  function Pai({ ativo, variante }: { ativo: boolean; variante?: Variante }) {
    renders.n += 1
    return <OndasDoNivel nivelRef={nivelRef} ativo={ativo} variante={variante} />
  }
  const r = render(<Pai ativo={opts.ativo ?? true} variante={opts.variante} />)
  const barras = () => Array.from(r.container.querySelectorAll('i')).map((i) => i.style.height)
  /** Segura o nível em `nivel` por `ms` (as fontes de áudio escrevem o pico no ref o tempo todo). */
  const manter = (nivel: number, ms: number) => {
    for (let t = 0; t < ms; t += 10) {
      nivelRef.current = nivel
      act(() => {
        vi.advanceTimersByTime(10)
      })
    }
  }
  const trocar = (p: { ativo: boolean; variante?: Variante }) => r.rerender(<Pai {...p} />)
  return { nivelRef, renders, barras, manter, trocar, container: r.container }
}

describe('OndasDoNivel', () => {
  it('o nível muda e o PAI não re-renderiza (nenhum estado React no laço)', () => {
    const m = montar()
    m.manter(0.8, 3_000)
    expect(m.renders.n).toBe(1)
    expect(m.barras()).toEqual(['96%', '96%', '96%', '96%', '96%'])
  })

  it('as alturas seguem o ref: nível × 120 %, com piso de 18 % e teto de 100 %', () => {
    const m = montar()
    expect(m.barras()).toEqual(['18%', '18%', '18%', '18%', '18%'])
    m.manter(0.5, 3_000)
    expect(m.barras()).toEqual(['60%', '60%', '60%', '60%', '60%'])
    m.manter(1, 3_000)
    expect(m.barras()).toEqual(['100%', '100%', '100%', '100%', '100%'])
    m.manter(0.05, 3_000)
    expect(m.barras()).toEqual(['18%', '18%', '18%', '18%', '18%'])
  })

  it('o pico decai entre amostras (sem fonte escrevendo, as barras descem sozinhas)', () => {
    const m = montar()
    m.manter(0.9, 3_000)
    act(() => {
      vi.advanceTimersByTime(3_000)
    })
    expect(m.barras()).toEqual(['18%', '18%', '18%', '18%', '18%'])
    expect(m.nivelRef.current).toBeLessThan(0.01)
  })

  it('mantém a classe e o desenho de cada tela: `ondas` 18 % sem animação; `cel-ondas` 20 %', () => {
    const pc = montar()
    const caixaPc = pc.container.querySelector('span')!
    expect(caixaPc.className).toBe('ondas')
    expect(caixaPc.getAttribute('aria-hidden')).toBe('true')
    expect((caixaPc.firstElementChild as HTMLElement).style.animation).toMatch(/none/)
    cleanup()
    const cel = montar({ variante: 'celular' })
    expect(cel.container.querySelector('span')!.className).toBe('cel-ondas')
    expect(cel.barras()).toEqual(['20%', '20%', '20%', '20%', '20%'])
    cel.manter(0.1, 3_000)
    expect(cel.barras()).toEqual(['20%', '20%', '20%', '20%', '20%'])
  })

  it('ativo = false para o laço (nenhum timer pendente) e as barras voltam ao piso', () => {
    const m = montar()
    m.manter(0.7, 3_000)
    m.trocar({ ativo: false })
    expect(vi.getTimerCount()).toBe(0)
    expect(m.barras()).toEqual(['18%', '18%', '18%', '18%', '18%'])
    m.manter(0.9, 1_000)
    expect(m.barras()).toEqual(['18%', '18%', '18%', '18%', '18%'])
  })

  it('reativar começa do zero: o pico guardado durante a pausa não aparece', () => {
    const m = montar({ ativo: false })
    m.nivelRef.current = 1
    m.trocar({ ativo: true })
    expect(m.nivelRef.current).toBe(0)
  })

  it('desmontar para o laço', () => {
    const m = montar()
    m.manter(0.5, 500)
    cleanup()
    expect(vi.getTimerCount()).toBe(0)
  })

  /** Quantas vezes o laço LEU o nível em 1 s (cada amostra lê o ref uma vez). */
  function amostrasPorSegundo() {
    let leituras = 0
    let valor = 0
    const nivelRef = {
      get current() {
        leituras += 1
        return valor
      },
      set current(v: number) {
        valor = v
      },
    }
    render(<OndasDoNivel nivelRef={nivelRef} ativo />)
    leituras = 0
    act(() => {
      vi.advanceTimersByTime(1_000)
    })
    return leituras
  }

  it('20 quadros por segundo no modo cheio', () => {
    const n = amostrasPorSegundo()
    expect(n).toBeGreaterThanOrEqual(18)
    expect(n).toBeLessThanOrEqual(20)
  })

  it('8 quadros por segundo no modo leve (reduzirEfeitos)', () => {
    localStorage.setItem(REDUZIR_EFEITOS_KEY, 'true')
    const n = amostrasPorSegundo()
    expect(n).toBeGreaterThanOrEqual(7)
    expect(n).toBeLessThanOrEqual(8)
  })

  it('8 quadros por segundo com movimento reduzido, mesmo com o modo leve desligado à mão', () => {
    vi.stubGlobal(
      'matchMedia',
      vi.fn((q: string) => ({
        matches: q.includes('prefers-reduced-motion'),
        addEventListener() {},
        removeEventListener() {},
      })),
    )
    const n = amostrasPorSegundo()
    expect(n).toBeGreaterThanOrEqual(7)
    expect(n).toBeLessThanOrEqual(8)
  })
})
