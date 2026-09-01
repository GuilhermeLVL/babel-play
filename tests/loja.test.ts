// @vitest-environment jsdom
import { describe, expect, it } from 'vitest'
import { CATALOGO_DA_LOJA, estadoDoItem, marcarPosse, hidratarPosse, possuidos, nivelCoerente, vitrineDoProximoNivel } from '../src/lib/loja'

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
    expect(estadoDoItem(vercel, 1, 0)).toEqual({ estado: 'bloqueado', motivo: 'Nível 4 ou 110 Seeds' })
    marcarPosse(vercel.id)
    expect(estadoDoItem(vercel, 1, 0).estado).toBe('equipavel')
    localStorage.removeItem('babel.loja_possuidos')
  })
  it('exclusivo de conquista: nem nível 99 nem 9999 Seeds abrem; a conquista abre', () => {
    localStorage.removeItem('babel.conquistas')
    localStorage.removeItem('babel.liberado')
    const aurora = CATALOGO_DA_LOJA.find((i) => i.id === 'tema-aurora')!
    expect(aurora.precoSeeds).toBeUndefined()
    expect(estadoDoItem(aurora, 99, 9999)).toEqual({ estado: 'bloqueado', motivo: 'Conquista: Constante' })
    localStorage.setItem('babel.conquistas', JSON.stringify(['constante']))
    expect(estadoDoItem(aurora, 1, 0).estado).toBe('equipavel')
    localStorage.removeItem('babel.conquistas')
    // e a vitrine "no próximo nível" nunca promete um exclusivo
    for (const n of [1, 5, 9]) expect(vitrineDoProximoNivel(n).some((i) => i.exclusivoDe)).toBe(false)
  })
  it('preços seguem as faixas da economia v2 (comum < raro < épico < lendário)', () => {
    const faixa: Record<string, [number, number]> = { comum: [40, 60], raro: [100, 140], epico: [200, 260], lendario: [380, 600] }
    for (const i of CATALOGO_DA_LOJA) {
      if (i.precoSeeds === undefined) continue
      const [min, max] = faixa[i.raridade]
      expect(i.precoSeeds, `${i.id} (${i.raridade}) = ${i.precoSeeds}`).toBeGreaterThanOrEqual(min)
      expect(i.precoSeeds, `${i.id} (${i.raridade}) = ${i.precoSeeds}`).toBeLessThanOrEqual(max)
    }
  })
  it('vitrine do próximo nível aponta o degrau mais próximo', () => {
    const v = vitrineDoProximoNivel(1)
    expect(v.length).toBeGreaterThan(0)
    expect(new Set(v.map((i) => i.nivel)).size).toBe(1)
    expect(v[0].nivel).toBe(2)
  })

  it('hidratarPosse: o servidor soma ao espelho local sem apagar a compra offline (B4)', () => {
    localStorage.removeItem('babel.loja_possuidos')
    marcarPosse('offline-1') // compra otimista que o servidor ainda não conhece
    hidratarPosse(['do-servidor-a', 'do-servidor-b'])
    expect([...possuidos()].sort()).toEqual(['do-servidor-a', 'do-servidor-b', 'offline-1'])
    // Lista vazia/ausente não zera nada — offline continua valendo.
    hidratarPosse([])
    hidratarPosse(undefined)
    expect(possuidos().size).toBe(3)
    localStorage.removeItem('babel.loja_possuidos')
  })
})
