// @vitest-environment jsdom
/**
 * A SESSÃO ANÔNIMA DO SUPABASE NÃO É CONTA (Fase 7). O convidado com nuvem tem sessão, mas a
 * identidade do app continua `anonimo` (dados no aparelho). Quando a mesma sessão deixa de ser
 * anônima (conversão: `USER_UPDATED`), vira `conta` — e o `ModalDeMigracao` sobe os dados locais.
 */
import { act, renderHook, waitFor } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'

type Ouvinte = (evento: string, s: unknown) => void
const supa = vi.hoisted(() => {
  const ouvintes: Ouvinte[] = []
  return {
    ouvintes,
    auth: {
      getSession: vi.fn(async () => ({
        data: { session: { access_token: 'a', user: { id: 'u1', is_anonymous: true } } },
      })),
      onAuthStateChange: vi.fn((cb: Ouvinte) => {
        ouvintes.push(cb)
        return { data: { subscription: { unsubscribe: () => {} } } }
      }),
      mfa: { getAuthenticatorAssuranceLevel: vi.fn(async () => ({ data: null, error: null })) },
    },
  }
})
vi.mock('../src/lib/supabase', () => ({
  supabase: { auth: supa.auth },
  authRequired: true,
  carregarSupabase: async () => ({ auth: supa.auth }),
  getAccessToken: async () => null,
}))
vi.mock('../src/lib/auth', () => ({ precisaDoSegundoFator: async () => false }))

import { useSessaoSupabase } from '../src/lib/estado/useSessaoSupabase'
import { estadoDeIdentidade } from '../src/lib/identidade'

describe('useSessaoSupabase com sessão anônima', () => {
  it('anônima → identidade `anonimo` e sessão nula; convertida (mesmo id) → `conta`', async () => {
    const { result } = renderHook(() => useSessaoSupabase())
    await waitFor(() => expect(estadoDeIdentidade()).toBe('anonimo'))
    expect(result.current.session).toBeNull()

    // O `signInAnonymously` do primeiro uso de nuvem dispara SIGNED_IN com o usuário anônimo.
    act(() => supa.ouvintes.forEach((cb) => cb('SIGNED_IN', { user: { id: 'u1', is_anonymous: true } })))
    expect(estadoDeIdentidade()).toBe('anonimo')
    expect(result.current.session).toBeNull()

    // Conversão: o mesmo id, agora sem `is_anonymous`.
    act(() => supa.ouvintes.forEach((cb) => cb('USER_UPDATED', { user: { id: 'u1', is_anonymous: false } })))
    expect(estadoDeIdentidade()).toBe('conta')
    expect(result.current.session).toMatchObject({ user: { id: 'u1' } })
  })
})
