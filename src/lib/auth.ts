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
import { AUTH_CALLBACK_PATH } from './authCallback';
import { ehSessaoAnonima } from './convidado';
import { t } from './i18n';
import { supabase } from './supabase';

export type AuthProvider = 'google' | 'facebook';

export interface AuthResult {
  ok: boolean;
  /** Mensagem pronta p/ UI, já no idioma da interface. Genérica em login/reset. */
  message?: string;
  /** Cadastro sem sessão → precisa confirmar o e-mail antes de entrar. */
  needsEmailConfirm?: boolean;
  /**
   * O código do erro do Supabase ao ENTRAR — só para a porta (`Login.tsx`) reconhecer
   * `captcha_failed`, trocar a mensagem genérica e reiniciar o widget. A frase do captcha mora lá,
   * no pedaço carregado sob demanda: este arquivo entra no pacote inicial, e cada byte aqui conta.
   */
  code?: string;
}

/* AS MENSAGENS SÃO A CHAVE DO CATÁLOGO (o português, ver `lib/i18n.ts`) e passam por `t()` NA HORA
   de devolver, não aqui em cima: traduzida na carga do módulo, a frase ficaria presa ao idioma
   daquele instante — o catálogo chega depois, por `fetch`, e a pessoa pode trocar de idioma. O
   erro que vem do Supabase (`error.message`) passa como veio: não é frase nossa. */
const NOT_CONFIGURED = 'Login não configurado neste ambiente.';
const INVALID_CREDS = 'E-mail ou senha incorretos.'; // genérica: não diz QUAL está errado
const CONVIDADO_CONFIRMA_EMAIL =
  'Enviamos um link para o seu e-mail. Depois de confirmar, defina a senha em Ajustes → Conta — o que você fez como convidado continua com você.';
const RESET_SENT = 'Se existir uma conta com esse e-mail, enviamos um link de recuperação.';
const CODIGO_INVALIDO = 'Código inválido. Tente de novo.';

const naoConfigurado = () => ({ ok: false, message: t(NOT_CONFIGURED) });

/**
 * CAPTCHA (Cloudflare Turnstile). Com a proteção ligada no painel do Supabase, é o servidor DELE que
 * confere a resposta do desafio; o cliente só a manda em `options.captchaToken` ao entrar, criar
 * conta e recuperar senha. Quem tem a resposta é a porta (`Login.tsx`), e ela a passa já neste
 * formato; sem captcha (build sem `VITE_TURNSTILE_SITE_KEY`) não passa nada, e o pedido que sai
 * pela rede é o mesmo de antes.
 */
export interface OpcoesDeCaptcha {
  captchaToken?: string;
}

/**
 * O MÍNIMO DA SENHA é o do Supabase de produção (docs/LANCAMENTO.md, passo 3: 8 caracteres, com a
 * proteção contra senha vazada). A porta dizia 6 — quem digitava 6 ou 7 passava no navegador e
 * levava um erro em inglês do servidor. As telas de senha leem daqui.
 */
export const SENHA_MINIMA = 8;
/**
 * A CHAVE da mensagem de senha curta, com `{n}` no lugar do mínimo — não a frase pronta. Quem mostra
 * escreve `t(SENHA_CURTA, { n: SENHA_MINIMA })`: com o número dentro da chave, cada mudança do
 * mínimo orfanaria a tradução, e o tradutor não teria como pôr o número onde o idioma dele pede.
 */
export const SENHA_CURTA = 'A senha precisa ter pelo menos {n} caracteres.';
const SENHA_VAZADA = 'Essa senha já apareceu em vazamentos de dados conhecidos. Escolha outra, só sua.';
const SENHA_FRACA = 'Senha fraca: use pelo menos {n} caracteres, misturando letras e números.';

/**
 * O erro de senha do Supabase (`AuthWeakPasswordError`, `code: 'weak_password'`, com `reasons`)
 * vem em inglês; o resto passa como veio.
 */
