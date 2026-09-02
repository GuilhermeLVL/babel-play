/**
 * Uma frase por palavra, vinda do dump do Tatoeba.
 *
 * Regra: 5–12 palavras, contém a palavra, e entre as candidatas vence a que tem MENOS palavras
 * fora da faixa — uma frase cujo resto do vocabulário a pessoa já viu é exemplo; uma cheia de
 * palavras desconhecidas é outro exercício disfarçado. `avaliarFrase` é a régua real do app.
 */
import { chaveComparavel, avaliarFrase } from '../../src/core/learning/quality.ts';

const MIN_PALAVRAS = 5;
const MAX_PALAVRAS = 12;
/** Teto de candidatas guardadas por palavra: o dump tem milhões de frases e o resto é ruído. */
const MAX_CANDIDATAS = 40;

export function tokens(frase) {
  return (frase ?? '').split(/[^\p{L}'’-]+/u).map(chaveComparavel).filter(Boolean);
}

/** Índice `chave da palavra` → frases candidatas. Só entra frase que passa na régua. */
export function indexar(frasesBrutas, { maxCandidatas = MAX_CANDIDATAS } = {}) {
  const indice = new Map();
  for (const frase of frasesBrutas ?? []) {
    const t = tokens(frase);
    if (t.length < MIN_PALAVRAS || t.length > MAX_PALAVRAS) continue;
    if (!avaliarFrase(frase, { minPalavras: MIN_PALAVRAS, maxPalavras: MAX_PALAVRAS }).serve) continue;
    const item = { frase, tokens: t };
    for (const chave of new Set(t)) {
      const lista = indice.get(chave);
      if (!lista) indice.set(chave, [item]);
      else if (lista.length < maxCandidatas) lista.push(item);
    }
  }
  return indice;
}

/** `null` quando nenhuma candidata serve. `vocabulario`: Set de chaves da faixa. */
export function escolherFrase(palavra, indice, vocabulario) {
  const candidatas = indice.get(chaveComparavel(palavra));
  if (!candidatas?.length) return null;
  let melhor = null;
  let melhorCusto = Infinity;
  for (const c of candidatas) {
    let fora = 0;
    for (const t of c.tokens) if (!vocabulario.has(t)) fora++;
    const custo = fora * 100 + c.tokens.length; // empate: a mais curta
    if (custo < melhorCusto) { melhorCusto = custo; melhor = c.frase; }
  }
  return melhor;
}

/** `palavras` → `Map(palavra → frase)`, só com as que acharam frase. */
export function frasesParaPalavras(palavras, indice, vocabulario) {
  const fora = new Map();
  for (const p of palavras ?? []) {
    const palavra = typeof p === 'string' ? p : p.palavra;
    const frase = escolherFrase(palavra, indice, vocabulario);
    if (frase) fora.set(palavra, frase);
  }
  return fora;
}

/** As chaves de todas as palavras da trilha — o "dentro da faixa" de `escolherFrase`. */
export function vocabularioDe(palavras) {
  return new Set((palavras ?? []).map((p) => chaveComparavel(typeof p === 'string' ? p : p.palavra)));
}
