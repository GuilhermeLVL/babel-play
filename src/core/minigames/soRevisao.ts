import type { VocabCard } from '../../types';
import { triarCartoes } from '../learning/quality';

/**
 * "SÓ REVISÃO": o PISO para o item que nenhum jogo consegue usar.
 *
 * Quem importa um baralho o fez de propósito. Uma palavra sem tradução e sem frase não serve a
 * jogo nenhum (todos precisam de uma pista), mas continua sendo vocabulário da pessoa: ela some
 * dos jogos, e não pode sumir do app. Aqui ela vira uma revisão simples (lembrei / não lembrei)
 * que grava na memória, sem mecânica. É piso, não destino: item que serve a um jogo vai ao jogo.
 *
 * Só entra o defeito `sem-pista`: ruído, palavra gramatical, duplicata e idioma incerto continuam
 * fora de propósito (não são vocabulário que a pessoa quis estudar).
 */
export function itensSoRevisao(cards: VocabCard[], lang: string): VocabCard[] {
  const { fora } = triarCartoes(
    (cards ?? []).filter((c) => c.inDeck !== false),
    { lang },
  );
  return fora.filter((f) => f.motivo === 'sem-pista' && f.card.word.trim()).map((f) => f.card);
}
