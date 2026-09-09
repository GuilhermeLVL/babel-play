// @vitest-environment jsdom
import { beforeEach,describe, expect, it } from 'vitest'

import { recompensasDoNivel } from '../src/lib/desbloqueios'
import { emojiDoItem,estadoDaColecao, itemDaConquista, itensPorNivel, proximaRecompensa, recompensasDoNivelCompleto } from '../src/lib/galeria/progressao'
import { CATALOGO_DA_LOJA } from '../src/lib/loja'

describe('progressão — o mapa das quatro áreas', () => {
  beforeEach(() => localStorage.clear())

  it('itensPorNivel exclui exclusivos e vem ordenado', () => {
    const m = itensPorNivel()
    const niveis = [...m.keys()]
    expect(niveis).toEqual([...niveis].sort((a, b) => a - b))
    for (const lista of m.values()) for (const i of lista) expect(i.exclusivoDe).toBeUndefined()
  })

  it('próxima recompensa é o menor nível acima do atual, com destaque no mais raro', () => {
    const p = proximaRecompensa(1)!
    expect(p.nivel).toBe(2)
    expect(p.itens.every((i) => i.nivel === 2)).toBe(true)
    const peso = { lendario: 4, epico: 3, raro: 2, comum: 1 } as const
    expect(p.itens.every((i) => peso[i.raridade] <= peso[p.destaque.raridade])).toBe(true)
    expect(proximaRecompensa(99)).toBeNull()
  })

  it('estadoDaColecao classifica cada item em UMA área, sem aprimoramentos', () => {
    const e = estadoDaColecao(3, 100)
    const total = e.possuidos.length + e.compraveis.length + e.porNivel.length + e.porConquista.length
    expect(total).toBe(CATALOGO_DA_LOJA.filter((i) => i.tipo !== 'aprimoramento').length)
    expect(e.porConquista.every((i) => !!i.exclusivoDe)).toBe(true)
    expect(e.possuidos.every((i) => i.exclusivoDe ? false : i.nivel <= 3)).toBe(true)
    expect(e.compraveis.every((i) => i.nivel > 3 && (i.precoSeeds ?? Infinity) <= 100)).toBe(true)
  })

  it('recompensas do nível completo cobrem o catálogo antigo de desbloqueios, e mais', () => {
    for (const n of [2, 3, 4]) {
      const completo = recompensasDoNivelCompleto(n)
      for (const r of recompensasDoNivel(n)) {
        if (r.tipo === 'fonte') continue // fonte ainda não é item da Loja
        expect(completo.some((i) => i.tipo === r.tipo && i.alvo === r.id)).toBe(true)
      }
      expect(completo.some((i) => !['tema', 'posicao', 'estudio', 'fonte'].includes(i.tipo))).toBe(true)
    }
  })

  it('itemDaConquista devolve o exclusivo da conquista', () => {
    expect(itemDaConquista('constante')?.id).toBe('tema-aurora')
    expect(itemDaConquista('inexistente')).toBeUndefined()
  })

  it('emojiDoItem sempre devolve algo visível', () => {
    for (const i of CATALOGO_DA_LOJA) expect(emojiDoItem(i).length).toBeGreaterThan(0)
  })
})
