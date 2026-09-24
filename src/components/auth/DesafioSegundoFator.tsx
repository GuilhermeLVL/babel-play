/**
 * Segunda etapa do login (Fase 6 — 2FA de verdade). Aparece depois de senha ou Google quando a conta
 * tem um app autenticador ativo: a sessão ainda é `aal1` e o servidor recusa cobrança, exclusão de
 * conta e chaves de API até ela virar `aal2` (`server/lib/aal.ts`). Mesmo AuthShell do login e da
 * redefinição de senha — herda o design system.
 */
import React, { useState } from 'react';

import * as auth from '../../lib/auth';
import AuthShell from './AuthShell';

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
      setErro(r.message ?? 'Código inválido. Tente de novo.');
      return;
    }
    onConcluido();
  }

  return (
    <AuthShell
      hero={{
        title: (
          <>
            Mais um
            <br />
            passo.
          </>
        ),
        subtitle: 'Sua conta tem verificação em duas etapas. Confirme que é você.',
      }}
    >
      <h1 className="font-display text-2xl font-bold text-ink">Verificação em duas etapas</h1>
      <p className="mt-1 mb-6 text-sm text-ink-muted">Digite o código de 6 dígitos do seu app autenticador.</p>

      <form onSubmit={submit} className="grid gap-4">
        <div>
          <label htmlFor="mfa-login-codigo" className="mb-1 block text-xs font-medium text-ink-muted">
            Código
          </label>
          <input
            id="mfa-login-codigo"
            inputMode="numeric"
            autoComplete="one-time-code"
            required
            pattern="[0-9]{6}"
            maxLength={6}
            value={codigo}
            autoFocus
            onChange={(e) => setCodigo(e.target.value.replace(/\D/g, ''))}
            placeholder="000000"
            className="field-input"
          />
        </div>

        {erro && (
          <p className="text-sm text-error-ink" role="alert">
            {erro}
          </p>
        )}

        <button
          type="submit"
          disabled={carregando || codigo.length !== 6}
          className="btn-ink w-full justify-center disabled:opacity-60"
        >
          {carregando ? 'Aguarde…' : 'Confirmar'}
        </button>
      </form>

      <div className="mt-6 border-t border-border-subtle pt-5 text-center text-xs text-ink-muted">
        <button
          type="button"
          onClick={() => void auth.signOut()}
          className="font-medium text-accent-ink underline underline-offset-2"
        >
          Sair e entrar com outra conta
        </button>
      </div>
    </AuthShell>
  );
}
