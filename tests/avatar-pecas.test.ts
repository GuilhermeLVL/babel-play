import { describe, expect, it } from 'vitest'

import { PALETA } from '../src/core/avatar/paleta'
import {
  CATEGORIAS_DA_PECA,
  compativelComABase,
  CORES_DE_PECA,
  ehPecaDeAcessibilidade,
  LIMITE_DE_PECAS,
  ORCAMENTO_DE_PECAS,
  pecaPorId,
  PECAS,
  pecasParaOTier,
  TETO_DE_TRIANGULOS_POR_PECA,
  triangulosDasPecas,
  validarPecas,
} from '../src/core/avatar/pecas'

describe('catálogo de peças', () => {
  it('ids únicos, categoria válida, orçamento dentro do teto e nenhum material extra', () => {
    expect(new Set(PECAS.map((p) => p.id)).size).toBe(PECAS.length)
    for (const p of PECAS) {
      expect(CATEGORIAS_DA_PECA).toContain(p.categoria)
      expect(p.orcamento.triangulos).toBeGreaterThan(0)
      expect(p.orcamento.triangulos).toBeLessThanOrEqual(TETO_DE_TRIANGULOS_POR_PECA)
      expect(p.orcamento.materiais).toBe(0)
      expect(p.requer.length).toBeGreaterThan(0)
      expect(p.lugares.length).toBeGreaterThan(0)
      expect(CORES_DE_PECA.map((c) => c.id)).toContain(p.corPadrao)
    }
  })

  it('as cores de peça reaproveitam ids e tons da paleta de cabelo (nomes já traduzidos)', () => {
    for (const c of CORES_DE_PECA.filter((x) => x.id !== 'padrao')) {
      const na = PALETA.cabelo.find((x) => x.id === c.id)
      expect(na?.hex).toBe(c.hex)
    }
  })

  it('REPRESENTAÇÃO NÃO É RECOMPENSA: peça de acessibilidade é sempre livre', () => {
    const acess = PECAS.filter((p) => p.acessibilidade)
    expect(acess.map((p) => p.id)).toEqual(
      expect.arrayContaining([
        'oculos-redondo',
        'oculos-quadrado',
        'aparelho-auditivo-esq',
        'aparelho-auditivo-dir',
        'implante-coclear-esq',
        'implante-coclear-dir',
      ]),
    )
    expect(acess.filter((p) => p.tipo !== 'livre')).toEqual([])
    expect(PECAS.filter((p) => p.tipo === 'loja' && p.acessibilidade)).toEqual([])
  })

  it('a loja tem só enfeite: cartola, chapéu de explorador e capa', () => {
    expect(PECAS.filter((p) => p.tipo === 'loja').map((p) => p.id)).toEqual(['cartola', 'chapeu-de-explorador', 'capa'])
  })

  it('há as peças pedidas: óculos, fone, aparelho, implante, boné/chapéu, faixa, balão e lenço', () => {
    for (const id of [
      'oculos-redondo',
      'oculos-quadrado',
      'fone-de-ouvido',
      'bone',
      'chapeu-simples',
      'faixa-de-cabelo',
      'balao-de-fala',
      'lenco',
    ])
      expect(pecaPorId(id)).toBeDefined()
  })
})

