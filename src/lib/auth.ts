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
import { ehSessaoAnonima } from './convidado';
import { supabase } from './supabase';

export type AuthProvider = 'google' | 'facebook';

export interface AuthResult {
  ok: boolean;
  /** Mensagem pronta p/ UI. Genérica em login/reset. */
  message?: string;
  /** Cadastro sem sessão → precisa confirmar o e-mail antes de entrar. */
  needsEmailConfirm?: boolean;
}

const NOT_CONFIGURED = 'Login não configurado neste ambiente.';
const INVALID_CREDS = 'E-mail ou senha incorretos.'; // genérica: não diz QUAL está errado
const CONVIDADO_CONFIRMA_EMAIL =
  'Enviamos um link para o seu e-mail. Depois de confirmar, defina a senha em Ajustes → Conta — o que você fez como convidado continua com você.';
const RESET_SENT = 'Se existir uma conta com esse e-mail, enviamos um link de recuperação.';

/** E-mail + senha. Erro → mensagem genérica (anti-enumeração). */
export async function signInEmail(email: string, password: string): Promise<AuthResult> {
  if (!supabase) return { ok: false, message: NOT_CONFIGURED };
  const { error } = await supabase.auth.signInWithPassword({ email, password });
  return error ? { ok: false, message: INVALID_CREDS } : { ok: true };
}

/**
 * O convidado (Fase 7) tem sessão ANÔNIMA do Supabase? Então criar conta é CONVERTER essa sessão —
 * `updateUser`/`linkIdentity` mantêm o mesmo id, e a cota/contadores do servidor seguem com a pessoa.
 * Um `signUp` comum criaria OUTRO usuário e deixaria o anônimo órfão (a limpeza de 30 dias o leva).
 */
async function sessaoAnonimaAtiva(): Promise<boolean> {
  if (!supabase) return false;
  try {
    const { data } = await supabase.auth.getSession();
    return ehSessaoAnonima(data.session);
  } catch {
    return false;
  }
}

/**
 * Criar conta. Sem sessão de volta → verificação por e-mail pendente.
 *
 * CONVIDADO COM SESSÃO ANÔNIMA: vincula o e-mail ao MESMO usuário (`updateUser({ email })`). O
 * Supabase só aceita senha DEPOIS de o e-mail ser confirmado — então a senha digitada não é enviada
 * aqui; a tela avisa que ela é definida depois da confirmação (em Ajustes → Conta, ou pelo "esqueci a
 * senha"). Guardar a senha no aparelho até lá seria pior do que pedir de novo.
 */
export async function signUpEmail(email: string, password: string): Promise<AuthResult> {
  if (!supabase) return { ok: false, message: NOT_CONFIGURED };
  if (await sessaoAnonimaAtiva()) {
    const { error } = await supabase.auth.updateUser({ email });
    if (error) return { ok: false, message: error.message };
    return { ok: true, needsEmailConfirm: true, message: CONVIDADO_CONFIRMA_EMAIL };
  }
  const { data, error } = await supabase.auth.signUp({ email, password });
  if (error) return { ok: false, message: error.message };
  if (!data.session) return { ok: true, needsEmailConfirm: true };
  return { ok: true };
}

/** Login social (redireciona o browser). O `redirectTo` deve estar na allowlist do painel Supabase. */
export async function signInWithProvider(provider: AuthProvider, redirectTo?: string): Promise<AuthResult> {
  if (!supabase) return { ok: false, message: NOT_CONFIGURED };
  /* Convidado com sessão anônima: vincula o provedor ao MESMO usuário (exige "manual linking" no
     painel do Supabase). Se o Google já for de outra conta, o Supabase recusa — aí é LOGIN naquela
     conta, pelo caminho normal abaixo, e os dados do aparelho sobem pelo `ModalDeMigracao`. */
  if (await sessaoAnonimaAtiva()) {
    const { error } = await supabase.auth.linkIdentity({
      provider,
      ...(redirectTo ? { options: { redirectTo } } : {}),
    });
    if (!error) return { ok: true };
  }
  const { error } = await supabase.auth.signInWithOAuth({
    provider,
    ...(redirectTo ? { options: { redirectTo } } : {}),
  });
  return error ? { ok: false, message: `Não foi possível iniciar o login com ${provider}.` } : { ok: true };
}

/** Recuperação de senha. SEMPRE devolve ok+genérico (não revela se o e-mail existe). */
export async function sendPasswordReset(email: string, redirectTo?: string): Promise<AuthResult> {
  if (!supabase) return { ok: false, message: NOT_CONFIGURED };
  try {
    await supabase.auth.resetPasswordForEmail(email, redirectTo ? { redirectTo } : undefined);
  } catch {
    /* silencioso de propósito: anti-enumeração */
  }
  return { ok: true, message: RESET_SENT };
}

