/**
 * O SDK DO SUPABASE FORA DO CAMINHO CRÍTICO DO VISITANTE (carga-rapida-no-celular, 2.1).
 *
 * Sem sessão guardada (`sb-*-auth-token`) e fora do retorno do login, o `/app` não baixa o
 * `vendor-supabase` no boot: o Início pinta sem ele. Com sessão, ou na volta do OAuth/recuperação, baixa já.
 */
import { describe, expect, it } from 'vitest'

import { precisaDoSupabaseNoBoot } from '../src/lib/sessaoNoBoot'

const base = { chaves: [] as string[], caminho: '/app', busca: '', hash: '' }

describe('precisaDoSupabaseNoBoot', () => {
  it('visitante sem sessão guardada: não baixa no boot', () => {
    expect(precisaDoSupabaseNoBoot(base)).toBe(false)
    expect(precisaDoSupabaseNoBoot({ ...base, chaves: ['babel.age_profile', 'sb-outra-coisa'] })).toBe(false)
  })

  it('sessão guardada (inclusive a anônima do convidado): baixa no boot', () => {
    expect(precisaDoSupabaseNoBoot({ ...base, chaves: ['sb-abcdef-auth-token'] })).toBe(true)
  })

  it('volta do login (callback, código PKCE ou tokens no hash): baixa no boot', () => {
    expect(precisaDoSupabaseNoBoot({ ...base, caminho: '/auth/callback/' })).toBe(true)
    expect(precisaDoSupabaseNoBoot({ ...base, busca: '?code=123' })).toBe(true)
    expect(precisaDoSupabaseNoBoot({ ...base, hash: '#access_token=x&type=recovery' })).toBe(true)
    expect(precisaDoSupabaseNoBoot({ ...base, hash: '#error_code=otp_expired' })).toBe(true)
  })
})
