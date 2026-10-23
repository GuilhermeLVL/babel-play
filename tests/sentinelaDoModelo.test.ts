/**
 * Sentinela de queda: uma marca por instância de página no `localStorage`. Só a marca deixada por OUTRA
 * página (que não está viva) vale como queda; a própria, nunca (parar/iniciar na mesma aba).
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import {
  desmarcar,
  INSTANCIA_DA_PAGINA,
  marcarCarregando,
  quedaSuspeita,
  vetarSeCaiuComOModelo,
} from '../src/lib/captura/sentinelaDoModelo'

const memoria = new Map<string, string>()
const MOTIVO = 'a aba caiu com o modelo carregado'

beforeEach(() => {
  memoria.clear()
  vi.stubGlobal('localStorage', {
    getItem: (k: string) => memoria.get(k) ?? null,
    setItem: (k: string, v: string) => void memoria.set(k, v),
    removeItem: (k: string) => void memoria.delete(k),
    key: (i: number) => [...memoria.keys()][i] ?? null,
    get length() {
      return memoria.size
    },
  })
})
afterEach(() => vi.unstubAllGlobals())

describe('sentinelaDoModelo', () => {
  it('a marca é por instância: babel.sentinela.<id>.<instância>', () => {
    marcarCarregando('m', 1000)
    expect(memoria.get(`babel.sentinela.m.${INSTANCIA_DA_PAGINA}`)).toBe('1000')
  })

  it('(a) a PRÓPRIA instância marca e checa: sem queda e sem veto', async () => {
    const proibir = vi.fn(async () => undefined)
    marcarCarregando('m')
    expect(quedaSuspeita('m')).toBe(false)
    expect(await vetarSeCaiuComOModelo('m', proibir)).toBe(false)
    expect(proibir).not.toHaveBeenCalled()
  })

  it('(b) marca de OUTRA instância com menos de 30 min: veto com o motivo, e a marca dela some', async () => {
    const proibir = vi.fn(async () => undefined)
    marcarCarregando('m', 1000, 'outra')
    expect(quedaSuspeita('m', 2000)).toBe(true)
    expect(await vetarSeCaiuComOModelo('m', proibir, 2000)).toBe(true)
    expect(proibir).toHaveBeenCalledWith('m', MOTIVO)
    expect(quedaSuspeita('m', 3000)).toBe(false)
  })

  it('(c) o desmarcar da aba B não apaga a marca da aba A', () => {
    marcarCarregando('m', 1000, 'A')
    marcarCarregando('m', 1000, 'B')
    desmarcar('m', 'B')
    expect(memoria.has('babel.sentinela.m.A')).toBe(true)
    expect(memoria.has('babel.sentinela.m.B')).toBe(false)
  })

  it('outra aba VIVA (lock segurado) não é queda', async () => {
    const proibir = vi.fn(async () => undefined)
    marcarCarregando('m', 1000, 'viva')
    vi.stubGlobal('navigator', {
      locks: { query: async () => ({ held: [{ name: 'babel.sentinela.m.viva' }] }) },
    })
    expect(await vetarSeCaiuComOModelo('m', proibir, 2000)).toBe(false)
    expect(proibir).not.toHaveBeenCalled()
  })

  it('marca de outra instância com 31 min não vale e é removida', () => {
    marcarCarregando('m', 0, 'velha')
    expect(quedaSuspeita('m', 31 * 60_000)).toBe(false)
    expect(memoria.has('babel.sentinela.m.velha')).toBe(false)
  })

  it('desmarcar apaga a própria; ids não se misturam', () => {
    marcarCarregando('a', 1000, 'x')
    expect(quedaSuspeita('b', 2000)).toBe(false)
    marcarCarregando('m')
    desmarcar('m')
    expect(memoria.size).toBe(1)
  })

  it('sem localStorage nunca lança', async () => {
    vi.stubGlobal('localStorage', undefined)
    expect(() => marcarCarregando('m')).not.toThrow()
    expect(quedaSuspeita('m')).toBe(false)
    expect(await vetarSeCaiuComOModelo('m', async () => undefined)).toBe(false)
  })
})
