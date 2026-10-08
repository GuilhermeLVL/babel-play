import type { MinigameId } from '@core';
import { Eye, Timer } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';

import { useNivelDoJogo } from '../../../lib/jogos/nivelDoJogo';
import { play } from '../../../lib/soundFx';
import { BotaoDeAjuda } from './HudDaRodada';

/** Quanto o "+10 s" devolve ao relógio (`jogos4.js:161`). */
export const SEGUNDOS_A_MAIS = 10;
/** Quanto a resposta fica à vista (`jogos4.js:172`, `jogos4.css:14`). */
const RESPOSTA_A_VISTA_MS = 3600;

/**
 * AS AJUDAS GERAIS — porte de `ajudasDe()` e `usarAjuda()` do protótipo (`jogos4.js:69-78, 154-182`).
 *
 *   - "+10 s" (só nos jogos com relógio): devolve dez segundos. De graça. 3, 2 ou 1 por rodada.
 *   - "Ver resposta": mostra a resposta no alto do palco por 3,6 s e a rodada CONTINUA. Custa: zera o
 *     combo, e o acerto que vier depois vale só o mínimo (quem chama marca o item como "com dica").
 *     2, 1 ou 1 por rodada.
 *
 * O jogo continua dono do relógio e da resposta; aqui moram os botões, a contagem e a faixa da resposta.
 */
export default function AjudasGerais({
  jogo,
  parado,
  aoGanharTempo,
  resposta,
  aoVerResposta,
}: {
  jogo: MinigameId;
  /** A jogada não aceita ajuda agora (pausa, explicação aberta, rodada no fim). */
  parado: boolean;
  /** Ausente: o jogo não tem relógio, e o "+10 s" não aparece. */
  aoGanharTempo?: (segundos: number) => void;
  /** A resposta da jogada de agora; `null` quando não há o que mostrar. */
  resposta: () => string | null;
  /** A resposta foi mostrada: o jogo zera a sequência e marca a jogada como "com dica". */
  aoVerResposta: () => void;
}) {
  const nivel = useNivelDoJogo(jogo);
  const [tempo, setTempo] = useState(() => ({ facil: 3, medio: 2, dificil: 1 })[nivel]);
  const [vezes, setVezes] = useState(() => ({ facil: 2, medio: 1, dificil: 1 })[nivel]);
  const [aVista, setAVista] = useState<{ texto: string; chave: number } | null>(null);
  const botao = useRef<HTMLSpanElement>(null);
  const [palco, setPalco] = useState<Element | null>(null);

  useEffect(() => setPalco(botao.current?.closest('.palco-jogo') ?? null), []);
  useEffect(() => {
    if (!aVista) return;
    const t = window.setTimeout(() => setAVista(null), RESPOSTA_A_VISTA_MS);
    return () => window.clearTimeout(t);
  }, [aVista]);

  return (
    <>
      <span ref={botao} hidden />
      {aoGanharTempo && (
        <BotaoDeAjuda
          icone={Timer}
          rotulo="+10 s"
          resta={tempo}
          disabled={parado}
          title="De graça"
          data-ajuda="tempo"
          onClick={() => {
            if (tempo <= 0) return;
            setTempo((n) => n - 1);
            play('timeBonus');
            aoGanharTempo(SEGUNDOS_A_MAIS);
          }}
        />
      )}
      <BotaoDeAjuda
        icone={Eye}
        rotulo="Ver resposta"
        resta={vezes}
        disabled={parado}
        title="Conta como dica: zera o combo"
        data-ajuda="resposta"
        onClick={() => {
          const r = resposta();
          if (vezes <= 0 || !r) return;
          setVezes((n) => n - 1);
          setAVista({ texto: r, chave: Date.now() });
          aoVerResposta();
        }}
      />
      {aVista &&
        palco &&
        createPortal(
          <div className="pj-resp" role="status" key={aVista.chave}>
            Resposta: <b>{aVista.texto}</b>
          </div>,
          palco,
        )}
    </>
  );
}
