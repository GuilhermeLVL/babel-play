/**
 * MEDIDAS DO PARCIAL (change `parciais-incrementais`, D2): atraso por palavra e erasure (flicker).
 *
 * Funções PURAS, uma implementação só: a bancada (`scripts/perf/latencia-legenda`) e o cliente usam estas mesmas.
 * A entrada é a série de quadros do balão (`{ t, texto }`, o que a sonda registra em `lat.dom`), nunca o app.
 *
 * - `atrasoDePalavraMs`: por palavra de REFERÊNCIA, (primeiro quadro em que a palavra aparece, na forma que ficou no
 *   texto final) − (fim da palavra no roteiro). Palavra revista depois (apagada ou trocada) conta UMA vez, pela primeira
 *   aparição da forma final. Palavra de referência que não ficou no texto final fica de fora e é contada.
 * - `erasure` (NE, Arivazhagan et al., arXiv:1912.03393): palavras apagadas ou trocadas do fim de cada saída ao passar
 *   para a seguinte ÷ palavras do texto final.
 * - `referenciaProporcional`: para a TRADUÇÃO não há verdade por palavra; o tempo de referência de cada palavra
 *   traduzida é o fim da palavra de origem na posição proporcional. É um PROXY: só serve para comparar variantes.
 *
 * Palavra = sequência de letras/números, sem acento e em minúsculas; idiomas escritos sem espaço (chinês, japonês,
 * tailandês...) contam um caractere por palavra.
 */

export interface PalavraDeReferencia {
  /** Palavra como no roteiro (a normalização é feita aqui). */
  palavra: string;
  /** Fim da palavra, em ms, na MESMA linha do tempo dos quadros. */
  fimMs: number;
}

export interface QuadroDoBalao {
  /** Instante em que o quadro foi pintado (ms). */
  t: number;
  /** O texto visível do balão (original ou tradução) naquele quadro. */
  texto: string;
}

export interface AtrasoPorPalavra {
  /** Atraso (ms) de cada palavra de referência, na ordem; `null` = não ficou no texto final (ou nunca apareceu). */
  atrasos: (number | null)[];
  /** Quantas palavras de referência não casaram com o texto final. */
  semCasamento: number;
}

// Escritas sem espaço entre palavras: cada caractere vira uma palavra.
export const SEM_ESPACO =
  /[\p{Script=Han}\p{Script=Hiragana}\p{Script=Katakana}\p{Script=Thai}\p{Script=Lao}\p{Script=Khmer}]/u;

/** Texto → palavras normalizadas (minúsculas, sem acento latino e sem pontuação). Vazio e "…" dão `[]`. */
export function tokenizar(texto: string): string[] {
  const limpo = String(texto ?? '')
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .normalize('NFC')
    .toLowerCase();
  const saida: string[] = [];
  for (const pedaco of limpo.split(/[^\p{L}\p{N}\p{M}]+/u)) {
    if (!pedaco) continue;
    if (!SEM_ESPACO.test(pedaco)) {
      saida.push(pedaco);
      continue;
    }
    let atual = '';
    for (const ch of pedaco) {
      if (SEM_ESPACO.test(ch)) {
        if (atual) saida.push(atual);
        atual = '';
        saida.push(ch);
      } else atual += ch;
    }
    if (atual) saida.push(atual);
  }
  return saida;
}

/** Quantos tokens do começo de `a` e `b` são iguais. */
function prefixoComum(a: string[], b: string[]): number {
  let i = 0;
  while (i < a.length && i < b.length && a[i] === b[i]) i++;
  return i;
}

/**
 * Casa a referência com o texto final por alinhamento de Levenshtein por palavra e devolve, para cada palavra de
 * referência, o índice da palavra IGUAL no texto final (ou -1: apagada, trocada ou errada pelo STT).
 */
