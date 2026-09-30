import { Check, Clock, LoaderCircle, Mic, PartyPopper, Receipt } from 'lucide-react';
import { useEffect, useState } from 'react';

import {
  brl,
  carregarFaturas,
  carregarStatusDeBilling,
  dataCurta,
  type Fatura,
  planoPagoDe,
  precoMensal,
  type StatusDeBilling,
} from '../../../lib/assinatura';
import { carregarEntitlements } from '../../../lib/entitlements';
import { t } from '../../../lib/i18n';
import { registrarAssinaturaConcluida } from '../../../lib/ofertas/instrumentacao';
import { navegarPara } from '../../../lib/rotas';
import { IconeEmBloco, Tela } from '../../ui';
import { irSub, PLANO_NOME, planoPorId } from './dados';

/**
 * ASSINATURA CONFIRMADA — `T.assinado` do protótipo aprovado.
 *
 * É O RETORNO DEPOIS DO PAGAMENTO CONFIRMADO PELO SERVIDOR. A tela não acredita em quem a abriu:
 * pergunta a `/api/billing/status` e só comemora se a assinatura estiver `active` (o webhook do
 * Asaas é quem põe esse estado, quando o dinheiro entra). Aberta antes disso — ou digitada na
 * barra de endereço —, ela mostra que ainda espera a confirmação e continua perguntando.
 */
export default function Assinado() {
  const [status, setStatus] = useState<StatusDeBilling | null | 'carregando'>('carregando');
  const [faturas, setFaturas] = useState<Fatura[] | null>(null);

  useEffect(() => {
    let vivo = true;
    const ver = async () => {
      const s = await carregarStatusDeBilling();
      if (!vivo) return;
      setStatus(s);
      if (s?.assinatura?.status === 'active') {
        void carregarEntitlements();
        /* Fim do funil das ofertas (Fase 8). Conta uma vez por checkout iniciado neste aparelho:
           recarregar esta tela não soma de novo. */
        registrarAssinaturaConcluida();
        const f = await carregarFaturas();
        if (vivo) setFaturas(f);
        return true;
      }
      return false;
    };
    let id = 0;
    void ver().then((ok) => {
      if (!ok && vivo)
        id = window.setInterval(() => void ver().then((pronto) => pronto && window.clearInterval(id)), 5000);
    });
    return () => {
      vivo = false;
      window.clearInterval(id);
    };
  }, []);

  const a = status !== 'carregando' ? status?.assinatura : null;
  const confirmada = !!a && a.status === 'active' && planoPagoDe(a.plano) !== null;

  if (!confirmada) {
    return (
      <Tela largura="estreita">
        <section className="cartao p6 sucesso entra">
          <div className="vazio">
            <IconeEmBloco icone={status === 'carregando' ? LoaderCircle : Clock} />
            <h3>{status === 'carregando' ? 'Conferindo o pagamento…' : 'Ainda não recebemos a confirmação'}</h3>
            <p>
              {status === 'carregando'
                ? 'Perguntando ao servidor se o pagamento já entrou.'
                : 'O plano libera quando o processador confirmar o pagamento. Pix e cartão costumam levar alguns minutos; boleto, até 2 dias úteis. Esta tela continua conferindo sozinha.'}
            </p>
          </div>
          <div className="linha" style={{ gap: 10, justifyContent: 'center', flexWrap: 'wrap', marginTop: 20 }}>
            <button type="button" className="btn btn-outline" onClick={() => irSub(null)}>
              Ver planos
            </button>
          </div>
        </section>
      </Tela>
    );
  }

  const plano = planoPagoDe(a.plano) ?? 'premium';
  const P = PLANO_NOME[plano];
  const ultima = faturas?.find((f) => f.status === 'paga') ?? null;
  const hoje = new Date().toISOString().slice(0, 10);

  return (
    <Tela largura="estreita">
      <section className="cartao p6 sucesso entra">
        <div className="selo-ok" aria-hidden>
          <Check />
        </div>
        <span className="sobrancelha" style={{ justifyContent: 'center' }}>
          <PartyPopper aria-hidden /> Assinatura confirmada
        </span>
        <h1 style={{ fontSize: 30, fontWeight: 900, margin: '6px 0 8px' }}>Bem-vindo ao {P}!</h1>
        <p className="mut" style={{ maxWidth: '52ch', margin: '0 auto' }}>
          Já está tudo liberado. O recibo fica em Planos → Sua assinatura.
        </p>
        <ul className="lista-check liberado">
          {planoPorId(plano).itens.map(([, t]) => (
            <li key={t}>
              <Check aria-hidden />
              {t}
            </li>
          ))}
        </ul>
        <dl className="dados centro">
          <div>
            <dt>Plano</dt>
            <dd>{P} · mensal</dd>
          </div>
          <div>
            <dt>{ultima && ultima.data !== hoje ? `Pago em ${dataCurta(ultima.data)}` : 'Pago hoje'}</dt>
            <dd className="tn">{brl(ultima?.valor ?? precoMensal(plano))}</dd>
          </div>
          {/* A PRÓXIMA COBRANÇA vem do Asaas (`proximaCobranca`). `valeAte` é outra coisa — o vencimento
              mais a graça de atraso — e aparece como "acesso até" quando o Asaas não respondeu. */}
          <div>
            <dt>{status !== 'carregando' && status?.proximaCobranca ? t('Próxima cobrança em') : t('Acesso até')}</dt>
            <dd className="tn">
              {dataCurta(status !== 'carregando' && status?.proximaCobranca ? status.proximaCobranca : a.valeAte)}
            </dd>
          </div>
        </dl>
        <div className="linha" style={{ gap: 10, justifyContent: 'center', flexWrap: 'wrap', marginTop: 20 }}>
          <button type="button" className="btn btn-solid grande" onClick={() => navegarPara({ view: 'capture' })}>
            <Mic aria-hidden /> Começar a usar
          </button>
          <button type="button" className="btn btn-outline" onClick={() => irSub('assinatura')}>
            <Receipt aria-hidden /> Ver minha assinatura
          </button>
        </div>
      </section>
    </Tela>
  );
}
