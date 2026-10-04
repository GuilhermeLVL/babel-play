/**
 * O QUE SÓ A PORTA DE ENTRADA USA: as frases dos erros do Supabase, o reenvio do e-mail de confirmação,
 * o e-mail lembrado no aparelho, os requisitos da senha e o erro que um link vencido traz na URL.
 *
 * Mora fora de `auth.ts` de propósito: aquele arquivo entra no pacote inicial, e a porta (`Login`,
 * `ResetPassword`) é carregada sob demanda.
 */
import type { AuthResult, OpcoesDeCaptcha } from './auth';
import { AUTH_CALLBACK_PATH, CHAVE_DO_ERRO_DO_LINK } from './authCallback';
import { t } from './i18n';
import { supabase } from './supabase';

/* As frases são a CHAVE do catálogo e passam por `t()` na hora de mostrar (ver `auth.ts`). */
const LIMITE = 'Muitas tentativas em pouco tempo. Aguarde alguns minutos e tente de novo.';
const LIMITE_DE_EMAIL =
  'O limite de e-mails desta hora foi atingido. Aguarde alguns minutos e peça de novo, o link anterior continua valendo.';
const SEM_REDE = 'Sem conexão com o servidor de login. Confira a internet e tente de novo.';
const NAO_CONFIRMADO = 'Seu e-mail ainda não foi confirmado. Abra o link que enviamos ou peça um novo.';
const EMAIL_INVALIDO = 'Esse e-mail não parece válido. Confira se digitou certo.';
const CONTA_SUSPENSA = 'Esta conta está suspensa. Fale com o suporte.';
const CADASTRO_FECHADO = 'O cadastro de contas novas está pausado no momento.';
const LINK_VENCIDO =
  'Esse link expirou ou já foi usado. Para trocar a senha, use "Esqueci"; para confirmar o cadastro, entre e peça um novo e-mail.';
const LINK_RECUSADO = 'Não foi possível concluir pelo link. Peça um novo e-mail e abra no mesmo navegador.';

/** O código que a porta usa para "o e-mail ainda não foi confirmado" (oferece o reenvio). */
export const EMAIL_NAO_CONFIRMADO = 'email_not_confirmed';

/** A frase do erro, pelo código do Supabase; `null` quando a tela deve usar a mensagem que já tem. */
export function mensagemDoCodigo(code?: string): string | null {
  switch (code) {
    case EMAIL_NAO_CONFIRMADO:
      return t(NAO_CONFIRMADO);
    case 'over_email_send_rate_limit':
      return t(LIMITE_DE_EMAIL);
    case 'over_request_rate_limit':
      return t(LIMITE);
    case 'sem_rede':
      return t(SEM_REDE);
    case 'email_address_invalid':
    case 'email_address_not_authorized':
      return t(EMAIL_INVALIDO);
    case 'user_banned':
      return t(CONTA_SUSPENSA);
    case 'signup_disabled':
    case 'email_provider_disabled':
      return t(CADASTRO_FECHADO);
    default:
      return null;
  }
}

/** O link de confirmação ou de recuperação voltou com erro (vencido, já usado, aberto em outro navegador). */
export function consumirErroDoLink(): string | null {
  try {
    const code = sessionStorage.getItem(CHAVE_DO_ERRO_DO_LINK);
    if (!code) return null;
    sessionStorage.removeItem(CHAVE_DO_ERRO_DO_LINK);
    return t(code === 'otp_expired' ? LINK_VENCIDO : LINK_RECUSADO);
  } catch {
    return null;
  }
}

/** Manda de novo o e-mail de confirmação do cadastro. */
export async function reenviarConfirmacao(email: string, options?: OpcoesDeCaptcha): Promise<AuthResult> {
  if (!supabase) return { ok: false };
  const emailRedirectTo = typeof window !== 'undefined' ? `${window.location.origin}${AUTH_CALLBACK_PATH}` : undefined;
  try {
    const { error } = await supabase.auth.resend({ type: 'signup', email, options: { emailRedirectTo, ...options } });
    return error ? { ok: false, code: error.code, message: error.message } : { ok: true };
  } catch {
    return { ok: false, code: 'sem_rede' };
  }
}

/* ── O E-MAIL LEMBRADO NESTE APARELHO (a senha é do gerenciador do navegador, nunca nossa) ─────── */
const CHAVE_DO_EMAIL = 'babel.login.email';

export function emailLembrado(): string {
  try {
    return localStorage.getItem(CHAVE_DO_EMAIL) ?? '';
  } catch {
    return '';
  }
}

export function lembrarEmail(email: string | null): void {
  try {
    if (email) localStorage.setItem(CHAVE_DO_EMAIL, email);
    else localStorage.removeItem(CHAVE_DO_EMAIL);
  } catch {
    /* sem armazenamento: a pessoa digita de novo */
  }
}

/** O que a senha nova já cumpre. Só o tamanho é exigido; letras e números são a recomendação. */
export function requisitosDaSenha(
  senha: string,
  minimo: number,
): { tamanho: boolean; letra: boolean; numero: boolean } {
  return { tamanho: senha.length >= minimo, letra: /\p{L}/u.test(senha), numero: /\d/.test(senha) };
}

/** Segundos entre um pedido de e-mail e o próximo (o Supabase recusa antes de 60 s). */
export const ESPERA_DO_REENVIO = 60;
