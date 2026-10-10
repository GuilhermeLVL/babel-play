import { ArrowLeftRight, LifeBuoy, LoaderCircle, TriangleAlert } from 'lucide-react';
import { useState } from 'react';

import { brl, type Conta, dataCurta, type PlanoPago, precoMensal, trocarDePlano } from '../../../lib/assinatura';
import { t } from '../../../lib/i18n';
import { toast } from '../../Toast';
import { Dialogo, fecharDialogoDe } from '../../ui';
import { irAjuda } from './dados';
import { nomeDoPlano, ordemDoPlano } from './quatroPlanos';

/**
 * TROCAR DE PLANO — a confirmação antes de `POST /api/billing/trocar` (`lib/assinatura.trocarDePlano`).
 *
 * O protótipo dos quatro planos não tem este diálogo: lá o botão do cartão só avisa "no app, aqui abre
 * o pagamento" (`planos4.js:806-810`). No app o toque muda o VALOR da próxima cobrança, e isso não se faz
 * sem a pessoa confirmar. A casca é a dos outros diálogos da assinatura (`DialogosDaAssinatura.tsx`).
 *
 * A REGRA É DO SERVIDOR (`design.md` §11, item 11): a troca vale no próximo ciclo, sem pro-rata; até lá
 * o plano é o que está pago. Aqui só se pede e se mostra o que voltou. Rota ausente (servidor anterior)
 * vira "ainda não disponível", com o caminho do suporte.
 */
export function DialogoTrocar({
  conta,
  para,
  aoFechar,
  aoTrocado,
}: {
  conta: Conta;
  para: PlanoPago;
  aoFechar: () => void;
  /** A troca foi gravada: a tela relê o estado da conta. */
  aoTrocado: () => void;
}) {
  const [ocupado, setOcupado] = useState(false);
  const [erro, setErro] = useState('');
  const [semRota, setSemRota] = useState(false);
  const atual = conta.plano ?? 'premium';
  const novo = nomeDoPlano(para);
  const desce = ordemDoPlano(para) < ordemDoPlano(atual);
  const titulo = desce ? t('Mudar para o {plano}', { plano: novo }) : t('Assinar {plano}', { plano: novo });
  const quando = conta.proximaCobranca ?? conta.valeAte;

  const confirmar = async (botao: HTMLElement) => {
    setOcupado(true);
    setErro('');
    const r = await trocarDePlano(para);
    setOcupado(false);
    if (!r.ok) {
      setSemRota(!!r.indisponivel);
      setErro(
        r.indisponivel
          ? t(
              'A troca de plano por aqui ainda não está disponível. Fale com o suporte para mudar sem pagar duas vezes.',
            )
          : (r.erro ?? t('Não consegui trocar o plano agora. Tente de novo.')),
      );
      return;
    }
    toast.ok(
      r.trocaPendente?.aPartirDe
        ? t('Troca pedida: o {plano} passa a valer em {data}.', {
            plano: novo,
            data: dataCurta(r.trocaPendente.aPartirDe),
          })
        : t('Troca pedida: o {plano} passa a valer no próximo ciclo.', { plano: novo }),
    );
    fecharDialogoDe(botao);
    aoTrocado();
  };

  return (
    <Dialogo
      icone={ArrowLeftRight}
      titulo={titulo}
      sub={t('{valor} por mês, a partir do próximo ciclo.', { valor: brl(precoMensal(para)) })}
      largura=""
      aoFechar={aoFechar}
    >
      <div className="dlg-corpo pilha">
        <p>
          {t('A troca vale no próximo ciclo, sem cobrança proporcional. Até lá você continua com o {plano}.', {
            plano: nomeDoPlano(atual),
          })}
          {quando ? ` ${t('O {plano} passa a valer em {data}.', { plano: novo, data: dataCurta(quando) })}` : ''}
        </p>
        <p className="mut" style={{ fontSize: 13 }}>
          {t('Trocar de plano nunca apaga o que você já gravou.')}
        </p>
        {erro && (
          <p className="qc-erro" role="alert">
            <TriangleAlert aria-hidden />
            <span>{erro}</span>
          </p>
        )}
      </div>
      <div className="dlg-pe">
        <button type="button" className="btn btn-outline" onClick={(e) => fecharDialogoDe(e.currentTarget)}>
          {t('Agora não')}
        </button>
        {semRota ? (
          <button
            type="button"
            className="btn btn-solid"
            onClick={(e) => {
              fecharDialogoDe(e.currentTarget);
              irAjuda();
            }}
          >
            <LifeBuoy aria-hidden /> {t('Falar com o suporte')}
          </button>
        ) : (
          <button
            type="button"
            className="btn btn-solid"
            disabled={ocupado}
            onClick={(e) => void confirmar(e.currentTarget)}
          >
            {ocupado && <LoaderCircle className="qc-gira" aria-hidden />}
            {titulo}
          </button>
        )}
      </div>
    </Dialogo>
  );
}
