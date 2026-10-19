/**
 * TETO DO R2 — a gramática das três variáveis (`openspec/changes/r2-teto-de-uso`, decisão 4).
 *
 * Cinco casos por variável: ausente (padrão), número (o teto), `0` (kill switch), `ilimitado`
 * (desliga) e qualquer outro valor (erro de configuração, que derruba o boot).
 */
import { describe, expect, it } from 'vitest'

import { lerTetoDoR2 } from '../server/lib/tetoDoR2'

const MB = 1024 * 1024

describe('lerTetoDoR2: R2_TETO_MB', () => {
  it('ausente → 9 216 MB (90 % dos 10 GB grátis)', () => {
    expect(lerTetoDoR2({}).bytes).toBe(9216 * MB)
    expect(lerTetoDoR2({ R2_TETO_MB: '' }).bytes).toBe(9216 * MB)
  })
  it('número ≥ 1 → o teto em MB', () => {
    expect(lerTetoDoR2({ R2_TETO_MB: '500' }).bytes).toBe(500 * MB)
  })
  it('0 → teto zero (recusa todo upload novo)', () => {
    expect(lerTetoDoR2({ R2_TETO_MB: '0' }).bytes).toBe(0)
  })
  it('ilimitado → sem teto', () => {
    expect(lerTetoDoR2({ R2_TETO_MB: 'ilimitado' }).bytes).toBe(Infinity)
  })
  it('qualquer outro valor é erro de configuração', () => {
    for (const v of ['abc', '-1', '1.5', '10GB', 'Infinity'])
      expect(() => lerTetoDoR2({ R2_TETO_MB: v }), v).toThrow(/R2_TETO_MB/)
  })
})

describe('lerTetoDoR2: R2_TETO_OPS_A_MES', () => {
  it('ausente → 900 000', () => {
    expect(lerTetoDoR2({}).opsA).toBe(900_000)
  })
  it('número ≥ 1 → o teto', () => {
    expect(lerTetoDoR2({ R2_TETO_OPS_A_MES: '1234' }).opsA).toBe(1234)
  })
  it('0 → teto zero', () => {
    expect(lerTetoDoR2({ R2_TETO_OPS_A_MES: '0' }).opsA).toBe(0)
  })
  it('ilimitado → sem teto', () => {
    expect(lerTetoDoR2({ R2_TETO_OPS_A_MES: 'ilimitado' }).opsA).toBe(Infinity)
  })
  it('qualquer outro valor é erro de configuração', () => {
    for (const v of ['muito', '-5', '2.5'])
      expect(() => lerTetoDoR2({ R2_TETO_OPS_A_MES: v }), v).toThrow(/R2_TETO_OPS_A_MES/)
  })
})

describe('lerTetoDoR2: R2_TETO_OPS_B_MES', () => {
  it('ausente → 9 000 000', () => {
    expect(lerTetoDoR2({}).opsB).toBe(9_000_000)
  })
  it('número ≥ 1 → o teto', () => {
    expect(lerTetoDoR2({ R2_TETO_OPS_B_MES: '77' }).opsB).toBe(77)
  })
  it('0 → teto zero', () => {
    expect(lerTetoDoR2({ R2_TETO_OPS_B_MES: '0' }).opsB).toBe(0)
  })
  it('ilimitado → sem teto', () => {
    expect(lerTetoDoR2({ R2_TETO_OPS_B_MES: 'ilimitado' }).opsB).toBe(Infinity)
  })
  it('qualquer outro valor é erro de configuração', () => {
    for (const v of ['nenhum', '-1', '0x10'])
      expect(() => lerTetoDoR2({ R2_TETO_OPS_B_MES: v }), v).toThrow(/R2_TETO_OPS_B_MES/)
  })
})

describe('lerTetoDoR2: inteiro grande demais', () => {
  it('acima de Number.MAX_SAFE_INTEGER é erro de configuração (estouraria o bigint no SQL e passaria sem teto)', () => {
    const gigante = '9'.repeat(30)
    expect(() => lerTetoDoR2({ R2_TETO_OPS_A_MES: gigante })).toThrow(/R2_TETO_OPS_A_MES/)
    expect(() => lerTetoDoR2({ R2_TETO_OPS_B_MES: '9007199254740993' })).toThrow(/R2_TETO_OPS_B_MES/)
    expect(() => lerTetoDoR2({ R2_TETO_MB: gigante })).toThrow(/R2_TETO_MB/)
    expect(lerTetoDoR2({ R2_TETO_OPS_A_MES: String(Number.MAX_SAFE_INTEGER) }).opsA).toBe(Number.MAX_SAFE_INTEGER)
  })
  it('R2_TETO_MB cujo valor em bytes passaria do inteiro seguro também é erro', () => {
    expect(() => lerTetoDoR2({ R2_TETO_MB: String(2 ** 40) })).toThrow(/R2_TETO_MB/)
  })
})

describe('as variáveis estão declaradas', () => {
  it('em server/lib/config.ts e no .env.production.example', async () => {
    const { VARIAVEIS } = await import('../server/lib/config')
    const { readFileSync } = await import('node:fs')
    const exemplo = readFileSync('.env.production.example', 'utf8')
    for (const nome of ['R2_TETO_MB', 'R2_TETO_OPS_A_MES', 'R2_TETO_OPS_B_MES']) {
      const v = VARIAVEIS.find((x) => x.nome === nome)
      expect(v, nome).toBeDefined()
      expect(v?.exigencia).toBe('opcional')
      expect(v?.criticidade).toBe('degrada-capacidade')
      expect(exemplo, nome).toContain(nome)
    }
  })
})
