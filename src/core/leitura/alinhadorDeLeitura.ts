/**
 * O ALINHADOR DA LEITURA EM VOZ ALTA (spec `leitura-ativa-voz-alta`; design §4). Diz ONDE a pessoa está no texto a
 * partir dos parciais do reconhecimento local, e nunca que ela errou.
 *
 * COMO. O estado é imutável: as palavras do texto, a marca de cada uma (`pendente`, `lida`, `pulada`) e o cursor.
 * Cada parcial é a hipótese da fala corrente ("lia" → "lia likes" → "lia likes apples"); as palavras novas são as
 * que vêm depois do prefixo igual ao parcial anterior (assim uma palavra que o reconhecedor corrige por baixo —
 * "sick" → "six" — é tentada de novo). Só volta a ser tentada a posição da hipótese que ainda não tinha casado: a
 * revisão de uma palavra já lida ("lia" → "leah") não anda o cursor. Cada palavra nova procura a primeira igual na janela `[cursor, cursor+6)`:
 * casou → as de antes viram `pulada`, ela vira `lida`, o cursor anda. Não casou → nada muda (ruído, hesitação,
 * palavra fora da janela). O final de uma fala zera a hipótese: a fala seguinte começa do zero.
 *
 * O CURSOR SÓ AVANÇA. Uma palavra lida nunca volta a pendente e o destaque não pisca para trás. Quem move o cursor
 * para trás (ou para longe) é a pessoa, tocando na palavra (`reposicionar`), e isso não marca nada como pulada.
 *
 * IGUALDADE GENEROSA. Sem acento, caixa e pontuação; flexão vale ("apple" lê "apples"); algarismo vale o número
 * ("6" lê "six"); palavra longa com uma letra de diferença vale ("marked" lê "market"). O reconhecedor corrige
 * para a palavra esperada com frequência, então "trocada" não existe aqui: o pior que acontece é "pulada", que a
 * tela mostra como "O Frasy não ouviu bem", nunca como erro.
 *
 * Puro: sem DOM, sem relógio, sem rede.
 */
import { chaveDaPalavra } from '../texto/palavra';
import type { FraseDoTexto } from './narracao';
import { dividirTexto, mesmoLema, type PalavraDaLeitura } from './textoDaLeitura';

export type MarcaDaPalavra = 'pendente' | 'lida' | 'pulada';
/** O que a tela pinta: a marca, e `atual` para a palavra pendente sob o cursor. */
export type EstadoDaPalavra = MarcaDaPalavra | 'atual';

/** Até quantas palavras à frente do cursor uma palavra ouvida pode casar. */
export const JANELA_DO_ALINHADOR = 6;
/** A fração de palavras lidas de uma frase que dá a estrela. */
export const FRACAO_DA_ESTRELA = 0.8;

export interface EstadoDoAlinhador {
  readonly lang: string;
  readonly frases: readonly FraseDoTexto[];
  readonly palavras: readonly PalavraDaLeitura[];
  readonly marcas: readonly MarcaDaPalavra[];
  /** O índice da próxima palavra a ler; `palavras.length` = o texto acabou. */
  readonly cursor: number;
  /** As palavras (já normalizadas) da hipótese da fala corrente que já foram aplicadas. */
  readonly hipotese: readonly string[];
  /**
   * Por posição da hipótese da fala corrente: aquela posição já casou com uma palavra do texto. Uma revisão do
   * reconhecedor nessa posição ("lia" → "leah") não é tentada de novo, senão casaria mais adiante e o cursor
   * pularia o que ninguém leu. Só cresce durante a fala; o final zera.
   */
  readonly casadas: readonly boolean[];
}

/** Hesitações que o reconhecedor às vezes escreve: nunca casam e nunca contam. */
const HESITACOES = new Set(['um', 'uh', 'uhm', 'umm', 'hmm', 'hm', 'er', 'erm', 'ah', 'eh', 'mm']);

