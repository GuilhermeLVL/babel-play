// @vitest-environment jsdom
/**
 * A INCLINAÇÃO DO APARELHO (`src/lib/dispositivo/inclinacao.ts`) e O TATO NO CELULAR
 * (`src/lib/dispositivo/tato.ts`): o que no computador segue o ponteiro, no celular segue o
 * giroscópio; e cada acontecimento tem a sua vibração, com chave própria.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const movimento = vi.hoisted(() => ({ rico: true }))
vi.mock('../src/lib/movimento/animar', () => ({ movimentoRico: () => movimento.rico }))

import {
  assinarInclinacao,
  inclinacaoDoPonteiro,
  novoEstadoDaInclinacao,
  passoDaInclinacao,
  pedirLicencaDoSensor,
} from '../src/lib/dispositivo/inclinacao'
import {
  aparelhoVibra,
  CHAVE_DO_TATO,
  guardarTato,
  PADROES_DE_TATO,
  tato,
  tatoLigado,
} from '../src/lib/dispositivo/tato'

const girar = (beta: number | null, gamma: number | null) =>
  window.dispatchEvent(Object.assign(new Event('deviceorientation'), { beta, gamma }))
const mover = (clientX: number, clientY: number, pointerType = 'mouse') =>
  window.dispatchEvent(Object.assign(new Event('pointermove'), { clientX, clientY, pointerType }))

beforeEach(() => {
  movimento.rico = true
  localStorage.clear()
})

describe('a inclinação', () => {
  it('o jeito de segurar vira o zero: a primeira leitura não inclina nada', () => {
    const estado = novoEstadoDaInclinacao()
    expect(passoDaInclinacao(estado, 48, -7)).toEqual({ x: 0, y: 0 })
  })

  it('só o movimento conta, e o valor fica entre -1 e 1', () => {
    const estado = novoEstadoDaInclinacao()
    passoDaInclinacao(estado, 40, 0)
    const meio = passoDaInclinacao(estado, 40, 11)
    expect(meio.x).toBeCloseTo(0.5, 1)
    expect(meio.y).toBeCloseTo(0, 2)
    expect(passoDaInclinacao(estado, 120, -90)).toEqual({ x: -1, y: 1 })
  })

  it('a postura nova vira o zero aos poucos', () => {
    const estado = novoEstadoDaInclinacao()
    passoDaInclinacao(estado, 0, 0)
    const logo = passoDaInclinacao(estado, 0, 15).x
    let depois = logo
    for (let i = 0; i < 2000; i++) depois = passoDaInclinacao(estado, 0, 15).x
    expect(logo).toBeGreaterThan(0.6)
    expect(depois).toBeLessThan(0.01)
  })

  it('o ponteiro dá o mesmo par: centro é 0, bordas são -1 e 1', () => {
    expect(inclinacaoDoPonteiro(500, 300, 1000, 600)).toEqual({ x: 0, y: 0 })
    expect(inclinacaoDoPonteiro(0, 600, 1000, 600)).toEqual({ x: -1, y: 1 })
    expect(inclinacaoDoPonteiro(10, 10, 0, 0)).toEqual({ x: 0, y: 0 })
  })

  it('entrega pelo ponteiro no computador, cala o ponteiro quando o sensor fala, e para ao cancelar', () => {
    const recebidas: Array<{ x: number; y: number }> = []
    const cancelar = assinarInclinacao((i) => recebidas.push(i))

    mover(window.innerWidth, window.innerHeight / 2)
    expect(recebidas.at(-1)).toEqual({ x: 1, y: 0 })
    mover(0, 0, 'touch')
    expect(recebidas).toHaveLength(1)

    girar(null, null)
    expect(recebidas).toHaveLength(1)
    girar(30, 0)
    girar(30, 22)
    expect(recebidas.at(-1)?.x).toBeCloseTo(1, 1)
    mover(0, 0)
    expect(recebidas).toHaveLength(3)

    cancelar()
    girar(30, -22)
    expect(recebidas).toHaveLength(3)
  })

  it('quem pediu menos movimento não recebe nada', () => {
    const aoInclinar = vi.fn()
    const cancelar = assinarInclinacao(aoInclinar)
    movimento.rico = false
    mover(10, 10)
    girar(10, 10)
    expect(aoInclinar).not.toHaveBeenCalled()
    cancelar()
  })

  it('pede a licença do sensor onde ela existe (iPhone) e não atrapalha onde não existe', async () => {
    const global = globalThis as { DeviceOrientationEvent?: unknown }
    const antes = global.DeviceOrientationEvent
    global.DeviceOrientationEvent = undefined
    await expect(pedirLicencaDoSensor()).resolves.toBe(true)
    global.DeviceOrientationEvent = { requestPermission: async () => 'granted' }
    await expect(pedirLicencaDoSensor()).resolves.toBe(true)
    global.DeviceOrientationEvent = { requestPermission: async () => 'denied' }
    await expect(pedirLicencaDoSensor()).resolves.toBe(false)
    global.DeviceOrientationEvent = { requestPermission: async () => Promise.reject(new Error('fora de um toque')) }
    await expect(pedirLicencaDoSensor()).resolves.toBe(false)
    global.DeviceOrientationEvent = antes
  })
})

describe('o tato', () => {
  const vibrate = vi.fn(() => true)
  const comToque = (sim: boolean) =>
    Object.defineProperty(window, 'matchMedia', {
      configurable: true,
      value: (q: string) => ({ matches: sim && q.includes('coarse'), addEventListener() {}, removeEventListener() {} }),
    })

  beforeEach(() => {
    vibrate.mockClear()
    Object.defineProperty(navigator, 'vibrate', { configurable: true, value: vibrate })
    comToque(true)
  })
  afterEach(() => {
    Object.defineProperty(navigator, 'vibrate', { configurable: true, value: undefined })
  })

  it('cada acontecimento tem o seu padrão: o toque mal se nota, o erro são dois pulsos', () => {
    expect(tato('toque')).toBe(true)
    expect(vibrate).toHaveBeenLastCalledWith(6)
    tato('erro')
    expect(vibrate).toHaveBeenLastCalledWith([30, 40, 30])
    for (const padrao of Object.values(PADROES_DE_TATO)) {
      const pulsos = typeof padrao === 'number' ? [padrao] : padrao
      expect(Math.max(...pulsos)).toBeLessThanOrEqual(50)
    }
  })

  it('vem ligado de fábrica e a chave desliga', () => {
    expect(tatoLigado()).toBe(true)
    guardarTato(false)
    expect(localStorage.getItem(CHAVE_DO_TATO)).toBe('nao')
    expect(tato('acerto')).toBe(false)
    expect(vibrate).not.toHaveBeenCalled()
    guardarTato(true)
    expect(tato('acerto')).toBe(true)
  })

  it('não vibra sem tela de toque nem sem motor', () => {
    comToque(false)
    expect(aparelhoVibra()).toBe(false)
    expect(tato('toque')).toBe(false)
    comToque(true)
    Object.defineProperty(navigator, 'vibrate', { configurable: true, value: undefined })
    expect(aparelhoVibra()).toBe(false)
    expect(tato('toque')).toBe(false)
  })
})
