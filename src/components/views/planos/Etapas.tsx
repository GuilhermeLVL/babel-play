import { Check } from 'lucide-react';
import { Fragment } from 'react';

/**
 * AS ETAPAS DO CHECKOUT E DO CANCELAMENTO — o `ol.stepper` do protótipo aprovado, na mesma
 * marcação: cada etapa é um `li` (`.on` a atual, `.feito` as anteriores) e entre elas um
 * `li.traco` decorativo.
 */
export default function Etapas({ passos, atual }: { passos: string[]; atual: number }) {
  return (
    <ol className="stepper" aria-label="Etapas">
      {passos.map((t, i) => (
        <Fragment key={t}>
          {i > 0 && <li className="traco" aria-hidden />}
          <li className={atual === i ? 'on' : atual > i ? 'feito' : ''} aria-current={atual === i ? 'step' : undefined}>
            <span>{atual > i ? <Check aria-hidden /> : i + 1}</span>
            {t}
          </li>
        </Fragment>
      ))}
    </ol>
  );
}

/** Volta a rolagem da tela ao topo ao trocar de etapa (o `$('#rolagem').scrollTop = 0` do protótipo). */
export const rolarAoTopo = (): void => document.querySelector('.rolagem')?.scrollTo?.({ top: 0 });
