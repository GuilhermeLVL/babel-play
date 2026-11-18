import { Fragment, type ReactNode } from 'react';

import type { EstadoDaPalavra } from '../../../core/leitura/alinhadorDeLeitura';
import type { TextoDividido } from '../../../core/leitura/textoDaLeitura';
import type { Etiqueta } from '../../../core/vocabulario/etiquetas';
import { t } from '../../../lib/i18n';

/**
 * O TEXTO EM PALAVRAS TOCÁVEIS (ux T3). Cada palavra é um botão com duas camadas, as duas por ATRIBUTO: a etiqueta do
 * caderno de sempre (`data-etiqueta`, `etiquetas.css`) e, na voz alta, a marca da leitura (`data-leitura`). O espaço e a
 * pontuação entre as palavras ficam como estão no texto. A frase atual da narração ganha `data-atual`.
 */
export default function TextoComPalavras(props: {
  texto: string;
  dividido: Readonly<{
    frases: readonly TextoDividido['frases'][number][];
    palavras: readonly TextoDividido['palavras'][number][];
  }>;
  /** A marca de cada palavra na voz alta; ausente nos outros modos. */
  leitura?: (i: number) => EstadoDaPalavra;
  /** A frase destacada (a narração). */
  fraseAtual?: number | null;
  /** As frases que ganharam a estrela. */
  estrelas?: ReadonlySet<number>;
  etiqueta?: (palavra: string) => Etiqueta | undefined;
  aoTocar: (i: number, alvo: HTMLElement, porTeclado: boolean) => void;
}) {
  const { texto, dividido } = props;
  const blocos: ReactNode[] = [];
  let cursor = 0;
  dividido.frases.forEach((f, iFrase) => {
    if (f.inicio > cursor) blocos.push(texto.slice(cursor, f.inicio));
    const partes: ReactNode[] = [];
    let dentro = f.inicio;
    dividido.palavras.forEach((p, i) => {
      if (p.frase !== iFrase) return;
      if (p.inicio > dentro) partes.push(texto.slice(dentro, p.inicio));
      const marca = props.leitura?.(i);
      partes.push(
        <button
          key={i}
          type="button"
          className="la-palavra"
          data-i={i}
          data-leitura={marca && marca !== 'pendente' ? marca : undefined}
          data-etiqueta={props.etiqueta?.(p.texto)}
          aria-current={marca === 'atual' ? 'true' : undefined}
          aria-description={marca === 'pulada' ? t('O Frasy não ouviu bem') : undefined}
          onClick={(e) => props.aoTocar(i, e.currentTarget, e.detail === 0)}
        >
          {texto.slice(p.inicio, p.fim)}
        </button>,
      );
      dentro = p.fim;
    });
    if (f.fim > dentro) partes.push(texto.slice(dentro, f.fim));
    blocos.push(
      <Fragment key={`f${iFrase}`}>
        <span className="la-frase" data-frase={iFrase} data-atual={props.fraseAtual === iFrase ? 'true' : undefined}>
          {partes}
        </span>
        {props.estrelas?.has(iFrase) && (
          <span className="la-estrela" role="img" aria-label={t('estrela')}>
            ★
          </span>
        )}
      </Fragment>,
    );
    cursor = f.fim;
  });
  if (cursor < texto.length) blocos.push(texto.slice(cursor));
  return (
    <p className="la-texto" lang="en" data-testid="leitura-ativa-texto">
      {blocos}
    </p>
  );
}
