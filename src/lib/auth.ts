/**
 * Serviço de autenticação (cliente) — camada fina e ÚNICA sobre o Supabase Auth. As telas só chamam
 * estas funções; o tratamento de erro fica aqui, consistente e SEGURO por desenho:
 *  - login e recuperação usam mensagem GENÉRICA (nunca revelam se o e-mail existe → anti-enumeração,
 *    OWASP ASVS V2.1/V2.5);
 *  - sem Supabase configurado (self-host), tudo devolve "não configurado" e nada acontece.
 *
 * Identidade/senha/MFA são do SUPABASE — não reimplementamos segurança. Ver docs/auth/auth-flow-design.md.
 * Nota: a API de MFA (enroll/challenge/verify) segue o SDK atual do @supabase/supabase-js; revalidar
 * contra a doc do Supabase ao ligar de verdade (o MCP tem `search_docs`).
 */
import { supabase } from './supabase'

export type AuthProvider = 'google' | 'facebook'

export interface AuthResult {
  ok: boolean
  /** Mensagem pronta p/ UI. Genérica em login/reset. */
  message?: string
  /** Cadastro sem sessão → precisa confirmar o e-mail antes de entrar. */
  needsEmailConfirm?: boolean
}

const NOT_CONFIGURED = 'Login não configurado neste ambiente.'
const INVALID_CREDS = 'E-mail ou senha incorretos.' // genérica: não diz QUAL está errado
const RESET_SENT = 'Se existir uma conta com esse e-mail, enviamos um link de recuperação.'

/** E-mail + senha. Erro → mensagem genérica (anti-enumeração). */
export async function signInEmail(email: string, password: string): Promise<AuthResult> {
  if (!supabase) return { ok: false, message: NOT_CONFIGURED }
  const { error } = await supabase.auth.signInWithPassword({ email, password })
  return error ? { ok: false, message: INVALID_CREDS } : { ok: true }
}

/** Criar conta. Sem sessão de volta → verificação por e-mail pendente. */
export async function signUpEmail(email: string, password: string): Promise<AuthResult> {
  if (!supabase) return { ok: false, message: NOT_CONFIGURED }
  const { data, error } = await supabase.auth.signUp({ email, password })
  if (error) return { ok: false, message: error.message }
  if (!data.session) return { ok: true, needsEmailConfirm: true }
  return { ok: true }
}

/** Login social (redireciona o browser). O `redirectTo` deve estar na allowlist do painel Supabase. */
export async function signInWithProvider(provider: AuthProvider, redirectTo?: string): Promise<AuthResult> {
  if (!supabase) return { ok: false, message: NOT_CONFIGURED }
  const { error } = await supabase.auth.signInWithOAuth({
    provider,
    ...(redirectTo ? { options: { redirectTo } } : {}),
  })
  return error ? { ok: false, message: `Não foi possível iniciar o login com ${provider}.` } : { ok: true }
}

/** Recuperação de senha. SEMPRE devolve ok+genérico (não revela se o e-mail existe). */
export async function sendPasswordReset(email: string, redirectTo?: string): Promise<AuthResult> {
  if (!supabase) return { ok: false, message: NOT_CONFIGURED }
  try {
    await supabase.auth.resetPasswordForEmail(email, redirectTo ? { redirectTo } : undefined)
  } catch { /* silencioso de propósito: anti-enumeração */ }
  return { ok: true, message: RESET_SENT }
}

/** Define a nova senha (a partir do link de recuperação, ou em Conta). */
export async function updatePassword(newPassword: string): Promise<AuthResult> {
  if (!supabase) return { ok: false, message: NOT_CONFIGURED }
  const { error } = await supabase.auth.updateUser({ password: newPassword })
  return error ? { ok: false, message: error.message } : { ok: true }
}

export async function signOut(): Promise<void> {
  if (supabase) await supabase.auth.signOut()
}

// ── 2FA / MFA (TOTP) ─────────────────────────────────────────────────────────
export interface MfaEnroll { ok: boolean; message?: string; factorId?: string; qrSvg?: string; secret?: string }

/** Inicia o cadastro de um fator TOTP: devolve o QR (SVG) + segredo p/ o app autenticador. */
export async function enrollTotp(friendlyName = 'App autenticador'): Promise<MfaEnroll> {
  if (!supabase) return { ok: false, message: NOT_CONFIGURED }
  const { data, error } = await supabase.auth.mfa.enroll({ factorType: 'totp', friendlyName })
  if (error) return { ok: false, message: error.message }
  return { ok: true, factorId: data.id, qrSvg: data.totp.qr_code, secret: data.totp.secret }
}

/** Confirma o fator (challenge + verify) com o código do app — ativa o 2FA. */
export async function confirmTotp(factorId: string, code: string): Promise<AuthResult> {
  if (!supabase) return { ok: false, message: NOT_CONFIGURED }
  const ch = await supabase.auth.mfa.challenge({ factorId })
  if (ch.error) return { ok: false, message: ch.error.message }
  const { error } = await supabase.auth.mfa.verify({ factorId, challengeId: ch.data.id, code })
  return error ? { ok: false, message: 'Código inválido. Tente de novo.' } : { ok: true }
}

/** Responde ao desafio de 2FA no login (mesma mecânica do confirm). */
export const verifyTotpChallenge = confirmTotp

/** Remove um fator (desabilitar 2FA). */
export async function unenrollTotp(factorId: string): Promise<AuthResult> {
  if (!supabase) return { ok: false, message: NOT_CONFIGURED }
  const { error } = await supabase.auth.mfa.unenroll({ factorId })
  return error ? { ok: false, message: error.message } : { ok: true }
}

export interface TotpFactor { id: string; friendlyName?: string; verified: boolean }

/** Lista os fatores TOTP do usuário (p/ a tela de Conta/Segurança saber se o 2FA está ativo). */
export async function listTotpFactors(): Promise<TotpFactor[]> {
  if (!supabase) return []
  const { data } = await supabase.auth.mfa.listFactors()
  const totp = (data?.totp ?? []) as Array<{ id: string; friendly_name?: string; status?: string }>
  return totp.map((f) => ({ id: f.id, friendlyName: f.friendly_name, verified: f.status === 'verified' }))
}