export function casarComOFinal(referencia: string[], final: string[]): number[] {
  const n = referencia.length;
  const m = final.length;
  const d: number[][] = Array.from({ length: n + 1 }, (_, i) => {
    const linha = new Array<number>(m + 1).fill(0);
    linha[0] = i;
    return linha;
  });
  for (let j = 0; j <= m; j++) d[0][j] = j;
  for (let i = 1; i <= n; i++)
    for (let j = 1; j <= m; j++)
      d[i][j] = Math.min(
        d[i - 1][j] + 1,
        d[i][j - 1] + 1,
        d[i - 1][j - 1] + (referencia[i - 1] === final[j - 1] ? 0 : 1),
      );
  const casou = new Array<number>(n).fill(-1);
  let i = n;
  let j = m;
  while (i > 0 && j > 0) {
    const igual = referencia[i - 1] === final[j - 1];
    if (igual && d[i][j] === d[i - 1][j - 1]) {
      casou[i - 1] = j - 1;
      i--;
      j--;
    } else if (d[i][j] === d[i - 1][j - 1] + 1) {
      i--;
      j--;
    } else if (d[i][j] === d[i - 1][j] + 1) i--;
    else j--;
  }
  return casou;
}

/** Fração (0 a 1) das palavras de referência que casam com o texto final (a régua dos 90% de `1.5`). */
export function fracaoCasada(referencia: string[], final: string[]): number {
  if (!referencia.length) return 0;
  return casarComOFinal(referencia, final).filter((j) => j >= 0).length / referencia.length;
}

/**
 * O atraso por palavra de UMA fala. `quadros` em ordem de tempo; o texto final é o do ÚLTIMO quadro com palavras.
 * A k-ésima ocorrência de uma palavra no texto final "aparece" no primeiro quadro que já tem k ocorrências dela
 * (palavra repetida na frase não confunde a primeira com a segunda).
 */
export function atrasoDePalavraMs(referencia: PalavraDeReferencia[], quadros: QuadroDoBalao[]): AtrasoPorPalavra {
  const series = quadros
    .map((q) => ({ t: q.t, tokens: tokenizar(q.texto) }))
    .filter((q) => q.tokens.length > 0)
    .sort((a, b) => a.t - b.t);
  const atrasos: (number | null)[] = new Array(referencia.length).fill(null);
  if (!series.length || !referencia.length) return { atrasos, semCasamento: referencia.length };
  const final = series[series.length - 1].tokens;
  const casou = casarComOFinal(
    referencia.map((r) => tokenizar(r.palavra).join('')),
    final.map((w) => w),
  );
  let semCasamento = 0;
  referencia.forEach((r, i) => {
    const j = casou[i];
    if (j < 0) {
      semCasamento++;
      return;
    }
    const palavra = final[j];
    const k = final.slice(0, j + 1).filter((w) => w === palavra).length;
    const quadro = series.find((q) => q.tokens.filter((w) => w === palavra).length >= k);
    if (quadro) atrasos[i] = Math.round(quadro.t - r.fimMs);
    else semCasamento++;
  });
  return { atrasos, semCasamento };
}

/**
 * Erasure normalizada (NE) de UMA fala: soma, para cada par de saídas consecutivas, das palavras do fim da anterior que
 * a seguinte não manteve (apagadas ou trocadas), ÷ palavras do texto final. Quadros sem palavras (balão vazio, "…")
 * não são saída. `null` se não há texto final.
 */
export function erasure(quadros: QuadroDoBalao[]): { apagadas: number; final: number; ne: number } | null {
  const saidas = quadros
    .map((q) => ({ t: q.t, tokens: tokenizar(q.texto) }))
    .filter((q) => q.tokens.length > 0)
    .sort((a, b) => a.t - b.t);
  if (!saidas.length) return null;
  let apagadas = 0;
  for (let i = 1; i < saidas.length; i++) {
    const antes = saidas[i - 1].tokens;
    apagadas += antes.length - prefixoComum(antes, saidas[i].tokens);
  }
  const final = saidas[saidas.length - 1].tokens.length;
  return { apagadas, final, ne: apagadas / final };
}

/**
 * Referência PROPORCIONAL da tradução (PROXY declarado): a j-ésima das M palavras traduzidas leva o fim da palavra de
 * origem na posição proporcional ceil((j + 1) × N / M) − 1. Devolve uma referência pronta para `atrasoDePalavraMs`.
 */
export function referenciaProporcional(
  palavrasTraduzidas: string[],
  origem: PalavraDeReferencia[],
): PalavraDeReferencia[] {
  const m = palavrasTraduzidas.length;
  const n = origem.length;
  if (!m || !n) return [];
  return palavrasTraduzidas.map((palavra, j) => ({
    palavra,
    fimMs: origem[Math.min(n - 1, Math.ceil(((j + 1) * n) / m) - 1)].fimMs,
  }));
}
