/**
 * A FORÇA DE UMA PALAVRA, de 1 a 4 — o "quão firme está" que o LingQ mostra como status 1–4, mas DERIVADO do
 * agendador (FSRS-5) em vez de marcado à mão: não há status manual que brigue com a repetição espaçada.
 *
 *   1  Nova         sem revisão ainda (sem estabilidade, ou nenhuma repetição)
 *   2  Reconhecida  estabilidade abaixo de 3 dias
 *   3  Familiar     estabilidade de 3 a menos de 21 dias
 *   4  Firme        estabilidade de 21 dias ou mais
 *
 * REBAIXAMENTO: um cartão com muitos esquecimentos (3 ou mais `lapses`) perde um nível, nunca abaixo de 2 (ele já
 * foi revisado). O FSRS já derruba a estabilidade num esquecimento; isto só segura quem esquece sempre, para não
 * ganhar o quarto traço por um pico de estabilidade. O banco guarda só a CONTAGEM de esquecimentos, não quando
 * ocorreram, então "recente" não existe aqui: a regra não depende do relógio, e por isso a força pode ser
 * filtrada e ordenada em SQL.
 *
 * O "Conhecida" do LingQ é a marcação "Já sei" que já existe (`marcadas.ts`): outra coisa, e não entra aqui.
 *
 * A regra é espelhada em SQL em `server/db/repositories/vocab.ts` (`forcaSql`); os limiares saem DAQUI, e o teste
 * da rota confere que as duas dão o mesmo.
 */
export type Forca = 1 | 2 | 3 | 4;

/** Estabilidade (dias) a partir da qual a palavra é Familiar (3) e Firme (4). */
export const LIMIAR_FAMILIAR_DIAS = 3;
export const LIMIAR_FIRME_DIAS = 21;
/** Esquecimentos a partir dos quais a força cai um nível. */
export const LAPSES_QUE_REBAIXAM = 3;

export const FORCAS: readonly Forca[] = [1, 2, 3, 4];

/** O que a regra lê de um cartão: tanto a linha do banco quanto o `VocabCard` do cliente servem. */
export interface CartaoParaForca {
  stability?: number | null;
  fsrsStability?: number | null;
  reps?: number | null;
  lapses?: number | null;
}

export function forcaDoCartao(c: CartaoParaForca): Forca {
  const estabilidade = c.stability ?? c.fsrsStability ?? null;
  if (estabilidade == null || estabilidade <= 0 || !(c.reps ?? 0)) return 1;
  const base: Forca = estabilidade < LIMIAR_FAMILIAR_DIAS ? 2 : estabilidade < LIMIAR_FIRME_DIAS ? 3 : 4;
  if (base > 2 && (c.lapses ?? 0) >= LAPSES_QUE_REBAIXAM) return (base - 1) as Forca;
  return base;
}
