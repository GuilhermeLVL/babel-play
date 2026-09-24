// @vitest-environment jsdom
/**
 * PERFIL PROTEGIDO NO CLIENTE (Fase 4 — ECA Digital e LGPD art. 14).
 *
 * 1. Conta RESTRITA (menor de 16 sem o responsável): os dados NÃO saem para a rede — o funil
 *    responde pelo servidor em memória, como no modo sem conta. A conta, o convite e a cobrança
 *    continuam indo ao servidor.
 * 2. Com o vínculo aceito, a nuvem volta.
 * 3. `perfilProtegido()`: sem conta no modo público = protegido; adulto declarado = não.
 */
import 'fake-indexeddb/auto'

import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('../src/lib/supabase', () => ({
  supabase: null,
  authRequired: true,
  carregarSupabase: async () => null,
  getAccessToken: async () => 'token-de-teste',
}))

import { apiFetch } from '../src/data/api'
import { fecharStore, limparTudo } from '../src/data/efemero/store'
import { definirIdentidade } from '../src/lib/identidade'
import { definirProtecao, type EstadoDeProtecao, perfilProtegido } from '../src/lib/protecaoDoMenor'

const base: EstadoDeProtecao = {
  nascimentoInformado: true,
  faixa: '12-15',
  protegido: true,
  exigeResponsavel: true,
  exigeConsentimentoEspecifico: false,
  vinculo: { estado: 'nenhum' },
  restrita: true,
}

const rede = vi.fn(
  async (url: unknown) => new Response(JSON.stringify({ via: 'rede', url: String(url) }), { status: 200 }),
)

beforeAll(async () => {
  vi.stubGlobal('fetch', rede)
  await limparTudo()
})
afterAll(async () => {
  await fecharStore()
  vi.unstubAllGlobals()
})
beforeEach(() => rede.mockClear())

describe('conta restrita fica no aparelho', () => {
  it('sessões vão para o servidor local; idade, convite e cobrança vão para a rede', async () => {
    definirIdentidade('conta')
    definirProtecao(base)
    const r = await apiFetch('/api/sessions')
    expect(r.ok).toBe(true)
    expect(rede, 'sessões de conta restrita não podem sair para a rede').not.toHaveBeenCalled()

    await apiFetch('/api/me/idade')
    await apiFetch('/api/me/responsavel/convite', { method: 'POST', body: '{}' })
    await apiFetch('/api/billing/status')
    expect(rede.mock.calls.map((c) => String(c[0]))).toEqual([
      '/api/me/idade',
      '/api/me/responsavel/convite',
      '/api/billing/status',
    ])
  })

  it('com o vínculo aceito, a nuvem volta', async () => {
    definirIdentidade('conta')
    definirProtecao({ ...base, vinculo: { estado: 'aceito', responsavel: 'Mãe' }, restrita: false })
    await apiFetch('/api/sessions')
    expect(rede).toHaveBeenCalledTimes(1)
  })
})

describe('perfilProtegido', () => {
  it('sem conta no modo público: protegido (idade desconhecida)', () => {
    definirIdentidade('anonimo')
    expect(perfilProtegido()).toBe(true)
  })
  it('adulto declarado: não protegido; menor: protegido', () => {
    definirIdentidade('conta')
    definirProtecao({ ...base, faixa: 'adulto', protegido: false, exigeResponsavel: false, restrita: false })
    expect(perfilProtegido()).toBe(false)
    definirProtecao({ ...base, faixa: '16-17', exigeResponsavel: false, restrita: false })
    expect(perfilProtegido()).toBe(true)
  })
})
