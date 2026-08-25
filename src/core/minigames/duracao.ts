/**
 * QUANTO TEMPO LEVA UMA RODADA — e por que este módulo prefere calar a chutar.
 *
 * O mockup do redesenho trazia "leva uns 4 minutos" no card de revisão. É uma frase útil: a decisão
 * de começar agora ou depois depende dela. Mas o número tem de ser MEDIDO, e este app já registra o
 * insumo: `exercise_results.ms` é gravado por item respondido, desde sempre.
 *
 * A REGRA: com poucas amostras não há estimativa, há palpite. Abaixo de `MIN_AMOSTRAS` este módulo
 * devolve `null` e a tela diz "rodada curta" — que é verdade e não promete minuto nenhum. Um "4
 * minutos" tirado de três respostas seria exatamente o tipo de número plausível-porém-inventado que
 * `tests/semConteudoFabricado.test.ts` existe para barrar.
 *
 * MEDIANA, NÃO MÉDIA. Uma rodada em que alguém saiu para o almoço com o jogo aberto produz um item
 * de 40 minutos. A média engole isso e passa a prometer meia hora por rodada; a mediana não se move.
 */

/**
 * Vinte respostas medidas. Abaixo disso a mediana ainda balança demais entre sessões — e uma
 * estimativa que muda de 2 para 6 minutos a cada rodada ensina a não confiar no número.
 */
export const MIN_AMOSTRAS = 20;

/**
 * Teto por item. Acima disso não foi tempo de resposta, foi a aba esquecida aberta — e mesmo a
 * mediana fica torta se metade das amostras for lixo desse tipo.
 */
const MS_MAX_POR_ITEM = 120_000;

/** Piso: registros de poucos milissegundos são de clique duplo ou de item pulado, não de resposta. */
const MS_MIN_POR_ITEM = 300;

export interface EstimativaDeRodada {
  /** Arredondado para cima, nunca abaixo de 1 — "0 minutos" não ajuda ninguém a decidir. */
  minutos: number;
  /** Quantas respostas sustentam o número. É o que a tela usa para se explicar, se precisar. */
  amostras: number;
}

/**
 * A mediana de tempo por item, ou `null` quando não há amostra que a sustente.
 *
 * Aceita a lista crua de `ms` — a filtragem de lixo é responsabilidade daqui, e não de cada tela que
 * chama, senão cada uma filtra de um jeito.
 */
export function medianaPorItem(amostras: readonly number[]): number | null {
  const limpas = amostras
    .filter((ms) => Number.isFinite(ms) && ms >= MS_MIN_POR_ITEM && ms <= MS_MAX_POR_ITEM)
    .sort((a, b) => a - b);

  if (limpas.length < MIN_AMOSTRAS) return null;

  const meio = limpas.length >> 1;
  return limpas.length % 2 ? limpas[meio] : (limpas[meio - 1] + limpas[meio]) / 2;
}

/**
 * Quanto deve levar uma rodada de `nItens`, dado o histórico de tempos por item.
 *
 * Devolve `null` quando não há medição suficiente. Quem chama diz "rodada curta" nesse caso — a
 * tela nunca inventa o minuto.
 */
export function estimativaDeMinutos(
  nItens: number,
  amostras: readonly number[],
): EstimativaDeRodada | null {
  if (nItens <= 0) return null;

  const mediana = medianaPorItem(amostras);
  if (mediana === null) return null;

  const limpas = amostras.filter((ms) => Number.isFinite(ms) && ms >= MS_MIN_POR_ITEM && ms <= MS_MAX_POR_ITEM);
  return {
    minutos: Math.max(1, Math.ceil((mediana * nItens) / 60_000)),
    amostras: limpas.length,
  };
}

/**
 * A frase pronta, para a tela não ter de repetir a regra do `null` em cada lugar.
 *
 * "leva uns 4 minutos" quando há medição; "rodada curta" quando não há. Os dois são verdadeiros; só
 * o primeiro é preciso, e ele só aparece quando pode ser.
 */
export function rotuloDeDuracao(estimativa: EstimativaDeRodada | null): string {
  if (!estimativa) return 'rodada curta';
  return estimativa.minutos === 1 ? 'leva cerca de 1 minuto' : `leva uns ${estimativa.minutos} minutos`;
}
