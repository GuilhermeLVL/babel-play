import { Gauge } from 'lucide-react';

import { jogoTemNiveis, NIVEIS_DO_JOGO, type NivelDoJogo } from '../../../core/minigames/regras';
import type { MinigameId } from '../../../core/minigames/types';
import { useQuestNovo } from '../../../lib/dispositivo/telaNovaDoQuest';
import { t } from '../../../lib/i18n';
import { guardarNivelDoJogo, useNivelDoJogo } from '../../../lib/jogos/nivelDoJogo';

/** O nome do nível como a pessoa lê. Função, e não tabela, para o `t()` ver cada frase. */
export function nomeDoNivel(nivel: NivelDoJogo): string {
  if (nivel === 'facil') return t('Fácil');
  if (nivel === 'dificil') return t('Difícil');
  return t('Médio');
}

/**
 * O NÍVEL DO JOGO, dentro da pausa: Fácil, Médio ou Difícil (`core/minigames/regras.ts`).
 *
 * Trocar RECOMEÇA a rodada. Uma rodada pela metade com dois níveis misturados não diria nada: o
 * relógio e as vidas já gastos eram de outra regra. Por isso mora na pausa, ao lado de "Recomeçar",
 * e avisa antes.
 *
 * Jogo sem regra que o nível mude (os de produção livre, os de voz) não mostra nada.
 */
export default function SeletorDeNivel({ jogo, aoTrocar }: { jogo: MinigameId; aoTrocar: () => void }) {
  const nivel = useNivelDoJogo(jogo);
  const questNovo = useQuestNovo();
  if (!jogoTemNiveis(jogo)) return null;

  const escolher = (novo: NivelDoJogo) => {
    if (novo === nivel) return;
    guardarNivelDoJogo(jogo, novo);
    aoTrocar();
  };
  const botoes = NIVEIS_DO_JOGO.map((n) => (
    <button
      key={n}
      type="button"
      className={questNovo ? 'q-aba' : undefined}
      aria-pressed={n === nivel}
      onClick={() => escolher(n)}
    >
      {nomeDoNivel(n)}
    </button>
  ));

  if (questNovo) {
    return (
      <div className="q-ajuste" data-nivel-do-jogo={nivel}>
        <div>
          <b>
            <Gauge aria-hidden /> {t('Nível')}
          </b>
          <small>{t('Trocar o nível recomeça a rodada.')}</small>
        </div>
        <div className="q-abas q-seg" role="group" aria-label={t('Nível')}>
          {botoes}
        </div>
      </div>
    );
  }
  return (
    <div className="op-linha" style={{ padding: '6px 4px' }} data-nivel-do-jogo={nivel}>
      <b>
        <Gauge aria-hidden style={{ display: 'inline-block', width: 16, height: 16, verticalAlign: -3 }} /> {t('Nível')}
      </b>
      <div className="seg" role="group" aria-label={t('Nível')} title={t('Trocar o nível recomeça a rodada.')}>
        {botoes}
      </div>
    </div>
  );
}
