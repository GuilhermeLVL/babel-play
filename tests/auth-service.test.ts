/**
 * Serviço de auth (cliente) — segurança por desenho. Mocka o Supabase e verifica: login errado
 * devolve mensagem GENÉRICA (anti-enumeração), signup sem sessão pede verificação, reset SEMPRE
 * responde ok+genérico (mesmo se o provedor lançar), e o MFA encapsula enroll/confirm.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'

// vi.hoisted: o factory do vi.mock é içado ao topo — a mock precisa existir antes.
const { auth } = vi.hoisted(() => ({
  auth: {
    signInWithPassword: vi.fn(),
    signUp: vi.fn(),
    signInWithOAuth: vi.fn(),
    resetPasswordForEmail: vi.fn(),
    updateUser: vi.fn(),
    signOut: vi.fn(),
    mfa: { enroll: vi.fn(), challenge: vi.fn(), verify: vi.fn(), unenroll: vi.fn() },
  },
}))
vi.mock('../src/lib/supabase', () => ({ supabase: { auth }, authRequired: true, getAccessToken: async () => null }))

import * as svc from '../src/lib/auth'

beforeEach(() => { vi.clearAllMocks() })

describe('serviço de auth — segurança por desenho', () => {
  it('login errado → mensagem genérica (não revela e-mail vs senha)', async () => {
    auth.signInWithPassword.mockResolvedValue({ error: { message: 'Invalid login credentials' } })
    const r = await svc.signInEmail('a@x.com', 'errada')
    expect(r.ok).toBe(false)
    expect(r.message).toBe('E-mail ou senha incorretos.')
  })

  it('login ok → ok', async () => {
    auth.signInWithPassword.mockResolvedValue({ error: null })
    expect((await svc.signInEmail('a', 'b')).ok).toBe(true)
  })

  it('signup sem sessão → needsEmailConfirm', async () => {
    auth.signUp.mockResolvedValue({ data: { session: null }, error: null })
    expect(await svc.signUpEmail('a@x.com', 'senha123')).toMatchObject({ ok: true, needsEmailConfirm: true })
  })

  it('reset SEMPRE devolve ok+genérico, mesmo se o provedor lançar (anti-enumeração)', async () => {
    auth.resetPasswordForEmail.mockRejectedValue(new Error('conta não existe'))
    const r = await svc.sendPasswordReset('qualquer@x.com')
    expect(r.ok).toBe(true)
    expect(r.message).toMatch(/se existir/i)
  })

  it('login social chama o OAuth do provedor certo', async () => {
    auth.signInWithOAuth.mockResolvedValue({ error: null })
    await svc.signInWithProvider('google', 'http://localhost:3100/auth/callback')
    expect(auth.signInWithOAuth).toHaveBeenCalledWith(expect.objectContaining({ provider: 'google' }))
  })

  it('MFA enroll devolve QR + segredo', async () => {
    auth.mfa.enroll.mockResolvedValue({ data: { id: 'f1', totp: { qr_code: '<svg/>', secret: 'ABC' } }, error: null })
    expect(await svc.enrollTotp()).toMatchObject({ ok: true, factorId: 'f1', qrSvg: '<svg/>', secret: 'ABC' })
  })

  it('MFA confirm: código errado → mensagem amigável', async () => {
    auth.mfa.challenge.mockResolvedValue({ data: { id: 'c1' }, error: null })
    auth.mfa.verify.mockResolvedValue({ error: { message: 'invalid' } })
    const r = await svc.confirmTotp('f1', '000000')
    expect(r.ok).toBe(false)
    expect(r.message).toMatch(/código inválido/i)
  })
})
