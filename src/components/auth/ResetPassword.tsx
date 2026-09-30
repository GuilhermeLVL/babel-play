/**
 * Redefinir senha (SaaS Fatia 5). Aberta pelo link do e-mail de recuperação: o Supabase dispara
 * `PASSWORD_RECOVERY` e estabelece uma sessão temporária; o App monta esta tela. O usuário escolhe a
 * nova senha (com confirmação) → `auth.updatePassword` → `onDone()` (a sessão já é válida, o App entra).
 * Mesmo AuthShell/PasswordField do login → herda o design system, o caret (F1) e o olho (F4).
 */
import React, { useState } from 'react';

import * as auth from '../../lib/auth';
import { t } from '../../lib/i18n';
import { T } from '../../lib/T';
import AuthShell from './AuthShell';
import PasswordField from './PasswordField';

export default function ResetPassword({ onDone }: { onDone: () => void }) {
  const [senha, setSenha] = useState('');
  const [confirma, setConfirma] = useState('');
  const [erro, setErro] = useState<string | null>(null);
  const [aviso, setAviso] = useState<string | null>(null);
  const [carregando, setCarregando] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setErro(null);
    setAviso(null);
    if (senha.length < auth.SENHA_MINIMA) {
      setErro(t(auth.SENHA_CURTA, { n: auth.SENHA_MINIMA }));
      return;
    }
    if (senha !== confirma) {
      setErro(t('As senhas não coincidem.'));
      return;
    }
    setCarregando(true);
    const r = await auth.updatePassword(senha);
    setCarregando(false);
    if (!r.ok) {
      setErro(r.message ?? t('Falha ao redefinir a senha.'));
      return;
    }
    setAviso(t('Senha redefinida! Entrando…'));
    onDone(); // a sessão de recuperação já é válida → o App carrega logado
  }

  return (
    <AuthShell
      hero={{ title: <T txt="Quase<br>lá." />, subtitle: t('Escolha uma nova senha e você já entra direto.') }}
    >
      <h1 className="font-display text-2xl font-bold text-ink">{t('Definir nova senha')}</h1>
      <p className="mt-1 mb-6 text-sm text-ink-muted">{t('Digite e confirme a nova senha da sua conta.')}</p>

      <form onSubmit={submit} className="grid gap-4">
        <div>
          <label htmlFor="reset-senha" className="mb-1 block text-xs font-medium text-ink-muted">
            {t('Nova senha')}
          </label>
          <PasswordField
            id="reset-senha"
            required
            minLength={auth.SENHA_MINIMA}
            autoComplete="new-password"
            value={senha}
            onChange={(e) => setSenha(e.target.value)}
            placeholder={t('mínimo {n} caracteres', { n: auth.SENHA_MINIMA })}
          />
        </div>
        <div>
          <label htmlFor="reset-confirma" className="mb-1 block text-xs font-medium text-ink-muted">
            {t('Confirmar senha')}
          </label>
          <PasswordField
            id="reset-confirma"
            required
            minLength={auth.SENHA_MINIMA}
            autoComplete="new-password"
            value={confirma}
            onChange={(e) => setConfirma(e.target.value)}
            placeholder={t('repita a senha')}
          />
        </div>

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

        <button type="submit" disabled={carregando} className="btn-ink w-full justify-center disabled:opacity-60">
          {carregando ? t('Aguarde…') : t('Redefinir senha')}
        </button>
      </form>
    </AuthShell>
  );
}
