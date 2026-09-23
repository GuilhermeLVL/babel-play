// @vitest-environment jsdom
/**
 * Efeitos de câmera e ritmo (Fundação). O que precisa continuar verdade: com movimento reduzido
 * nada anima e nada atrasa o jogo, e o placar que sobe SEMPRE termina no valor exato.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('../src/lib/soundFx', () => ({ play: vi.fn(), EVENTS: {} }))

import { contagem321, contarAte, desfoqueDeGolpe, entradaDeCamera, pausaDeImpacto, vinheta } from '../src/lib/juice'

beforeEach(() => {
  document.body.className = ''
  document.body.innerHTML = '<div id="root"></div>'
})
afterEach(() => vi.useRealTimers())

describe('com movimento reduzido', () => {
  beforeEach(() => document.body.classList.add('animations-off'))

  it('a contagem não aparece e resolve na hora', async () => {
    await contagem321('Vai!')
    expect(document.querySelector('.babel-contagem')).toBeNull()
  })

  it('contarAte já escreve o valor final', async () => {
    const el = document.createElement('span')
    await contarAte(el, 120, { sufixo: ' XP' })
    expect(el.textContent).toBe('120 XP')
  })

  it('vinheta, desfoque, entrada e pausa não fazem nada', async () => {
    const el = document.createElement('div')
    vinheta('erro')
    desfoqueDeGolpe(el)
    entradaDeCamera(el)
    await pausaDeImpacto(50)
    expect(document.querySelector('.babel-vinheta')).toBeNull()
    expect(el.className).toBe('')
    expect(document.getElementById('root')!.className).toBe('')
  })
})

describe('com animação ligada', () => {
  beforeEach(() => {
    document.body.classList.add('animations-on')
    vi.useFakeTimers()
  })

  it('contarAte passa por valores intermediários e termina no exato', async () => {
    const el = document.createElement('span')
    const fim = contarAte(el, 1000, { dur: 320 })
    vi.advanceTimersByTime(160)
    const meio = Number(el.textContent)
    expect(meio).toBeGreaterThan(0)
    expect(meio).toBeLessThan(1000)
    await vi.runAllTimersAsync()
    await fim
    expect(el.textContent).toBe('1000')
  })

  it('a contagem mostra 3, 2, 1 e o rótulo final, e depois some', async () => {
    const vistos: string[] = []
    const fim = contagem321('Vai!')
    for (let i = 0; i < 4; i++) {
      vistos.push(document.querySelector('.babel-contagem-num')?.textContent ?? '')
      await vi.advanceTimersByTimeAsync(700)
    }
    await fim
    expect(vistos).toEqual(['3', '2', '1', 'Vai!'])
    expect(document.querySelector('.babel-contagem')).toBeNull()
  })

  it('vinheta entra e sai sozinha', () => {
    vinheta('combo')
    expect(document.querySelector('.babel-vinheta-combo')).not.toBeNull()
    vi.advanceTimersByTime(700)
    expect(document.querySelector('.babel-vinheta')).toBeNull()
  })

  it('pausa de impacto congela o palco e solta', async () => {
    const fim = pausaDeImpacto(90)
    expect(document.getElementById('root')!.classList.contains('babel-pausa-impacto')).toBe(true)
    await vi.advanceTimersByTimeAsync(100)
    await fim
    expect(document.getElementById('root')!.classList.contains('babel-pausa-impacto')).toBe(false)
  })

  it('desfoque de golpe aplica a intensidade e a classe temporária', () => {
    const el = document.createElement('div')
    desfoqueDeGolpe(el, 9)
    expect(el.style.getPropertyValue('--golpe-desfoque')).toBe('9px')
    expect(el.classList.contains('babel-desfoque-golpe')).toBe(true)
    vi.advanceTimersByTime(300)
    expect(el.classList.contains('babel-desfoque-golpe')).toBe(false)
  })
})
