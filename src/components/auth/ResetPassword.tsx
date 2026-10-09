/**
 * Redefinir senha (SaaS Fatia 5). Aberta pelo link do e-mail de recuperação: o Supabase dispara
 * `PASSWORD_RECOVERY` e estabelece uma sessão temporária; o App monta esta tela. O usuário escolhe a
 * nova senha (com confirmação) → `auth.updatePassword` → `onDone()` (a sessão já é válida, o App entra).
 * Mesmo AuthShell/PasswordField do login → herda o design system, o caret (F1) e o olho (F4).
 */
import { CircleAlert, CircleCheck, LoaderCircle } from 'lucide-react';
import React, { useState } from 'react';

import * as auth from '../../lib/auth';
import { t } from '../../lib/i18n';
import { T } from '../../lib/T';
import PasswordField from './PasswordField';
import { RequisitosDaSenha } from './PecasDaPorta';
import CascaDeEntradaDoQuest from './quest/CascaDeEntradaDoQuest';

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

  /** Desistir: a sessão temporária do link é encerrada e a porta de login volta, com a senha de antes. */
  async function cancelar() {
    await auth.signOut();
    onDone();
  }

  /* QUEST: os mesmos dois campos, o erro e o aviso, nas medidas do headset (`questEntrada.css`). */
  return (
    <CascaDeEntradaDoQuest
      hero={{ title: <T txt="Quase<br>lá." />, subtitle: t('Escolha uma nova senha e você já entra direto.') }}
      testId="redefinir-senha-do-quest"
    >
      <header className="qen-cab">
        <div>
          <p className="qen-sobre">{t('Sua conta')}</p>
          <h1>{t('Definir nova senha')}</h1>
          <p>{t('Digite e confirme a nova senha da sua conta.')}</p>
        </div>
      </header>

      <form onSubmit={submit} className="qen-form">
        <div className="qen-campo">
          <label htmlFor="reset-senha">{t('Nova senha')}</label>
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
        <RequisitosDaSenha senha={senha} minimo={auth.SENHA_MINIMA} quest />
        <div className="qen-campo">
          <label htmlFor="reset-confirma">{t('Confirmar senha')}</label>
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

        <button type="submit" disabled={carregando} className="qen-botao pri">
          {carregando && <LoaderCircle className="qen-gira" aria-hidden />}
          {carregando ? t('Aguarde…') : t('Redefinir senha')}
        </button>
      </form>
      <p className="qen-rodape">
        <button type="button" className="qen-link" onClick={cancelar}>
          {t('Cancelar e voltar ao login')}
        </button>
      </p>
    </CascaDeEntradaDoQuest>
  );
}
