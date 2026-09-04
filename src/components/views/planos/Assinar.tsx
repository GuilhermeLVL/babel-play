import { useEffect, useState } from 'react';
import { CreditCard, ExternalLink, XCircle } from 'lucide-react';
import { apiFetch } from '../../../data/api';
import { PLAN_MATRIX, type PlanoDeAssinatura } from '../../../core/planos';
import { authRequired } from '../../../lib/supabase';
import { carregarEntitlements } from '../../../lib/entitlements';
import { data } from '../../../lib/i18n';

/**
 * ASSINAR — o pedaço que faltava da tela de Planos (E3).
 *
 * O DESENHO: este formulário só INICIA. Ele cria a assinatura no Asaas e abre o link de pagamento;
 * quem promove o plano é exclusivamente o webhook, quando o pagamento confirma — nada aqui muda
 * `subscriptions`. Por isso o estado pós-envio diz "aguardando pagamento" em vez de fingir sucesso.
 *
 * CPF vai DIRETO ao processador (obrigação regulatória é dele) — não passa a existir no nosso
 * banco, e a política de privacidade pode afirmar isso.
 *
 * Só aparece no modo público com conta: no self-host não há o que vender (tudo já é liberado), e
 * sem conta não há a quem cobrar.
 */

interface StatusDeBilling {
  configurado: boolean;
  assinatura: { plano: string; status: string; valeAte: number | null; provedor: string | null } | null;
}

const VENDAVEIS = (['essencial', 'pro'] as const) satisfies readonly PlanoDeAssinatura[];

