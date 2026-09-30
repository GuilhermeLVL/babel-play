import {
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

import { brl, type Conta, dataCurta, type Fatura, ROTULO_DO_METODO } from '../../../lib/assinatura';
import { Dialogo, fecharDialogoDe } from '../../ui';
import { irAjuda, PLANO_NOME } from './dados';

/**
 * OS DIÁLOGOS DE "SUA ASSINATURA" — `dialogoPagamento`, `dialogoPausar` e `dialogoFatura` do
 * protótipo aprovado, com a mesma casca (`.dlg-cab`, `.dlg-corpo`, `.dlg-pe`). O `dialogoMudarPlano`
 * saiu com a matriz v2 (um plano pago só); a troca de CICLO, mensal ↔ anual, volta com o C5/C7.
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
        <p>
          Você escolhe <b>Pix, boleto ou cartão a cada cobrança</b>, na página segura do Asaas que chega por e-mail.
          Para pagar com outro cartão, basta escolhê-lo ali.
        </p>
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
