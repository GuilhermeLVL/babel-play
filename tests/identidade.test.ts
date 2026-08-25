// @vitest-environment jsdom
/**
 * Fatia 5 / passo 2 — o eixo de IDENTIDADE (anônimo / conta / self-host).
 *
 * Falha-antes: o módulo não existia; `apiFetch` não tinha como saber que está sem conta.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('../src/lib/supabase', () => ({
  supabase: null, authRequired: true, carregarSupabase: async () => null, getAccessToken: async () => null,
}))

import {
  _reiniciarIdentidade, aguardarIdentidade, aoMudarIdentidade, armarIdentidade, definirIdentidade, estadoDeIdentidade,
} from '../src/lib/identidade'

describe('identidade', () => {
  beforeEach(() => _reiniciarIdentidade())

  it('no modo público começa carregando; sem a espera armada, aguardar devolve o estado na hora', async () => {
    expect(estadoDeIdentidade()).toBe('carregando')
    expect(await aguardarIdentidade()).toBe('carregando')
  })

  it('com a espera armada, aguardar fica pendente até o App definir', async () => {
    armarIdentidade()
    let resolvida: string | null = null
    const p = aguardarIdentidade().then((e) => { resolvida = e })
    await new Promise((r) => setTimeout(r, 10))
    expect(resolvida).toBeNull()
    definirIdentidade('anonimo')
    await p
    expect(resolvida).toBe('anonimo')
    expect(estadoDeIdentidade()).toBe('anonimo')
  })

  it('mudança avisa quem escuta, com antes e depois; repetir o mesmo estado não avisa', () => {
    const visto: Array<[string, string]> = []
    const parar = aoMudarIdentidade((depois, antes) => visto.push([antes, depois]))
    definirIdentidade('anonimo')
    definirIdentidade('anonimo')
    definirIdentidade('conta')
    parar()
    definirIdentidade('anonimo')
    expect(visto).toEqual([['carregando', 'anonimo'], ['anonimo', 'conta']])
  })

  it('build sem login nasce self-host, sem esperar ninguém', async () => {
    vi.resetModules()
    vi.doMock('../src/lib/supabase', () => ({ supabase: null, authRequired: false, carregarSupabase: async () => null, getAccessToken: async () => null }))
    const m = await import('../src/lib/identidade')
    expect(m.estadoDeIdentidade()).toBe('selfhost')
    m.armarIdentidade()
    expect(await m.aguardarIdentidade()).toBe('selfhost')
  })
})
