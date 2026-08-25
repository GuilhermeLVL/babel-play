// @vitest-environment jsdom
/** apiFetch: em modo público, 401 tenta 1 refresh e retry; se persistir, faz signOut. Local não mexe. */
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'

const supa = vi.hoisted(() => ({
  refreshSession: vi.fn(),
  signOut: vi.fn(async () => {}),
}))
vi.mock('../src/lib/supabase', () => ({
  supabase: { auth: supa },
  authRequired: true,
  getAccessToken: async () => 'tok',
}))

import { apiFetch } from '../src/data/api'

const R = (status: number) => new Response(status === 200 ? '{}' : 'no', { status })

beforeEach(() => { supa.refreshSession.mockReset(); supa.signOut.mockClear() })
afterEach(() => { vi.unstubAllGlobals() })

describe('apiFetch 401', () => {
  it('401 → refresh ok → retry 200; sem signOut', async () => {
    const fetchMock = vi.fn().mockResolvedValueOnce(R(401)).mockResolvedValueOnce(R(200))
    vi.stubGlobal('fetch', fetchMock)
    supa.refreshSession.mockResolvedValue({ data: { session: { access_token: 'novo' } } })
    const res = await apiFetch('/api/x')
    expect(res.status).toBe(200)
    expect(fetchMock).toHaveBeenCalledTimes(2)
    expect(supa.signOut).not.toHaveBeenCalled()
  })

  it('401 → refresh sem sessão → signOut; sem retry', async () => {
    const fetchMock = vi.fn().mockResolvedValue(R(401))
    vi.stubGlobal('fetch', fetchMock)
    supa.refreshSession.mockResolvedValue({ data: { session: null } })
    const res = await apiFetch('/api/x')
    expect(res.status).toBe(401)
    expect(fetchMock).toHaveBeenCalledTimes(1)
    expect(supa.signOut).toHaveBeenCalledTimes(1)
  })
})
