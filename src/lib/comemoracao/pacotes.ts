import type { BurstKind, FormaParticula } from '../effects';

/**
 * OS PACOTES DE EFEITO — o que cada efeito equipado desenha.
 *
 * Um efeito é só um par (rajada, forma): o motor (`planoDeComemoracao`) decide QUANDO e QUANTO; o
 * pacote decide COMO aparece. Por enquanto existe só o `padrao` de cada tipo — é o retorno que os
 * jogos já tinham. A onda 3 (maestria) acrescenta as finalizações por jogo e os acertos/combos
 * genéricos; a posse virá dos créditos `maestria:`/`loja:`, não daqui.
 */

export interface PacoteDeEfeito {
  kind: BurstKind;
  forma?: FormaParticula;
}

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
};

/** O multiplicador subiu de degrau: faísca quente. */
export const COMBOS: Record<string, PacoteDeEfeito> = {
  padrao: { kind: 'combo' },
};

/** Rodada de três estrelas: a chuva de confete do topo. */
export const FINALIZACOES: Record<string, PacoteDeEfeito> = {
  padrao: { kind: 'perfeito', forma: 'confete' },
};

/** Id desconhecido (item removido, dado antigo) cai no padrão, nunca em `undefined`. */
export function pacote(tabela: Record<string, PacoteDeEfeito>, id: string): PacoteDeEfeito {
  return tabela[id] ?? tabela.padrao;
}

/**
 * Os efeitos que o usuário equipou. Até a onda 3 não há o que equipar: devolve o padrão. Fica
 * como função (e não constante) para a onda 3 ler a escolha sem mudar quem chama.
 */
export function efeitosEquipados(): EfeitosEquipados {
  return EFEITOS_PADRAO;
}
