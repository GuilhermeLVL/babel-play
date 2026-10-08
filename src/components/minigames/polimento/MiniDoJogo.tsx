import type { MinigameId } from '@core';
import type { CSSProperties } from 'react';

import { textosDoJogo } from './textos';

/**
 * A MINIATURA DO JOGO — a cena pequena do protótipo (`minis.js`, `minis.css`): desenhada em HTML e CSS
 * com as cores do tema, MOSTRA a mecânica. Parada de fábrica; anda com o ponteiro em cima do cartão
 * (e devagar o tempo todo onde não há ponteiro). É enfeite para o leitor de tela.
 *
 * A marcação é a do protótipo, guardada em `src/data/polimento/jogos-textos.json`: texto fixo do
 * repositório, nunca conteúdo de quem usa o app.
 */
export default function MiniDoJogo({ jogo, cor = 'var(--accent)' }: { jogo: MinigameId; cor?: string }) {
  const cena = textosDoJogo(jogo)?.mini;
  if (!cena) return null;
  return (
    <span
      className="px-mini"
      data-mini={jogo}
      aria-hidden="true"
      style={{ '--mm': cor } as CSSProperties}
      dangerouslySetInnerHTML={{ __html: cena }}
    />
  );
}
