/**
 * A tela pergunta a MESMA régua do servidor antes de pedir a voz da nuvem (change `voz-natural-openrouter`): plano pago
 * com `vozNatural`, fora do teste. No teste, sem conta ou no Grátis, nem se pede: a voz do aparelho lê.
 */
import { describe, expect, it } from 'vitest'

import { ENTITLEMENTS_FECHADOS, PLAN_MATRIX } from '../src/core/planos'
import { type Entitlements, temVozDaNuvem } from '../src/lib/entitlements'

const de = (plan: Entitlements['plan'], extra: Partial<Entitlements> = {}): Entitlements => ({
  ...(plan === 'anonimo' ? ENTITLEMENTS_FECHADOS : PLAN_MATRIX[plan].entitlements),
  plan,
  armazenamento: null,
  ...extra,
})

describe('temVozDaNuvem', () => {
  it('assinante do Plus: sim; no teste do Plus: não', () => {
    expect(temVozDaNuvem(de('plus'))).toBe(true)
    expect(temVozDaNuvem(de('plus', { teste: { terminaEm: Date.now() + 1000 } }))).toBe(false)
  })

  it('Grátis, Essencial e sem conta: não', () => {
    expect(temVozDaNuvem(de('free'))).toBe(false)
    expect(temVozDaNuvem(de('essencial'))).toBe(false)
    expect(temVozDaNuvem(de('anonimo', { vozNatural: true }))).toBe(false)
  })
})
