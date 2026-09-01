/**
 * A RÉGUA DAS QUATRO ORIGENS (mudança economia-legivel-e-moedas).
 *
 * O app tem quatro maneiras de dar um item e nenhuma tinha sinal: a cor respondia "quão especial
 * é?" e ninguém respondia "como eu consigo?". Pior, depois de obtido as três origens gratuitas
 * caíam no mesmo balde e a coleção parava de contar como foi montada.
 */
// @vitest-environment jsdom
import { describe, it, expect, beforeEach } from 'vitest'
import { CATALOGO_DA_LOJA, ORIGEM, origemDoItem, COR_DA_RARIDADE, marcarPosse, type OrigemDoItem } from '../src/lib/loja'
import { estadoDaColecao, emojiDoItem } from '../src/lib/galeria/progressao'

beforeEach(() => localStorage.removeItem('babel.loja_possuidos'))

describe('origem do item', () => {
  it('exclusivo de conquista é conquista, mesmo possuído', () => {
    const excl = CATALOGO_DA_LOJA.find((i) => i.exclusivoDe)!
    expect(origemDoItem(excl)).toBe('conquista')
    expect(origemDoItem(excl, true)).toBe('conquista')
  })

  it('comprado é seeds; não comprado é nível', () => {
    const item = CATALOGO_DA_LOJA.find((i) => !i.exclusivoDe && i.precoSeeds)!
    expect(origemDoItem(item, false)).toBe('nivel')
    expect(origemDoItem(item, true)).toBe('seeds')
  })

  it('toda origem tem cor de TOKEN, nunca hex cru', () => {
    const origens: OrigemDoItem[] = ['nivel', 'seeds', 'conquista', 'creditos']
    for (const o of origens) {
      const c = ORIGEM[o]
      expect(c.rotulo.length, o).toBeGreaterThan(0)
      expect(c.comoSeGanha.length, o).toBeGreaterThan(0)
      for (const classe of [c.borda, c.fundo, c.texto]) {
        expect(classe, `${o}: ${classe} tem cor literal`).not.toMatch(/#[0-9a-f]{3,8}/i)
      }
    }
  })

  it('a raridade também saiu dos hex crus (#4C9AFF/#A66CFF brigavam com os 7 temas)', () => {
    for (const [r, c] of Object.entries(COR_DA_RARIDADE)) {
      expect(`${c.borda} ${c.fundo}`, r).not.toMatch(/#[0-9a-f]{3,8}/i)
    }
  })
})

describe('estadoDaColecao separa as três origens gratuitas', () => {
  it('os baldes somam exatamente `possuidos`, sem sobreposição', () => {
    const c = estadoDaColecao(10, 0)
    const soma = c.ganhosPorNivel.length + c.compradosComSeeds.length + c.conquistados.length
    expect(soma).toBe(c.possuidos.length)
    const ids = [...c.ganhosPorNivel, ...c.compradosComSeeds, ...c.conquistados].map((i) => i.id)
    expect(new Set(ids).size).toBe(ids.length)
  })

  it('comprar move o item de "ganhei por nível" para "comprei"', () => {
    // Item de nível alto: no nível 1 ele não é seu; comprado, passa a ser — e por compra.
    const alvo = CATALOGO_DA_LOJA.find((i) => !i.exclusivoDe && i.nivel >= 9 && i.precoSeeds)!
    expect(estadoDaColecao(1, 0).possuidos.map((i) => i.id)).not.toContain(alvo.id)
    marcarPosse(alvo.id)
    const c = estadoDaColecao(1, 0)
    expect(c.compradosComSeeds.map((i) => i.id)).toContain(alvo.id)
    expect(c.ganhosPorNivel.map((i) => i.id)).not.toContain(alvo.id)
  })
})

describe('ícone do item', () => {
  it('o TIPO manda: dois temas diferentes têm o mesmo ícone estável', () => {
    const temas = CATALOGO_DA_LOJA.filter((i) => i.tipo === 'tema')
    const icones = new Set(temas.map(emojiDoItem))
    expect(icones.size, 'tema deveria ter um ícone só').toBe(1)
  })

  it('pack e cursor continuam lendo a descrição — ali o emoji É o produto', () => {
    const pack = CATALOGO_DA_LOJA.find((i) => i.id === 'pack-oceano')!
    expect(emojiDoItem(pack)).toBe('🐬')
  })
})
