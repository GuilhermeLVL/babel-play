// @vitest-environment jsdom
/**
 * O AVISO DA CAMADA DE POLIMENTO (`src/lib/polimento/useAviso.ts`), porte de `prototipo.js:681-751`:
 * a vida, a pausa com o ponteiro em cima e o arrasto com os limiares do protótipo (45 px ou 0,11 px/ms).
 */
import { act, cleanup, fireEvent, render } from '@testing-library/react'
import React, { useRef } from 'react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { useAviso } from '../src/lib/polimento/useAviso'

function Aviso({ ms, aoSair }: { ms: number; aoSair: () => void }) {
  const ref = useRef<HTMLDivElement>(null)
  const gestos = useAviso(ref, 'a1', ms, aoSair)
  return (
    <div ref={ref} className="toast on" data-testid="aviso" {...gestos}>
      salvo
    </div>
  )
}

const aviso = () => document.querySelector('[data-testid="aviso"]') as HTMLElement
const ponteiro = (tipo: string, x: number, y: number) =>
  fireEvent(aviso(), new MouseEvent(tipo, { bubbles: true, clientX: x, clientY: y }))

beforeEach(() => {
  vi.useFakeTimers()
  document.documentElement.dataset.px = 'on'
  document.body.className = 'animations-on'
})
afterEach(() => {
  cleanup()
  vi.useRealTimers()
  delete document.documentElement.dataset.px
})

describe('a vida do aviso', () => {
  it('sai sozinho no fim do tempo; com o ponteiro em cima espera, e depois fica mais 1,5 s', () => {
    const aoSair = vi.fn()
    render(<Aviso ms={3400} aoSair={aoSair} />)
    act(() => void vi.advanceTimersByTime(3000))
    ponteiro('pointerenter', 10, 10)
    fireEvent.pointerEnter(aviso())
    act(() => void vi.advanceTimersByTime(5000))
    expect(aoSair).not.toHaveBeenCalled()
    fireEvent.pointerLeave(aviso())
    act(() => void vi.advanceTimersByTime(1499))
    expect(aoSair).not.toHaveBeenCalled()
    act(() => void vi.advanceTimersByTime(1))
    expect(aoSair).toHaveBeenCalledOnce()
  })

  it('aviso sem tempo (erro) fica até ser dispensado', () => {
    const aoSair = vi.fn()
    render(<Aviso ms={0} aoSair={aoSair} />)
    act(() => void vi.advanceTimersByTime(60_000))
    expect(aoSair).not.toHaveBeenCalled()
  })
})

describe('o arrasto do aviso', () => {
  it('para a direita segue o dedo; além de 45 px sai pela direita em 230 ms', () => {
    const aoSair = vi.fn()
    render(<Aviso ms={3400} aoSair={aoSair} />)
    fireEvent.pointerDown(aviso(), { pointerId: 1, clientX: 100, clientY: 20 })
    fireEvent.pointerMove(aviso(), { pointerId: 1, clientX: 160, clientY: 22 })
    expect(aviso().style.transform).toBe('translate(60px, 0px)')
    expect(aviso().classList.contains('px-arrastando')).toBe(true)
    act(() => void vi.advanceTimersByTime(2000))
    fireEvent.pointerUp(aviso(), { pointerId: 1, clientX: 160, clientY: 22 })
    expect(aviso().style.transform).toBe('translateX(calc(100% + 40px))')
    expect(aoSair).not.toHaveBeenCalled()
    act(() => void vi.advanceTimersByTime(230))
    expect(aoSair).toHaveBeenCalledOnce()
  })

  it('para a esquerda resiste (elástico) e, solto devagar, volta', () => {
    const aoSair = vi.fn()
    render(<Aviso ms={3400} aoSair={aoSair} />)
    fireEvent.pointerDown(aviso(), { pointerId: 1, clientX: 100, clientY: 20 })
    fireEvent.pointerMove(aviso(), { pointerId: 1, clientX: 40, clientY: 20 })
    const dx = Number(/translate\((-?[\d.]+)px/.exec(aviso().style.transform)?.[1])
    expect(dx).toBeLessThan(0)
    expect(dx).toBeGreaterThan(-60)
    act(() => void vi.advanceTimersByTime(1000))
    fireEvent.pointerUp(aviso(), { pointerId: 1, clientX: 40, clientY: 20 })
    expect(aviso().style.transform).toBe('')
    act(() => void vi.advanceTimersByTime(230))
    expect(aoSair).not.toHaveBeenCalled()
  })

  it('com a camada desligada o aviso não se arrasta', () => {
    document.documentElement.dataset.px = 'off'
    render(<Aviso ms={3400} aoSair={() => undefined} />)
    fireEvent.pointerDown(aviso(), { pointerId: 1, clientX: 100, clientY: 20 })
    fireEvent.pointerMove(aviso(), { pointerId: 1, clientX: 180, clientY: 20 })
    expect(aviso().style.transform).toBe('')
  })
})
