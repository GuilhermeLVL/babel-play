/**
 * Sentinela de queda: a marca do `localStorage` que diz "a aba anterior caiu com o modelo carregado".
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { desmarcar, marcarCarregando, quedaSuspeita, vetarSeCaiuComOModelo } from '../src/lib/captura/sentinelaDoModelo'

const memoria = new Map<string, string>()

beforeEach(() => {
  memoria.clear()
  vi.stubGlobal('localStorage', {
    getItem: (k: string) => memoria.get(k) ?? null,
    setItem: (k: string, v: string) => void memoria.set(k, v),
    removeItem: (k: string) => void memoria.delete(k),
  })
})
afterEach(() => vi.unstubAllGlobals())

describe('sentinelaDoModelo', () => {
  it('marcar grava babel.sentinela.<id> e a queda fica suspeita', () => {
    marcarCarregando('m', 1000)
    expect(memoria.get('babel.sentinela.m')).toBe('1000')
    expect(quedaSuspeita('m', 2000)).toBe(true)
  })

  it('desmarcar apaga: sem queda', () => {
    marcarCarregando('m', 1000)
    desmarcar('m')
    expect(quedaSuspeita('m', 2000)).toBe(false)
  })

  it('marca de 31 min não vale e é removida', () => {
    marcarCarregando('m', 0)
    expect(quedaSuspeita('m', 31 * 60_000)).toBe(false)
    expect(memoria.has('babel.sentinela.m')).toBe(false)
  })

  it('sem marca: false; ids não se misturam', () => {
    marcarCarregando('a', 1000)
    expect(quedaSuspeita('b', 2000)).toBe(false)
  })

  it('sem localStorage nunca lança', () => {
    vi.stubGlobal('localStorage', undefined)
    expect(() => marcarCarregando('m')).not.toThrow()
    expect(quedaSuspeita('m')).toBe(false)
  })

  it('vetarSeCaiuComOModelo: com marca, proíbe com o motivo e apaga; sem marca, não faz nada', async () => {
    const proibir = vi.fn(async () => undefined)
    expect(await vetarSeCaiuComOModelo('m', proibir)).toBe(false)
    expect(proibir).not.toHaveBeenCalled()
    marcarCarregando('m')
    expect(await vetarSeCaiuComOModelo('m', proibir)).toBe(true)
    expect(proibir).toHaveBeenCalledWith('m', 'a aba caiu com o modelo carregado')
    expect(quedaSuspeita('m')).toBe(false)
  })
})
