/**
 * Marco 1 — Commit 11: o header Authorization das chamadas ao próprio servidor.
 *
 * authHeaders() é o seam: devolve o Bearer quando há sessão Supabase e {} quando não há (uso
 * local/self-host sem login). O supabase é mockado — nenhuma rede, nenhum env real.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'

vi.mock('../src/lib/supabase', () => ({ getAccessToken: vi.fn(), supabase: null, authRequired: false }))

import { authHeaders } from '../src/lib/authHeaders'
import { getAccessToken } from '../src/lib/supabase'

describe('Marco 1 — authHeaders', () => {
  beforeEach(() => vi.mocked(getAccessToken).mockReset())

  it('inclui Authorization quando há sessão', async () => {
    vi.mocked(getAccessToken).mockResolvedValue('jwt-abc')
    expect(await authHeaders()).toEqual({ Authorization: 'Bearer jwt-abc' })
  })

  it('vazio quando não há sessão (uso local sem login)', async () => {
    vi.mocked(getAccessToken).mockResolvedValue(null)
    expect(await authHeaders()).toEqual({})
  })
})
