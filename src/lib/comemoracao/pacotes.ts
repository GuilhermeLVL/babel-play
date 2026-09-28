import type { MinigameId } from '@core';

import {
  efeitoQueVale,
  efeitosGuardados,
  jogoDaComemoracao,
  RECEITAS_DE_ACERTO,
  RECEITAS_DE_COMBO,
  RECEITAS_DE_FINALIZACAO,
} from './efeitos';

/**
 * OS PACOTES DE EFEITO — o que cada efeito equipado desenha.
 *
 * Um efeito é só um par (rajada, forma): o motor (`planoDeComemoracao`) decide QUANDO e QUANTO; o
 * pacote decide COMO aparece. O `padrao` de cada tipo é o retorno que os jogos já tinham; a onda 3
 * (maestria) acrescenta as receitas do catálogo de efeitos (`./efeitos`): 6 acertos e 4 combos
 * genéricos, 18 acertos e 18 finalizações de maestria. A posse vem dos créditos, não daqui.
 */

export type { PacoteDeEfeito } from './tipos';
import type { PacoteDeEfeito } from './tipos';

/** Os efeitos equipados agora: um id por tipo de efeito de jogo. */
export interface EfeitosEquipados {
  acerto: string;
  combo: string;
  finalizacao: string;
}

export const EFEITOS_PADRAO: EfeitosEquipados = { acerto: 'padrao', combo: 'padrao', finalizacao: 'padrao' };

/** Acertou um item: a faísca curta e verde. */
export const ACERTOS: Record<string, PacoteDeEfeito> = {
  padrao: { kind: 'xp' },
  ...RECEITAS_DE_ACERTO,
};

/** O multiplicador subiu de degrau: faísca quente. */
export const COMBOS: Record<string, PacoteDeEfeito> = {
  padrao: { kind: 'combo' },
  ...RECEITAS_DE_COMBO,
};

/** Rodada de três estrelas: a chuva de confete do topo. */
export const FINALIZACOES: Record<string, PacoteDeEfeito> = {
  padrao: { kind: 'perfeito', forma: 'confete' },
  ...RECEITAS_DE_FINALIZACAO,
};

/** Id desconhecido (item removido, dado antigo) cai no padrão, nunca em `undefined`. */
export function pacote(tabela: Record<string, PacoteDeEfeito>, id: string): PacoteDeEfeito {
  return tabela[id] ?? tabela.padrao;
}

/**
 * Os efeitos que valem AGORA: o que o usuário equipou, filtrado pela posse (maestria creditada) e
 * pelo jogo (`efeitoQueVale`). Sem jogo explícito, vale o jogo em curso (a casca da rodada avisa).
 * Nada equipado, item removido ou fora do jogo de origem: o padrão.
 */
export function efeitosEquipados(jogo: MinigameId | null = jogoDaComemoracao()): EfeitosEquipados {
  const g = efeitosGuardados();
  return {
    acerto: efeitoQueVale('efeito-acerto', g.acerto, jogo),
    combo: efeitoQueVale('efeito-combo', g.combo, jogo),
    finalizacao: efeitoQueVale('finalizacao', g.finalizacao, jogo),
  };
}
