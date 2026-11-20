import React, { useEffect, useState } from 'react';

import { onPontoFlutuante, type PontoFlutuante } from '../lib/juice';
import { zoomDoCorpo } from '../lib/zoomDoCorpo';

/**
 * A CAMADA DOS NÚMEROS QUE SOBEM ("+10", "×3").
 *
 * Vive no topo da árvore, junto do canvas de partículas, e não dentro de cada jogo. O motivo é
 * concreto: dentro do jogo, o container tem `overflow` e o número seria CORTADO na borda —
 * exatamente o defeito que o canvas de partículas tinha quando morava dentro do `<main>`.
 *
 * `pointer-events: none` em tudo: o número nunca rouba um clique da próxima jogada.
 */
export default function FloatingScoreLayer() {
  const [pontos, setPontos] = useState<PontoFlutuante[]>([]);

  useEffect(
    () =>
      onPontoFlutuante((p) => {
        setPontos((atuais) => [...atuais, p]);
        // Remove depois da animação. Sem isto a lista cresceria para sempre numa sessão longa.
        setTimeout(() => setPontos((atuais) => atuais.filter((x) => x.id !== p.id)), 1100);
      }),
    [],
  );

  if (!pontos.length) return null;
  const z = zoomDoCorpo(); // as coordenadas chegam em px da janela; o `left/top` é em px do body (zoom do A±)

  return (
    <div className="fixed inset-0 pointer-events-none z-40" aria-hidden>
      {pontos.map((p) => (
        <span
          key={p.id}
          data-flutuante={p.tom}
          className={`absolute font-display font-black text-lg select-none babel-float ${
            p.tom === 'bom' ? 'text-good-ink' : p.tom === 'ruim' ? 'text-error-ink' : 'text-ink'
          }`}
          style={{ left: p.x / z, top: p.y / z, transform: 'translate(-50%, -50%)' }}
        >
          {p.texto}
        </span>
      ))}
    </div>
  );
}
