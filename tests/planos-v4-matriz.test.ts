/**
 * A MATRIZ V4 (`docs/specs/2026-10-24-planos-v4.md`): Plus, Família e Pro entram; Essencial, Premium e Ao Vivo
 * saem de VENDA (não de uso) quando `venda_planos_v4` liga. O webhook descobre o plano pelo valor pago, então
 * a regra é: valor de um plano só identifica o plano; valor de dois planos NUNCA concede por palpite.
 */
import { describe, expect, it } from 'vitest'

import { custoDoPlanoNoPiorCaso, margemDoAnual } from '../scripts/ia/modeloDeCusto'
import {
  FLAG_VENDA_FAMILIA,
  FLAG_VENDA_PLANOS_V4,
  FLAG_VENDA_PRO4,
  PARCELAS_DO_ANUAL,
  PLAN_MATRIX,
  PLANO_DO_TESTE,
  planoDoTeste,
  type PlanoPago,
  planoPeloPagamento,
  PLANOS_PAGOS,
  planosAVenda,
  valoresCobraveis,
} from '../src/core/planos'

const ligadas =
  (...chaves: string[]) =>
  (k: string) =>
    chaves.includes(k)
const V4 = [FLAG_VENDA_PLANOS_V4]

describe('(a) os 6 valores cobráveis da v4 identificam o plano', () => {
  const casos: Array<[PlanoPago, number, number]> = [
    ['plus', 14.9, 149.0],
    ['familia', 24.9, 249.0],
    ['pro4', 34.9, 349.0],
  ]
  it.each(casos)('%s: mensal e anual', (plano, mensal, anual) => {
    expect(PLAN_MATRIX[plano]).toMatchObject({ precoMensalBrl: mensal, precoAnualBrl: anual })
    expect(planoPeloPagamento(mensal)).toEqual({ plano, ciclo: 'mensal' })
    expect(planoPeloPagamento(anual)).toEqual({ plano, ciclo: 'anual' })
  })

  it('o anual é 10 mensalidades e as parcelas do 12x também identificam', () => {
    for (const [plano, mensal, anual] of casos) {
      expect(anual).toBeCloseTo(mensal * 10, 5)
      const parcelas = valoresCobraveis(plano).filter((v) => v.parcelas === PARCELAS_DO_ANUAL)
      expect(parcelas).toHaveLength(2)
    }
    // Família e Pro não têm parcela em comum com ninguém.
    expect(planoPeloPagamento(20.75, { parcelas: 12 })).toEqual({ plano: 'familia', ciclo: 'anual' })
    expect(planoPeloPagamento(29.08, { parcelas: 12 })).toEqual({ plano: 'pro4', ciclo: 'anual' })
    expect(planoPeloPagamento(29.12, { parcelas: 12 })).toEqual({ plano: 'pro4', ciclo: 'anual' })
    expect(planoPeloPagamento(12.41, { parcelas: 12 })).toEqual({ plano: 'plus', ciclo: 'anual' })
  })

  it('o id é `pro4`, nunca `pro` (alias legado do Premium)', () => {
    expect('pro' in PLAN_MATRIX).toBe(false)
    expect(PLAN_MATRIX.pro4.rotulo).toBe('Pro')
  })
})

