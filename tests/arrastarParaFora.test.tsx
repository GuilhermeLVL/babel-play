// @vitest-environment jsdom
/**
 * ARRASTAR PARA FORA (`src/lib/movimento/useArrastarParaFora.ts`) e o aviso que o usa
 * (`src/components/Toast.tsx`): a peça segue o dedo, sai quando o gesto ia para fora, volta quando
 * não ia, e o relógio do aviso para enquanto o dedo segura.
 */
import { act, cleanup, render } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const movimento = vi.hoisted(() => ({ rico: true }))
vi.mock('../src/lib/movimento/animar', () => ({ movimentoRico: () => movimento.rico }))
vi.mock('../src/lib/soundFx', () => ({ play: vi.fn() }))

import Toaster, { toast } from '../src/components/Toast'
import { useArrastarParaFora } from '../src/lib/movimento/useArrastarParaFora'

/** O jsdom não tem `PointerEvent`: um `MouseEvent` com o nome certo chega ao React do mesmo jeito. */
const ponteiro = (el: Element, tipo: string, clientX: number) =>
  act(() => {
    el.dispatchEvent(new MouseEvent(tipo, { bubbles: true, clientX }))
  })

function Peca({ aoSair }: { aoSair: () => void }) {
  const { segurando, gestos } = useArrastarParaFora(aoSair)
  return (
    <div data-testid="peca" data-segurando={segurando} {...gestos}>
      <button type="button">ação</button>
    </div>
  )
}

function montar(aoSair = vi.fn()) {
  const { getByTestId } = render(<Peca aoSair={aoSair} />)
  const peca = getByTestId('peca') as HTMLElement
  Object.defineProperty(peca, 'offsetWidth', { configurable: true, value: 300 })
  return { peca, aoSair }
}

beforeEach(() => {
  movimento.rico = true
  vi.useFakeTimers()
})
afterEach(() => {
  cleanup()
  vi.useRealTimers()
})

describe('arrastar para fora', () => {
  it('segue o dedo e avisa que está sendo segurada', () => {
    const { peca } = montar()
    ponteiro(peca, 'pointerdown', 100)
    expect(peca.dataset.segurando).toBe('true')
    ponteiro(peca, 'pointermove', 160)
    expect(peca.style.transform).toBe('translateX(60px)')
  })

  it('para o lado errado cede, mas menos do que foi puxada', () => {
    const { peca } = montar()
    ponteiro(peca, 'pointerdown', 100)
    ponteiro(peca, 'pointermove', 20)
    const andou = Number(peca.style.transform.match(/-?[\d.]+/)?.[0])
    expect(andou).toBeLessThan(0)
    expect(andou).toBeGreaterThan(-80)
  })

  it('solta além da metade, sai', () => {
    const { peca, aoSair } = montar()
    ponteiro(peca, 'pointerdown', 100)
    ponteiro(peca, 'pointermove', 280)
    ponteiro(peca, 'pointerup', 280)
    expect(peca.style.opacity).toBe('0')
    expect(aoSair).not.toHaveBeenCalled()
    vi.advanceTimersByTime(250)
    expect(aoSair).toHaveBeenCalledOnce()
    expect(peca.dataset.segurando).toBe('false')
  })

  it('solta perto, volta ao lugar', () => {
    const { peca, aoSair } = montar()
    ponteiro(peca, 'pointerdown', 100)
    ponteiro(peca, 'pointermove', 130)
    ponteiro(peca, 'pointerup', 130)
    vi.advanceTimersByTime(500)
    expect(aoSair).not.toHaveBeenCalled()
    expect(peca.style.transform).toBe('')
  })

  it('o toque num botão de dentro é do botão; e na faixa contida nada se arrasta', () => {
    const { peca } = montar()
    ponteiro(peca.querySelector('button') as Element, 'pointerdown', 100)
    expect(peca.dataset.segurando).toBe('false')

    movimento.rico = false
    ponteiro(peca, 'pointerdown', 100)
    ponteiro(peca, 'pointermove', 200)
    expect(peca.style.transform).toBe('')
  })
})

describe('o aviso', () => {
  it('não some enquanto o dedo segura, e some depois de solto', () => {
    const { container } = render(<Toaster />)
    act(() => {
      toast.ok('Guardado', { duration: 1000 })
    })
    const caixa = container.querySelector('.toast') as HTMLElement
    expect(caixa.textContent).toContain('Guardado')

    ponteiro(caixa, 'pointerdown', 100)
    act(() => {
      vi.advanceTimersByTime(3000)
    })
    expect(caixa.textContent).toContain('Guardado')

    ponteiro(caixa, 'pointerup', 100)
    act(() => {
      vi.advanceTimersByTime(1100)
    })
    expect(caixa.textContent).not.toContain('Guardado')
  })
})
