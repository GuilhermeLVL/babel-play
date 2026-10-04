/**
 * Porta de entrada (front-door split). Só aparece no modo público (VITE_AUTH_REQUIRED=1 com Supabase
 * configurado); no self-host o App nunca a monta. Três modos: entrar · criar conta · recuperar senha.
 * Social (Google/Facebook) + e-mail/senha. Toda a lógica de auth vem de `src/lib/auth.ts` (mensagens
 * genéricas por segurança). Após entrar, o `onAuthStateChange` no App troca a tela sozinho.
 */
import { CircleAlert, CircleCheck, Info, LoaderCircle, TriangleAlert } from 'lucide-react';
import React, { Suspense, useEffect, useState } from 'react';

import { lerAbertura } from '../data/rotas/idade';
import * as auth from '../lib/auth';
import { useQuestNovo } from '../lib/dispositivo/telaNovaDoQuest';
import { t } from '../lib/i18n';
import { lazyComRecarga } from '../lib/lazyComRecarga';
import { supabase } from '../lib/supabase';
import { T } from '../lib/T';
import { chaveDoTurnstile } from '../lib/turnstile';
import AuthShell from './auth/AuthShell';
import PasswordField from './auth/PasswordField';
import CascaDeEntradaDoQuest from './auth/quest/CascaDeEntradaDoQuest';

/* O widget do captcha só é baixado quando a porta abre num build com `VITE_TURNSTILE_SITE_KEY`. */
const CaptchaDaPorta = lazyComRecarga(() => import('./auth/CaptchaDaPorta'));

type Mode = 'login' | 'signup' | 'forgot';

/* As frases do captcha moram aqui (a porta é carregada sob demanda), não em `lib/auth.ts`. */
const CAPTCHA_PENDENTE = 'Conclua a verificação de segurança para continuar.';
/** O código com que o Supabase recusa a resposta do desafio (vencida, repetida ou ausente). */
const CAPTCHA_FALHOU = 'captcha_failed';
const CAPTCHA_RECUSADO = 'A verificação de segurança não foi aceita. Refaça a verificação e tente de novo.';

/* As tabelas guardam a CHAVE (o português); quem traduz é o ponto de uso, `t(TITULO[modo])` —
   traduzir aqui, na carga do módulo, prenderia a frase ao idioma daquele instante. */
const TITULO: Record<Mode, string> = { login: 'Entrar', signup: 'Criar conta', forgot: 'Recuperar senha' };
const SUB: Record<Mode, string> = {
  login: 'Bem-vindo de volta.',
  signup: 'Comece em segundos, sua conta, seus dados.',
  forgot: 'Enviamos um link de redefinição por e-mail.',
};

/**
 * ENTRAR COM GOOGLE (mudança porta-de-entrada, decisão do dono: e-mail+senha e Google).
 *
 * Era uma constante `false` com os handlers já escritos — pronto e desligado. Agora deriva do
 * ambiente: existe quando existe Supabase configurado, que é a mesma condição que faz a tela
 * inteira funcionar. Um botão que aparece sem provedor por trás seria pior do que não aparecer.
 *
 * FACEBOOK saiu do lançamento por decisão do dono (`src/lib/auth.ts` continua aceitando os dois —
 * é um botão de voltar, não um retrabalho).
 */

interface LoginProps {
  /**
   * Soft gate (D10): quando presente, a porta oferece seguir SEM conta — transcrição, tradução e
   * jogos sobre a sessão atual rodam inteiros no navegador. Ausente no fluxo de recuperação.
   */
  onContinuarSemConta?: () => void;
}

