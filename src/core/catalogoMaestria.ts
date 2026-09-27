import {
  ACERTOS_DE_MAESTRIA,
  ACERTOS_GENERICOS,
  COMBOS_GENERICOS,
  type EfeitoDeJogo,
  FINALIZACOES_DE_MAESTRIA,
} from './efeitosDeJogo';
import { JOGOS_DA_MAESTRIA, NOME_DO_JOGO_NA_MAESTRIA } from './maestria';
import type { ItemDaLoja } from './tiposDaLoja';

/**
 * OS ITENS DA ONDA 3 NO CATÁLOGO (recompensas v2): efeitos de jogo, molduras e títulos.
 *
 * Arquivo próprio, concatenado em `CATALOGO_DA_LOJA` numa linha, para a onda 4 (temas, legendas,
 * cartões — `catalogoV2.ts`) acrescentar em paralelo sem conflito em `loja.ts`.
 *
 * DUAS FAMÍLIAS, e a diferença é a porta:
 *
 *  · GENÉRICOS (6 acertos, 4 combos): só Seeds, SEM nível. A simulação da onda 2 mostrou que o nível
 *    da conta abre tudo antes de as Seeds juntarem; item novo com nível seria item de graça.
 *
 *  · DE MAESTRIA (18 × 4 = 72): só a maestria do jogo abre — sem nível, sem Seeds, sem Créditos,
 *    nunca no baú (`ehSorteavelNoDrop` exige preço em Seeds). Cada jogo dá, na escada da spec 8.1:
 *      nível 2 (Prata)   → o efeito de acerto do jogo;
 *      nível 3 (Ouro)    → a moldura de perfil;
 *      nível 4 (Platina) → a finalização do jogo;
 *      nível 5 (Mestre)  → o título "Mestre de <jogo>" (e libera a finalização em qualquer jogo).
 *    Moldura e título são dado + posse nesta onda; aparecem no perfil na onda 5.
 */

function deEfeito(e: EfeitoDeJogo): ItemDaLoja {
  const base = { id: e.id, tipo: e.tipo, alvo: e.id, nome: e.nome, desc: e.desc, raridade: e.raridade };
  if (e.jogo) {
    return { ...base, jogo: e.jogo, origemMaestria: { jogo: e.jogo, nivel: e.tipo === 'finalizacao' ? 4 : 2 } };
  }
  return { ...base, precoSeeds: e.precoSeeds };
}

const MOLDURAS: ItemDaLoja[] = JOGOS_DA_MAESTRIA.map((jogo) => ({
  id: `moldura-${jogo}`,
  tipo: 'moldura',
  alvo: jogo,
  nome: `Moldura ${NOME_DO_JOGO_NA_MAESTRIA[jogo]}`,
  desc: `Moldura de perfil de quem chegou ao Ouro em ${NOME_DO_JOGO_NA_MAESTRIA[jogo]}.`,
  raridade: 'epico',
  jogo,
  origemMaestria: { jogo, nivel: 3 },
}));

const TITULOS: ItemDaLoja[] = JOGOS_DA_MAESTRIA.map((jogo) => ({
  id: `titulo-${jogo}`,
  tipo: 'titulo',
  alvo: jogo,
  nome: `Mestre de ${NOME_DO_JOGO_NA_MAESTRIA[jogo]}`,
  desc: `O título de quem chegou ao nível Mestre em ${NOME_DO_JOGO_NA_MAESTRIA[jogo]}.`,
  raridade: 'lendario',
  jogo,
  origemMaestria: { jogo, nivel: 5 },
}));

export const CATALOGO_DA_MAESTRIA: ItemDaLoja[] = [
  ...ACERTOS_GENERICOS.map(deEfeito),
  ...COMBOS_GENERICOS.map(deEfeito),
  ...ACERTOS_DE_MAESTRIA.map(deEfeito),
  ...MOLDURAS,
  ...FINALIZACOES_DE_MAESTRIA.map(deEfeito),
  ...TITULOS,
];
