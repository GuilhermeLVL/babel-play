import type { MinigameId } from '@core';
import { ClockPlus, Flag } from 'lucide-react';
import { useState } from 'react';

import { ajudasDoJogo, SEGUNDOS_A_MAIS } from '../../../core/minigames/regras';
import { t } from '../../../lib/i18n';
import { useNivelDoJogo } from '../../../lib/jogos/nivelDoJogo';
import { play } from '../../../lib/soundFx';
import { BotaoDeAjuda } from './HudDaRodada';

/**
 * AS AJUDAS QUE TODO JOGO COM RELÓGIO TEM — as duas saídas de quem travou.
 *
 *   - "+10 s": dez segundos a mais NESTA jogada. Não custa nota: o relógio aperta, não mede. Quantas
 *     por rodada depende do nível (`core/minigames/regras.ts`, ajuda `tempo`).
 *   - "Ver resposta": quem não lembra não precisa ficar olhando o relógio acabar. Mostra a resposta e
 *     segue, e conta como o tempo esgotado sempre contou: "não lembrei" (`revealed`), sem meio-termo.
 *
 * O jogo continua dono do relógio: aqui só mora o botão, a contagem e o texto, para as duas ajudas
 * terem a mesma cara e o mesmo preço em todos os jogos.
 */
export default function AjudasGerais({
  jogo,
  parado,
  aoGanharTempo,
  aoVerResposta,
}: {
  jogo: MinigameId;
  /** A jogada não aceita ajuda agora (contagem, pausa, resposta já dada, rodada no fim). */
  parado: boolean;
  aoGanharTempo: (segundos: number) => void;
  aoVerResposta: () => void;
}) {
  const nivel = useNivelDoJogo(jogo);
  const [resta, setResta] = useState(() => ajudasDoJogo(jogo, 'tempo', nivel));
  return (
    <>
      <BotaoDeAjuda
        icone={ClockPlus}
        rotulo={t('+10 s')}
        resta={resta}
        disabled={parado}
        title={t('Dez segundos a mais nesta jogada. Não custa nota.')}
        data-ajuda="tempo"
        onClick={() => {
          if (resta <= 0) return;
          setResta((r) => r - 1);
          play('timeBonus');
          aoGanharTempo(SEGUNDOS_A_MAIS);
        }}
      />
      <BotaoDeAjuda
        icone={Flag}
        rotulo={t('Ver resposta')}
        disabled={parado}
        title={t('Mostra a resposta e passa para a próxima.')}
        custo={t('conta como não lembrei')}
        data-ajuda="resposta"
        onClick={aoVerResposta}
      />
    </>
  );
}
