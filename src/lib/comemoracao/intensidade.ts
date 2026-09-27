import type { MinigameId } from '../../core/minigames/types';

/**
 * O QUE ACONTECEU e O QUANTO MERECE — a parte do motor de comemoração que não conhece DOM.
 *
 * Escala por raridade (a regra de `lib/juice`): o comum é discreto porque acontece o tempo todo;
 * o exagero fica para o que é raro. Uma estrela não solta confete; três estrelas soltam a
 * finalização. Se tudo brilhasse, nada brilharia.
 */

export type EventoDeComemoracao =
  | { tipo: 'acerto'; combo: number; el?: Element | null; pontos?: number }
  | { tipo: 'erro'; el?: Element | null }
  | { tipo: 'combo'; multiplicador: number; el?: Element | null }
  | { tipo: 'recorde'; el?: Element | null }
  | { tipo: 'rodada'; estrelas: 0 | 1 | 2 | 3; jogo: MinigameId; el?: Element | null }
  | { tipo: 'maestria'; jogo: MinigameId; nivel: 1 | 2 | 3 | 4 | 5 }
  | { tipo: 'conquista' }
  | { tipo: 'bau'; raridade: 'comum' | 'raro' }
  | { tipo: 'nivel' };

export type Intensidade = 'discreta' | 'media' | 'forte' | 'maxima';

export function intensidadeDe(ev: EventoDeComemoracao): Intensidade {
  switch (ev.tipo) {
    case 'acerto':
    case 'erro':
      return 'discreta';
    case 'combo':
      return 'media';
    case 'rodada':
      return ev.estrelas === 3 ? 'maxima' : ev.estrelas === 2 ? 'media' : 'discreta';
    case 'bau':
      return ev.raridade === 'raro' ? 'forte' : 'media';
    case 'maestria':
      return ev.nivel === 5 ? 'maxima' : 'forte';
    case 'recorde':
    case 'conquista':
    case 'nivel':
      return 'forte';
  }
}
