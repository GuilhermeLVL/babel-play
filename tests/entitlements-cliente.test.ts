// @vitest-environment jsdom
/**
 * Fatia 5 / passo 1 — o cliente OBEDECE `GET /api/me/entitlements`.
 *
 * Falha-antes: o módulo antigo devolvia `selfhost` (tudo liberado) sem perguntar a ninguém, e tinha
 * `setPlan` — o cliente se auto-promovia e a UI mentia (402 na rota, selo "liberado" na tela).
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('../src/lib/supabase', () => ({
  supabase: null,
  authRequired: true,
  carregarSupabase: async () => null,
  getAccessToken: async () => null,
}))

import { carregarEntitlements, getEntitlements, limparEntitlements, onPlanChange } from '../src/lib/entitlements'

const resposta = (corpo: unknown, status = 200) =>
  new Response(JSON.stringify(corpo), { status, headers: { 'content-type': 'application/json' } })

describe('entitlements do cliente', () => {
  beforeEach(() => {
    localStorage.clear()
    limparEntitlements()
  })
  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it('sem cache e sem rede, o default do modo público é FECHADO (não selfhost)', () => {
    const e = getEntitlements()
    expect(e.plan).toBe('free')
    expect(e.managedCloudStt).toBe(false)
    expect(e.managedCloudLlm).toBe(false)
    expect(e.traducaoNuance).toBe(false)
    expect(e.vozNatural).toBe(false)
    expect(e.interpreteAutomatico).toBe(false)
  })

  it('o que o servidor responde vira o que a tela mostra, e quem está aberto é avisado', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () =>
        resposta({
          plan: 'premium',
          managedCloudStt: true,
          managedCloudLlm: true,
          largerModels: true,
          traducaoNuance: true,
          vozNatural: true,
          interpreteAutomatico: true,
          armazenamento: { usados: 1024, teto: 5_000_000_000 },
        }),
      ),
    )
    const avisos = vi.fn()
    const parar = onPlanChange(avisos)
    const e = await carregarEntitlements()
    parar()
    expect(e.plan).toBe('premium')
    expect(e.traducaoNuance).toBe(true)
    expect(e.vozNatural).toBe(true)
    expect(e.interpreteAutomatico).toBe(true)
    expect(getEntitlements().armazenamento).toEqual({ usados: 1024, teto: 5_000_000_000 })
    expect(avisos).toHaveBeenCalledTimes(1)
    expect(JSON.parse(localStorage.getItem('babel.entitlements')!).plan).toBe('premium')
  })

  it('matriz v2: o nome antigo (servidor anterior ou cache antigo) é lido como Premium, com as flags dele', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => resposta({ plan: 'pro', managedCloudLlm: true })),
    )
    const e = await carregarEntitlements()
    expect(e.plan).toBe('premium')
    expect(e.managedCloudLlm).toBe(true)
    // O servidor anterior não mandava os entitlements novos: sem eles, fechados.
    expect(e.traducaoNuance).toBe(false)
  })

  it('não existe caminho para o cliente mudar o plano', async () => {
    const mod = await import('../src/lib/entitlements')
    expect('setPlan' in mod).toBe(false)
    expect('getPlan' in mod).toBe(false)
  })

  it('resposta fora da forma ou erro de rede mantém o último valor conhecido', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => resposta({ plan: 'pro', sttAoVivo: true })),
    )
    await carregarEntitlements()
    expect(getEntitlements().sttAoVivo).toBe(true)

    vi.stubGlobal(
      'fetch',
      vi.fn(async () => resposta({ error: 'x' }, 500)),
    )
    expect((await carregarEntitlements()).sttAoVivo).toBe(true)

    vi.stubGlobal(
      'fetch',
      vi.fn(async () => {
        throw new Error('rede')
      }),
    )
    expect((await carregarEntitlements()).sttAoVivo).toBe(true)

    /* CONTRATO NOVO (mudança planos-essencial): plano desconhecido NÃO descarta mais a resposta.
       O comportamento antigo jogava fora as flags VERDADEIRAS que vieram junto — um cliente antigo
       diante do plano `essencial` recém-lançado fecharia tudo. Agora só o rótulo degrada
       (`free`); as flags do servidor valem, porque a autoridade é ele. */
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => resposta({ plan: 'deus', sttAoVivo: true })),
    )
    const comPlanoDesconhecido = await carregarEntitlements()
    expect(comPlanoDesconhecido.plan).toBe('free')
    expect(comPlanoDesconhecido.sttAoVivo).toBe(true)
  })

  it('cache durável sobrevive ao recarregar o módulo, mas só se tiver a forma certa', async () => {
    localStorage.setItem('babel.entitlements', JSON.stringify({ plan: 'pro', sttAoVivo: true }))
    limparEntitlements() // limpa memória E disco — então o próximo get volta ao default
    expect(getEntitlements().plan).toBe('free')
    localStorage.setItem('babel.entitlements', '{"plan":"pro","sttAoVivo":true}')
    vi.resetModules()
    vi.doMock('../src/lib/supabase', () => ({
      supabase: null,
      authRequired: true,
      carregarSupabase: async () => null,
      getAccessToken: async () => null,
    }))
    const fresco = await import('../src/lib/entitlements')
    expect(fresco.getEntitlements().sttAoVivo).toBe(true)
    localStorage.setItem('babel.entitlements', 'não é json')
    vi.resetModules()
    const quebrado = await import('../src/lib/entitlements')
    expect(quebrado.getEntitlements().sttAoVivo).toBe(false)
  })
})