describe('validarPecas', () => {
  it('aceita combinações possíveis', () => {
    expect(validarPecas(['oculos-redondo', 'aparelho-auditivo-esq', 'bone', 'lenco'])).toEqual([])
    expect(validarPecas([])).toEqual([])
  })

  it('rejeita id desconhecido e repetido', () => {
    expect(validarPecas(['nao-existe']).join()).toMatch(/desconhecida/)
    expect(validarPecas(['bone', 'bone']).join()).toMatch(/repetida/)
  })

  it('rejeita duas peças no mesmo lugar, mas aparelho auditivo convive com fone e chapéu', () => {
    expect(validarPecas(['bone', 'cartola']).join()).toMatch(/mesmo lugar/)
    expect(validarPecas(['oculos-redondo', 'oculos-quadrado']).join()).toMatch(/mesmo lugar/)
    expect(validarPecas(['fone-de-ouvido', 'implante-coclear-esq']).join()).toMatch(/mesmo lugar/)
    expect(validarPecas(['fone-de-ouvido', 'aparelho-auditivo-esq', 'aparelho-auditivo-dir', 'bone'])).toEqual([])
  })

  it('compatibilidade com a base', () => {
    const p = pecaPorId('bone')!
    const restrita = { ...p, bases: ['colecao'] as const }
    expect(compativelComABase(restrita, 'colecao')).toBe(true)
    expect(compativelComABase(restrita, 'importado')).toBe(false)
    expect(compativelComABase(p, 'importado')).toBe(true)
  })

  it('o orçamento de triângulos e o número de peças são por tier', () => {
    expect(ORCAMENTO_DE_PECAS.fraco.decorativas).toBe(false)
    expect(ORCAMENTO_DE_PECAS.forte.maxPecas).toBe(LIMITE_DE_PECAS)
    expect(validarPecas(PECAS.map((p) => p.id)).join()).toMatch(/no máximo/)
    const quatro = ['fone-de-ouvido', 'bone', 'lenco', 'balao-de-fala']
    expect(triangulosDasPecas(quatro)).toBeGreaterThan(0)
    expect(validarPecas(quatro, { tier: 'forte' })).toEqual([])
    const cinco = ['oculos-redondo', 'fone-de-ouvido', 'bone', 'lenco', 'balao-de-fala']
    expect(validarPecas(cinco, { tier: 'fraco' }).join()).toMatch(/no máximo|orçamento/)
  })

  it('estouro de triângulos por tier é detectado', () => {
    // Sete peças grandes passam de 1200 (fraco) e ainda cabem em 2600 (forte).
    const sete = [
      'oculos-redondo',
      'fone-de-ouvido',
      'bone',
      'lenco',
      'balao-de-fala',
      'aparelho-auditivo-esq',
      'aparelho-auditivo-dir',
    ]
    expect(triangulosDasPecas(sete)).toBeGreaterThan(ORCAMENTO_DE_PECAS.fraco.triangulos)
    expect(validarPecas(sete, { tier: 'forte' })).toEqual([])
  })
})

describe('pecasParaOTier', () => {
  const ids = ['oculos-redondo', 'bone', 'aparelho-auditivo-dir', 'implante-coclear-esq', 'balao-de-fala']
  it('tier fraco e PiP: só acessibilidade', () => {
    const r = pecasParaOTier(ids, 'fraco')
    expect(r.usadas).toEqual(['oculos-redondo', 'aparelho-auditivo-dir', 'implante-coclear-esq'])
    expect(r.cortadas.map((c) => c.id).sort()).toEqual(['balao-de-fala', 'bone'])
    expect(r.usadas.every(ehPecaDeAcessibilidade)).toBe(true)
  })
  it('medio e forte mostram tudo o que couber, na ordem da receita', () => {
    expect(pecasParaOTier(ids, 'medio').usadas).toEqual(ids)
    expect(pecasParaOTier(ids, 'forte').usadas).toEqual(ids)
  })
  it('quando falta orçamento, a acessibilidade vence o enfeite', () => {
    const muitas = [
      'fone-de-ouvido',
      'bone',
      'lenco',
      'balao-de-fala',
      'faixa-de-cabelo',
      'oculos-redondo',
      'aparelho-auditivo-dir',
    ]
    const r = pecasParaOTier(muitas, 'medio')
    expect(r.usadas).toContain('oculos-redondo')
    expect(r.usadas).toContain('aparelho-auditivo-dir')
  })
  it('id desconhecido é cortado sem lançar', () => {
    expect(pecasParaOTier(['x-y'], 'forte').cortadas).toEqual([{ id: 'x-y', motivo: 'desconhecida' }])
  })
})
