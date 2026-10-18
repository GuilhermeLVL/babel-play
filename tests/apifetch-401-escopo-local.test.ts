// @vitest-environment jsdom
/**
 * apiFetch (src/data/funil.ts): o 401 que PERSISTE depois do refresh encerra a sessão SÓ neste
 * aparelho (`scope: 'local'`). O padrão do Supabase é `global`, que derrubaria o login em todos os
 * outros aparelhos por causa de um 401 possivelmente transitório. Complementa `apifetch-401.test.ts`,
 * que cobre a existência do signOut mas não o escopo.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest'

const supa = vi.hoisted(() => ({
  refreshSession: vi.fn(),
  signOut: vi.fn(async () => ({})),
}))
vi.mock('../src/lib/supabase', () => ({
  supabase: { auth: supa },
  authRequired: true,
  getAccessToken: async () => 'tok',
}))

import { apiFetch } from '../src/data/funil'

const R = (status: number) => new Response(status === 200 ? '{}' : 'no', { status })

beforeEach(() => {
  supa.refreshSession.mockReset()
  supa.signOut.mockClear()
  vi.unstubAllGlobals()
})

describe('apiFetch: 401 persistente depois do refresh', () => {
  it('refresh devolve sessão, mas o retry segue 401: signOut com scope "local"', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(R(401)))
    supa.refreshSession.mockResolvedValue({ data: { session: { access_token: 'novo' } } })
    const res = await apiFetch('/api/x')
    expect(res.status).toBe(401)
    expect(supa.signOut).toHaveBeenCalledTimes(1)
    expect(supa.signOut).toHaveBeenCalledWith({ scope: 'local' })
  })

  it('refresh sem sessão: também signOut local (nunca global nem sem argumento)', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(R(401)))
    supa.refreshSession.mockResolvedValue({ data: { session: null } })
    await apiFetch('/api/x')
    expect(supa.signOut).toHaveBeenCalledTimes(1)
    expect(supa.signOut).toHaveBeenCalledWith({ scope: 'local' })
  })

  it('401 que o retry resolve: não sai de lugar nenhum', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValueOnce(R(401)).mockResolvedValueOnce(R(200)))
    supa.refreshSession.mockResolvedValue({ data: { session: { access_token: 'novo' } } })
    expect((await apiFetch('/api/x')).status).toBe(200)
    expect(supa.signOut).not.toHaveBeenCalled()
  })
})
