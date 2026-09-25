// @vitest-environment jsdom
/**
 * FASE 6b — AS FLAGS NO CLIENTE (`src/lib/flags.ts`).
 *
 * Prova: sem nada (primeira abertura, offline), flag é desligada e payload é o padrão embutido;
 * a resposta do servidor entra no cache e no localStorage, e um módulo recém-carregado (o próximo
 * F5) já nasce com o último valor conhecido, sem rede; falha de rede e resposta fora da forma NÃO
 * mudam nada; os cabeçalhos de contexto sobem (instalação estável, idioma, versão); o modo sem
 * conta vai à rede de verdade para `/api/flags` (e só para ela); e o hook re-renderiza.
 */
import 'fake-indexeddb/auto'

import { act, render, screen } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('../src/lib/supabase', () => ({
  supabase: null,
  authRequired: true,
  carregarSupabase: async () => null,
  getAccessToken: async () => null,
}))

const resposta = (corpo: unknown, status = 200) =>
  new Response(JSON.stringify(corpo), { status, headers: { 'content-type': 'application/json' } })

async function modulo() {
  return import('../src/lib/flags')
}

beforeEach(() => {
  localStorage.clear()
  vi.resetModules()
})
afterEach(() => {
  vi.unstubAllGlobals()
})

describe('fallback seguro', () => {
  it('sem cache e sem rede: flag desligada e payload = padrão embutido', async () => {
    const F = await modulo()
    const PADRAO = { gatilhos: [] }
    expect(F.flagLigada('modo_convidado')).toBe(false)
    expect(F.configRemota('oferta_planos', PADRAO, F.ehConfigDeOfertas)).toBe(PADRAO)
  })

  it('flag ligada mas payload fora da forma → padrão', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => resposta({ flags: { oferta_planos: { ligada: true, payload: { gatilhos: 'x' } } } })),
    )
    const F = await modulo()
    await F.carregarFlags()
    const PADRAO = { gatilhos: [] }
    expect(F.flagLigada('oferta_planos')).toBe(true)
    expect(F.configRemota('oferta_planos', PADRAO, F.ehConfigDeOfertas)).toBe(PADRAO)
  })
})

describe('cache em memória e localStorage', () => {
  it('guarda a resposta e o próximo carregamento do módulo já nasce com ela, sem rede', async () => {
    const payload = { gatilhos: [{ id: 'a' }] }
    vi.stubGlobal(
      'fetch',
      vi.fn(async () =>
        resposta({ flags: { modo_convidado: { ligada: true }, oferta_planos: { ligada: true, payload } } }),
      ),
    )
    const F = await modulo()
    await F.carregarFlags()
    expect(F.flagLigada('modo_convidado')).toBe(true)

    vi.resetModules()
    const rede = vi.fn(() => {
      throw new Error('REDE PROIBIDA')
    })
    vi.stubGlobal('fetch', rede)
    const G = await modulo()
    expect(G.flagLigada('modo_convidado'), 'primeiro paint vem do localStorage').toBe(true)
    expect(G.configRemota('oferta_planos', { gatilhos: [] }, G.ehConfigDeOfertas)).toEqual(payload)
    expect(rede).not.toHaveBeenCalled()
  })

  it('falha de rede, 503 e forma estranha mantêm o último valor conhecido', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => resposta({ flags: { x: { ligada: true } } })),
    )
    const F = await modulo()
    await F.carregarFlags()
    for (const falha of [
      async () => {
        throw new TypeError('offline')
      },
      async () => resposta({ error: 'flags indisponíveis' }, 503),
      async () => resposta(['lixo']),
    ]) {
      vi.stubGlobal('fetch', vi.fn(falha))
      await F.carregarFlags()
      expect(F.flagLigada('x')).toBe(true)
    }
  })

  it('entrada individual com forma estranha é descartada (vira desligada)', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => resposta({ flags: { boa: { ligada: true }, ruim: { ligada: 'sim' }, pior: null } })),
    )
    const F = await modulo()
    await F.carregarFlags()
    expect(F.flagsAtuais()).toEqual({ boa: { ligada: true } })
  })
})

describe('contexto enviado', () => {
  it('manda instalação (UUID estável), idioma e chama a rota certa', async () => {
    const chamadas: Array<{ url: string; headers: Record<string, string> }> = []
    vi.stubGlobal(
      'fetch',
      vi.fn(async (url: string, init?: RequestInit) => {
        chamadas.push({ url, headers: (init?.headers ?? {}) as Record<string, string> })
        return resposta({ flags: {} })
      }),
    )
    const F = await modulo()
    await F.carregarFlags()
    await F.carregarFlags()
    expect(chamadas).toHaveLength(2)
    expect(chamadas[0].url).toBe('/api/flags')
    const inst = chamadas[0].headers['x-babel-instalacao']
    expect(inst).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/)
    expect(chamadas[1].headers['x-babel-instalacao'], 'estável entre leituras').toBe(inst)
    expect(F.idDaInstalacao()).toBe(inst)
    expect(chamadas[0].headers['x-babel-idioma']).toBe('pt')
  })
})

describe('modo sem conta', () => {
  it('/api/flags vai à rede de verdade; o resto continua no servidor em memória', async () => {
    const { definirIdentidade } = await import('../src/lib/identidade')
    definirIdentidade('anonimo')
    const rede = vi.fn(async (url: string) => {
      if (url === '/api/flags') return resposta({ flags: { modo_convidado: { ligada: true } } })
      throw new Error(`REDE PROIBIDA: ${url}`)
    })
    vi.stubGlobal('fetch', rede)
    const F = await modulo()
    await F.carregarFlags()
    expect(F.flagLigada('modo_convidado')).toBe(true)
    expect(rede).toHaveBeenCalledTimes(1)

    const { servidorEfemero } = await import('../src/data/efemero/servidor')
    const r = await servidorEfemero('/api/me')
    expect(r.status).toBe(501) // não passou direto
    expect(rede).toHaveBeenCalledTimes(1)
  })
})

describe('hooks', () => {
  it('useFlag re-renderiza quando o servidor muda e useConfigRemota cai no padrão', async () => {
    let ligada = false
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => resposta({ flags: { nova: { ligada } } })),
    )
    const F = await modulo()
    const PADRAO = { gatilhos: [] }
    function Tela() {
      const on = F.useFlag('nova')
      const cfg = F.useConfigRemota('oferta_planos', PADRAO, F.ehConfigDeOfertas)
      return (
        <p>
          {on ? 'ligada' : 'desligada'} {cfg === PADRAO ? 'padrao' : 'remoto'}
        </p>
      )
    }
    render(<Tela />)
    await act(async () => {
      await F.carregarFlags()
    })
    expect(screen.getByText('desligada padrao')).toBeTruthy()
    ligada = true
    await act(async () => {
      await F.carregarFlags()
    })
    expect(screen.getByText('ligada padrao')).toBeTruthy()
  })
})
