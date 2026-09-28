import type { ComponentType } from 'react';

import type { MinigameItem, RoundReport } from '../../../core/minigames/types';
import type { EstadoDoCartao } from '../../../lib/pelesDeCartao';
import type { AgeProfileType } from '../../../lib/profile';

export interface PropsDeJogo {
  items: MinigameItem[];
  ageProfile: AgeProfileType;
  onFinish: (report: RoundReport) => void;
  onExit: () => void;
  /**
   * O estado do cartão de uma palavra do baralho (nova · aprendida · dominada), para quem desenha
   * cartão vestir a pele equipada (spec 5.2.4). `null`/ausente = sem pele (item de fala).
   */
  estadoDoCartao?: (cardId: string) => EstadoDoCartao | null;
}

/**
 * Record EXAUSTIVO: um jogo novo em MINIGAMES nao compila ate declarar aqui se tem tela propria
 * (componente) ou se e servido por outro caminho (null). Antes disto a cascata de `Play.tsx` era
 * uma fila de `if` por id, e um id sem `if` caia em tela vazia sem erro nenhum.
 */
export type TelaDoJogo = ComponentType<PropsDeJogo> | null;