/** Define a nova senha (a partir do link de recuperação, ou em Conta). */
export async function updatePassword(newPassword: string): Promise<AuthResult> {
  if (!supabase) return { ok: false, message: NOT_CONFIGURED };
  const { error } = await supabase.auth.updateUser({ password: newPassword });
  return error ? { ok: false, message: error.message } : { ok: true };
}

export async function signOut(): Promise<void> {
  if (supabase) await supabase.auth.signOut();
}

// ── 2FA / MFA (TOTP) ─────────────────────────────────────────────────────────
export interface MfaEnroll {
  ok: boolean;
  message?: string;
  factorId?: string;
  qrSvg?: string;
  secret?: string;
}

/** Inicia o cadastro de um fator TOTP: devolve o QR (SVG) + segredo p/ o app autenticador. */
export async function enrollTotp(friendlyName = 'App autenticador'): Promise<MfaEnroll> {
  if (!supabase) return { ok: false, message: NOT_CONFIGURED };
  const { data, error } = await supabase.auth.mfa.enroll({ factorType: 'totp', friendlyName });
  if (error) return { ok: false, message: error.message };
  return { ok: true, factorId: data.id, qrSvg: data.totp.qr_code, secret: data.totp.secret };
}

/** Confirma o fator (challenge + verify) com o código do app — ativa o 2FA. */
export async function confirmTotp(factorId: string, code: string): Promise<AuthResult> {
  if (!supabase) return { ok: false, message: NOT_CONFIGURED };
  const ch = await supabase.auth.mfa.challenge({ factorId });
  if (ch.error) return { ok: false, message: ch.error.message };
  const { error } = await supabase.auth.mfa.verify({ factorId, challengeId: ch.data.id, code });
  return error ? { ok: false, message: 'Código inválido. Tente de novo.' } : { ok: true };
}

/** Remove um fator (desabilitar 2FA). */
export async function unenrollTotp(factorId: string): Promise<AuthResult> {
  if (!supabase) return { ok: false, message: NOT_CONFIGURED };
  const { error } = await supabase.auth.mfa.unenroll({ factorId });
  return error ? { ok: false, message: error.message } : { ok: true };
}

/**
 * SEGUNDA ETAPA DO LOGIN (Fase 6 — 2FA de verdade).
 *
 * Senha e Google entregam uma sessão `aal1`. Se a conta tem um fator TOTP verificado, o Supabase
 * diz que o próximo nível é `aal2`, e o servidor recusa as rotas sensíveis até lá
 * (`server/lib/aal.ts`). Esta pergunta é o que faz o App mostrar o desafio do código logo depois
 * do login, em vez de a pessoa descobrir o 2FA num 403 no meio de um cancelamento.
 */
export async function precisaDoSegundoFator(): Promise<boolean> {
  if (!supabase) return false;
  try {
    const { data } = await supabase.auth.mfa.getAuthenticatorAssuranceLevel();
    return data?.nextLevel === 'aal2' && data?.currentLevel !== 'aal2';
  } catch {
    return false;
  }
}

/** Verifica o código do app autenticador no login e eleva a sessão para `aal2`. */
export async function verificarSegundoFator(code: string): Promise<AuthResult> {
  if (!supabase) return { ok: false, message: NOT_CONFIGURED };
  const { data } = await supabase.auth.mfa.listFactors();
  const fator = (data?.totp ?? []).find((f: { status?: string }) => f.status === 'verified') as
    | { id: string }
    | undefined;
  if (!fator) return { ok: false, message: 'Nenhum app autenticador ativo nesta conta.' };
  const ch = await supabase.auth.mfa.challenge({ factorId: fator.id });
  if (ch.error) return { ok: false, message: 'Não foi possível iniciar a verificação. Tente de novo.' };
  const { error } = await supabase.auth.mfa.verify({ factorId: fator.id, challengeId: ch.data.id, code });
  return error ? { ok: false, message: 'Código inválido. Tente de novo.' } : { ok: true };
}

export interface TotpFactor {
  id: string;
  friendlyName?: string;
  verified: boolean;
}

/** Lista os fatores TOTP do usuário (p/ a tela de Conta/Segurança saber se o 2FA está ativo). */
export async function listTotpFactors(): Promise<TotpFactor[]> {
  if (!supabase) return [];
  const { data } = await supabase.auth.mfa.listFactors();
  const totp = (data?.totp ?? []) as Array<{ id: string; friendly_name?: string; status?: string }>;
  return totp.map((f) => ({ id: f.id, friendlyName: f.friendly_name, verified: f.status === 'verified' }));
}
