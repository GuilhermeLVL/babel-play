import { useEffect, useState } from 'react';
import { Coins, ExternalLink, Ticket, Check } from 'lucide-react';
import { apiFetch } from '../../../data/api';
import { CATALOGO_DE_CREDITOS, precoEmReais, type PacoteDeCredito } from '../../../core/creditos';
import { authRequired } from '../../../lib/supabase';

/**
 * COMPRAR CRÉDITOS E O PASSE — a única tela do app onde entra dinheiro por escolha do usuário.
 *
 * O DESENHO É O MESMO DE `planos/Assinar.tsx`, e isso é deliberado: o formulário só INICIA a
 * cobrança e abre o link do Asaas. Quem concede o crédito é o webhook, quando o pagamento
 * confirma. Por isso o estado pós-envio diz "aguardando pagamento" em vez de fingir sucesso —
 * conceder no clique seria dar moeda a quem abandonou o checkout.
 *
 * O CPF vai DIRETO ao processador (a obrigação regulatória é dele) e não passa a existir no nosso
 * banco — a política de privacidade pode continuar afirmando isso.
 *
 * O QUE ESTA TELA PROMETE, e o texto diz na cara: crédito compra ENFEITE. Nível, XP, Seeds e
 * conquista continuam saindo só de estudo. É a linha que separa este app de um pay-to-win, e é a
 * mesma que a página Sobre passou a declarar.
 */

interface EstadoDosCreditos {
  saldo: number;
  temPasse: boolean;
  compras: Array<{ sku: string; status: string; creditos: number; em: number }>;
}

