// @vitest-environment jsdom
/**
 * A MATRIZ SERVE A VÁRIOS PLANOS PAGOS (change `planos-v3-e-rota-inteligente`, etapa 1).
 *
 * Com um plano pago só, `'premium'` foi escrito à mão em meia dúzia de lugares: a faixa da admissão,
 * o "já assinou" do teste de 14 dias, a intenção padrão do webhook, a lista de planos das flags, o
 * tipo do plano pago no cliente — e os entitlements do cliente eram uma cópia campo a campo dos da
 * matriz. Cada um desses lugares esqueceria o segundo plano pago em silêncio. Estes testes prendem a
 * derivação: quem decide "é pagante?" e "que capacidades tem?" lê a matriz.
 */
import { readFileSync } from 'node:fs'

import { afterEach, describe, expect, it, vi } from 'vitest'

vi.mock('../src/lib/supabase', () => ({
  supabase: null,
  authRequired: true,
  carregarSupabase: async () => null,
  getAccessToken: async () => null,
}))

import { planoDeAdmissao } from '../server/ai/admissao'
import { PLANOS_DA_FLAG } from '../src/core/flags'
import {
  ehPlanoPago,
  ENTITLEMENTS_FECHADOS,
  lerEntitlements,
  PLAN_MATRIX,
  PLANO_CONVIDADO,
  PLANO_DO_TESTE,
  planoPagoMaisBarato,
  PLANOS_DE_ASSINATURA,
  PLANOS_PAGOS,
  planosAVenda,
} from '../src/core/planos'
import { entitlementsAnonimos } from '../src/data/efemero/rotas/conta'
import { PLANOS_PAGOS as PAGOS_DO_CLIENTE } from '../src/lib/assinatura'
import { carregarEntitlements, getEntitlements, limparEntitlements } from '../src/lib/entitlements'

const CAMPOS = Object.keys(PLAN_MATRIX.free.entitlements).sort()

afterEach(() => {
  vi.unstubAllGlobals()
  localStorage.clear()
  limparEntitlements()
})

describe('os planos pagos saem da matriz', () => {
  it('pago é o plano que tem preço — nem mais, nem menos', () => {
    const comPreco = PLANOS_DE_ASSINATURA.filter((p) => PLAN_MATRIX[p].precoMensalBrl !== null)
    expect([...PLANOS_PAGOS]).toEqual(comPreco)
    expect(PLANOS_PAGOS.length).toBeGreaterThanOrEqual(1)
    for (const p of PLANOS_DE_ASSINATURA) expect(ehPlanoPago(p), p).toBe(comPreco.includes(p))
    expect(ehPlanoPago('convidado')).toBe(false)
    expect(ehPlanoPago(undefined)).toBe(false)
  })

  /* O cliente não tem lista própria: o que o checkout oferece são os planos À VENDA da matriz. Com
     as chaves da venda desligadas (como nascem), é só o que nunca teve chave. */
  it('o checkout oferece os planos à venda da matriz, não uma lista escrita à mão', () => {
    expect([...PAGOS_DO_CLIENTE]).toEqual(planosAVenda(() => false))
    expect(PAGOS_DO_CLIENTE.length).toBeGreaterThanOrEqual(1)
    for (const p of PAGOS_DO_CLIENTE) expect(PLANOS_PAGOS).toContain(p)
  })

  it('à venda é o plano pago com TODAS as chaves de venda ligadas', () => {
    expect(planosAVenda(() => true)).toEqual([...PLANOS_PAGOS])
    const semChave = PLANOS_PAGOS.filter((p) => PLAN_MATRIX[p].flagsDeVenda.length === 0)
    expect(planosAVenda(() => false)).toEqual(semChave)
    for (const p of PLANOS_PAGOS) {
      for (const desligada of PLAN_MATRIX[p].flagsDeVenda) {
        expect(
          planosAVenda((chave) => chave !== desligada),
          `${p} sem ${desligada}`,
        ).not.toContain(p)
      }
    }
  })

  it('o teste de 14 dias concede um plano pago da matriz', () => {
    expect(ehPlanoPago(PLANO_DO_TESTE)).toBe(true)
  })

  it('o mais barato é o de menor mensalidade', () => {
    const menor = Math.min(...PLANOS_PAGOS.map((p) => PLAN_MATRIX[p].precoMensalBrl as number))
    expect(PLAN_MATRIX[planoPagoMaisBarato()].precoMensalBrl).toBe(menor)
  })
})

