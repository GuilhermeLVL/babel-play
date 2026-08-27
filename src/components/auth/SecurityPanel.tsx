/**
 * Conta / Segurança (SaaS Fatia 5). Habilitar/desabilitar 2FA (TOTP: QR + código do app), trocar
 * senha e sair. Autocontido — plugável na tela de Configurações. Só ativo no modo com login
 * (Supabase configurado); no self-host mostra um aviso. Toda a auth vem de `src/lib/auth.ts`.
 */
import React, { useEffect, useState } from 'react';
import * as auth from '../../lib/auth';
import { supabase } from '../../lib/supabase';

function QrView({ svg }: { svg?: string }) {
  if (!svg) return null;
  if (svg.startsWith('data:') || svg.startsWith('http')) return <img src={svg} alt="QR do 2FA" className="h-32 w-32" />;
  return <div className="h-32 w-32" role="img" aria-label="QR do 2FA" dangerouslySetInnerHTML={{ __html: svg }} />;
}

export default function SecurityPanel() {
  const configurado = !!supabase;
  const [factors, setFactors] = useState<auth.TotpFactor[]>([]);
  const [loading, setLoading] = useState(true);
  const [enroll, setEnroll] = useState<auth.MfaEnroll | null>(null);
  const [code, setCode] = useState('');
  const [novaSenha, setNovaSenha] = useState('');
  const [erro, setErro] = useState<string | null>(null);
  const [aviso, setAviso] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const fatorAtivo = factors.find((f) => f.verified);

  async function refresh() {
    setLoading(true);
    setFactors(await auth.listTotpFactors());
    setLoading(false);
  }
  useEffect(() => {
    if (configurado) void refresh();
    else setLoading(false);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function iniciarEnroll() {
    setErro(null); setAviso(null); setBusy(true);
    const r = await auth.enrollTotp();
    if (!r.ok) setErro(r.message ?? 'Falha ao iniciar o 2FA.');
    else setEnroll(r);
    setBusy(false);
  }
  async function confirmar() {
    if (!enroll?.factorId) return;
    setErro(null); setBusy(true);
    const r = await auth.confirmTotp(enroll.factorId, code.trim());
    if (!r.ok) setErro(r.message ?? 'Código inválido.');
    else { setEnroll(null); setCode(''); setAviso('2FA ativado com sucesso.'); await refresh(); }
    setBusy(false);
  }
  async function desativar(id: string) {
    setErro(null); setBusy(true);
    const r = await auth.unenrollTotp(id);
    if (!r.ok) setErro(r.message ?? 'Falha ao desativar.');
    else { setAviso('2FA desativado.'); await refresh(); }
    setBusy(false);
  }
  async function trocarSenha(e: React.FormEvent) {
    e.preventDefault(); setErro(null); setAviso(null); setBusy(true);
    const r = await auth.updatePassword(novaSenha);
    if (!r.ok) setErro(r.message ?? 'Falha ao trocar a senha.');
    else { setNovaSenha(''); setAviso('Senha atualizada.'); }
    setBusy(false);
  }

  if (!configurado) {
    return <p className="text-sm text-ink-muted">Segurança da conta fica disponível no modo com login (Supabase configurado).</p>;
  }

  return (
    <div className="grid gap-6">
      <section className="card-panel p-5">
        <h3 className="font-display text-base font-bold text-ink">Verificação em duas etapas (2FA)</h3>
        <p className="mt-1 text-sm text-ink-muted">Um código do app autenticador além da senha, recomendado.</p>

        {erro && <p className="mt-3 text-sm text-error-ink" role="alert">{erro}</p>}
        {aviso && <p className="mt-3 text-sm text-good-ink" role="status">{aviso}</p>}

        {loading ? (
          <p className="mt-3 text-sm text-ink-faint">Carregando…</p>
        ) : enroll ? (
          <div className="mt-4 grid gap-3">
            <p className="text-sm text-ink-muted">Escaneie o QR no app (Google Authenticator, Authy…) ou digite o segredo:</p>
            <div className="flex items-center gap-4">
              <QrView svg={enroll.qrSvg} />
              <code className="break-all rounded bg-canvas px-2 py-1 text-xs text-ink-muted">{enroll.secret}</code>
            </div>
            <label htmlFor="mfa-code" className="text-xs font-medium text-ink-muted">Código de 6 dígitos</label>
            <input id="mfa-code" inputMode="numeric" autoComplete="one-time-code" value={code}
              onChange={(e) => setCode(e.target.value)} placeholder="000000" className="ap-input w-40" />
            <div className="flex gap-2">
              <button type="button" className="btn-ink" disabled={busy || code.trim().length < 6} onClick={confirmar}>Confirmar</button>
              <button type="button" className="btn-outline" disabled={busy} onClick={() => { setEnroll(null); setCode(''); }}>Cancelar</button>
            </div>
          </div>
        ) : fatorAtivo ? (
          <div className="mt-4 flex items-center justify-between">
            <span className="badge-tag ok">Ativo</span>
            <button type="button" className="btn-outline" disabled={busy} onClick={() => desativar(fatorAtivo.id)}>Desativar</button>
          </div>
        ) : (
          <button type="button" className="btn-ink mt-4" disabled={busy} onClick={iniciarEnroll}>Habilitar 2FA</button>
        )}
      </section>

      <section className="card-panel p-5">
        <h3 className="font-display text-base font-bold text-ink">Senha</h3>
        <form onSubmit={trocarSenha} className="mt-3 flex items-end gap-2">
          <div className="flex-1">
            <label htmlFor="nova-senha" className="mb-1 block text-xs font-medium text-ink-muted">Nova senha</label>
            <input id="nova-senha" type="password" minLength={6} required value={novaSenha}
              onChange={(e) => setNovaSenha(e.target.value)} placeholder="mínimo 6 caracteres" className="ap-input w-full" />
          </div>
          <button type="submit" className="btn-ink" disabled={busy}>Trocar</button>
        </form>
      </section>

      <section className="card-panel p-5">
        <h3 className="font-display text-base font-bold text-ink">Sessão</h3>
        <button type="button" className="btn-outline mt-3" onClick={() => void auth.signOut()}>Sair da conta</button>
      </section>
    </div>
  );
}
