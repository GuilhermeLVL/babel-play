// @vitest-environment jsdom
import { beforeEach, describe, expect, it } from 'vitest'

import { PECAS } from '../src/core/avatar/pecas'
import { NIVEL_SO_SEEDS } from '../src/core/catalogoV2'
import { autorizarGastoDeCredito, vendavelEmCreditos } from '../src/core/economiaAutoridade'
import { VITRINE_DE_CREDITOS } from '../src/core/loja'
import { CATALOGO_DA_LOJA, estadoDoItem, estadoPorAlvo, hidratarPosse, marcarPosse } from '../src/lib/loja'

const itensDoAvatar = () => CATALOGO_DA_LOJA.filter((i) => i.tipo === 'avatar')

describe('loja: itens de avatar (M6)', () => {
  beforeEach(() => {
    localStorage.clear()
  })

  it('só as peças `loja` do catálogo viram item, uma a uma', () => {
    expect(
      itensDoAvatar()
        .map((i) => i.alvo)
        .sort(),
    ).toEqual(
      PECAS.filter((p) => p.tipo === 'loja')
        .map((p) => p.id)
        .sort(),
    )
    expect(itensDoAvatar().length).toBeGreaterThanOrEqual(3)
  })

  it('ACESSIBILIDADE NÃO É RECOMPENSA: nenhuma peça de acessibilidade está no catálogo da loja', () => {
    const acess = new Set(PECAS.filter((p) => p.acessibilidade).map((p) => p.id))
    expect(itensDoAvatar().filter((i) => acess.has(i.alvo))).toEqual([])
    // Nem por id: nenhum item de nenhum tipo aponta para uma peça de acessibilidade.
    expect(CATALOGO_DA_LOJA.filter((i) => acess.has(i.alvo) || [...acess].some((a) => i.id.includes(a)))).toEqual([])
    // E peça livre também não é item (fora do catálogo = livre).
    expect(itensDoAvatar().filter((i) => PECAS.find((p) => p.id === i.alvo)?.tipo !== 'loja')).toEqual([])
  })

  it('vizinhos de faixa: só Seeds, sem nível da conta, sem Créditos, com raridade comum/rara', () => {
    for (const i of itensDoAvatar()) {
      expect(i.precoSeeds).toBeGreaterThan(0)
      expect(i.nivel).toBe(NIVEL_SO_SEEDS)
      expect(i.precoCreditos).toBeUndefined()
      expect(i.exclusivoDe ?? i.origemMaestria ?? i.origemTemporada).toBeUndefined()
      expect(['comum', 'raro']).toContain(i.raridade)
      if (i.raridade === 'comum') expect(i.precoSeeds).toBeGreaterThanOrEqual(350)
      if (i.raridade === 'comum') expect(i.precoSeeds).toBeLessThanOrEqual(450)
      if (i.raridade === 'raro') expect(i.precoSeeds).toBeGreaterThanOrEqual(1000)
      if (i.raridade === 'raro') expect(i.precoSeeds).toBeLessThanOrEqual(1300)
    }
  })

  it('NENHUM item de avatar se paga com dinheiro: fora da vitrine de Créditos e sem autorização de gasto', () => {
    for (const i of itensDoAvatar()) {
      expect(vendavelEmCreditos(i)).toBe(false)
      expect(VITRINE_DE_CREDITOS.map((v) => v.id)).not.toContain(i.id)
      expect(autorizarGastoDeCredito(`premium:${i.id}`)).toEqual({ erro: `${i.id} não é vendido em Créditos` })
    }
  })

  it('estadoDoItem reaproveitado: não abre por nível, compra com Seeds, posse vem do servidor', () => {
    const capa = itensDoAvatar().find((i) => i.alvo === 'capa')!
    expect(estadoDoItem(capa, 1, 0).estado).toBe('bloqueado')
    expect(estadoDoItem(capa, 80, 0).estado).toBe('bloqueado') // nível da conta não abre
    expect(estadoDoItem(capa, 1, capa.precoSeeds!).estado).toBe('compravel')
    hidratarPosse([capa.id]) // o que o servidor confirmou
    expect(estadoDoItem(capa, 1, 0).estado).toBe('equipavel')
  })

  it('peça livre está fora do catálogo e `estadoPorAlvo` a deixa equipável; a da loja segue a régua', () => {
    expect(estadoPorAlvo('avatar', 'oculos-redondo', 1, 0).estado).toBe('equipavel')
    expect(estadoPorAlvo('avatar', 'aparelho-auditivo-dir', 1, 0).estado).toBe('equipavel')
    expect(estadoPorAlvo('avatar', 'cartola', 1, 0).estado).toBe('bloqueado')
    marcarPosse(itensDoAvatar().find((i) => i.alvo === 'cartola')!.id)
    expect(estadoPorAlvo('avatar', 'cartola', 1, 0).estado).toBe('equipavel')
  })
})
