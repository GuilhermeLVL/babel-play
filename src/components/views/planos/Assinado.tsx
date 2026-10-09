import '../../../styles/questConta.css';

import { Check, Clock, LoaderCircle, Mic, PartyPopper, Receipt } from 'lucide-react';
import { useEffect, useState } from 'react';

import {
  brl,
  carregarFaturas,
  carregarStatusDeBilling,
  dataCurta,
  type Fatura,
  formaDaConta,
  parcelasDoAnual,
  planoPagoDe,
  precoAnual,
  precoMensal,
  rotuloDaForma,
  type StatusDeBilling,
} from '../../../lib/assinatura';
import { carregarEntitlements } from '../../../lib/entitlements';
import { t } from '../../../lib/i18n';
import { registrarAssinaturaConcluida } from '../../../lib/ofertas/instrumentacao';
import { navegarPara } from '../../../lib/rotas';
import { irSub, itemCompleto, PLANO_NOME, planoPorId } from './dados';

/**
 * ASSINATURA CONFIRMADA — `T.assinado` do protótipo aprovado.
 *
 * É O RETORNO DEPOIS DO PAGAMENTO CONFIRMADO PELO SERVIDOR. A tela não acredita em quem a abriu:
 * pergunta a `/api/billing/status` e só comemora se a assinatura estiver `active` (o webhook do
 * Asaas é quem põe esse estado, quando o dinheiro entra). Aberta antes disso — ou digitada na
 * barra de endereço —, ela mostra que ainda espera a confirmação e continua perguntando.
 *
 * O CICLO E O MEIO (C7): "Premium · mensal", "· anual" ou "· anual em 12x", do status; sem fatura
 * ainda, o valor mostrado é o que aquela forma cobra (o mês, o ano ou a parcela).
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

  /* QUEST, à espera da confirmação: o mesmo estado (conferindo, ainda não chegou) e a mesma saída. */
  if (!confirmada) {
    const conferindo = status === 'carregando';
    const IconeDaEspera = conferindo ? LoaderCircle : Clock;
    return (
      <div className="q-palco qc" data-testid="assinado-do-quest">
        <section className="q-cartao qc-sucesso" role="status">
          <span className={`qc-selo qc-neutro${conferindo ? ' qc-esperando' : ''}`} aria-hidden>
            <IconeDaEspera />
          </span>
          <h2>{conferindo ? t('Conferindo o pagamento…') : t('Ainda não recebemos a confirmação')}</h2>
          <p>
            {conferindo
              ? t('Perguntando ao servidor se o pagamento já entrou.')
              : t(
                  'O plano libera quando o processador confirmar o pagamento. Pix e cartão costumam levar alguns minutos; boleto, até 2 dias úteis. Esta tela continua conferindo sozinha.',
                )}
          </p>
          <div className="q-acoes">
            <button type="button" className="q-ctl" onClick={() => irSub(null)}>
              {t('Ver planos')}
            </button>
          </div>
        </section>
      </div>
    );
  }

  const plano = planoPagoDe(a.plano) ?? 'premium';
  const P = PLANO_NOME[plano];
  const forma = formaDaConta({ ciclo: a.ciclo, meio: a.meio });
  const valorDaForma =
    forma === 'anual' ? precoAnual(plano) : forma === 'anual_12x' ? parcelasDoAnual(plano).padrao : precoMensal(plano);
  const ultima = faturas?.find((f) => f.status === 'paga') ?? null;
  const hoje = new Date().toISOString().slice(0, 10);

  /* QUEST, confirmada: o que ficou liberado, o que foi pago e os dois caminhos de saída. */
  return (
    <div className="q-palco qc" data-testid="assinado-do-quest">
      <section className="q-cartao qc-sucesso">
        <span className="qc-selo" aria-hidden>
          <Check />
        </span>
        <p className="q-sobre" style={{ margin: 0 }}>
          <PartyPopper aria-hidden style={{ width: 18, height: 18, verticalAlign: -3, marginRight: 6 }} />
          {t('Assinatura confirmada')}
        </p>
        <h1>{t('Bem-vindo ao {plano}!', { plano: P })}</h1>
        <p>{t('Já está tudo liberado. O recibo fica em Planos → Sua assinatura.')}</p>
        <ul className="qc-lista">
          {planoPorId(plano).itens.map((item) => (
            <li key={item.texto}>
              <Check aria-hidden />
              {itemCompleto(item)}
            </li>
          ))}
        </ul>
        <dl className="qc-dados">
          <div>
            <dt>{t('Plano')}</dt>
            <dd>{`${P} · ${rotuloDaForma(forma)}`}</dd>
          </div>
          <div>
            <dt>
              {ultima && ultima.data !== hoje ? t('Pago em {data}', { data: dataCurta(ultima.data) }) : t('Pago hoje')}
            </dt>
            <dd>{brl(ultima?.valor ?? valorDaForma)}</dd>
          </div>
          <div>
            <dt>{status !== 'carregando' && status?.proximaCobranca ? t('Próxima cobrança em') : t('Acesso até')}</dt>
            <dd>
              {dataCurta(status !== 'carregando' && status?.proximaCobranca ? status.proximaCobranca : a.valeAte)}
            </dd>
          </div>
        </dl>
        <div className="q-acoes">
          <button type="button" className="q-ctl pri" onClick={() => navegarPara({ view: 'capture' })}>
            <Mic aria-hidden /> {t('Começar a usar')}
          </button>
          <button type="button" className="q-ctl" onClick={() => irSub('assinatura')}>
            <Receipt aria-hidden /> {t('Ver minha assinatura')}
          </button>
        </div>
      </section>
    </div>
  );
}
