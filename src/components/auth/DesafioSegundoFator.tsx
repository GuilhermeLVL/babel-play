/**
 * Segunda etapa do login (Fase 6 — 2FA de verdade). Aparece depois de senha ou Google quando a conta
 * tem um app autenticador ativo: a sessão ainda é `aal1` e o servidor recusa cobrança, exclusão de
 * conta e chaves de API até ela virar `aal2` (`server/lib/aal.ts`). Mesmo AuthShell do login e da
 * redefinição de senha — herda o design system.
 */
import { CircleAlert, LoaderCircle, ShieldCheck } from 'lucide-react';
import React, { useState } from 'react';

import * as auth from '../../lib/auth';
import { t } from '../../lib/i18n';
import { T } from '../../lib/T';
import CascaDeEntradaDoQuest from './quest/CascaDeEntradaDoQuest';

export default function DesafioSegundoFator({ onConcluido }: { onConcluido: () => void }) {
  const [codigo, setCodigo] = useState('');
  const [erro, setErro] = useState<string | null>(null);
  const [carregando, setCarregando] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setErro(null);
    setCarregando(true);
    const r = await auth.verificarSegundoFator(codigo.trim());
    setCarregando(false);
    if (!r.ok) {
      setErro(r.message ?? t('Código inválido. Tente de novo.'));
      return;
    }
    onConcluido();
  }

  /* QUEST: o código lido de longe, um botão principal, e a saída ("entrar com outra conta") com 56 px. */
  return (
    <CascaDeEntradaDoQuest
      hero={{
        title: <T txt="Mais um<br>passo." />,
        subtitle: t('Sua conta tem verificação em duas etapas. Confirme que é você.'),
      }}
      testId="segundo-fator-do-quest"
    >
      <header className="qen-cab">
        <span className="qen-ic" aria-hidden>
          <ShieldCheck />
        </span>
        <div>
          <h1>{t('Verificação em duas etapas')}</h1>
          <p>{t('Digite o código de 6 dígitos do seu app autenticador.')}</p>
        </div>
      </header>

      <form onSubmit={submit} className="qen-form">
        <div className="qen-campo">
          <label htmlFor="mfa-login-codigo">{t('Código')}</label>
          <input
            id="mfa-login-codigo"
            className="qen-codigo"
            inputMode="numeric"
            autoComplete="one-time-code"
            required
            pattern="[0-9]{6}"
            maxLength={6}
            value={codigo}
            autoFocus
            onChange={(e) => setCodigo(e.target.value.replace(/\D/g, ''))}
            placeholder="000000"
          />
        </div>

        {erro && (
          <p className="qen-erro" role="alert">
            <CircleAlert aria-hidden />
            <span>{erro}</span>
          </p>
        )}

        <button type="submit" disabled={carregando || codigo.length !== 6} className="qen-botao pri">
          {carregando && <LoaderCircle className="qen-gira" aria-hidden />}
          {carregando ? t('Aguarde…') : t('Confirmar')}
        </button>
      </form>

      <p className="qen-rodape">
        <button type="button" className="qen-link" onClick={() => void auth.signOut()}>
          {t('Sair e entrar com outra conta')}
        </button>
      </p>
    </CascaDeEntradaDoQuest>
  );
}