describe('quem lê "é pagante?" lê a matriz', () => {
  it('todo plano pago entra na faixa de pagantes da admissão; o self-host também', () => {
    for (const p of PLANOS_PAGOS) expect(planoDeAdmissao(p), p).toBe('premium')
    expect(planoDeAdmissao('selfhost')).toBe('premium')
    expect(planoDeAdmissao('free')).toBe('gratis')
    expect(planoDeAdmissao('convidado')).toBe('gratis')
    expect(planoDeAdmissao(undefined)).toBe('gratis')
  })

  it('o teste e o alívio não disputam a capacidade de quem paga, em nenhum plano', () => {
    for (const p of PLANOS_PAGOS) {
      expect(planoDeAdmissao(p, false, true), p).toBe('gratis')
      expect(planoDeAdmissao(p, true), p).toBe('alivio')
    }
  })

  it('uma regra de flag pode nomear qualquer plano da matriz, e o convidado', () => {
    expect([...PLANOS_DA_FLAG]).toEqual(['convidado', ...PLANOS_DE_ASSINATURA])
  })

  /* O nome do plano fica na matriz e na cobrança. Estes arquivos decidiam por `'premium'` escrito à
     mão; se ele voltar, o segundo plano pago é esquecido ali sem nenhum teste de comportamento notar. */
  it.each([
    'server/lib/entitlements.ts',
    'server/lib/billingEventos.ts',
    'server/routes/billing.ts',
    'src/core/flags.ts',
    'src/lib/assinatura.ts',
    'src/lib/entitlements.ts',
    'src/data/efemero/rotas/conta.ts',
  ])('%s não escreve o nome de um plano pago à mão', (arquivo) => {
    const fonte = readFileSync(arquivo, 'utf8')
      .replace(/\/\*[\s\S]*?\*\//g, '')
      .replace(/^\s*\/\/.*$/gm, '')
    for (const p of PLANOS_PAGOS) expect(fonte, `'${p}' em ${arquivo}`).not.toMatch(new RegExp(`['"\`]${p}['"\`]`))
  })
})

describe('os entitlements do cliente são gerados da matriz', () => {
  it('todo plano (e o convidado) declara os mesmos campos', () => {
    for (const p of PLANOS_DE_ASSINATURA) expect(Object.keys(PLAN_MATRIX[p].entitlements).sort(), p).toEqual(CAMPOS)
    expect(Object.keys(PLANO_CONVIDADO.entitlements).sort()).toEqual(CAMPOS)
    expect(Object.keys(ENTITLEMENTS_FECHADOS).sort()).toEqual(CAMPOS)
  })

  it('ler devolve o que o servidor mandou, campo a campo, para todo plano', () => {
    for (const p of PLANOS_DE_ASSINATURA) {
      const doServidor = JSON.parse(JSON.stringify({ plan: p, ...PLAN_MATRIX[p].entitlements }))
      expect(lerEntitlements(doServidor), p).toEqual(PLAN_MATRIX[p].entitlements)
    }
  })

  it('campo que não veio, ou veio fora da forma, fica FECHADO', () => {
    expect(lerEntitlements({})).toEqual(ENTITLEMENTS_FECHADOS)
    const lixo = Object.fromEntries(CAMPOS.map((c) => [c, 'sim']))
    expect(lerEntitlements(lixo)).toEqual(ENTITLEMENTS_FECHADOS)
  })

  it('o cache do cliente carrega TODOS os campos da matriz, sem lista à mão', async () => {
    for (const p of PLANOS_PAGOS) {
      const corpo = { plan: p, ...PLAN_MATRIX[p].entitlements, armazenamento: { usados: 1, teto: 2 } }
      vi.stubGlobal(
        'fetch',
        vi.fn(async () => new Response(JSON.stringify(corpo), { status: 200 })),
      )
      const e = await carregarEntitlements()
      expect(e, p).toMatchObject({ plan: p, ...PLAN_MATRIX[p].entitlements })
    }
  })

  it('sem cache, o modo público abre com o Grátis da matriz', () => {
    expect(getEntitlements()).toMatchObject({ plan: 'free', ...PLAN_MATRIX.free.entitlements })
  })

  it('a edição estática responde a mesma forma, toda fechada', async () => {
    const corpo = (await (await entitlementsAnonimos()).json()) as Record<string, unknown>
    expect(corpo).toMatchObject({ plan: 'anonimo', ...ENTITLEMENTS_FECHADOS })
    for (const c of CAMPOS) expect(corpo, c).toHaveProperty(c)
  })
})
