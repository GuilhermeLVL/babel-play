// @vitest-environment jsdom
import { describe, expect, it } from 'vitest'
import { CATALOGO_DA_LOJA, estadoDoItem, marcarPosse, nivelCoerente, vitrineDoProximoNivel } from '../src/lib/loja'

describe('loja', () => {
  it('o catálogo espelha os níveis do módulo de desbloqueios', () => {
    for (const item of CATALOGO_DA_LOJA) expect(nivelCoerente(item), item.id).toBe(true)
  })
  it('estado: nível libera, Seeds compram o atalho, senão cadeado com o caminho', () => {
    localStorage.removeItem('babel.loja_possuidos')
    localStorage.removeItem('babel.liberado')
    const vercel = CATALOGO_DA_LOJA.find((i) => i.id === 'tema-vercel')!
    expect(estadoDoItem(vercel, 4, 0).estado).toBe('equipavel')
    expect(estadoDoItem(vercel, 1, 999).estado).toBe('compravel')
    expect(estadoDoItem(vercel, 1, 0)).toEqual({ estado: 'bloqueado', motivo: 'Nível 4 ou 80 Seeds' })
    marcarPosse(vercel.id)
    expect(estadoDoItem(vercel, 1, 0).estado).toBe('equipavel')
    localStorage.removeItem('babel.loja_possuidos')
  })
  it('vitrine do próximo nível aponta o degrau mais próximo', () => {
    const v = vitrineDoProximoNivel(1)
    expect(v.length).toBeGreaterThan(0)
    expect(new Set(v.map((i) => i.nivel)).size).toBe(1)
    expect(v[0].nivel).toBe(2)
  })
})
