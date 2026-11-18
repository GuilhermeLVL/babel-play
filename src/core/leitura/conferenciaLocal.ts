/**
 * CONFERIR SOZINHO — a checagem da escrita no aparelho (spec `leitura-ativa-escrita`; design, decisão 12). É o que
 * o plano grátis e a conta restrita recebem, e o que aparece quando a cota de retornos acaba: a contagem de
 * palavras, quais palavras-alvo do texto a pessoa usou (pelo lema: "friends" conta "friend") e as frases que
 * ficaram sem ponto final. Sem IA, sem rede.
 *
 * Puro: sem DOM, sem rede.
 */
import { mesmoLema } from './textoDaLeitura';

/** Os limites para pedir retorno (spec: de 20 a 120 palavras). */
export const MIN_PALAVRAS_DA_ESCRITA = 20;
export const MAX_PALAVRAS_DA_ESCRITA = 120;

const palavrasDe = (texto: string): string[] =>
  texto
    .split(/\s+/u)
    .map((w) => w.replace(/^[^\p{L}\p{N}]+|[^\p{L}\p{N}]+$/gu, ''))
    .filter((w) => /\p{L}/u.test(w));

/** Palavras com letra ("2" e "-" soltos não contam; "Don't" é uma). */
export const contarPalavrasDaEscrita = (texto: string): number => palavrasDe(texto).length;

export interface ConferenciaDaEscrita {
  palavras: number;
  alvoUsadas: string[];
  alvoFaltando: string[];
  /** O pedaço final de cada parágrafo que não termina em ".", "!", "?" ou "…" (fora as aspas). */
  frasesSemPonto: string[];
}

export function conferirEscrita(e: {
  texto: string;
  palavrasAlvo: readonly string[];
  lang: string;
}): ConferenciaDaEscrita {
  const palavras = palavrasDe(e.texto);
  const usada = (alvo: string) => palavras.some((p) => mesmoLema(p, alvo, e.lang));
  const frasesSemPonto: string[] = [];
  for (const paragrafo of e.texto.split(/\n+/u)) {
    const limpo = paragrafo.trim().replace(/["'”’»)\]]+$/u, '');
    if (!/\p{L}/u.test(limpo)) continue;
    if (/[.!?…]$/u.test(limpo)) continue;
    const partes = limpo.split(/(?<=[.!?…])\s+/u);
    frasesSemPonto.push(partes[partes.length - 1].trim());
  }
  return {
    palavras: palavras.length,
    alvoUsadas: e.palavrasAlvo.filter(usada),
    alvoFaltando: e.palavrasAlvo.filter((a) => !usada(a)),
    frasesSemPonto,
  };
}
