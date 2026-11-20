/**
 * O RESULTADO DAS PERGUNTAS COMO UMA RODADA (spec `leitura-ativa-perguntas-e-pratica`; design, decisão 7). Vai pelo
 * mesmo caminho das rodadas de jogo (`POST /api/exercises/rodada`), com o tipo `leituraAtiva` e um `roundId` por
 * leitura: é o que a missão "Leia 1 texto" conta. Só o resultado de cada pergunta — de primeira, de segunda, não
 * acertou ou pulada —; a opção escolhida, o tempo por palavra e o texto da pessoa nunca saem do aparelho.
 *
 * Puro: sem DOM, sem rede.
 */
import { RODADA_DE_LEITURA } from '../missoes';
import { TETO_DE_PALAVRAS_POR_MINUTO } from './alinhadorDeLeitura';

/**
 * A leitura vale a missão "Leia 1 texto"? Só se o tempo na leitura cabe numa leitura de verdade: no máximo o teto de
 * palavras por minuto. Abrir e tocar "Terminei" em 1 s não vale (as perguntas ainda podem ser respondidas, mas a
 * rodada não sai).
 */
export function leituraValeAMissao(palavrasDoTexto: number, msLendo: number): boolean {
  if (!(msLendo > 0) || !(palavrasDoTexto > 0)) return false;
  return (palavrasDoTexto * 60_000) / msLendo <= TETO_DE_PALAVRAS_POR_MINUTO;
}

export type ResultadoDaPergunta = 'primeira' | 'segunda' | 'nenhuma' | 'pulada';

export interface ItemDaRodadaDeLeitura {
  /** `<textoId>#<n>`: a pergunta, nunca a resposta. */
  itemRef: string;
  correct?: number;
  attempts: number;
  kind: 'leitura';
}

export function itensDaRodadaDeLeitura(
  textoId: string,
  resultados: readonly ResultadoDaPergunta[],
): ItemDaRodadaDeLeitura[] {
  return resultados.map((r, i) => {
    const itemRef = `${textoId}#${i + 1}`;
    if (r === 'pulada') return { itemRef, attempts: 0, kind: 'leitura' };
    return { itemRef, correct: r === 'nenhuma' ? 0 : 1, attempts: r === 'primeira' ? 1 : 2, kind: 'leitura' };
  });
}

export function rodadaDaLeitura(e: {
  textoId: string;
  resultados: readonly ResultadoDaPergunta[];
  roundId: string;
  duracaoMs: number;
}) {
  return {
    roundId: e.roundId,
    exerciseKind: RODADA_DE_LEITURA,
    origem: `leitura:${e.textoId}`,
    duracaoMs: Math.max(0, Math.round(e.duracaoMs)),
    itens: itensDaRodadaDeLeitura(e.textoId, e.resultados),
  };
}