export default function Assinar() {
  const [status, setStatus] = useState<StatusDeBilling | null>(null);
  const [plano, setPlano] = useState<PlanoDeAssinatura>('essencial');
  const [nome, setNome] = useState('');
  const [cpf, setCpf] = useState('');
  const [ocupado, setOcupado] = useState(false);
  const [erro, setErro] = useState('');
  const [linkAberto, setLinkAberto] = useState(false);

  useEffect(() => {
    let vivo = true;
    void apiFetch('/api/billing/status')
      .then(async (r) => (r.ok ? ((await r.json()) as StatusDeBilling) : null))
      .then((s) => { if (vivo && s) setStatus(s); })
      .catch(() => { /* sem status, o bloco não renderiza — nunca inventa estado */ });
    return () => { vivo = false; };
  }, []);

  // Self-host e modo sem conta não têm o que comprar; sem billing configurado, nada a prometer.
  /**
   * SEM COBRANÇA CONFIGURADA, A TELA DIZ (mudança vender-onde-se-ve).
   *
   * Devolver `null` fazia a compra SUMIR: quem abria não descobria que não dava, descobria que
   * não existia. É o mesmo defeito de degradar em silêncio que esta base vem perseguindo — e a
   * Loja já resolvia isso no cartão de Créditos, dizendo na cara que ali não há o que vender.
   */
  if (!authRequired || !status?.configurado) {
    return (
      <section className="card-panel bg-surface p-5" data-testid="assinar">
        <p className="text-[12.5px] text-ink-muted max-w-[68ch] leading-relaxed">
          Nesta instalação não há assinatura — sem conta e sem cobrança configurada, não existe o
          que cobrar. <b className="text-ink">O plano Grátis é o que está rodando aqui</b>, e ele
          é o app inteiro rodando no seu computador.
        </p>
      </section>
    );
  }
  const ativa = status.assinatura && (status.assinatura.status === 'active' || status.assinatura.status === 'past_due');

  const assinar = async () => {
    setErro(''); setOcupado(true);
    try {
      const r = await apiFetch('/api/billing/assinar', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ plano, nome: nome.trim(), cpfCnpj: cpf.replace(/\D/g, '') }),
      });
      const corpo = (await r.json()) as { linkDePagamento?: string | null; error?: string };
      if (!r.ok) { setErro(corpo.error ?? `falha (HTTP ${r.status})`); return; }
      if (corpo.linkDePagamento) {
        window.open(corpo.linkDePagamento, '_blank', 'noopener');
        setLinkAberto(true);
      } else {
        setErro('assinatura criada, mas o link de pagamento não veio — tente recarregar.');
      }
    } catch {
      setErro('não consegui falar com o servidor.');
    } finally {
      setOcupado(false);
    }
  };

  const cancelar = async () => {
    setErro(''); setOcupado(true);
    try {
      const r = await apiFetch('/api/billing/cancelar', { method: 'POST' });
      if (!r.ok) { setErro('não consegui cancelar — tente de novo.'); return; }
      await carregarEntitlements();
      setStatus((s) => (s?.assinatura ? { ...s, assinatura: { ...s.assinatura, status: 'canceled' } } : s));
    } catch {
      setErro('não consegui falar com o servidor.');
    } finally {
      setOcupado(false);
    }
  };

  return (
    <div className="card-panel bg-surface p-5 mt-4" data-testid="planos-assinar">
      {ativa ? (
        <>
          <p className="text-[13px] text-ink">
            Sua assinatura <strong>{status.assinatura!.plano}</strong> está{' '}
            {status.assinatura!.status === 'past_due' ? 'com pagamento pendente' : 'ativa'}
            {status.assinatura!.valeAte
              ? ` — válida até ${data(new Date(status.assinatura!.valeAte))}`
              : ''}.
          </p>
          <button onClick={() => void cancelar()} disabled={ocupado} className="btn-outline mt-3">
            <XCircle className="w-4 h-4" aria-hidden /> Cancelar renovação
          </button>
          <p className="text-[12px] text-ink-muted mt-2">
            Cancelar para a renovação; o que já foi pago vale até o fim do período.
          </p>
        </>
      ) : linkAberto ? (
        <p className="text-[13px] text-ink">
          Abrimos o link de pagamento numa nova aba. Assim que o pagamento confirmar, seu plano
          ativa sozinho — pode levar alguns minutos. Nada muda até lá, e é assim mesmo.
        </p>
      ) : (
        <>
          <p className="font-bold text-[14px] text-ink mb-3">
            <CreditCard size={15} className="inline me-1.5" aria-hidden />Assinar
          </p>
          <div className="flex flex-wrap gap-2 mb-3" role="radiogroup" aria-label="Plano a assinar">
            {VENDAVEIS.map((p) => (
              <button
                key={p}
                role="radio"
                aria-checked={plano === p}
                onClick={() => setPlano(p)}
                className={plano === p ? 'btn-solid' : 'btn-outline'}
              >
                {PLAN_MATRIX[p].rotulo} · R$ {PLAN_MATRIX[p].precoMensalBrl!.toFixed(2).replace('.', ',')}/mês
              </button>
            ))}
          </div>
          <div className="grid gap-2 sm:grid-cols-2 mb-3">
            <input
              value={nome}
              onChange={(e) => setNome(e.target.value)}
              placeholder="Nome completo"
              aria-label="Nome completo"
              className="w-full bg-canvas border border-border-subtle rounded-lg px-3 py-2 text-ink text-sm"
            />
            <input
              value={cpf}
              onChange={(e) => setCpf(e.target.value)}
              placeholder="CPF (só números)"
              aria-label="CPF"
              inputMode="numeric"
              className="w-full bg-canvas border border-border-subtle rounded-lg px-3 py-2 text-ink text-sm"
            />
          </div>
          <button
            onClick={() => void assinar()}
            disabled={ocupado || nome.trim().length < 2 || cpf.replace(/\D/g, '').length < 11}
            className="btn-solid"
          >
            <ExternalLink className="w-4 h-4" aria-hidden />
            {ocupado ? 'Criando…' : 'Continuar para o pagamento'}
          </button>
          <p className="text-[12px] text-ink-muted mt-2">
            Pagamento por Pix ou cartão, processado pelo Asaas. Seu CPF vai direto ao processador —
            não fica no nosso banco.
          </p>
        </>
      )}
      {erro && <p className="text-[12px] text-error-ink mt-2" role="alert">{erro}</p>}
    </div>
  );
}
