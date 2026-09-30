import {
  ArrowRight,
  CalendarRange,
  Check,
  CirclePause,
  CreditCard,
  Download,
  ExternalLink,
  FileText,
  LifeBuoy,
  Lock,
  Receipt,
} from 'lucide-react';

import {
  brl,
  type Conta,
  dataCurta,
  economiaDoAnual,
  type Fatura,
  formaDaConta,
  precoAnual,
  precoMensal,
  ROTULO_DO_METODO,
} from '../../../lib/assinatura';
import { t } from '../../../lib/i18n';
import { Dialogo, fecharDialogoDe } from '../../ui';
import { irAjuda, irSub, PLANO_NOME } from './dados';

/**
 * OS DIÁLOGOS DE "SUA ASSINATURA" — `dialogoPagamento`, `dialogoPausar` e `dialogoFatura` do
 * protótipo aprovado, com a mesma casca (`.dlg-cab`, `.dlg-corpo`, `.dlg-pe`). O `dialogoMudarPlano`
 * saiu com a matriz v2 (um plano pago só); a troca de CICLO, mensal ↔ anual, é o `DialogoCiclo` (C7).
 *
 * O QUE O SERVIDOR AINDA NÃO FAZ, O DIÁLOGO DIZ. Trocar o cartão e pausar não têm rota no servidor: a assinatura do Asaas é criada com `billingType: 'UNDEFINED'` (o pagador
 * escolhe Pix, boleto ou cartão A CADA cobrança, na página do Asaas), e não existe pausa na
 * cobrança. Criar essas operações mexe em valor e em regra de cobrança — fora do escopo desta
 * tela. Então o diálogo tem a forma do protótipo e o conteúdo honesto: o que fazer hoje, e o
 * caminho até o suporte.
 */

const fechar = (e: React.MouseEvent) => fecharDialogoDe(e.currentTarget);
const abrir = (url: string) => window.open(url, '_blank', 'noopener');

function Rodape({ children }: { children: React.ReactNode }) {
  return (
    <div className="dlg-pe">
      <button type="button" className="btn btn-outline" onClick={fechar}>
        Cancelar
      </button>
      {children}
    </div>
  );
}

function BotaoSuporte() {
  return (
    <button
      type="button"
      className="btn btn-solid"
      onClick={(e) => {
        fechar(e);
        irAjuda();
      }}
    >
      <LifeBuoy aria-hidden /> Falar com o suporte
    </button>
  );
}

/** Forma de pagamento: no Asaas, escolhida a cada cobrança. */
export function DialogoPagamento({
  conta,
  aberta,
  metodoAtual,
  aoFechar,
}: {
  conta: Conta;
  /** A fatura em aberto (atrasada/pendente), quando há — é por ela que se paga com outro meio. */
  aberta: Fatura | null;
  metodoAtual: string;
  aoFechar: () => void;
}) {
  return (
    <Dialogo
      icone={CreditCard}
      titulo="Forma de pagamento"
      sub={`Atual: ${metodoAtual}`}
      largura=""
      aoFechar={aoFechar}
    >
      <div className="dlg-corpo">
        {/* O 12x é um parcelamento no CARTÃO (C5): não há escolha a cada cobrança. */}
        {formaDaConta(conta) === 'anual_12x' ? (
          <p>
            {t(
              'No anual em 12x, as parcelas são do cartão que você usou no pagamento. Para trocar de cartão no meio do parcelamento, fale com o suporte.',
            )}
          </p>
        ) : (
          <p>
            Você escolhe <b>Pix, boleto ou cartão a cada cobrança</b>, na página segura do Asaas que chega por e-mail.
            Para pagar com outro cartão, basta escolhê-lo ali.
          </p>
        )}
        <p className="nota-seg">
          <Lock aria-hidden /> O cartão é digitado só na página do processador de pagamento. O Babel Play não vê nem
          guarda esses dados.{' '}
          {conta.estado === 'falhou' && aberta ? 'A cobrança pendente se resolve pagando a fatura em aberto.' : ''}
        </p>
      </div>
      <Rodape>
        {aberta?.link ? (
          <button
            type="button"
            className="btn btn-solid"
            onClick={(e) => {
              fechar(e);
              abrir(aberta.link!);
            }}
          >
            <ExternalLink aria-hidden /> Pagar a fatura em aberto
          </button>
        ) : (
          <BotaoSuporte />
        )}
      </Rodape>
    </Dialogo>
  );
}

/** Pausar: a cobrança não tem pausa; o suporte resolve caso a caso. */
export function DialogoPausar({ conta, aoFechar }: { conta: Conta; aoFechar: () => void }) {
  return (
    <Dialogo
      icone={CirclePause}
      tom="rare"
      titulo="Pausar a assinatura"
      sub="Sem cobrança durante a pausa. Você usa o Grátis enquanto isso."
      largura=""
      aoFechar={aoFechar}
    >
      <div className="dlg-corpo pilha">
        <p>
          A pausa ainda não é feita direto por aqui. <b>Fale com o suporte</b> e diga por quanto tempo (1, 2 ou 3
          meses).
        </p>
        <p className="mut" style={{ fontSize: 13 }}>
          Se preferir resolver agora, cancele a renovação: você continua com o{' '}
          {conta.plano ? PLANO_NOME[conta.plano] : 'plano'} até {dataCurta(conta.valeAte)} e assina de novo quando
          quiser.
        </p>
      </div>
      <Rodape>
        <BotaoSuporte />
      </Rodape>
    </Dialogo>
  );
}