const NUMEROS_EN: Record<string, string> = {
  0: 'zero',
  1: 'one',
  2: 'two',
  3: 'three',
  4: 'four',
  5: 'five',
  6: 'six',
  7: 'seven',
  8: 'eight',
  9: 'nine',
  10: 'ten',
  11: 'eleven',
  12: 'twelve',
  13: 'thirteen',
  14: 'fourteen',
  15: 'fifteen',
  16: 'sixteen',
  17: 'seventeen',
  18: 'eighteen',
  19: 'nineteen',
  20: 'twenty',
  30: 'thirty',
  40: 'forty',
  50: 'fifty',
  100: 'hundred',
};

/** A palavra ouvida como a comparação a vê: chave, com o algarismo por extenso no inglês. */
function normalizarOuvida(w: string, lang: string): string {
  const chave = chaveDaPalavra(w);
  if (/^\d+$/.test(chave) && lang.startsWith('en')) return NUMEROS_EN[Number(chave)] ?? chave;
  return chave;
}

/** Distância de edição limitada (para "uma letra de diferença"). */
function distancia(a: string, b: string): number {
  if (Math.abs(a.length - b.length) > 1) return 2;
  const linha = Array.from({ length: b.length + 1 }, (_, j) => j);
  for (let i = 1; i <= a.length; i++) {
    let anterior = linha[0];
    linha[0] = i;
    for (let j = 1; j <= b.length; j++) {
      const guardado = linha[j];
      linha[j] = Math.min(linha[j] + 1, linha[j - 1] + 1, anterior + (a[i - 1] === b[j - 1] ? 0 : 1));
      anterior = guardado;
    }
  }
  return linha[b.length];
}

/** A palavra ouvida (normalizada) lê a palavra do texto? */
function casa(ouvida: string, p: PalavraDaLeitura, lang: string): boolean {
  if (ouvida === p.chave) return true;
  if (mesmoLema(ouvida, p.chave, lang)) return true;
  return ouvida.length >= 5 && p.chave.length >= 5 && distancia(ouvida, p.chave) <= 1;
}

export function criarAlinhador(texto: string, lang = 'en'): EstadoDoAlinhador {
  const { frases, palavras } = dividirTexto(texto, lang);
  return { lang, frases, palavras, marcas: palavras.map(() => 'pendente'), cursor: 0, hipotese: [], casadas: [] };
}

/** Uma palavra ouvida, na janela à frente do cursor. */
function ouvir(e: { marcas: MarcaDaPalavra[]; cursor: number }, ouvida: string, s: EstadoDoAlinhador): boolean {
  const fim = Math.min(s.palavras.length, e.cursor + JANELA_DO_ALINHADOR);
  for (let i = e.cursor; i < fim; i++) {
    if (!casa(ouvida, s.palavras[i], s.lang)) continue;
    for (let k = e.cursor; k < i; k++) if (e.marcas[k] === 'pendente') e.marcas[k] = 'pulada';
    e.marcas[i] = 'lida';
    e.cursor = i + 1;
    return true;
  }
  return false;
}

/**
 * Aplica um parcial (a hipótese inteira da fala corrente). `final`: a fala acabou; a próxima começa uma hipótese
 * nova. Devolve o MESMO objeto quando nada muda (a tela não repinta à toa).
 */
