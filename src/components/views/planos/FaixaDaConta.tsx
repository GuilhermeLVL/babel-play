import {
  CalendarX,
  Check,
  Cloud,
  Cpu,
  CreditCard,
  RotateCcw,
  Server,
  Settings,
  Settings2,
  Sparkles,
  TriangleAlert,
} from 'lucide-react';
import type { ReactNode } from 'react';

import { brl, type Conta, dataCurta, precoMensal } from '../../../lib/assinatura';
import { navegarPara } from '../../../lib/rotas';
import { IconeEmBloco, type TomDoIcone } from '../../ui';
import { PLANO_NOME } from './dados';

/**
 * "SEU PLANO AGORA" — a faixa do topo de Planos e de Sua assinatura (`faixaConta()` do protótipo).
 *
 * Os textos são os do protótipo com os dados do servidor: a data é o fim do período pago
 * (`valeAte`), o valor é o da matriz. O que o app não sabe, a faixa não diz — não há "no Visa
 * •••• 4242" porque o cartão fica no Asaas, e não há "tentamos de novo em 3 dias" porque quem
 * decide a nova tentativa é o processador.
 */
export default function FaixaDaConta({
  conta,
  rotuloGratis = 'Grátis',
  naAssinatura = false,
  aoGerenciar,
  aoAtualizarPagamento,
  aoReativar,
}: {
  conta: Conta;
  rotuloGratis?: string;
  /** Dentro de "Sua assinatura" o botão "Gerenciar" sai (já se está lá). */
  naAssinatura?: boolean;
  aoGerenciar: () => void;
  aoAtualizarPagamento: () => void;
  aoReativar: () => void;
}) {
  const { estado } = conta;
  const p = conta.plano ? PLANO_NOME[conta.plano] : '';
  const preco = conta.plano ? brl(precoMensal(conta.plano)) : '';
  const ate = <b>{dataCurta(conta.valeAte)}</b>;
  const IconePago = conta.plano === 'essencial' ? Sparkles : Cloud;

  let icone = Cpu;
  let tom: TomDoIcone = 'accent';
  let titulo: ReactNode = rotuloGratis;
  let selo: ReactNode = <span className="badge neu">Plano atual</span>;
  let texto: ReactNode = 'Tudo roda no seu aparelho. Assine para usar a IA de nuvem e estudar em qualquer lugar.';
  let acao: ReactNode = null;

  if (estado === 'selfhost') {
    icone = Server;
    tom = 'good';
    titulo = 'Self-host';
    selo = (
      <span className="badge ok">
        <Check aria-hidden /> Tudo liberado
      </span>
    );
    texto = 'O app roda no seu computador: nada de cota, nada de cobrança. Os planos abaixo são para usar na nuvem.';
    acao = (
      <button type="button" className="btn btn-outline" onClick={() => navegarPara({ view: 'settings' })}>
        <Settings aria-hidden /> Onde as contas rodam
      </button>
    );
  } else if (estado === 'ativa') {
    icone = IconePago;
    titulo = `${p} · mensal`;
    selo = (
      <span className="badge ok">
        <Check aria-hidden /> Ativa
      </span>
    );
    texto = conta.valeAte ? (
      <>
        Próxima cobrança em {ate}: {preco}.
      </>
    ) : (
      `${preco} por mês.`
    );
    acao = naAssinatura ? null : (
      <button type="button" className="btn btn-outline" onClick={aoGerenciar}>
        <Settings2 aria-hidden /> Gerenciar
      </button>
    );
  } else if (estado === 'falhou') {
    icone = TriangleAlert;
    tom = 'warn';
    titulo = `${p} · mensal`;
    selo = (
      <span className="badge warn">
        <TriangleAlert aria-hidden /> Pagamento pendente
      </span>
    );
    texto = conta.valeAte ? (
      <>
        Não recebemos o pagamento desta mensalidade. O acesso continua até {ate}; pague a fatura em aberto para não
        perder o {p}.
      </>
    ) : (
      `Não recebemos o pagamento desta mensalidade. Pague a fatura em aberto para não perder o ${p}.`
    );
    acao = (
      <button type="button" className="btn btn-solid" onClick={aoAtualizarPagamento}>
        <CreditCard aria-hidden /> Atualizar pagamento
      </button>
    );
  } else if (estado === 'cancelada') {
    icone = CalendarX;
    titulo = `${p} · mensal`;
    selo = <span className="badge neu">Cancelada</span>;
    texto = (
      <>
        Você continua com o {p} até {ate}. Depois disso, volta para o Grátis. Nenhuma cobrança nova.
      </>
    );
    acao = (
      <button type="button" className="btn btn-solid" onClick={aoReativar}>
        <RotateCcw aria-hidden /> Reativar
      </button>
    );
  }

  return (
    <section className={`cartao agora ${estado === 'falhou' ? 'alerta' : ''}`} aria-label="Seu plano agora">
      <IconeEmBloco icone={icone} tom={tom} />
      <div style={{ flex: 1, minWidth: 220 }}>
        <span className="label-mono">Seu plano agora</span>
        <h2>
          {titulo} {selo}
        </h2>
        <p className="mut">{texto}</p>
      </div>
      {acao}
    </section>
  );
}