export default function ComprarCreditos() {
  const [estado, setEstado] = useState<EstadoDosCreditos | null>(null);
  const [configurado, setConfigurado] = useState<boolean | null>(null);
  const [escolhido, setEscolhido] = useState<PacoteDeCredito | null>(null);
  const [nome, setNome] = useState('');
  const [cpf, setCpf] = useState('');
  const [ocupado, setOcupado] = useState(false);
  const [erro, setErro] = useState('');
  const [linkAberto, setLinkAberto] = useState(false);

  useEffect(() => {
    let vivo = true;
    void apiFetch('/api/billing/status')
      .then(async (r) => (r.ok ? ((await r.json()) as { configurado: boolean }) : null))
      .then((s) => { if (vivo) setConfigurado(s?.configurado ?? false); })
      .catch(() => { if (vivo) setConfigurado(false); });
    void apiFetch('/api/billing/creditos')
      .then(async (r) => (r.ok ? ((await r.json()) as EstadoDosCreditos) : null))
      .then((e) => { if (vivo && e) setEstado(e); })
      .catch(() => { /* sem saldo, a tela não inventa número */ });
    return () => { vivo = false; };
  }, []);

  // Self-host e modo sem conta não têm o que vender; sem billing, nada a prometer.
  if (!authRequired || configurado === false) return null;

  const comprar = async () => {
    if (!escolhido) return;
    setErro(''); setOcupado(true);
    try {
      const r = await apiFetch('/api/billing/comprar', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ sku: escolhido.sku, nome: nome.trim(), cpfCnpj: cpf.replace(/\D/g, '') }),
      });
      const corpo = (await r.json()) as { linkDePagamento?: string | null; error?: string };
      if (!r.ok) { setErro(corpo.error ?? `falha (HTTP ${r.status})`); return; }
      if (corpo.linkDePagamento) {
        window.open(corpo.linkDePagamento, '_blank', 'noopener');
        setLinkAberto(true);
      } else {
        setErro('cobrança criada, mas o link não veio — tente recarregar.');
      }
    } catch {
      setErro('não consegui falar com o servidor.');
    } finally {
      setOcupado(false);
    }
  };

  const passe = CATALOGO_DE_CREDITOS.find((p) => p.sku === 'passe-t1')!;
  const pacotes = CATALOGO_DE_CREDITOS.filter((p) => p.sku !== 'passe-t1');

  if (linkAberto) {
    return (
      <section className="card-panel bg-surface p-5" data-testid="comprar-creditos">
        <p className="text-[13px] text-ink">
          Abrimos o pagamento numa nova aba. Assim que confirmar, o crédito entra sozinho — pode
          levar alguns minutos. <b>Nada muda até lá, e é assim mesmo</b>: crédito só entra pago.
        </p>
        <button onClick={() => { setLinkAberto(false); setEscolhido(null); }} className="btn-outline mt-3">
          Voltar
        </button>
      </section>
    );
  }

  return (
    <section className="space-y-4" data-testid="comprar-creditos">
      <div className="flex items-baseline justify-between gap-3 flex-wrap">
        <p className="label-mono flex items-center gap-1.5">
          <Coins className="w-3.5 h-3.5" aria-hidden /> Créditos
        </p>
        {estado && (
          <p className="text-[12.5px] text-ink-muted">
            Você tem <b className="text-premium-ink tabular-nums">{estado.saldo}</b> créditos
            {estado.temPasse && ' · Passe da Temporada 1 ativo'}
          </p>
        )}
      </div>

      <p className="text-[12.5px] text-ink-muted max-w-[68ch]">
        Créditos compram <b className="text-ink">enfeite</b>: o Passe de Temporada, variantes e
        kits. <b className="text-ink">Não compram progresso</b> — nível, XP, Seeds e conquista só
        saem estudando, e isso não vai mudar.
      </p>

      {/* O PASSE primeiro: é o produto principal, e o único que devolve mais do que custa. */}
      <button
        onClick={() => setEscolhido(passe)}
        aria-pressed={escolhido?.sku === passe.sku}
        className={`w-full text-left card-panel p-4 border-2 cursor-pointer transition-colors ${
          escolhido?.sku === passe.sku ? 'border-premium bg-premium-soft' : 'border-border-subtle hover:border-premium'
        }`}
      >
        <span className="flex items-center justify-between gap-3 flex-wrap">
          <span className="flex items-center gap-2 font-bold text-[14px] text-ink">
            <Ticket className="w-4 h-4 text-premium" aria-hidden /> {passe.nome}
          </span>
          <span className="font-mono font-bold text-[17px] text-ink tabular-nums">{precoEmReais(passe.precoCentavos)}</span>
        </span>
        <span className="block text-[12px] text-ink-muted mt-1.5 leading-snug">{passe.descricao}</span>
      </button>

      <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
        {pacotes.map((p) => (
          <button
            key={p.sku}
            onClick={() => setEscolhido(p)}
            aria-pressed={escolhido?.sku === p.sku}
            className={`card-panel p-3 text-left cursor-pointer border-2 transition-colors ${
              escolhido?.sku === p.sku ? 'border-premium bg-premium-soft' : 'border-border-subtle hover:border-premium'
            }`}
          >
            {p.bonusPct ? (
              <span className="text-[9px] font-mono font-bold uppercase tracking-wider text-premium-ink">
                +{p.bonusPct}% de bônus
              </span>
            ) : null}
            <span className="block font-bold text-[13.5px] text-ink">{p.nome}</span>
            <span className="block font-mono font-bold text-[16px] text-ink tabular-nums mt-1">{precoEmReais(p.precoCentavos)}</span>
            <span className="block text-[11.5px] text-ink-muted mt-0.5">{p.descricao}</span>
          </button>
        ))}
      </div>

      {escolhido && (
        <div className="card-panel bg-canvas p-4 space-y-3">
          <p className="text-[12.5px] text-ink">
            <b>{escolhido.nome}</b> · {precoEmReais(escolhido.precoCentavos)}. O pagamento é no
            Asaas (Pix, boleto ou cartão); o CPF vai direto para lá e não fica no nosso banco.
          </p>
          <div className="grid sm:grid-cols-2 gap-2">
            <input
              value={nome} onChange={(e) => setNome(e.target.value)}
              placeholder="Seu nome completo" aria-label="Seu nome completo"
              className="px-3 py-2 rounded-xl bg-surface border border-border-subtle text-[13px] text-ink outline-none focus:border-accent"
            />
            <input
              value={cpf} onChange={(e) => setCpf(e.target.value)} inputMode="numeric"
              placeholder="CPF (só números)" aria-label="CPF, só números"
              className="px-3 py-2 rounded-xl bg-surface border border-border-subtle text-[13px] text-ink outline-none focus:border-accent"
            />
          </div>
          {erro && <p className="text-[12px] text-error-ink">{erro}</p>}
          <button
            onClick={() => void comprar()}
            disabled={ocupado || nome.trim().length < 2 || cpf.replace(/\D/g, '').length < 11}
            className="btn-solid disabled:opacity-50 disabled:cursor-not-allowed"
          >
            <ExternalLink className="w-4 h-4" aria-hidden />
            {ocupado ? 'Abrindo o pagamento…' : `Pagar ${precoEmReais(escolhido.precoCentavos)}`}
          </button>
          <p className="text-[11.5px] text-ink-muted flex items-start gap-1.5">
            <Check className="w-3.5 h-3.5 mt-0.5 shrink-0 text-good" aria-hidden />
            O crédito entra quando o pagamento confirmar, não no clique.
          </p>
        </div>
      )}
    </section>
  );
}
