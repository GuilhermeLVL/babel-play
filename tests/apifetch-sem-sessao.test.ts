// @vitest-environment jsdom
/**
 * apiFetch (src/data/funil.ts) no modo público SEM sessão utilizável (fix/cliente-sem-sessao).
 *
 * O sintoma medido: com uma sessão que o servidor recusa guardada no aparelho, a abertura do app
 * mandava 13 chamadas autenticadas, todas 401 (refresh e `signOut` por chamada, e as que saíam
 * depois iam SEM token). Cada 401 soma no limitador de falhas do IP; na terceira abertura, 429 para
 * todo mundo atrás daquele IP e a home presa no esqueleto do progresso.
 *
 * Aqui: sem token não sai nada para a rede; o 401 abre uma renovação só, compartilhada; depois de a
 * sessão cair, as chamadas seguintes respondem como sem conta.
 */
import 'fake-indexeddb/auto'

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const supa = vi.hoisted(() => {
  const estado = { token: null as string | null }
  return {
    estado,
    refreshSession: vi.fn(),
    signOut: vi.fn(async () => {
      estado.token = null
      return {}
    }),
  }
})
vi.mock('../src/lib/supabase', () => ({
  supabase: { auth: { refreshSession: supa.refreshSession, signOut: supa.signOut } },
  authRequired: true,
  carregarSupabase: async () => null,
  getAccessToken: async () => supa.estado.token,
}))

import { apiFetch, temSessao } from '../src/data/funil'
import { _reiniciarIdentidade, armarIdentidade, definirIdentidade } from '../src/lib/identidade'

const R = (status: number) => new Response(status === 200 ? '{}' : '{"error":"token inválido"}', { status })

beforeEach(() => {
  supa.refreshSession.mockReset()
  supa.signOut.mockClear()
  supa.estado.token = null
  _reiniciarIdentidade()
})
afterEach(() => {
  vi.unstubAllGlobals()
})

describe('temSessao (decisão pura)', () => {
  it('modo público: só com token', () => {
    expect(temSessao({ authRequired: true, token: null })).toBe(false)
    expect(temSessao({ authRequired: true, token: '' })).toBe(false)
    expect(temSessao({ authRequired: true, token: 'Bearer x' })).toBe(true)
  })
  it('self-host: o servidor não exige token', () => {
    expect(temSessao({ authRequired: false, token: null })).toBe(true)
  })
})

describe('apiFetch sem token no modo público', () => {
  it('identidade ainda não resolvida e sem token: responde sem conta, nenhuma chamada à rede', async () => {
    const rede = vi.fn(async () => R(401))
    vi.stubGlobal('fetch', rede)
    const res = await apiFetch('/api/metrics/profile')
    expect(rede).not.toHaveBeenCalled()
    expect(res.status).toBe(200)
  })

  it('identidade "conta" com a sessão já encerrada: também não vai à rede', async () => {
    armarIdentidade()
    definirIdentidade('conta')
    const rede = vi.fn(async () => R(401))
    vi.stubGlobal('fetch', rede)
    await apiFetch('/api/settings')
    expect(rede).not.toHaveBeenCalled()
  })

  it('/api/flags continua público: vai à rede mesmo sem token', async () => {
    armarIdentidade()
    definirIdentidade('anonimo')
    const rede = vi.fn(async () => R(200))
    vi.stubGlobal('fetch', rede)
    await apiFetch('/api/flags')
    expect(rede).toHaveBeenCalledTimes(1)
  })

  it('com token: a chamada autenticada sai, com o Authorization', async () => {
    armarIdentidade()
    definirIdentidade('conta')
    supa.estado.token = 'tok'
    const rede = vi.fn(async (_u: string, _i?: RequestInit) => R(200))
    vi.stubGlobal('fetch', rede)
    const res = await apiFetch('/api/settings')
    expect(res.status).toBe(200)
    expect(rede).toHaveBeenCalledTimes(1)
    expect((rede.mock.calls[0]?.[1]?.headers as Record<string, string>).Authorization).toBe('Bearer tok')
  })
})

describe('sessão recusada pelo servidor (token expirado ou revogado)', () => {
  it('rajada de 401 junta: UM refresh, UM signOut, e as chamadas seguintes não vão à rede', async () => {
    armarIdentidade()
    definirIdentidade('conta')
    supa.estado.token = 'velho'
    supa.refreshSession.mockResolvedValue({ data: { session: null } })
    const rede = vi.fn(async () => R(401))
    vi.stubGlobal('fetch', rede)

    const juntas = await Promise.all([
      apiFetch('/api/me/entitlements'),
      apiFetch('/api/me/idade'),
      apiFetch('/api/settings'),
    ])
    expect(juntas.map((r) => r.status)).toEqual([401, 401, 401])
    expect(supa.refreshSession).toHaveBeenCalledTimes(1)
    expect(supa.signOut).toHaveBeenCalledTimes(1)
    expect(supa.signOut).toHaveBeenCalledWith({ scope: 'local' })
    expect(rede).toHaveBeenCalledTimes(3)

    // O resto do arranque: nenhuma ida à rede, nenhum refresh a mais.
    const depois = await Promise.all([apiFetch('/api/metrics/profile'), apiFetch('/api/sessions')])
    expect(depois.every((r) => r.status === 200)).toBe(true)
    expect(rede).toHaveBeenCalledTimes(3)
    expect(supa.refreshSession).toHaveBeenCalledTimes(1)
  })

  it('quem começa enquanto a renovação corre espera o desfecho e não manda o token recusado', async () => {
    armarIdentidade()
    definirIdentidade('conta')
    supa.estado.token = 'velho'
    let liberarRefresh: (v: unknown) => void = () => {}
    supa.refreshSession.mockReturnValue(new Promise((r) => (liberarRefresh = r)))
    const rede = vi.fn(async () => R(401))
    vi.stubGlobal('fetch', rede)

    const primeira = apiFetch('/api/me/entitlements')
    await vi.waitFor(() => expect(supa.refreshSession).toHaveBeenCalledTimes(1))
    const segunda = apiFetch('/api/settings')
    await new Promise((r) => setTimeout(r, 10))
    expect(rede).toHaveBeenCalledTimes(1)

    liberarRefresh({ data: { session: null } })
    expect((await primeira).status).toBe(401)
    expect((await segunda).status).toBe(200)
    expect(rede).toHaveBeenCalledTimes(1)
  })

  it('refresh renova: a rajada tenta de novo uma vez cada, com o token novo, sem signOut', async () => {
    armarIdentidade()
    definirIdentidade('conta')
    supa.estado.token = 'velho'
    supa.refreshSession.mockImplementation(async () => {
      supa.estado.token = 'novo'
      return { data: { session: { access_token: 'novo' } } }
    })
    const rede = vi.fn(async (_u: string, i?: RequestInit) =>
      (i?.headers as Record<string, string>).Authorization === 'Bearer novo' ? R(200) : R(401),
    )
    vi.stubGlobal('fetch', rede)

    const res = await Promise.all([apiFetch('/api/settings'), apiFetch('/api/sessions')])
    expect(res.map((r) => r.status)).toEqual([200, 200])
    expect(supa.refreshSession).toHaveBeenCalledTimes(1)
    expect(supa.signOut).not.toHaveBeenCalled()
    expect(rede).toHaveBeenCalledTimes(4)
  })
})
