// @vitest-environment jsdom
/**
 * O CONSENTIMENTO DE ANÚNCIOS E A DATA DA CONTA NO CLIENTE (change `planos-v3-e-rota-inteligente`,
 * tarefa 11.3).
 *
 *  - `anuncios` é um consentimento PRÓPRIO: nasce desligado, não vem de carona de nenhum outro, e cada
 *    mudança fica registrada com data, como os que já existiam;
 *  - `contaCriadaEm` de `GET /api/me/entitlements` chega a `getEntitlements()`; servidor antigo (sem o
 *    campo), valor estranho e o espelho sem conta dão `null` — e sem data a política nega.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const gravado = vi.hoisted(() => ({ ui: null as Record<string, unknown> | null, ok: true }))

vi.mock('../src/lib/supabase', () => ({
  supabase: null,
  authRequired: true,
  carregarSupabase: async () => null,
  getAccessToken: async () => null,
}))
vi.mock('../src/data/api', async (original) => ({
  ...(await original<typeof import('../src/data/api')>()),
  fetchSettings: async () => null,
  patchUiSettings: async (patch: Record<string, unknown>) => {
    if (gravado.ok) gravado.ui = patch
    return gravado.ok
  },
}))

import { entitlementsAnonimos } from '../src/data/efemero/rotas/conta'
import { carregarEntitlements, getEntitlements, limparEntitlements } from '../src/lib/entitlements'
import {
  _reiniciarPreferencias,
  lerPreferencias,
  mudarConsentimento,
  normalizar,
  PADRAO,
  type Preferencias,
} from '../src/lib/preferencias'

const resposta = (corpo: unknown) =>
  new Response(JSON.stringify(corpo), { status: 200, headers: { 'content-type': 'application/json' } })

beforeEach(() => {
  localStorage.clear()
  limparEntitlements()
  _reiniciarPreferencias()
  gravado.ui = null
  gravado.ok = true
})
afterEach(() => {
  vi.unstubAllGlobals()
  vi.useRealTimers()
})

describe('consentimento `anuncios`', () => {
  it('nasce desligado', () => {
    expect(PADRAO.consentimentos.anuncios).toBe(false)
    expect(lerPreferencias().consentimentos.anuncios).toBe(false)
  })

  it('preferências gravadas antes dele existir continuam valendo, com ele desligado', () => {
    const antigas = { consentimentos: { metricas: false, novidades: true, ia: true, nuvem: true } }
    const p = normalizar(antigas)
    expect(p.consentimentos).toMatchObject({ metricas: false, novidades: true, ia: true, nuvem: true })
    expect(p.consentimentos.anuncios).toBe(false)
  })

  it('é separado: autorizar a nuvem, as métricas ou o reconhecimento não o liga', async () => {
    await mudarConsentimento('nuvem', true)
    await mudarConsentimento('metricas', true)
    await mudarConsentimento('reconhecimentoDoNavegador', true)
    expect(lerPreferencias().consentimentos.anuncios).toBe(false)
  })

  it('ligar e desligar mudam SÓ ele e ficam registrados com data', async () => {
    vi.useFakeTimers()
    vi.setSystemTime(1_800_000_000_000)
    const antes = lerPreferencias().consentimentos
    expect(await mudarConsentimento('anuncios', true)).toBe(true)
    expect(lerPreferencias().consentimentos).toEqual({ ...antes, anuncios: true })

    vi.setSystemTime(1_800_000_060_000)
    expect(await mudarConsentimento('anuncios', false)).toBe(true)
    expect(lerPreferencias().consentimentos).toEqual({ ...antes, anuncios: false })

    expect(lerPreferencias().registroDeConsentimentos).toEqual([
      { chave: 'anuncios', valor: true, em: 1_800_000_000_000 },
      { chave: 'anuncios', valor: false, em: 1_800_000_060_000 },
    ])
    /* E é isso que vai para o servidor (o blob `settings.ui.preferencias`). */
    const enviado = gravado.ui?.preferencias as Preferencias
    expect(enviado.consentimentos.anuncios).toBe(false)
    expect(enviado.registroDeConsentimentos).toHaveLength(2)
  })

  it('se o servidor recusa, o consentimento volta ao que era (a tela não mente)', async () => {
    gravado.ok = false
    expect(await mudarConsentimento('anuncios', true)).toBe(false)
    expect(lerPreferencias().consentimentos.anuncios).toBe(false)
    expect(lerPreferencias().registroDeConsentimentos).toEqual([])
  })
})

describe('`contaCriadaEm` no cliente', () => {
  const comServidor = async (corpo: Record<string, unknown>) => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => resposta({ plan: 'free', ...corpo })),
    )
    return carregarEntitlements()
  }

  it('sem resposta do servidor não há data', () => {
    expect(getEntitlements().contaCriadaEm ?? null).toBeNull()
  })

  it('a data do servidor chega a `getEntitlements()` e sobrevive ao recarregar (cache)', async () => {
    expect((await comServidor({ contaCriadaEm: 1_790_000_000_000 })).contaCriadaEm).toBe(1_790_000_000_000)
    expect(getEntitlements().contaCriadaEm).toBe(1_790_000_000_000)
    expect(JSON.parse(localStorage.getItem('babel.entitlements') ?? '{}').contaCriadaEm).toBe(1_790_000_000_000)
  })

  it.each([
    ['servidor anterior, sem o campo', {}],
    ['`null` (o convidado)', { contaCriadaEm: null }],
    ['texto', { contaCriadaEm: '2026-10-01' }],
    ['não finito', { contaCriadaEm: Number.NaN }],
  ])('%s → `null`', async (_nome, corpo) => {
    expect((await comServidor(corpo)).contaCriadaEm).toBeNull()
  })

  it('o espelho sem conta responde a mesma forma, com `null`', async () => {
    expect(await (await entitlementsAnonimos()).json()).toHaveProperty('contaCriadaEm', null)
  })
})