export function aplicarParcial(
  s: EstadoDoAlinhador,
  parcial: string,
  opcoes: { final?: boolean } = {},
): EstadoDoAlinhador {
  const ouvidas = parcial
    .split(/\s+/)
    .map((w) => normalizarOuvida(w, s.lang))
    .filter((w) => w && !HESITACOES.has(w));
  let comum = 0;
  while (comum < ouvidas.length && comum < s.hipotese.length && ouvidas[comum] === s.hipotese[comum]) comum++;
  const trabalho = { marcas: [...s.marcas], cursor: s.cursor };
  const casadas = [...s.casadas];
  for (let i = comum; i < ouvidas.length; i++) {
    /* Posição que já casou nesta fala: é revisão do reconhecedor, não palavra nova. */
    if (casadas[i]) continue;
    if (ouvir(trabalho, ouvidas[i], s)) casadas[i] = true;
  }
  const hipotese = opcoes.final ? [] : ouvidas;
  const casadasAgora = opcoes.final ? [] : casadas;
  const mudou =
    trabalho.cursor !== s.cursor ||
    trabalho.marcas.some((m, i) => m !== s.marcas[i]) ||
    hipotese.length !== s.hipotese.length ||
    hipotese.some((w, i) => w !== s.hipotese[i]) ||
    casadasAgora.length !== s.casadas.length ||
    casadasAgora.some((c, i) => c !== s.casadas[i]);
  return mudou ? { ...s, marcas: trabalho.marcas, cursor: trabalho.cursor, hipotese, casadas: casadasAgora } : s;
}

/**
 * A pessoa tocou na palavra `i` ("O Frasy se perdeu um pouco. Toque na palavra onde você está."): o cursor vai
 * para lá, sem marcar como pulada nada do caminho. A hipótese corrente é esquecida (ela era de outro lugar).
 */
export function reposicionar(s: EstadoDoAlinhador, i: number): EstadoDoAlinhador {
  const cursor = Math.max(0, Math.min(Math.trunc(i), s.palavras.length));
  return { ...s, cursor, hipotese: [], casadas: [] };
}

export function estadoDaPalavra(s: EstadoDoAlinhador, i: number): EstadoDaPalavra {
  const m = s.marcas[i] ?? 'pendente';
  return m === 'pendente' && i === s.cursor ? 'atual' : m;
}

/** As frases já atravessadas: nenhuma palavra pendente nelas. */
export function frasesConcluidas(s: EstadoDoAlinhador): number[] {
  const abertas = new Set<number>();
  s.palavras.forEach((p, i) => {
    if (s.marcas[i] === 'pendente') abertas.add(p.frase);
  });
  return s.frases.map((_, i) => i).filter((i) => !abertas.has(i) && s.palavras.some((p) => p.frase === i));
}

/** A frase concluída com pelo menos 80% das palavras lidas ganha a estrela discreta (Read Along). */
export function temEstrela(s: EstadoDoAlinhador, frase: number): boolean {
  let total = 0;
  let lidas = 0;
  s.palavras.forEach((p, i) => {
    if (p.frase !== frase) return;
    total++;
    if (s.marcas[i] === 'lida') lidas++;
    else if (s.marcas[i] === 'pendente') total = Number.NaN;
  });
  return total > 0 && lidas / total >= FRACAO_DA_ESTRELA;
}

/** As palavras puladas, uma vez cada, como aparecem no texto (sem a pontuação das bordas). */
export function palavrasPuladas(s: EstadoDoAlinhador): string[] {
  const vistas = new Set<string>();
  const out: string[] = [];
  s.palavras.forEach((p, i) => {
    if (s.marcas[i] !== 'pulada' || vistas.has(p.chave)) return;
    vistas.add(p.chave);
    out.push(p.texto.replace(/^[^\p{L}\p{N}]+|[^\p{L}\p{N}]+$/gu, ''));
  });
  return out;
}

/**
 * Acima disto ninguém está lendo o texto (leitura rápida de nativo fica perto de 250–300 por minuto): o número não
 * aparece e a leitura não conta para a missão.
 */
export const TETO_DE_PALAVRAS_POR_MINUTO = 300;

/** "Cerca de N palavras por minuto" (só para adulto em voz alta). `null` sem tempo medido ou acima do teto. */
export function palavrasPorMinuto(palavras: number, ms: number): number | null {
  if (!(ms > 0) || !(palavras > 0)) return null;
  const ppm = Math.round((palavras * 60_000) / ms);
  return ppm > TETO_DE_PALAVRAS_POR_MINUTO ? null : ppm;
}
