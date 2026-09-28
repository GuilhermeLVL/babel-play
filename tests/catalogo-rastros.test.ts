/**
 * OS RASTROS DO MOUSE, CURADOS (revisão de 27/09 das recompensas v2, P1 do catálogo).
 *
 * Três garantias:
 *  1. UM rastro por forma (faísca, estrelas, corações, pixel, arco-íris) fora da vitrine de
 *     Créditos, mais os quatro rastros dourados da vitrine. `ras-bolhas` (arco-íris celeste, Seeds)
 *     e `ras-matrix` (pixel verde, conquista Duelista) repetiam uma forma e saíram, com reembolso.
 *  2. Rastro é item SÓ de ponteiro fino: num aparelho de toque ele não aparece. Por isso nenhum
 *     rastro cai no baú — um prêmio invisível não é prêmio.
 *  3. Nenhum rastro nem partícula da Loja desenha emoji (emoji ignora a paleta e a cor do tema).
 */
import { describe, expect, it } from 'vitest'

import { itensSorteaveisNoDrop } from '../src/core/economiaAutoridade'
import { CONQUISTAS } from '../src/core/learning/conquistas'
import { CATALOGO_DA_LOJA } from '../src/core/loja'
import { ITENS_REMOVIDOS, reembolsosDevidos } from '../src/core/reembolso'
import { BURST_SPECS } from '../src/lib/effects'

/** A forma de um rastro, lida do `alvo` (`faisca` ou `gen:<forma>:<paleta>` / `croma:<forma>:<matiz>`). */
const formaDe = (alvo: string) => (alvo.includes(':') ? alvo.split(':')[1] : alvo)

describe('rastros — um por forma', () => {
  const rastros = CATALOGO_DA_LOJA.filter((i) => i.tipo === 'rastro' && i.alvo !== 'off')
  const daVitrine = rastros.filter((i) => i.precoCreditos !== undefined)
  const porForma = rastros.filter((i) => i.precoCreditos === undefined)

  it('cinco formas, um rastro cada, fora da vitrine', () => {
    const formas = porForma.map((i) => formaDe(i.alvo))
    expect(formas.sort()).toEqual(['arcoiris', 'coracoes', 'estrelas', 'faisca', 'pixel'])
  })

  it('e os quatro rastros dourados da vitrine de Créditos', () => {
    expect(daVitrine.map((i) => i.id).sort()).toEqual(['dourada-10', 'dourada-2', 'dourada-6', 'dourada-8'])
  })

  it('os duplicados saíram com reembolso das Seeds, e a conquista Duelista paga sem a peça', () => {
    for (const id of ['ras-bolhas', 'ras-matrix']) {
      expect(CATALOGO_DA_LOJA.some((i) => i.id === id), id).toBe(false)
      expect(ITENS_REMOVIDOS.has(id), id).toBe(true)
    }
    expect(reembolsosDevidos([{ reason: 'loja:ras-bolhas', amount: 1000 }], new Set())).toEqual([
      { creditoId: 'reembolso:loja:ras-bolhas', seeds: 1000 },
    ])
    const duelista = CONQUISTAS.find((c) => c.id === 'duelista')!
    expect(duelista.recompensa.cosmetico).toBeUndefined()
    expect(duelista.recompensa.seeds).toBeGreaterThan(0)
  })
})

describe('baú — nada que só o ponteiro fino mostra', () => {
  it('nenhum rastro é sorteável', () => {
    const tipos = new Set(itensSorteaveisNoDrop(new Set()).map((i) => i.tipo))
    expect(tipos.has('rastro')).toBe(false)
    expect(tipos.size).toBeGreaterThan(0)
  })
})

describe('sem emoji nos rastros e partículas da Loja', () => {
  it('o rastro de estrelas desenha forma do motor, não ⭐✨', () => {
    const spec = BURST_SPECS.rastroEstrelas
    expect(spec.forma).not.toBe('emoji')
    expect(spec.emojis).toBeUndefined()
  })

  it('as descrições do catálogo não prometem emoji', () => {
    const emoji = /\p{Extended_Pictographic}/u
    for (const i of CATALOGO_DA_LOJA.filter((x) => x.tipo === 'rastro' || x.tipo === 'particulas')) {
      expect(`${i.nome} ${i.desc}`, i.id).not.toMatch(emoji)
    }
  })
})