export default function Login({ onContinuarSemConta }: LoginProps = {}) {
  const [modo, setModo] = useState<Mode>('login');
  const [email, setEmail] = useState('');
  const [senha, setSenha] = useState('');
  const [erro, setErro] = useState<string | null>(null);
  const [aviso, setAviso] = useState<string | null>(null);
  const [carregando, setCarregando] = useState(false);
  /* SIGNUP_ENABLED=0 no servidor (Fase 3 — chave de emergência): a porta de "Criar conta" some e a
     tela explica. Quem já tem conta continua entrando; o servidor recusa conta nova de qualquer jeito. */
  const [cadastroAberto, setCadastroAberto] = useState(true);
  const questNovo = useQuestNovo();
  useEffect(() => {
    let vivo = true;
    void lerAbertura().then((a) => {
      if (!vivo) return;
      setCadastroAberto(a.cadastro);
      if (!a.cadastro) setModo((m) => (m === 'signup' ? 'login' : m));
    });
    return () => {
      vivo = false;
    };
  }, []);

  const configurado = !!supabase;
  /* CAPTCHA (Turnstile): só existe com a chave pública no build. A resposta do desafio vale para UM
     envio — depois dele `rodadaDoCaptcha` muda e o widget recomeça. Quem confere é o Supabase. */
  const chaveDoCaptcha = configurado ? chaveDoTurnstile() : null;
  const [respostaDoCaptcha, setRespostaDoCaptcha] = useState<string | null>(null);
  const [rodadaDoCaptcha, setRodadaDoCaptcha] = useState(0);
  const redirectTo = typeof window !== 'undefined' ? `${window.location.origin}/auth/callback` : undefined;

  function trocaModo(m: Mode) {
    setModo(m);
    setErro(null);
    setAviso(null);
  }

  async function social(provider: 'google') {
    setErro(null);
    setCarregando(true);
    const r = await auth.signInWithProvider(provider, redirectTo);
    if (!r.ok) {
      setErro(r.message ?? t('Falha no login social.'));
      setCarregando(false);
    }
    // sucesso → o browser é redirecionado ao provedor; nada a fazer aqui.
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setErro(null);
    setAviso(null);
    setCarregando(true);
    /* Sem captcha as chamadas saem com os MESMOS argumentos de sempre: a resposta só entra, como
       último argumento, quando existe. */
    const comCaptcha: [] | [auth.OpcoesDeCaptcha] =
      chaveDoCaptcha && respostaDoCaptcha ? [{ captchaToken: respostaDoCaptcha }] : [];
    let gastouOCaptcha = false;
    try {
      if (chaveDoCaptcha && !comCaptcha.length) {
        setErro(t(CAPTCHA_PENDENTE));
        return;
      }
      if (modo === 'login') {
        gastouOCaptcha = true;
        const r = await auth.signInEmail(email, senha, ...comCaptcha);
        if (!r.ok) setErro(r.code === CAPTCHA_FALHOU ? t(CAPTCHA_RECUSADO) : (r.message ?? t('Falha ao entrar.')));
      } else if (modo === 'signup') {
        // O mínimo do Supabase de produção, conferido aqui: o `minLength` do campo não segura um
        // envio programático, e o erro do servidor chegaria em inglês.
        if (senha.length < auth.SENHA_MINIMA) {
          setErro(t(auth.SENHA_CURTA, { n: auth.SENHA_MINIMA }));
          return;
        }
        gastouOCaptcha = true;
        const r = await auth.signUpEmail(email, senha, ...comCaptcha);
        // No cadastro o erro do Supabase passa como veio (`auth.ts`): a recusa do captcha se reconhece pela palavra.
        if (!r.ok)
          setErro(/captcha/i.test(r.message ?? '') ? t(CAPTCHA_RECUSADO) : (r.message ?? t('Falha ao criar conta.')));
        else if (r.needsEmailConfirm)
          setAviso(r.message ?? t('Conta criada! Confirme pelo link enviado ao seu e-mail para entrar.'));
      } else {
        gastouOCaptcha = true;
        const r = await auth.sendPasswordReset(email, redirectTo, ...comCaptcha);
        // A recuperação só devolve `ok: false` quando o captcha foi recusado (nada foi enviado).
        if (!r.ok && chaveDoCaptcha) setErro(t(CAPTCHA_RECUSADO));
        else setAviso(r.message ?? t('Se existir uma conta, enviamos um link.'));
      }
    } finally {
      setCarregando(false);
      if (gastouOCaptcha && chaveDoCaptcha) {
        setRespostaDoCaptcha(null);
        setRodadaDoCaptcha((n) => n + 1);
      }
    }
  }

  /* O mesmo widget nos três modos e nos dois desenhos; o espaço fica reservado enquanto ele chega. */
  const widgetDoCaptcha = chaveDoCaptcha ? (
    <Suspense fallback={<div className="min-h-[65px]" />}>
      <CaptchaDaPorta
        sitekey={chaveDoCaptcha}
        rodada={rodadaDoCaptcha}
        onToken={setRespostaDoCaptcha}
        quest={questNovo}
      />
    </Suspense>
  ) : null;

  const heroRecuperar = {
    // A quebra de linha mora na frase: em outro idioma ela cai onde o tradutor puser o `<br>`.
    title: <T txt="Sem<br>estresse." />,
    subtitle: t('Enviamos um link seguro pro seu e-mail, você define uma nova senha e volta em segundos.'),
  };

  /* QUEST: os mesmos três modos, provedores, erros e saídas, nas medidas do headset. UM botão
     principal (o do formulário); Google e "sem conta" vêm depois, como alternativas. A lógica acima é a
     mesma: aqui só muda a marcação (`questEntrada.css`). */
  if (questNovo) {
    const trocarDeModo =
      modo === 'login' && cadastroAberto ? (
        <p className="qen-rodape">
          {t('Não tem conta?')}
          <button type="button" className="qen-link" onClick={() => trocaModo('signup')}>
            {t('Criar uma conta')}
          </button>
        </p>
      ) : modo === 'login' ? (
        <p className="qen-aviso" role="note">
          <Info aria-hidden />
          <span>
            {t(
              'O cadastro de contas novas está pausado temporariamente. Você pode usar o app sem conta, no seu aparelho.',
            )}
          </span>
        </p>
      ) : modo === 'signup' ? (
        <p className="qen-rodape">
          {t('Já tem conta?')}
          <button type="button" className="qen-link" onClick={() => trocaModo('login')}>
            {t('Entrar')}
          </button>
        </p>
      ) : (
        <p className="qen-rodape">
          {/* A seta fica DENTRO da frase, como na tela de sempre (em árabe e hebraico ela vira). */}
          <button type="button" className="qen-link" onClick={() => trocaModo('login')}>
            {t('← Voltar ao login')}
          </button>
        </p>
      );

    return (
      <CascaDeEntradaDoQuest hero={modo === 'forgot' ? heroRecuperar : undefined} testId="login-do-quest">
        <header className="qen-cab">
          <div>
            <p className="qen-sobre">{t('Sua conta')}</p>
            <h1>{t(TITULO[modo])}</h1>
            <p>{t(SUB[modo])}</p>
          </div>
        </header>

        {!configurado && (
          <p className="qen-aviso alerta" role="alert">
            <TriangleAlert aria-hidden />
            <span>
              <T
                txt="Login não configurado neste ambiente, defina as variáveis <code>{variaveis}</code> no <code>{arquivo}</code>."
                val={{ variaveis: 'VITE_SUPABASE_*', arquivo: '.env' }}
              />
            </span>
          </p>
        )}

        <form onSubmit={submit} className="qen-form">
          <div className="qen-campo">
            <label htmlFor="auth-email">{t('E-mail')}</label>
            <input
              id="auth-email"
              type="email"
              required
              autoComplete="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder={t('voce@exemplo.com')}
            />
          </div>

          {modo !== 'forgot' && (
            <div className="qen-campo">
              <div className="qen-rotulo">
                <label htmlFor="auth-senha">{t('Senha')}</label>
                {modo === 'login' && (
                  <button type="button" className="qen-link" onClick={() => trocaModo('forgot')}>
                    {t('Esqueci')}
                  </button>
                )}
              </div>
              <PasswordField
                id="auth-senha"
                required
                minLength={modo === 'signup' ? auth.SENHA_MINIMA : undefined}
                autoComplete={modo === 'login' ? 'current-password' : 'new-password'}
                value={senha}
                onChange={(e) => setSenha(e.target.value)}
                placeholder={t('mínimo {n} caracteres', { n: auth.SENHA_MINIMA })}
              />
            </div>
          )}

          {widgetDoCaptcha}

          {erro && (
            <p className="qen-erro" role="alert">
              <CircleAlert aria-hidden />
              <span>{erro}</span>
            </p>
          )}
          {aviso && (
            <p className="qen-ok" role="status">
              <CircleCheck aria-hidden />
              <span>{aviso}</span>
            </p>
          )}

          <button type="submit" disabled={carregando || !configurado} className="qen-botao pri">
            {carregando && <LoaderCircle className="qen-gira" aria-hidden />}
            {carregando
              ? t('Aguarde…')
              : modo === 'login'
                ? t('Entrar')
                : modo === 'signup'
                  ? t('Criar conta')
                  : t('Enviar link')}
          </button>
        </form>

        {modo !== 'forgot' && (configurado || onContinuarSemConta) && (
          <>
            <p className="qen-divisor">{t('ou')}</p>
            <div className="qen-acoes par">
              {configurado && auth.googleLigado() && (
                <button type="button" onClick={() => social('google')} disabled={carregando} className="qen-botao">
                  {t('Continuar com Google')}
                </button>
              )}
              {onContinuarSemConta && (
                <button type="button" onClick={onContinuarSemConta} className="qen-botao">
                  {t('Continuar sem conta')}
                </button>
              )}
            </div>
          </>
        )}

        {trocarDeModo}

        {onContinuarSemConta && modo !== 'forgot' && (
          <>
            <p className="qen-nota">
              <T
                txt="Ao criar uma conta você concorda com os <termos>termos de uso</termos> e a <privacidade>política de privacidade</privacidade>."
                tags={{
                  termos: <a href="/termos.html" target="_blank" rel="noopener" />,
                  privacidade: <a href="/privacidade.html" target="_blank" rel="noopener" />,
                }}
              />
            </p>
            <p className="qen-nota">
              {t('Transcreva, traduza e jogue com a sessão atual. Nada sai deste navegador até você criar uma conta.')}
            </p>
          </>
        )}
      </CascaDeEntradaDoQuest>
    );
  }

  return (
    <AuthShell hero={modo === 'forgot' ? heroRecuperar : undefined}>
      <h1 className="font-display text-2xl font-bold text-ink">{t(TITULO[modo])}</h1>
      <p className="mt-1 mb-6 text-sm text-ink-muted">{t(SUB[modo])}</p>

      {!configurado && (
        <p className="mb-4 rounded-lg bg-warn-soft px-3 py-2 text-sm text-warn-ink" role="alert">
          {/* Os nomes entram como VALOR, fora da frase: o tradutor não os vê, então não os traduz. */}
          <T
            txt="Login não configurado neste ambiente, defina as variáveis <code>{variaveis}</code> no <code>{arquivo}</code>."
            val={{ variaveis: 'VITE_SUPABASE_*', arquivo: '.env' }}
          />
        </p>
      )}

      {configurado && auth.googleLigado() && modo !== 'forgot' && (
        <>
          <div className="grid gap-2">
            <button
              type="button"
              onClick={() => social('google')}
              disabled={carregando}
              className="btn-outline w-full justify-center disabled:opacity-50"
            >
              {t('Continuar com Google')}
            </button>
          </div>
          <div className="my-5 flex items-center gap-3 text-xs text-ink-faint">
            <span className="h-px flex-1 bg-border-subtle" />
            {t('ou')}
            <span className="h-px flex-1 bg-border-subtle" />
          </div>
        </>
      )}

      <form onSubmit={submit} className="grid gap-4">
        <div>
          <label htmlFor="auth-email" className="mb-1 block text-xs font-medium text-ink-muted">
            {t('E-mail')}
          </label>
          <input
            id="auth-email"
            type="email"
            required
            autoComplete="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder={t('voce@exemplo.com')}
            className="field-input"
          />
        </div>

        {modo !== 'forgot' && (
          <div>
            <div className="mb-1 flex items-center justify-between">
              <label htmlFor="auth-senha" className="block text-xs font-medium text-ink-muted">
                {t('Senha')}
              </label>
              {modo === 'login' && (
                <button type="button" onClick={() => trocaModo('forgot')} className="text-xs text-accent-ink underline">
                  {t('Esqueci')}
                </button>
              )}
            </div>
            <PasswordField
              id="auth-senha"
              required
              /* Só ao CRIAR: quem entra com uma senha antiga, anterior ao mínimo de 8, não é barrado
                 na porta — a regra vale para senha nova. */
              minLength={modo === 'signup' ? auth.SENHA_MINIMA : undefined}
              autoComplete={modo === 'login' ? 'current-password' : 'new-password'}
              value={senha}
              onChange={(e) => setSenha(e.target.value)}
              placeholder={t('mínimo {n} caracteres', { n: auth.SENHA_MINIMA })}
            />
          </div>
        )}

        {widgetDoCaptcha}

        {erro && (
          <p className="text-sm text-error-ink" role="alert">
            {erro}
          </p>
        )}
        {aviso && (
          <p className="text-sm text-good-ink" role="status">
            {aviso}
          </p>
        )}

        <button
          type="submit"
          disabled={carregando || !configurado}
          className="btn-ink w-full justify-center disabled:opacity-60"
        >
          {carregando
            ? t('Aguarde…')
            : modo === 'login'
              ? t('Entrar')
              : modo === 'signup'
                ? t('Criar conta')
                : t('Enviar link')}
        </button>
      </form>

      <div className="mt-6 border-t border-border-subtle pt-5 text-center text-xs text-ink-muted">
        {modo === 'login' && cadastroAberto && (
          <>
            {t('Não tem conta?')}{' '}
            <button
              type="button"
              onClick={() => trocaModo('signup')}
              className="font-medium text-accent-ink underline underline-offset-2"
            >
              {t('Criar uma conta')}
            </button>
          </>
        )}
        {modo === 'login' && !cadastroAberto && (
          <>
            {t(
              'O cadastro de contas novas está pausado temporariamente. Você pode usar o app sem conta, no seu aparelho.',
            )}
          </>
        )}
        {modo === 'signup' && (
          <>
            {t('Já tem conta?')}{' '}
            <button
              type="button"
              onClick={() => trocaModo('login')}
              className="font-medium text-accent-ink underline underline-offset-2"
            >
              {t('Entrar')}
            </button>
          </>
        )}
        {modo === 'forgot' && (
          <button
            type="button"
            onClick={() => trocaModo('login')}
            className="font-medium text-accent-ink underline underline-offset-2"
          >
            {/* A seta fica DENTRO da frase: em árabe e hebraico "voltar" aponta para o outro lado. */}
            {t('← Voltar ao login')}
          </button>
        )}
      </div>

      {onContinuarSemConta && modo !== 'forgot' && (
        <div className="mt-4 text-center">
          <button type="button" onClick={onContinuarSemConta} className="btn-outline w-full justify-center">
            {t('Continuar sem conta')}
          </button>
          {/* E5 — quem cria conta precisa conseguir LER o que está aceitando, antes de aceitar.
              UMA frase com os dois links dentro: cada idioma põe "termos" e "privacidade" na ordem
              dele. O `href` fica no código (`tags`), nunca no catálogo baixado. */}
          <p className="text-[11px] text-ink-faint text-center mt-3">
            <T
              txt="Ao criar uma conta você concorda com os <termos>termos de uso</termos> e a <privacidade>política de privacidade</privacidade>."
              tags={{
                termos: <a href="/termos.html" target="_blank" rel="noopener" className="underline" />,
                privacidade: <a href="/privacidade.html" target="_blank" rel="noopener" className="underline" />,
              }}
            />
          </p>
          <p className="mt-2 text-[11px] text-ink-faint">
            {t('Transcreva, traduza e jogue com a sessão atual. Nada sai deste navegador até você criar uma conta.')}
          </p>
        </div>
      )}
    </AuthShell>
  );
}
