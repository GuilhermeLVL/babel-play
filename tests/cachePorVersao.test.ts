/**
 * `CachePorVersao` (fix/rotas-caras): a entrada só vale para a versão com que foi guardada, e os
 * dois tetos (entradas e peso) despejam a menos usada recentemente.
 */
import { describe, expect, it } from 'vitest'

import { CachePorVersao } from '../server/lib/cachePorVersao'

describe('CachePorVersao', () => {
  it('só devolve a entrada para a MESMA versão', () => {
    const c = new CachePorVersao<string>(4)
    c.guardar('ana', '3', 'baralho v3')
    expect(c.obter('ana', '3')).toBe('baralho v3')
    expect(c.obter('ana', '4')).toBeUndefined()
    expect(c.obter('bia', '3')).toBeUndefined()
  })

  it('guardar de novo substitui a versão anterior, sem somar peso duas vezes', () => {
    const c = new CachePorVersao<string>(4, 100)
    c.guardar('ana', '1', 'a', 60)
    c.guardar('ana', '2', 'b', 60)
    expect(c.obter('ana', '1')).toBeUndefined()
    expect(c.obter('ana', '2')).toBe('b')
    expect(c.tamanho).toEqual({ entradas: 1, peso: 60 })
  })

  it('o teto de entradas despeja a menos usada recentemente', () => {
    const c = new CachePorVersao<number>(2)
    c.guardar('a', '1', 1)
    c.guardar('b', '1', 2)
    expect(c.obter('a', '1')).toBe(1) // `a` passa a ser a mais recente
    c.guardar('c', '1', 3)
    expect(c.obter('b', '1')).toBeUndefined()
    expect(c.obter('a', '1')).toBe(1)
    expect(c.obter('c', '1')).toBe(3)
  })

  it('o teto de peso despeja até caber, e uma entrada maior que o teto não entra', () => {
    const c = new CachePorVersao<string>(10, 100)
    c.guardar('a', '1', 'a', 40)
    c.guardar('b', '1', 'b', 40)
    c.guardar('c', '1', 'c', 40)
    expect(c.obter('a', '1')).toBeUndefined()
    expect(c.tamanho).toEqual({ entradas: 2, peso: 80 })
    c.guardar('gigante', '1', 'g', 101)
    expect(c.obter('gigante', '1')).toBeUndefined()
    expect(c.tamanho).toEqual({ entradas: 2, peso: 80 })
  })
})