describe('(b) planosAVenda com a v4', () => {
  it('v4 ligada: só o Plus; com as flags da Família e do Pro: os três', () => {
    expect(planosAVenda(ligadas(...V4))).toEqual(['plus'])
    expect(planosAVenda(ligadas(...V4, FLAG_VENDA_FAMILIA, FLAG_VENDA_PRO4))).toEqual(['plus', 'familia', 'pro4'])
  })

  it('v4 ligada encerra Essencial, Premium e Ao Vivo, mesmo com as outras flags de venda ligadas', () => {
    const vendidos = planosAVenda(ligadas(...V4, 'venda_planos_v3', 'stt_ao_vivo'))
    expect(vendidos).not.toContain('essencial')
    expect(vendidos).not.toContain('premium')
    expect(vendidos).not.toContain('aovivo')
  })

  it('v4 desligada: o de hoje (Premium sozinho; v3 ligada soma Essencial; Ao Vivo pede a nuvem ao vivo)', () => {
    expect(planosAVenda(() => false)).toEqual(['premium'])
    expect(planosAVenda(ligadas('venda_planos_v3'))).toEqual(['essencial', 'premium'])
    expect(planosAVenda(ligadas('venda_planos_v3', 'stt_ao_vivo'))).toEqual(['essencial', 'premium', 'aovivo'])
    // As flags da Família e do Pro sozinhas não abrem nada sem a v4.
    expect(planosAVenda(ligadas(FLAG_VENDA_FAMILIA, FLAG_VENDA_PRO4))).toEqual(['premium'])
  })

  it('o plano encerrado continua sendo plano válido (quem já o tem o mantém)', () => {
    for (const p of ['essencial', 'premium', 'aovivo'] as const) {
      expect(PLAN_MATRIX[p].encerradoPor).toEqual([FLAG_VENDA_PLANOS_V4])
      expect(planoPeloPagamento(PLAN_MATRIX[p].precoMensalBrl as number)?.plano).toBe(p)
    }
    expect(PLAN_MATRIX.plus.encerradoPor).toBeUndefined()
  })
})

describe('(c) a parcela 12,49 é de dois planos', () => {
  it('sem preferido é ambígua (null); com preferido, vai para o preferido', () => {
    expect(planoPeloPagamento(12.49, { parcelas: 12 })).toBeNull()
    expect(planoPeloPagamento(12.49, { parcelas: 12, preferido: null })).toBeNull()
    expect(planoPeloPagamento(12.49, { parcelas: 12, preferido: 'plus' })).toEqual({ plano: 'plus', ciclo: 'anual' })
    expect(planoPeloPagamento(12.49, { parcelas: 12, preferido: 'premium' })).toEqual({
      plano: 'premium',
      ciclo: 'anual',
    })
  })

  it('preferido que NÃO está entre os candidatos não decide: ambíguo continua null', () => {
    expect(planoPeloPagamento(12.49, { parcelas: 12, preferido: 'familia' })).toBeNull()
    expect(planoPeloPagamento(12.49, { parcelas: 12, preferido: 'essencial' })).toBeNull()
  })

  it('valor de um plano só ignora o preferido (o dinheiro decide, não a intenção)', () => {
    expect(planoPeloPagamento(14.9, { preferido: 'premium' })).toEqual({ plano: 'plus', ciclo: 'mensal' })
    expect(planoPeloPagamento(12.51, { parcelas: 12, preferido: 'plus' })).toEqual({ plano: 'premium', ciclo: 'anual' })
  })
})

describe('(d) nenhuma colisão de valor além da conhecida', () => {
  it('TODOS os valores cobráveis de todos os planos pagos: só a parcela 12,49 de Plus × Premium repete', () => {
    const todos = PLANOS_PAGOS.flatMap((p) => valoresCobraveis(p))
    // 6 mensalidades (essencial, premium, aovivo, plus, familia, pro4) + 5 anuais × 3 (ano, parcela, última).
    expect(todos).toHaveLength(6 + 5 * 3)
    const porCentavos = new Map<number, string[]>()
    for (const v of todos) {
      const c = Math.round(v.valor * 100)
      porCentavos.set(c, [...(porCentavos.get(c) ?? []), `${v.plano}:${v.oQue}`])
    }
    /* Repetir dentro do MESMO plano não é colisão: 249,00 em 12x é 12 × 20,75 (parcela padrão = última). */
    const colisoes = [...porCentavos].filter(([, quem]) => new Set(quem.map((q) => q.split(':')[0])).size > 1)
    expect(colisoes).toEqual([[1249, ['premium:parcela do 12x', 'plus:última parcela do 12x']]])
    // Folga maior que a tolerância de meio centavo entre valores diferentes.
    const distintos = [...porCentavos.keys()].sort((a, b) => a - b)
    for (let i = 1; i < distintos.length; i++) expect(distintos[i] - distintos[i - 1]).toBeGreaterThanOrEqual(1)
  })

  it('cada valor cobrável identifica o plano e o ciclo dele (com o plano como preferido)', () => {
    for (const p of PLANOS_PAGOS) {
      for (const v of valoresCobraveis(p)) {
        expect(planoPeloPagamento(v.valor, { parcelas: v.parcelas, preferido: p }), `${v.oQue} do ${p}`).toEqual({
          plano: p,
          ciclo: v.ciclo,
        })
      }
    }
  })
})

