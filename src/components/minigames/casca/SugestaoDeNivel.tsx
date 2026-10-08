import { Gauge } from 'lucide-react';
import { useState } from 'react';

import { sugestaoDeNivel } from '../../../core/minigames/regras';
import type { MinigameId } from '../../../core/minigames/types';
import { useQuestNovo } from '../../../lib/dispositivo/telaNovaDoQuest';
import { t } from '../../../lib/i18n';
import { guardarNivelDoJogo, lerNivelDoJogo } from '../../../lib/jogos/nivelDoJogo';
import { nomeDoNivel } from './SeletorDeNivel';

/**
 * A SUGESTÃO DE NÍVEL NO FIM DA RODADA: quem errou mais da metade ouve que existe um nível mais leve;
 * quem fechou tudo, que existe um mais apertado (`sugestaoDeNivel`, em `core/minigames/regras.ts`).
 *
 * O seletor mora na pausa, e quem está perdendo raramente pausa para procurar ajuste. Aqui a oferta
 * chega na hora em que faz sentido, e é só uma oferta: nada muda sem o toque.
 *
 * Com `aoRepetir`, aceitar joga de novo as mesmas palavras já no nível novo. Sem ele (a rodada não
 * pode ser repetida), a escolha fica guardada para a próxima.
 */
export default function SugestaoDeNivel({
  jogo,
  precisao,
  aoRepetir,
}: {
  jogo: MinigameId;
  /** A precisão da rodada, de 0 a 100. */
  precisao: number;
  aoRepetir: (() => void) | null;
}) {
  const questNovo = useQuestNovo();
  /* O nível em que a rodada FOI jogada: lido uma vez, para a oferta não mudar depois de aceita. */
  const [jogado] = useState(() => lerNivelDoJogo(jogo));
  const [aceito, setAceito] = useState(false);
  const novo = sugestaoDeNivel(jogo, jogado, precisao);
  if (!novo) return null;

  const nivel = nomeDoNivel(novo);
  const desce = novo === 'facil' || (novo === 'medio' && jogado === 'dificil');
  const texto = aceito
    ? t('Pronto: a próxima rodada deste jogo vem no {nivel}.', { nivel })
    : desce
      ? t('Foi puxado desta vez. No {nivel} o jogo aperta menos.', { nivel })
      : t('Rodada sem erro. No {nivel} o jogo aperta mais.', { nivel });
  const aceitar = () => {
    guardarNivelDoJogo(jogo, novo);
    if (aoRepetir) aoRepetir();
    else setAceito(true);
  };

  return (
    <div className={questNovo ? 'q-aviso' : 'aviso-info'} data-sugestao-de-nivel={novo} role="note">
      <span>
        {/* No desenho novo a faixa vizinha (a próxima recompensa) é só texto: esta segue igual. */}
        {!questNovo && <Gauge aria-hidden style={{ display: 'inline-block', verticalAlign: -3 }} />} {texto}
      </span>
      {!aceito && (
        <button type="button" className={questNovo ? 'q-ctl' : 'btn btn-outline peq'} onClick={aceitar}>
          {t('Jogar no {nivel}', { nivel })}
        </button>
      )}
    </div>
  );
}
