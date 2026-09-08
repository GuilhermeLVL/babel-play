import type { ComponentType } from 'react';
import type { MinigameItem, RoundReport } from '../../../core/minigames/types';
import type { AgeProfileType } from '../../../lib/profile';

export interface PropsDeJogo {
  items: MinigameItem[];
  ageProfile: AgeProfileType;
  onFinish: (report: RoundReport) => void;
  onExit: () => void;
}

/**
 * Record EXAUSTIVO: um jogo novo em MINIGAMES nao compila ate declarar aqui se tem tela propria
 * (componente) ou se e servido por outro caminho (null). Antes disto a cascata de `Play.tsx` era
 * uma fila de `if` por id, e um id sem `if` caia em tela vazia sem erro nenhum.
 */
export type TelaDoJogo = ComponentType<PropsDeJogo> | null;