describe('(e) o anual não dá margem negativa com a cota cheia no pior custo', () => {
  it.each(['plus', 'familia', 'pro4'] as const)('%s', (plano) => {
    expect(margemDoAnual(plano).margemMensalBrl).toBeGreaterThanOrEqual(0)
    expect(margemDoAnual(plano).margemAnualBrl).toBeGreaterThanOrEqual(0)
  })

  it('o modelo usa as cotas da matriz: o custo cresce com as horas', () => {
    expect(custoDoPlanoNoPiorCaso('familia').nuvemBrl).toBeGreaterThan(custoDoPlanoNoPiorCaso('plus').nuvemBrl)
    // 8 h × R$ 0,65 (spec).
    expect(custoDoPlanoNoPiorCaso('plus').nuvemBrl).toBeCloseTo(5.2, 5)
  })

  it('o anual é 10 mensalidades: a receita do ano é o preço anual, espalhada em 12 meses', () => {
    const m = margemDoAnual('plus')
    expect(m.receitaBrutaAnualBrl).toBe(149)
    expect(m.receitaLiquidaMensalBrl).toBeLessThan(149 / 12)
  })
})

describe('(f) planoDoTeste', () => {
  it('Plus com a v4 ligada, Premium sem', () => {
    expect(planoDoTeste(ligadas(...V4))).toBe('plus')
    expect(planoDoTeste(() => false)).toBe('premium')
    expect(planoDoTeste(ligadas(FLAG_VENDA_FAMILIA, FLAG_VENDA_PRO4))).toBe('premium')
  })

  it('PLANO_DO_TESTE segue sendo o da v3 (chamadores sem flags)', () => {
    expect(PLANO_DO_TESTE).toBe('premium')
  })
})

describe('as cotas e capacidades dos planos novos', () => {
  it('Plus: 8 h, 2 milhões de tokens, 150 mil caracteres de voz; entitlements do Premium sem o intérprete automático', () => {
    const q = PLAN_MATRIX.plus.quotas
    expect(q).toMatchObject({
      sttSegundosMes: 28_800,
      sttSegundosDia: 7_200,
      tokensMes: 2_000_000,
      tokensDia: 200_000,
      vozCaracteresMes: 150_000,
      vozCaracteresDia: 15_000,
    })
    expect(q.chamadasMes).toBeGreaterThan(PLAN_MATRIX.essencial.quotas.chamadasMes as number)
    expect(q.chamadasMes).toBeLessThan(PLAN_MATRIX.premium.quotas.chamadasMes as number)
    expect(PLAN_MATRIX.plus.entitlements).toEqual({ ...PLAN_MATRIX.premium.entitlements, interpreteAutomatico: false })
    expect(PLAN_MATRIX.familia.entitlements).toEqual(PLAN_MATRIX.plus.entitlements)
    expect(PLAN_MATRIX.pro4.entitlements).toEqual(PLAN_MATRIX.premium.entitlements)
  })

  it('Família 12 h / 3 M tokens / 600 mil de voz; Pro 20 h / 3 M / 600 mil', () => {
    expect(PLAN_MATRIX.familia.quotas).toMatchObject({
      sttSegundosMes: 43_200,
      tokensMes: 3_000_000,
      vozCaracteresMes: 600_000,
    })
    expect(PLAN_MATRIX.pro4.quotas).toMatchObject({
      sttSegundosMes: 72_000,
      sttSegundosDia: 7_200,
      tokensMes: 3_000_000,
      vozCaracteresMes: 600_000,
    })
  })
})
