/**
 * Porta de entrada (front-door split). Só aparece no modo público (VITE_AUTH_REQUIRED=1 com Supabase
 * configurado); no self-host o App nunca a monta. Três modos: entrar · criar conta · recuperar senha.
 * Social (Google/Facebook) + e-mail/senha. Toda a lógica de auth vem de `src/lib/auth.ts` (mensagens
 * genéricas por segurança). Após entrar, o `onAuthStateChange` no App troca a tela sozinho.
 */
import React, { useState } from 'react';
import { supabase } from '../lib/supabase';
import * as auth from '../lib/auth';
import AuthShell from './auth/AuthShell';
import PasswordField from './auth/PasswordField';

type Mode = 'login' | 'signup' | 'forgot';

const TITULO: Record<Mode, string> = { login: 'Entrar', signup: 'Criar conta', forgot: 'Recuperar senha' };
const SUB: Record<Mode, string> = {
  login: 'Bem-vindo de volta.',
  signup: 'Comece em segundos, sua conta, seus dados.',
  forgot: 'Enviamos um link de redefinição por e-mail.',
};

// Social desligado até Google/Facebook estarem configurados no Supabase. Flip p/ true quando ligar
// (os handlers e o serviço já estão prontos — é só mostrar os botões).
const SOCIAL_ENABLED = false;

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

  const configurado = !!supabase;
  const redirectTo = typeof window !== 'undefined' ? `${window.location.origin}/auth/callback` : undefined;

  function trocaModo(m: Mode) { setModo(m); setErro(null); setAviso(null); }

  async function social(provider: 'google' | 'facebook') {
    setErro(null); setCarregando(true);
    const r = await auth.signInWithProvider(provider, redirectTo);
    if (!r.ok) { setErro(r.message ?? 'Falha no login social.'); setCarregando(false); }
    // sucesso → o browser é redirecionado ao provedor; nada a fazer aqui.
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setErro(null); setAviso(null); setCarregando(true);
    try {
      if (modo === 'login') {
        const r = await auth.signInEmail(email, senha);
        if (!r.ok) setErro(r.message ?? 'Falha ao entrar.');
      } else if (modo === 'signup') {
        const r = await auth.signUpEmail(email, senha);
        if (!r.ok) setErro(r.message ?? 'Falha ao criar conta.');
        else if (r.needsEmailConfirm) setAviso('Conta criada! Confirme pelo link enviado ao seu e-mail para entrar.');
      } else {
        const r = await auth.sendPasswordReset(email, redirectTo);
        setAviso(r.message ?? 'Se existir uma conta, enviamos um link.');
      }
    } finally {
      setCarregando(false);
    }
  }

  const heroRecuperar = { title: (<>Sem<br />estresse.</>), subtitle: 'Enviamos um link seguro pro seu e-mail, você define uma nova senha e volta em segundos.' };

  return (
    <AuthShell hero={modo === 'forgot' ? heroRecuperar : undefined}>
      <h1 className="font-display text-2xl font-bold text-ink">{TITULO[modo]}</h1>
      <p className="mt-1 mb-6 text-sm text-ink-muted">{SUB[modo]}</p>

      {!configurado && (
        <p className="mb-4 rounded-lg bg-warn-soft px-3 py-2 text-sm text-warn-ink" role="alert">
          Login não configurado neste ambiente, defina as variáveis <code>VITE_SUPABASE_*</code> no <code>.env</code>.
        </p>
      )}

      {SOCIAL_ENABLED && modo !== 'forgot' && (
        <>
          <div className="grid gap-2">
            <button type="button" onClick={() => social('google')} disabled={carregando || !configurado}
              className="btn-outline w-full justify-center disabled:opacity-50">Continuar com Google</button>
            <button type="button" onClick={() => social('facebook')} disabled={carregando || !configurado}
              className="btn-outline w-full justify-center disabled:opacity-50">Continuar com Facebook</button>
          </div>
          <div className="my-5 flex items-center gap-3 text-xs text-ink-faint">
            <span className="h-px flex-1 bg-border-subtle" />ou<span className="h-px flex-1 bg-border-subtle" />
          </div>
        </>
      )}

      <form onSubmit={submit} className="grid gap-4">
        <div>
          <label htmlFor="auth-email" className="mb-1 block text-xs font-medium text-ink-muted">E-mail</label>
          <input id="auth-email" type="email" required autoComplete="email" value={email}
            onChange={(e) => setEmail(e.target.value)} placeholder="voce@exemplo.com" className="field-input" />
        </div>

        {modo !== 'forgot' && (
          <div>
            <div className="mb-1 flex items-center justify-between">
              <label htmlFor="auth-senha" className="block text-xs font-medium text-ink-muted">Senha</label>
              {modo === 'login' && (
                <button type="button" onClick={() => trocaModo('forgot')} className="text-xs text-accent-ink underline">Esqueci</button>
              )}
            </div>
            <PasswordField id="auth-senha" required minLength={6}
              autoComplete={modo === 'login' ? 'current-password' : 'new-password'} value={senha}
              onChange={(e) => setSenha(e.target.value)} placeholder="mínimo 6 caracteres" />
          </div>
        )}

        {erro && <p className="text-sm text-error-ink" role="alert">{erro}</p>}
        {aviso && <p className="text-sm text-good-ink" role="status">{aviso}</p>}

        <button type="submit" disabled={carregando || !configurado} className="btn-ink w-full justify-center disabled:opacity-60">
          {carregando ? 'Aguarde…' : modo === 'login' ? 'Entrar' : modo === 'signup' ? 'Criar conta' : 'Enviar link'}
        </button>
      </form>

      <div className="mt-6 border-t border-border-subtle pt-5 text-center text-xs text-ink-muted">
        {modo === 'login' && (<>Não tem conta? <button type="button" onClick={() => trocaModo('signup')} className="font-medium text-accent-ink underline underline-offset-2">Criar uma conta</button></>)}
        {modo === 'signup' && (<>Já tem conta? <button type="button" onClick={() => trocaModo('login')} className="font-medium text-accent-ink underline underline-offset-2">Entrar</button></>)}
        {modo === 'forgot' && (<button type="button" onClick={() => trocaModo('login')} className="font-medium text-accent-ink underline underline-offset-2">← Voltar ao login</button>)}
      </div>

      {onContinuarSemConta && modo !== 'forgot' && (
        <div className="mt-4 text-center">
          <button type="button" onClick={onContinuarSemConta} className="btn-outline w-full justify-center">Continuar sem conta</button>
          <p className="mt-2 text-[11px] text-ink-faint">Transcreva, traduza e jogue com a sessão atual. Nada sai deste navegador até você criar uma conta.</p>
        </div>
      )}
    </AuthShell>
  );
}
