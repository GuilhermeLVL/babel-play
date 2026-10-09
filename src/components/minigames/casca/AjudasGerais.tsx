import type { MinigameId } from '@core';
import { Eye, Timer } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';

import { jogoTemVerResposta, SEGUNDOS_A_MAIS as SEGUNDOS, vezesDaAjuda } from '../../../core/minigames/regras';
import { useQuestNovo } from '../../../lib/dispositivo/telaNovaDoQuest';
import { useNivelDoJogo } from '../../../lib/jogos/nivelDoJogo';
import { flutuar } from '../../../lib/polimento/jogos';
import { sentir } from '../../../lib/polimento/sentidos';
import { BotaoDeAjuda } from './HudDaRodada';

/** Quanto o "+10 s" devolve ao relógio (`jogos4.js:161`). */
export const SEGUNDOS_A_MAIS = SEGUNDOS;
/** Quanto a resposta fica à vista (`jogos4.js:172`, `jogos4.css:14`). */
const RESPOSTA_A_VISTA_MS = 3600;

/**
 * AS AJUDAS GERAIS — porte de `ajudasDe()` e `usarAjuda()` do protótipo (`jogos4.js:69-78, 154-182`).
 *
 *   - "+10 s" (só nos jogos com relógio, o Duelo entre eles): devolve dez segundos. De graça. 3, 2 ou 1
 *     por rodada. Sobe "+10s" do botão (`jogos4.js:164`).
 *   - "Ver resposta": mostra a resposta no alto do palco por 3,6 s e a rodada CONTINUA. Custa: zera o
 *     combo, e o acerto que vier depois vale só o mínimo (quem chama marca o item como "com dica").
 *     2, 1 ou 1 por rodada. Não existe na Memória, na Mala, no Cadavre e no Karaokê.
 *
 * As quantidades vêm de `core/minigames/regras.ts`. O jogo continua dono do relógio e da resposta; aqui
 * moram os botões, a contagem e a faixa da resposta. Só gasta a ajuda que fez alguma coisa: sem relógio
 * correndo (`aoGanharTempo` devolve `false`) ou sem resposta a mostrar, nada é descontado.
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
  /** Ausente: o jogo não tem relógio, e o "+10 s" não aparece. Devolver `false` diz que não havia relógio correndo. */
  aoGanharTempo?: (segundos: number) => boolean | void;
  /** A resposta da jogada de agora; `null` quando não há o que mostrar. */
  resposta: () => string | null;
  /** A resposta foi mostrada: o jogo zera a sequência e marca a jogada como "com dica". */
  aoVerResposta: () => void;
}) {
  const nivel = useNivelDoJogo(jogo);
  const questNovo = useQuestNovo();
  /* A contagem é a do nível em que a rodada começou: trocar o nível recomeça a rodada. */
  const [tempo, setTempo] = useState(
    () => vezesDaAjuda(jogo, 'tempo', nivel) || { facil: 3, medio: 2, dificil: 1 }[nivel],
  );
  const [vezes, setVezes] = useState(() => vezesDaAjuda(jogo, 'resposta', nivel));
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
          onClick={(e) => {
            if (tempo <= 0) return;
            if (aoGanharTempo(SEGUNDOS_A_MAIS) === false) return;
            setTempo((n) => n - 1);
            sentir('moeda', 'timeBonus'); /* `jogos4.js:165` */
            if (questNovo) flutuar(e.currentTarget, '+10s', 'good');
          }}
        />
      )}
      {jogoTemVerResposta(jogo) && (
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
            sentir('liga'); /* `jogos4.js:176` */
          }}
        />
      )}
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
