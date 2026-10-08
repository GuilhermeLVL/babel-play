// @vitest-environment jsdom
/**
 * O MOVIMENTO RICO DO DESENHO NOVO (`src/lib/movimento/`): as curvas de mola, a física dos gestos e,
 * principalmente, ONDE ele vale. A regra do headset ("120 a 180 ms, no lugar") não pode ser furada:
 * no Quest, no modo leve e com movimento reduzido a marca é `contido` e `animar` não toca em nada.
 */
import { readFileSync } from 'node:fs'

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const aparelho = vi.hoisted(() => ({ tipo: 'desktop-com-gpu', leve: false }))
vi.mock('../src/lib/dispositivo/perfil', async (original) => {
  const real = await original<typeof import('../src/lib/dispositivo/perfil')>()
  return {
    ...real,
    perfilDoDispositivo: () => ({ ...real.perfilDoDispositivo(), tipo: aparelho.tipo }),
    reduzirEfeitos: () => aparelho.leve,
  }
})

import { EVENTO_REDUZIR_EFEITOS } from '../src/lib/dispositivo/perfil'
import { animar, instalarMarcaDeMovimento, movimentoRico, pararAnimacoes } from '../src/lib/movimento/animar'
import { curvaDeMola, elastico, MOLA, MOLA_SUAVE, projetar, velocidadeDoGesto } from '../src/lib/movimento/mola'

const pontosDe = (curva: string) =>
  curva
    .replace(/^linear\(|\)$/g, '')
    .split(',')
    .map(Number)

beforeEach(() => {
  aparelho.tipo = 'desktop-com-gpu'
  aparelho.leve = false
  document.body.className = 'animations-on'
})
afterEach(() => {
  delete document.documentElement.dataset.movimento
})

