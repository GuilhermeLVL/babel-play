import { CreditCard } from 'lucide-react';
import { useEffect, useState } from 'react';

import { PLAN_MATRIX } from '../../core/planos';
import { carregarStatusDeBilling, estadoDaConta, type StatusDeBilling } from '../../lib/assinatura';
import { edicaoEstatica } from '../../lib/edicaoEstatica';
import { getEntitlements, onPlanChange } from '../../lib/entitlements';
import { t } from '../../lib/i18n';
import { aoMudarIdentidade, estadoDeIdentidade } from '../../lib/identidade';
import { navegarPara } from '../../lib/rotas';
import FaixaDeAvisoDoQuest from './quest/FaixaDeAvisoDoQuest';

/**
 * O PAGAMENTO ATRASADO NÃO PODE SER SURPRESA (funil de 29/09).
 *
 * Com a cobrança do Asaas vencida, o servidor marca a assinatura `past_due` e ela segue valendo por
 * um tempo — mas até aqui só a tela de Planos sabia disso, e quem não abria Planos só descobria
 * quando o plano caía. Esta faixa (`aviso-info warn`, a mesma dos outros avisos do app) aparece em
 * qualquer tela, com a saída: "Ver minha assinatura" (Planos → Sua assinatura, onde está a fatura
 * em aberto).
 *
 * QUEM DECIDE É O SERVIDOR: o estado vem de `GET /api/billing/status` pelo mesmo `estadoDaConta` da
 * tela de Planos. Só com conta (sem conta não há assinatura, e nem se pergunta); nunca na edição
 * estática. Pergunta ao montar, quando a identidade vira `conta` e quando o plano muda.
 *
 * DISPENSAR vale para a sessão do navegador (`sessionStorage`): o atraso é um fato que continua
 * valendo, então o aviso volta na próxima visita — mas não persegue a pessoa tela a tela.
 */
const CHAVE_DA_DISPENSA = 'babel.aviso.pagamento-atrasado.dispensado';

function dispensadoNestaSessao(): boolean {
  try {
    return sessionStorage.getItem(CHAVE_DA_DISPENSA) === '1';
  } catch {
    return false;
  }
}

export default function AvisoDePagamentoAtrasado() {
  const [status, setStatus] = useState<StatusDeBilling | null>(null);
  const [dispensado, setDispensado] = useState(dispensadoNestaSessao);

  useEffect(() => {
    if (edicaoEstatica()) return;
    let vivo = true;
    const conferir = () => {
      if (estadoDeIdentidade() !== 'conta') {
        setStatus(null);
        return;
      }
      void carregarStatusDeBilling().then((s) => {
        if (vivo) setStatus(s);
      });
    };
    conferir();
    const semIdentidade = aoMudarIdentidade(conferir);
    const semPlano = onPlanChange(conferir);
    return () => {
      vivo = false;
      semIdentidade();
      semPlano();
    };
  }, []);

  if (dispensado || edicaoEstatica() || !status) return null;
  const conta = estadoDaConta(getEntitlements().plan, status);
  if (conta.estado !== 'falhou' || !conta.plano) return null;

  const dispensar = () => {
    try {
      sessionStorage.setItem(CHAVE_DA_DISPENSA, '1');
    } catch {
      /* sem armazenamento, some só até recarregar */
    }
    setDispensado(true);
  };

  /* QUEST: a mesma frase e as mesmas duas saídas (ver a assinatura, dispensar), acima do palco. */
  return (
    <FaixaDeAvisoDoQuest
      icone={CreditCard}
      tom="alerta"
      noTopo
      testId="aviso-de-pagamento-atrasado"
      texto={t(
        'Não conseguimos confirmar o pagamento da sua assinatura. Pague a fatura para continuar com o {plano}.',
        { plano: PLAN_MATRIX[conta.plano].rotulo },
      )}
      acoes={[
        {
          rotulo: t('Ver minha assinatura'),
          aoClicar: () => navegarPara({ view: 'planos', planosTela: 'assinatura' }),
        },
      ]}
      aoDispensar={dispensar}
      rotuloDeDispensar={t('Dispensar aviso')}
    />
  );
}