function mensagemDoErroDeSenha(error: { message: string; code?: string; name?: string; reasons?: string[] }): string {
  const curta = () => t(SENHA_CURTA, { n: SENHA_MINIMA });
  const fraca = error.code === 'weak_password' || error.name === 'AuthWeakPasswordError';
  if (!fraca) return /at least \d+ characters/i.test(error.message) ? curta() : error.message;
  const motivos = error.reasons ?? [];
  if (motivos.includes('pwned')) return t(SENHA_VAZADA);
  if (motivos.includes('length')) return curta();
  return t(SENHA_FRACA, { n: SENHA_MINIMA });
}

/**
 * Para onde o link de CONFIRMAÇÃO DO E-MAIL leva: o mesmo `/auth/callback` do Google, onde a
 * intenção guardada antes do login é consumida (`lib/intencaoDeLogin`). Sem isto o Supabase usava
 * a Site URL do painel — a raiz — e a pessoa caía no Início. Precisa estar na allowlist de
 * redirecionamento do painel, como o callback do Google já está.
 */
function retornoDaConfirmacao(): string | undefined {
  return typeof window !== 'undefined' ? `${window.location.origin}${AUTH_CALLBACK_PATH}` : undefined;
}

/** E-mail + senha. Erro → mensagem genérica (anti-enumeração). */
export async function signInEmail(email: string, password: string, options?: OpcoesDeCaptcha): Promise<AuthResult> {
  if (!supabase) return naoConfigurado();
  const { error } = await supabase.auth.signInWithPassword({ email, password, options });
  return error ? { ok: false, message: t(INVALID_CREDS), code: error.code } : { ok: true };
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

export const EMAIL_JA_CADASTRADO = 'email_ja_cadastrado';
const EMAIL_JA_TEM_CONTA = 'Este e-mail já tem conta. Entre com a sua senha ou use "Esqueci" para definir uma nova.';

/**
 * O BOTÃO DO GOOGLE só aparece se o provedor estiver ligado no Supabase do build. `VITE_LOGIN_GOOGLE=0`
 * o esconde (clicar com o provedor desligado cai numa página de erro crua do Supabase).
 */
export const googleLigado = (): boolean => import.meta.env.VITE_LOGIN_GOOGLE !== '0';

/**
 * Criar conta. Sem sessão de volta → verificação por e-mail pendente.
 *
 * CONVIDADO COM SESSÃO ANÔNIMA: vincula o e-mail ao MESMO usuário (`updateUser({ email })`). O
 * Supabase só aceita senha DEPOIS de o e-mail ser confirmado — então a senha digitada não é enviada
 * aqui; a tela avisa que ela é definida depois da confirmação (em Ajustes → Conta, ou pelo "esqueci a
 * senha"). Guardar a senha no aparelho até lá seria pior do que pedir de novo.
 */
export async function signUpEmail(email: string, password: string, options?: OpcoesDeCaptcha): Promise<AuthResult> {
  if (!supabase) return naoConfigurado();
  const emailRedirectTo = retornoDaConfirmacao();
  if (await sessaoAnonimaAtiva()) {
    const { error } = await supabase.auth.updateUser({ email }, emailRedirectTo ? { emailRedirectTo } : undefined);
    if (error) return { ok: false, message: error.message };
    return { ok: true, needsEmailConfirm: true, message: t(CONVIDADO_CONFIRMA_EMAIL) };
  }
  const { data, error } = await supabase.auth.signUp({ email, password, options: { emailRedirectTo, ...options } });
  // Captcha recusado: a mensagem do Supabase passa como veio, e a porta a reconhece pela palavra.
  if (error) return { ok: false, message: mensagemDoErroDeSenha(error) };
  /* E-MAIL QUE JÁ TEM CONTA: com a confirmação por e-mail ligada o Supabase responde "sucesso" e não
     manda nada; o sinal é o usuário vir sem identidades. Dizer "confirme pelo link" deixava a pessoa
     esperando um e-mail que nunca chega. */
  if (data.user && data.user.identities?.length === 0)
    return { ok: false, code: EMAIL_JA_CADASTRADO, message: t(EMAIL_JA_TEM_CONTA) };
  if (!data.session) return { ok: true, needsEmailConfirm: true };
  return { ok: true };
}

/** Login social (redireciona o browser). O `redirectTo` deve estar na allowlist do painel Supabase. */
export async function signInWithProvider(provider: AuthProvider, redirectTo?: string): Promise<AuthResult> {
  if (!supabase) return naoConfigurado();
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
  return error
    ? { ok: false, message: t('Não foi possível iniciar o login com {provedor}.', { provedor: provider }) }
    : { ok: true };
}

/**
 * Recuperação de senha. SEMPRE devolve ok+genérico (não revela se o e-mail existe) — menos quando
 * o CAPTCHA é recusado: aí nada foi enviado para ninguém, a recusa não diz nada sobre o e-mail, e
 * responder "enviamos um link" seria mentira. É o ÚNICO caso de `ok: false` aqui, e nenhum código
 * de erro sai desta função.
 */
export async function sendPasswordReset(
  email: string,
  redirectTo?: string,
  options?: OpcoesDeCaptcha,
): Promise<AuthResult> {
  if (!supabase) return naoConfigurado();
  let code: string | undefined;
  try {
    code = (await supabase.auth.resetPasswordForEmail(email, { redirectTo, ...options })).error?.code;
  } catch {
    /* silencioso de propósito: anti-enumeração */
  }
  return { ok: code !== 'captcha_failed', message: t(RESET_SENT) };
}

/** Define a nova senha (a partir do link de recuperação, ou em Conta). */
export async function updatePassword(newPassword: string): Promise<AuthResult> {
  if (!supabase) return naoConfigurado();
  const { error } = await supabase.auth.updateUser({ password: newPassword });
  return error ? { ok: false, message: mensagemDoErroDeSenha(error) } : { ok: true };
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
  if (!supabase) return naoConfigurado();
  const { data, error } = await supabase.auth.mfa.enroll({ factorType: 'totp', friendlyName });
  if (error) return { ok: false, message: error.message };
  return { ok: true, factorId: data.id, qrSvg: data.totp.qr_code, secret: data.totp.secret };
}

/** Confirma o fator (challenge + verify) com o código do app — ativa o 2FA. */
export async function confirmTotp(factorId: string, code: string): Promise<AuthResult> {
  if (!supabase) return naoConfigurado();
  const ch = await supabase.auth.mfa.challenge({ factorId });
  if (ch.error) return { ok: false, message: ch.error.message };
  const { error } = await supabase.auth.mfa.verify({ factorId, challengeId: ch.data.id, code });
  return error ? { ok: false, message: t(CODIGO_INVALIDO) } : { ok: true };
}

/** Remove um fator (desabilitar 2FA). */
export async function unenrollTotp(factorId: string): Promise<AuthResult> {
  if (!supabase) return naoConfigurado();
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
  if (!supabase) return naoConfigurado();
  const { data } = await supabase.auth.mfa.listFactors();
  const fator = (data?.totp ?? []).find((f: { status?: string }) => f.status === 'verified') as
    | { id: string }
    | undefined;
  if (!fator) return { ok: false, message: t('Nenhum app autenticador ativo nesta conta.') };
  const ch = await supabase.auth.mfa.challenge({ factorId: fator.id });
  if (ch.error) return { ok: false, message: t('Não foi possível iniciar a verificação. Tente de novo.') };
  const { error } = await supabase.auth.mfa.verify({ factorId: fator.id, challengeId: ch.data.id, code });
  return error ? { ok: false, message: t(CODIGO_INVALIDO) } : { ok: true };
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