describe('as curvas de mola', () => {
  it('começam em 0, terminam em 1 e passam do ponto (é isso que as separa de um cubic-bezier)', () => {
    for (const curva of [MOLA, MOLA_SUAVE]) {
      const p = pontosDe(curva)
      expect(p[0]).toBe(0)
      expect(p.at(-1)).toBe(1)
      expect(Math.max(...p)).toBeGreaterThan(1)
    }
  })

  it('quanto menor o amortecimento, mais a mola passa do ponto', () => {
    const pico = (z: number) => Math.max(...pontosDe(curvaDeMola(z)))
    expect(pico(0.5)).toBeGreaterThan(pico(0.72))
    expect(pico(0.72)).toBeGreaterThan(pico(0.95))
    expect(pico(0.5)).toBeLessThan(1.2)
    expect(pico(0.72)).toBeLessThan(1.05)
  })

  it('as molas do CSS são as que o código gera, e o arquivo só vale no desenho novo', () => {
    const css = readFileSync('src/styles/questMovimento.css', 'utf8')
    expect(css).toContain(`--q-mola: ${MOLA};`)
    expect(css).toContain(`--q-mola-suave: ${MOLA_SUAVE};`)
    const semComentario = css.replace(/\/\*[\s\S]*?\*\//g, '')
    const fora: string[] = []
    for (const [, seletores] of semComentario.matchAll(/([^{}]+)\{/g)) {
      const s = seletores.trim()
      if (!s || s.startsWith('@') || /^(from|to|\d+%)$/.test(s)) continue
      for (const parte of s.split(/,(?![^(]*\))/)) {
        if (!parte.trim().startsWith("html[data-quest-novo='true']")) fora.push(parte.trim())
      }
    }
    expect(fora).toEqual([])
  })
})

describe('a física dos gestos', () => {
  it('projeta para onde o gesto ia, no sentido da velocidade', () => {
    expect(projetar(0)).toBe(0)
    expect(projetar(1000)).toBeCloseTo(499, 0)
    expect(projetar(-1000)).toBeCloseTo(-499, 0)
  })

  it('a borda cede cada vez menos e nunca passa do que foi puxado', () => {
    expect(elastico(0)).toBe(0)
    expect(elastico(50)).toBeLessThan(50)
    expect(elastico(400) - elastico(300)).toBeLessThan(elastico(100) - elastico(0))
    expect(elastico(-80)).toBeCloseTo(-elastico(80))
  })

  it('mede a velocidade pelas amostras, em px por segundo', () => {
    expect(velocidadeDoGesto([])).toBe(0)
    expect(velocidadeDoGesto([[0, 0]])).toBe(0)
    expect(
      velocidadeDoGesto([
        [0, 0],
        [50, 100],
      ]),
    ).toBe(500)
    expect(
      velocidadeDoGesto([
        [0, 100],
        [50, 100],
      ]),
    ).toBe(0)
  })
})

describe('onde o movimento rico vale', () => {
  it('vale no computador com as animações ligadas', () => {
    expect(movimentoRico()).toBe(true)
  })

  it('não vale no headset, no modo leve nem com as animações desligadas', () => {
    aparelho.tipo = 'quest'
    expect(movimentoRico()).toBe(false)
    aparelho.tipo = 'desktop-com-gpu'
    aparelho.leve = true
    expect(movimentoRico()).toBe(false)
    aparelho.leve = false
    document.body.className = 'animations-off'
    expect(movimentoRico()).toBe(false)
  })

  it('a marca no <html> acompanha o interruptor de animações e o Modo desempenho, e sai com a casca', async () => {
    const desinstalar = instalarMarcaDeMovimento()
    expect(document.documentElement.dataset.movimento).toBe('rico')

    document.body.className = 'animations-off'
    await new Promise((r) => setTimeout(r, 0))
    expect(document.documentElement.dataset.movimento).toBe('contido')

    document.body.className = 'animations-on'
    aparelho.leve = true
    window.dispatchEvent(new Event(EVENTO_REDUZIR_EFEITOS))
    expect(document.documentElement.dataset.movimento).toBe('contido')

    desinstalar()
    expect(document.documentElement.dataset.movimento).toBeUndefined()
  })
})

describe('animar', () => {
  const comAnimate = () => {
    const el = document.createElement('div')
    const animate = vi.fn(() => ({ finished: Promise.resolve(), cancel: vi.fn() }))
    Object.assign(el, { animate })
    return { el, animate }
  }

  it('anima com a curva de entrada por padrão', () => {
    const { el, animate } = comAnimate()
    expect(animar(el, [{ opacity: 0 }, { opacity: 1 }], { ms: 300 })).not.toBeNull()
    expect(animate).toHaveBeenCalledWith(
      [{ opacity: 0 }, { opacity: 1 }],
      expect.objectContaining({ duration: 300, easing: 'cubic-bezier(0.23, 1, 0.32, 1)', fill: 'backwards' }),
    )
  })

  it('não toca no elemento quando o movimento rico não vale', () => {
    const { el, animate } = comAnimate()
    aparelho.tipo = 'quest'
    expect(animar(el, [{ opacity: 0 }, { opacity: 1 }])).toBeNull()
    expect(animate).not.toHaveBeenCalled()
  })

  it('aceita elemento ausente e navegador sem WAAPI', () => {
    expect(animar(null, [])).toBeNull()
    expect(animar(document.createElement('div'), [{ opacity: 0 }])).toBeNull()
  })

  it('cancelar não deixa promessa rejeitada sem dono', async () => {
    const el = document.createElement('div')
    const rejeitada = Promise.reject(new DOMException('cancelada', 'AbortError'))
    const cancel = vi.fn()
    Object.assign(el, { getAnimations: () => [{ finished: rejeitada, cancel }] })
    pararAnimacoes(el)
    expect(cancel).toHaveBeenCalledOnce()
    await expect(rejeitada.catch(() => 'engolida')).resolves.toBe('engolida')
    pararAnimacoes(null)
  })
})
