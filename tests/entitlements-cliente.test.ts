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
  beforeEach(() => { localStorage.clear(); limparEntitlements() })
  afterEach(() => { vi.unstubAllGlobals() })

  it('sem cache e sem rede, o default do modo público é FECHADO (não selfhost)', () => {
    const e = getEntitlements()
    expect(e.plan).toBe('free')
    expect(e.youtubeImport).toBe(false)
    expect(e.managedCloudStt).toBe(false)
    expect(e.managedCloudLlm).toBe(false)
  })

  it('o que o servidor responde vira o que a tela mostra, e quem está aberto é avisado', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => resposta({
      plan: 'pro', youtubeImport: true, managedCloudStt: true, managedCloudLlm: true, largerModels: true,
      armazenamento: { usados: 1024, teto: 5_000_000_000 },
    })))
    const avisos = vi.fn()
    const parar = onPlanChange(avisos)
    const e = await carregarEntitlements()
    parar()
    expect(e.plan).toBe('pro')
    expect(getEntitlements().youtubeImport).toBe(true)
    expect(getEntitlements().armazenamento).toEqual({ usados: 1024, teto: 5_000_000_000 })
    expect(avisos).toHaveBeenCalledTimes(1)
    expect(JSON.parse(localStorage.getItem('babel.entitlements')!).plan).toBe('pro')
  })

  it('não existe caminho para o cliente mudar o plano', async () => {
    const mod = await import('../src/lib/entitlements')
    expect('setPlan' in mod).toBe(false)
    expect('getPlan' in mod).toBe(false)
  })

  it('resposta fora da forma ou erro de rede mantém o último valor conhecido', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => resposta({ plan: 'pro', youtubeImport: true })))
    await carregarEntitlements()
    expect(getEntitlements().youtubeImport).toBe(true)

    vi.stubGlobal('fetch', vi.fn(async () => resposta({ error: 'x' }, 500)))
    expect((await carregarEntitlements()).youtubeImport).toBe(true)

    vi.stubGlobal('fetch', vi.fn(async () => { throw new Error('rede') }))
    expect((await carregarEntitlements()).youtubeImport).toBe(true)

    vi.stubGlobal('fetch', vi.fn(async () => resposta({ plan: 'deus', youtubeImport: true })))
    expect((await carregarEntitlements()).plan).toBe('pro')
  })

  it('cache durável sobrevive ao recarregar o módulo, mas só se tiver a forma certa', async () => {
    localStorage.setItem('babel.entitlements', JSON.stringify({ plan: 'pro', youtubeImport: true }))
    limparEntitlements() // limpa memória E disco — então o próximo get volta ao default
    expect(getEntitlements().plan).toBe('free')
    localStorage.setItem('babel.entitlements', '{"plan":"pro","youtubeImport":true}')
    vi.resetModules()
    vi.doMock('../src/lib/supabase', () => ({ supabase: null, authRequired: true, carregarSupabase: async () => null, getAccessToken: async () => null }))
    const fresco = await import('../src/lib/entitlements')
    expect(fresco.getEntitlements().youtubeImport).toBe(true)
    localStorage.setItem('babel.entitlements', 'não é json')
    vi.resetModules()
    const quebrado = await import('../src/lib/entitlements')
    expect(quebrado.getEntitlements().youtubeImport).toBe(false)
  })
})
