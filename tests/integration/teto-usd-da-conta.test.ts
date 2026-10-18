/**
 * O TETO EM DÓLAR POR CONTA NOS PLANOS PAGOS (change `aviso-fim-do-teste-e-teto`).
 *
 * Contratos presos:
 * 1. DESLIGADO POR PADRÃO: sem `TETO_USD_MES_<PLANO>` nada é contado nem recusado, e não há escrita nova.
 * 2. Ligado: o gasto entregue (`registrarGastoDeIa`) soma no mês da conta; ao atingir o teto, a reserva do
 *    LLM é recusada com 402 `teto_usd_da_conta`, antes de reservar qualquer cota.
 * 3. O alívio e o plano sem teto não são afetados; o teto de um plano não vale para o outro.
 * 4. O log do teto leva só plano e valores (campos da allowlist), nunca quem é a conta.
 */
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from 'vitest'

import { asUserId } from '../../server/lib/authContext'
import { type EphemeralDb, setupEphemeralDb } from '../harness/ephemeralDb'

let h: EphemeralDb
let teto: any
let nuvem: any
let orcamento: any
let repo: any

beforeAll(async () => {
  h = await setupEphemeralDb()
  teto = await h.load('../../server/lib/tetoUsdDaConta')
  nuvem = await h.load('../../server/ai/reservaDeNuvem')
  orcamento = await h.load('../../server/lib/orcamentoDeIa')
  ;({ usageCountersRepo: repo } = await h.load('../../server/db/repositories/usageCounters'))
})
afterAll(async () => {
  await h.cleanup()
})
afterEach(() => {
  delete process.env.TETO_USD_MES_ESSENCIAL
  delete process.env.TETO_USD_MES_PREMIUM
  vi.restoreAllMocks()
})

const mes = () => new Date().toISOString().slice(0, 7)

describe('tetoUsdMesDaConta', () => {
  it('sem variável, vazia, zero, negativa ou inválida: sem teto (desligado)', () => {
    expect(teto.tetoUsdMesDaConta('premium', {})).toBe(Infinity)
    expect(teto.tetoUsdMesDaConta('premium', { TETO_USD_MES_PREMIUM: '' })).toBe(Infinity)
    expect(teto.tetoUsdMesDaConta('premium', { TETO_USD_MES_PREMIUM: '0' })).toBe(Infinity)
    expect(teto.tetoUsdMesDaConta('premium', { TETO_USD_MES_PREMIUM: '-1' })).toBe(Infinity)
    expect(teto.tetoUsdMesDaConta('premium', { TETO_USD_MES_PREMIUM: 'abc' })).toBe(Infinity)
  })

  it('lê o número do plano e ignora plano desconhecido', () => {
    expect(teto.tetoUsdMesDaConta('essencial', { TETO_USD_MES_ESSENCIAL: '0.5' })).toBe(0.5)
    expect(teto.tetoUsdMesDaConta('premium', { TETO_USD_MES_ESSENCIAL: '0.5' })).toBe(Infinity)
    expect(teto.tetoUsdMesDaConta('constructor', {})).toBe(Infinity)
    expect(teto.tetoUsdMesDaConta(undefined, {})).toBe(Infinity)
  })
})

describe('desligado por padrão', () => {
  it('registrar o gasto não escreve nada e a conferência passa', async () => {
    const u = asUserId('teto-off')
    await orcamento.registrarGastoDeIa(5, { userId: u, plano: 'premium' })
    expect(await repo.get(u, teto.METRIC_CONTA_GASTO_MICRO_USD, mes())).toBe(0)
    expect(await teto.conferirTetoUsdDaConta(u, 'premium')).toEqual({ ok: true })
    expect(await nuvem.recusaPeloTetoDaConta(u, 'premium')).toBeNull()
  })
})

describe('ligado', () => {
  it('soma o gasto entregue e, no teto, recusa com 402 teto_usd_da_conta', async () => {
    process.env.TETO_USD_MES_ESSENCIAL = '0.10'
    const u = asUserId('teto-on')
    await orcamento.registrarGastoDeIa(0.04, { userId: u, plano: 'essencial' })
    expect(await nuvem.recusaPeloTetoDaConta(u, 'essencial')).toBeNull() // 0,04 de 0,10
    await orcamento.registrarGastoDeIa(0.06, { userId: u, plano: 'essencial' })
    const r = await nuvem.recusaPeloTetoDaConta(u, 'essencial')
    expect(r).toMatchObject({ ok: false, status: 402, code: 'teto_usd_da_conta' })
    expect(r.corpo.error).toMatch(/no aparelho/)
    expect(r.corpo.detalhes).toEqual({ escopo: 'conta' })
  })

  it('reservarLlm recusa no teto ANTES de reservar a cota', async () => {
    process.env.TETO_USD_MES_PREMIUM = '0.05'
    const u = asUserId('teto-llm')
    await orcamento.registrarGastoDeIa(0.05, { userId: u, plano: 'premium' })
    const r = await nuvem.reservarLlm(u, 100, 'plano', 'premium')
    expect(r).toMatchObject({ ok: false, status: 402, code: 'teto_usd_da_conta' })
    expect(await repo.get(u, 'managed_calls', mes())).toBe(0)
  })

  it('o teto é por conta e por plano; o alívio não é afetado', async () => {
    process.env.TETO_USD_MES_PREMIUM = '0.05'
    const a = asUserId('teto-a')
    const b = asUserId('teto-b')
    await orcamento.registrarGastoDeIa(0.05, { userId: a, plano: 'premium' })
    expect(await nuvem.recusaPeloTetoDaConta(a, 'premium')).not.toBeNull()
    expect(await nuvem.recusaPeloTetoDaConta(b, 'premium')).toBeNull() // outra conta
    expect(await nuvem.recusaPeloTetoDaConta(a, 'essencial')).toBeNull() // outro plano, sem teto
    expect(await nuvem.recusaPeloTetoDaConta(a, 'premium', 'alivio')).toBeNull() // o alívio tem o teto dele
  })

  it('o log do teto não leva dado da conta', async () => {
    process.env.TETO_USD_MES_PREMIUM = '0.01'
    const u = asUserId('teto-log-pessoa@exemplo.com')
    const linhas: string[] = []
    vi.spyOn(console, 'warn').mockImplementation((s: unknown) => {
      linhas.push(String(s))
    })
    await orcamento.registrarGastoDeIa(0.02, { userId: u, plano: 'premium' })
    await teto.conferirTetoUsdDaConta(u, 'premium')
    vi.restoreAllMocks()
    const linha = linhas.find((l) => l.includes('conta_teto_usd_atingido'))
    expect(linha).toBeTruthy()
    expect(linha).not.toContain('teto-log-pessoa')
    expect(JSON.parse(linha as string)).toMatchObject({ plano: 'premium', tetoUsd: 0.01, status: 402 })
  })
})