/**
 * TROCAR DE CICLO (C7) — mensal ↔ anual, pelo caminho HONESTO de hoje, sem rota nova.
 *
 * POR QUE NÃO HÁ UM BOTÃO QUE TROCA NA HORA. Trocar no Asaas seria editar a assinatura (`cycle` e
 * `value`) — e aí o arrependimento de 7 dias, a data de renovação e o "o pagamento nunca encurta o
 * período" (`periodoQueVale`) teriam de ser repensados para uma cobrança que muda de natureza no meio,
 * sem sondagem no sandbox e sem o jurídico. Abrir uma SEGUNDA assinatura cobraria as duas juntas (o
 * servidor recusa: 409 `ja_assinante`). O caminho que o app já cumpre é: cancelar a renovação, ficar
 * com o que foi pago até o fim do período e, nesse dia, assinar o outro ciclo. Dentro dos 7 dias, o
 * cancelamento devolve tudo e já dá para assinar o outro na hora. O 12x não renova: no fim do ano,
 * escolhe-se de novo.
 */
export function DialogoCiclo({ conta, aoFechar }: { conta: Conta; aoFechar: () => void }) {
  const forma = formaDaConta(conta);
  const plano = conta.plano ?? 'premium';
  const p = PLANO_NOME[plano];
  const data = conta.proximaCobranca ? dataCurta(conta.proximaCobranca) : dataCurta(conta.valeAte);
  const e = economiaDoAnual(plano);
  const paraOAnual = forma === 'mensal';

  const sub = paraOAnual
    ? t('{anual} por ano: economize {economia}, o equivalente a {meses} meses grátis.', {
        anual: brl(precoAnual(plano)),
        economia: brl(e.reais),
        meses: e.meses,
      })
    : t('{mensal} por mês, depois do fim do ano pago.', { mensal: brl(precoMensal(plano)) });

  const passos: string[] =
    forma === 'anual_12x'
      ? [
          t('O anual em 12x não renova sozinho: o seu {plano} vale até {data}.', { plano: p, data }),
          t('Nesse dia, volte a Planos e assine o mensal. Até lá, as parcelas seguem no cartão.'),
        ]
      : paraOAnual
        ? [
            t('Cancele a renovação do mensal. Você continua com o {plano} até {data}.', { plano: p, data }),
            t('Nesse dia, volte a Planos e assine o anual, à vista ou em 12x no cartão.'),
          ]
        : [
            t(
              'Cancele a renovação do anual. Você continua com o {plano} até {data}, sem reembolso proporcional depois dos 7 dias.',
              { plano: p, data },
            ),
            t('Nesse dia, volte a Planos e assine o mensal.'),
          ];

  return (
    <Dialogo
      icone={CalendarRange}
      titulo={paraOAnual ? t('Passar para o anual') : t('Passar para o mensal')}
      sub={sub}
      largura=""
      aoFechar={aoFechar}
    >
      <div className="dlg-corpo pilha">
        {forma !== 'anual_12x' && (
          <p>
            {t(
              'A troca não é feita direto por aqui, para você não pagar duas vezes: a assinatura de agora continuaria cobrando junto com a nova.',
            )}
          </p>
        )}
        <ol style={{ margin: 0, paddingLeft: 20, display: 'grid', gap: 8 }}>
          {passos.map((x) => (
            <li key={x}>{x}</li>
          ))}
        </ol>
        {forma !== 'anual_12x' && (
          <p className="mut" style={{ fontSize: 13 }}>
            {t(
              'Nos primeiros 7 dias depois do primeiro pagamento, cancelar devolve o valor inteiro e encerra o acesso na hora: aí você já pode assinar o outro período.',
            )}
          </p>
        )}
      </div>
      <div className="dlg-pe">
        <button type="button" className="btn btn-outline" onClick={fechar}>
          {forma === 'anual_12x' ? t('Entendi') : t('Agora não')}
        </button>
        {forma !== 'anual_12x' && (
          <button
            type="button"
            className="btn btn-solid"
            onClick={(ev) => {
              fechar(ev);
              irSub('cancelar');
            }}
          >
            {t('Cancelar a renovação')} <ArrowRight aria-hidden />
          </button>
        )}
      </div>
    </Dialogo>
  );
}

/** Recibo de uma fatura. O comprovante e a fatura são páginas do Asaas. */
export function DialogoFatura({ fatura: f, aoFechar }: { fatura: Fatura; aoFechar: () => void }) {
  const meio = f.metodo ? ROTULO_DO_METODO[f.metodo] : 'Asaas';
  return (
    <Dialogo
      icone={Receipt}
      titulo={`Recibo ${f.id}`}
      sub={`${dataCurta(f.data)} · ${meio}`}
      largura=""
      aoFechar={aoFechar}
    >
      <div className="dlg-corpo">
        <dl className="linhas-preco">
          <div>
            <dt>{f.descricao}</dt>
            <dd className="tn">{brl(f.valor)}</dd>
          </div>
          <div className="total">
            <dt>{f.status === 'paga' ? 'Total pago' : f.status === 'estornada' ? 'Estornado' : 'Total'}</dt>
            <dd className="tn">{brl(f.valor)}</dd>
          </div>
        </dl>
      </div>
      <div className="dlg-pe">
        <button
          type="button"
          className="btn btn-outline"
          onClick={(e) => {
            fechar(e);
            irAjuda();
          }}
        >
          <FileText aria-hidden /> Nota fiscal
        </button>
        {f.recibo ? (
          <button type="button" className="btn btn-solid" onClick={() => abrir(f.recibo!)}>
            <Download aria-hidden /> Baixar recibo
          </button>
        ) : f.link ? (
          <button type="button" className="btn btn-solid" onClick={() => abrir(f.link!)}>
            <ExternalLink aria-hidden /> Ver a fatura
          </button>
        ) : (
          <button type="button" className="btn btn-solid" onClick={fechar}>
            <Check aria-hidden /> Fechar
          </button>
        )}
      </div>
    </Dialogo>
  );
}
