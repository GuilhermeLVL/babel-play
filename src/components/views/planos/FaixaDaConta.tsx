import {
  CalendarX,
  Check,
  Cpu,
  CreditCard,
  Hourglass,
  RotateCcw,
  Server,
  Settings,
  Settings2,
  TriangleAlert,
} from 'lucide-react';
import type { ReactNode } from 'react';

import {
  brl,
  type Conta,
  dataCurta,
  formaDaConta,
  parcelasDoAnual,
  precoAnual,
  precoMensal,
  rotuloDaForma,
} from '../../../lib/assinatura';
import { t } from '../../../lib/i18n';
import { faseDoFimDoTeste } from '../../../lib/ofertas/fimDoTeste';
import { navegarPara } from '../../../lib/rotas';
import { T } from '../../../lib/T';
import { PLANO_ICO, PLANO_NOME } from './dados';

/**
 * "SEU PLANO AGORA" — a faixa do topo de Planos e de Sua assinatura (`faixaConta()` do protótipo).
 *
 * Os textos são os do protótipo com os dados do servidor: a data é o fim do período pago
 * (`valeAte`), o valor é o da matriz. O que o app não sabe, a faixa não diz — não há "no Visa
 * •••• 4242" porque o cartão fica no Asaas, e não há "tentamos de novo em 3 dias" porque quem
 * decide a nova tentativa é o processador.
 *
 * O CICLO E O MEIO (C7): "Premium · mensal", "· anual" ou "· anual em 12x", cada um com a sua frase
 * — o mensal cobra todo mês, o anual renova em um ano pelo preço do ano, o 12x NÃO renova sozinho.
 *
 * O TESTE (C6/C7): quem está nos 14 dias vê até quando vale e que nada é cobrado — em D-3 e em D0 a
 * frase é a do aviso `fim_do_teste`, para a tela e o aviso dizerem a mesma coisa.
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
  const forma = formaDaConta(conta);
  const plano = conta.plano ?? 'premium';
  const comCiclo = `${p} · ${rotuloDaForma(forma)}`;
  const ate = dataCurta(conta.valeAte);
  const IconePago = PLANO_ICO[plano];
  /* QUEST: os mesmos selos e os mesmos botoes, com as pecas do headset (so a classe muda). */
  const classeDoSelo = (tom: 'ok' | 'warn' | 'neu') =>
    `q-tag ${tom === 'ok' ? 'qc-bom' : tom === 'warn' ? 'qc-atencao' : 'off'}`;
  const botaoDeContorno = 'q-ctl';
  const botaoSolido = 'q-ctl pri';

  let icone = Cpu;
  let titulo: ReactNode = rotuloGratis;
  let selo: ReactNode = <span className={classeDoSelo('neu')}>{t('Plano atual')}</span>;
  let texto: ReactNode = t('Tudo roda no seu aparelho. Assine para usar a IA de nuvem e estudar em qualquer lugar.');
  let acao: ReactNode = null;

  /* O que cada forma cobra, na frase de quem está em dia. */
  const cobrancaDaForma = (): ReactNode => {
    if (forma === 'concedido') return t('Sem cobrança: o plano foi concedido pela equipe.');
    if (forma === 'anual_12x')
      return (
        <T
          txt="Pago em 12x no cartão: o acesso vale até <b>{data}</b>. Não renova sozinho: no fim do ano, você escolhe de novo."
          val={{ data: ate }}
        />
      );
    const valor = forma === 'anual' ? brl(precoAnual(plano)) : brl(precoMensal(plano));
    if (conta.proximaCobranca)
      return forma === 'anual' ? (
        <T txt="Renova em <b>{data}</b>: {valor} por ano." val={{ data: dataCurta(conta.proximaCobranca), valor }} />
      ) : (
        <T txt="Próxima cobrança em <b>{data}</b>: {valor}." val={{ data: dataCurta(conta.proximaCobranca), valor }} />
      );
    return forma === 'anual' ? t('{valor} por ano.', { valor }) : t('{valor} por mês.', { valor });
  };

  if (estado === 'selfhost') {
    icone = Server;
    titulo = 'Self-host';
    selo = (
      <span className={classeDoSelo('ok')}>
        <Check aria-hidden /> {t('Tudo liberado')}
      </span>
    );
    texto = t('O app roda no seu computador: nada de cota, nada de cobrança. Os planos abaixo são para usar na nuvem.');
    acao = (
      <button type="button" className={botaoDeContorno} onClick={() => navegarPara({ view: 'settings' })}>
        <Settings aria-hidden /> {t('Onde as contas rodam')}
      </button>
    );
  } else if (estado === 'teste') {
    icone = Hourglass;
    titulo = t('{plano} · teste', { plano: PLANO_NOME.premium });
    selo = (
      <span className={classeDoSelo('ok')}>
        <Hourglass aria-hidden /> {t('Teste grátis')}
      </span>
    );
    const fase = conta.valeAte ? faseDoFimDoTeste(conta.valeAte) : null;
    texto =
      fase === 'd0' ? (
        t('Seu teste do Premium termina hoje. Depois a conta volta ao Grátis sozinha, e nada é cobrado.')
      ) : fase === 'd3' ? (
        <T
          txt="Seu teste do Premium termina em 3 dias, em <b>{data}</b>. Depois a conta volta ao Grátis sozinha, e nada é cobrado."
          val={{ data: ate }}
        />
      ) : (
        <T
          txt="Seu teste do Premium vale até <b>{data}</b>. No fim, a conta volta ao Grátis sozinha, e nada é cobrado."
          val={{ data: ate }}
        />
      );
  } else if (estado === 'ativa') {
    icone = IconePago;
    titulo = comCiclo;
    selo = (
      <span className={classeDoSelo('ok')}>
        <Check aria-hidden /> {t('Ativa')}
      </span>
    );
    /* A data da cobrança é a do Asaas (`proximaCobranca`), não `valeAte` (que soma a graça). */
    texto = cobrancaDaForma();
    acao = naAssinatura ? null : (
      <button type="button" className={botaoDeContorno} onClick={aoGerenciar}>
        <Settings2 aria-hidden /> {t('Gerenciar')}
      </button>
    );
  } else if (estado === 'falhou') {
    icone = TriangleAlert;
    titulo = comCiclo;
    selo = (
      <span className={classeDoSelo('warn')}>
        <TriangleAlert aria-hidden /> {t('Pagamento pendente')}
      </span>
    );
    /* No 12x o que falta é UMA parcela; no mensal e no anual, a cobrança do período. */
    const oQue =
      forma === 'anual_12x'
        ? t('Não recebemos o pagamento de uma parcela de {parcela}.', { parcela: brl(parcelasDoAnual(plano).padrao) })
        : forma === 'anual'
          ? t('Não recebemos o pagamento da anuidade.')
          : t('Não recebemos o pagamento desta mensalidade.');
    texto = conta.valeAte ? (
      <>
        {oQue}{' '}
        <T
          txt="O acesso continua até <b>{data}</b>; pague a fatura em aberto para não perder o {plano}."
          val={{ data: ate, plano: p }}
        />
      </>
    ) : (
      `${oQue} ${t('Pague a fatura em aberto para não perder o {plano}.', { plano: p })}`
    );
    acao = (
      <button type="button" className={botaoSolido} onClick={aoAtualizarPagamento}>
        <CreditCard aria-hidden /> {t('Atualizar pagamento')}
      </button>
    );
  } else if (estado === 'cancelada') {
    icone = CalendarX;
    titulo = comCiclo;
    selo = <span className={classeDoSelo('neu')}>{t('Cancelada')}</span>;
    texto =
      forma === 'anual_12x' ? (
        <T
          txt="Você continua com o {plano} até <b>{data}</b>. As parcelas que faltam seguem no cartão; nada novo é cobrado. Depois disso, volta para o Grátis."
          val={{ plano: p, data: ate }}
        />
      ) : (
        <T
          txt="Você continua com o {plano} até <b>{data}</b>. Depois disso, volta para o Grátis. Nenhuma cobrança nova."
          val={{ plano: p, data: ate }}
        />
      );
    acao = (
      <button type="button" className={botaoSolido} onClick={aoReativar}>
        <RotateCcw aria-hidden /> {t('Reativar')}
      </button>
    );
  }

  const Icone = icone;
  return (
    <section
      className={`q-cartao qc-agora${estado === 'falhou' ? ' qc-alerta' : ''}`}
      aria-label={t('Seu plano agora')}
    >
      <span className="q-ic">
        <Icone aria-hidden />
      </span>
      <div>
        <span className="q-rotulo">{t('Seu plano agora')}</span>
        <h2>
          {titulo} {selo}
        </h2>
        <p>{texto}</p>
      </div>
      {acao}
    </section>
  );
}
