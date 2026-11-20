/**
 * Serviço de auth (cliente) — segurança por desenho. Mocka o Supabase e verifica: login errado
 * devolve mensagem GENÉRICA (anti-enumeração), signup sem sessão pede verificação, reset SEMPRE
 * responde ok+genérico (mesmo se o provedor lançar), e o MFA encapsula enroll/confirm.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest'

// vi.hoisted: o factory do vi.mock é içado ao topo — a mock precisa existir antes.
const { auth } = vi.hoisted(() => ({
  auth: {
    signInWithPassword: vi.fn(),
    signUp: vi.fn(),
    signInWithOAuth: vi.fn(),
    resetPasswordForEmail: vi.fn(),
    updateUser: vi.fn(),
    signOut: vi.fn(),
    getUser: vi.fn(),
    refreshSession: vi.fn(),
    mfa: { enroll: vi.fn(), challenge: vi.fn(), verify: vi.fn(), unenroll: vi.fn(), listFactors: vi.fn() },
  },
}))
vi.mock('../src/lib/supabase', () => ({ supabase: { auth }, authRequired: true, getAccessToken: async () => null }))

import * as svc from '../src/lib/auth'

beforeEach(() => {
  vi.clearAllMocks()
  // Sessão válida por padrão: o MFA confere a sessão antes de chamar o Supabase.
  auth.getUser.mockResolvedValue({ data: { user: { id: 'u1' } }, error: null })
})

const EXPIROU = 'Sua sessão expirou. Saia e entre de novo para configurar a verificação em duas etapas.'

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

  it('MFA com sessão velha ("missing sub claim"): renova uma vez e, sem sessão, devolve a frase em português', async () => {
    auth.getUser.mockResolvedValue({
      data: { user: null },
      error: { name: 'AuthApiError', code: 'bad_jwt', message: 'invalid claim: missing sub claim' },
    })
    auth.refreshSession.mockResolvedValue({ data: { session: null }, error: { message: 'Invalid Refresh Token' } })
    const r = await svc.enrollTotp()
    expect(r).toMatchObject({ ok: false, code: svc.SESSAO_EXPIRADA, message: EXPIROU })
    expect(auth.refreshSession).toHaveBeenCalledTimes(1)
    expect(auth.mfa.enroll).not.toHaveBeenCalled()
  })

  it('MFA com sessão velha que a renovação salva segue para o enroll', async () => {
    auth.getUser.mockResolvedValue({ data: { user: null }, error: { message: 'invalid claim: missing sub claim' } })
    auth.refreshSession.mockResolvedValue({ data: { session: { access_token: 'novo' } }, error: null })
    auth.mfa.enroll.mockResolvedValue({ data: { id: 'f1', totp: { qr_code: '<svg/>', secret: 'ABC' } }, error: null })
    expect(await svc.enrollTotp()).toMatchObject({ ok: true, factorId: 'f1' })
  })

  it('erro de sessão vindo do próprio MFA (jwt expired, session_not_found) vira a frase, nunca o inglês cru', async () => {
    auth.mfa.enroll.mockResolvedValue({ data: null, error: { message: 'JWT expired' } })
    expect(await svc.enrollTotp()).toMatchObject({ ok: false, code: svc.SESSAO_EXPIRADA, message: EXPIROU })
    auth.mfa.challenge.mockResolvedValue({
      data: null,
      error: { code: 'session_not_found', message: 'Session not found' },
    })
    expect(await svc.confirmTotp('f1', '123456')).toMatchObject({ ok: false, code: svc.SESSAO_EXPIRADA })
    auth.mfa.unenroll.mockResolvedValue({ error: { message: 'invalid claim: missing sub claim' } })
    expect(await svc.unenrollTotp('f1')).toMatchObject({ ok: false, code: svc.SESSAO_EXPIRADA, message: EXPIROU })
  })

  it('outro erro do MFA passa como veio; falha de rede no getUser não vira "sessão expirada"', async () => {
    auth.getUser.mockResolvedValue({
      data: { user: null },
      error: { name: 'AuthRetryableFetchError', message: 'fetch failed' },
    })
    auth.mfa.unenroll.mockResolvedValue({ error: { message: 'Factor not found' } })
    expect(await svc.unenrollTotp('f1')).toEqual({ ok: false, message: 'Factor not found' })
    expect(auth.refreshSession).not.toHaveBeenCalled()
  })

  it('ehErroDeSessao reconhece os erros conhecidos e só eles', () => {
    expect(svc.ehErroDeSessao({ message: 'invalid claim: missing sub claim' })).toBe(true)
    expect(svc.ehErroDeSessao({ code: 'session_not_found', message: '' })).toBe(true)
    expect(svc.ehErroDeSessao({ message: 'JWT expired' })).toBe(true)
    expect(svc.ehErroDeSessao({ name: 'AuthSessionMissingError', message: 'Auth session missing!' })).toBe(true)
    expect(svc.ehErroDeSessao({ message: 'Invalid TOTP code entered' })).toBe(false)
    expect(svc.ehErroDeSessao(null)).toBe(false)
  })
})
