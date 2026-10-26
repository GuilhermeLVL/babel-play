import React from 'react';

import type { LivroDoCatalogo } from '../../../core/livros/tipos';
import { t } from '../../../lib/i18n';

/** Um tom estável por livro (o mesmo livro tem sempre a mesma lombada), só para distinguir as capas. */
function tomDe(id: string): number {
  let h = 0;
  for (const c of id) h = (h * 31 + c.charCodeAt(0)) % 360;
  return h;
}

export const autoresDe = (l: Pick<LivroDoCatalogo, 'autores'>) => l.autores.map((a) => a.nome).join(', ');

/**
 * A CAPA DESENHADA: nenhum livro do catálogo traz imagem de capa (as do Standard Ebooks têm licença própria
 * e as do Gutenberg são do projeto). Uma lombada colorida com o título e o autor em tinta do tema mantém o
 * contraste em claro e escuro, e o tom do id distingue um livro do outro.
 */
export function CapaDoLivro({ livro, grande = false }: { livro: LivroDoCatalogo; grande?: boolean }) {
  return (
    <span
      className={`lv-capa${grande ? ' grande' : ''}`}
      style={{ '--lv-tom': tomDe(livro.id) } as React.CSSProperties}
      aria-hidden
    >
      <span className="lv-capa-titulo" lang={livro.idioma}>
        {livro.titulo}
      </span>
      <span className="lv-capa-autor">{autoresDe(livro)}</span>
    </span>
  );
}

export function rotuloDoTempo(minutos: number): string {
  if (minutos < 60) return t('{n} min', { n: minutos });
  const horas = Math.round(minutos / 60);
  return t('{n} h', { n: horas });
}

/** O livro numa prateleira ou na lista de resultados: um alvo só, que abre o detalhe. */
export default function CartaoDoLivro({ livro, aoAbrir }: { livro: LivroDoCatalogo; aoAbrir: () => void }) {
  return (
    <li className="lv-item">
      <button type="button" className="lv-cartao" onClick={aoAbrir} data-livro={livro.id}>
        <CapaDoLivro livro={livro} />
        <span className="lv-cartao-texto">
          <b lang={livro.idioma}>{livro.titulo}</b>
          <span className="lv-autor">{autoresDe(livro)}</span>
          <span className="lv-selos">
            {livro.nivel && (
              <span className="lv-selo" title={t('Nível estimado')}>
                {livro.nivel}
              </span>
            )}
            <span className="lv-selo fraco">{rotuloDoTempo(livro.minutosEstimados)}</span>
          </span>
        </span>
      </button>
    </li>
  );
}
