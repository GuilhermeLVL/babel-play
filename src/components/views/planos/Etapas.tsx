import { Check } from 'lucide-react';
import { Fragment } from 'react';

import { useQuestNovo } from '../../../lib/dispositivo/telaNovaDoQuest';
import { t } from '../../../lib/i18n';

/**
 * AS ETAPAS DO CHECKOUT E DO CANCELAMENTO — o `ol.stepper` do protótipo aprovado, na mesma
 * marcação: cada etapa é um `li` (`.on` a atual, `.feito` as anteriores) e entre elas um
 * `li.traco` decorativo.
 *
 * No Meta Quest, a mesma lista com as medidas do headset (`.qc-etapas` em `questConta.css`).
 */
export default function Etapas({ passos, atual }: { passos: string[]; atual: number }) {
  const questNovo = useQuestNovo();
  if (questNovo)
    return (
      <ol className="qc-etapas" aria-label={t('Etapas')}>
        {passos.map((passo, i) => (
          <Fragment key={passo}>
            {i > 0 && <li className="qc-traco" aria-hidden />}
            <li
              className={atual === i ? 'qc-atual' : atual > i ? 'qc-feita' : undefined}
              aria-current={atual === i ? 'step' : undefined}
            >
              <span>{atual > i ? <Check aria-hidden /> : i + 1}</span>
              {t(passo)}
            </li>
          </Fragment>
        ))}
      </ol>
    );

  return (
    <ol className="stepper" aria-label={t('Etapas')}>
      {passos.map((passo, i) => (
        <Fragment key={passo}>
          {i > 0 && <li className="traco" aria-hidden />}
          <li className={atual === i ? 'on' : atual > i ? 'feito' : ''} aria-current={atual === i ? 'step' : undefined}>
            <span>{atual > i ? <Check aria-hidden /> : i + 1}</span>
            {t(passo)}
          </li>
        </Fragment>
      ))}
    </ol>
  );
}

/**
 * Volta a rolagem da tela ao topo ao trocar de etapa (o `$('#rolagem').scrollTop = 0` do protótipo). No
 * Quest quem rola é o palco (`.q-palco`).
 */
export const rolarAoTopo = (): void =>
  (document.querySelector('.q-palco.qc') ?? document.querySelector('.rolagem'))?.scrollTo?.({ top: 0 });
