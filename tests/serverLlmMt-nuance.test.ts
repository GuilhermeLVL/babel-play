/**
 * D2/D6 (Fase D, 30/09/2026) — A LEGENDA AO VIVO LEVA AS PREFERÊNCIAS DA TRADUÇÃO NUANCE.
 *
 * O adaptador do Tradutor IA (`ServerLlmMt`) manda ao `/api/ai/mt` o registro padrão e a variante dos
 * Ajustes — só fora do padrão e só para quem tem a capacidade — e NUNCA o `nivel`: a legenda ao vivo
 * fica no modelo rápido (D1); a nuance é de quem toca numa frase.
 */
import { afterEach, describe, expect, it, vi } from 'vitest'

const estado = vi.hoisted(() => ({
  nuance: true,
  prefs: { registro: 'formal', variantes: { pt: 'pt-PT', es: 'es-419' } } as Record<string, unknown>,
}))

vi.mock('../src/data/api', () => ({ apiFetch: vi.fn() }))
vi.mock('../src/lib/entitlements', () => ({
  getEntitlements: () => ({ plan: 'free', traducaoNuance: estado.nuance }),
}))
vi.mock('../src/lib/preferencias', async (original) => {
  const real = await original<typeof import('../src/lib/preferencias')>()
  return { ...real, lerPreferencias: () => ({ ...real.PADRAO, nuance: estado.prefs }) }
})

import { apiFetch } from '../src/data/api'
import { ServerLlmMt } from '../src/gateway/adapters/serverLlmMt'

const api = apiFetch as unknown as ReturnType<typeof vi.fn>

async function corpoEnviado(tgt: string): Promise<Record<string, unknown>> {
  api.mockResolvedValueOnce({ ok: true, status: 200, json: async () => ({ text: 'olá' }) })
  await new ServerLlmMt().translate('hello', 'en', tgt, { falada: true })
  const init = api.mock.calls.at(-1)?.[1] as { body: string }
  return JSON.parse(init.body) as Record<string, unknown>
}

afterEach(() => {
  api.mockReset()
  estado.nuance = true
  estado.prefs = { registro: 'formal', variantes: { pt: 'pt-PT', es: 'es-419' } }
})

describe('o pedido da legenda ao vivo', () => {
  it('com a Nuance: o registro e a variante dos Ajustes vão; o nível não', async () => {
    const corpo = await corpoEnviado('pt-BR')
    expect(corpo).toMatchObject({ text: 'hello', tgt: 'pt-BR', registro: 'formal', variante: 'pt-PT' })
    expect(corpo).not.toHaveProperty('nivel')
  })

  it('o padrão (automático, pt-BR) não manda nada a mais', async () => {
    estado.prefs = { registro: 'automatico', variantes: { pt: 'pt-BR', es: 'es-419' } }
    const corpo = await corpoEnviado('pt')
    expect(corpo).not.toHaveProperty('registro')
    expect(corpo).not.toHaveProperty('variante')
  })

  it('sem a Nuance, nada da Nuance vai', async () => {
    estado.nuance = false
    const corpo = await corpoEnviado('pt')
    expect(corpo).not.toHaveProperty('registro')
    expect(corpo).not.toHaveProperty('variante')
  })
})
