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

/**
 * Índice `chave da palavra` → frases candidatas. Só entra frase que passa na régua.
 *
 * Aceita `'texto'` ou `{ id, frase }` — o id é opcional aqui e obrigatório rio abaixo para quem
 * quiser a tradução, que o Tatoeba entrega por id.
 */
export function indexar(frasesBrutas, { maxCandidatas = MAX_CANDIDATAS } = {}) {
  const indice = new Map();
  for (const bruta of frasesBrutas ?? []) {
    const frase = typeof bruta === 'string' ? bruta : bruta.frase;
    const id = typeof bruta === 'string' ? undefined : bruta.id;
    const t = tokens(frase);
    if (t.length < MIN_PALAVRAS || t.length > MAX_PALAVRAS) continue;
    if (!avaliarFrase(frase, { minPalavras: MIN_PALAVRAS, maxPalavras: MAX_PALAVRAS }).serve) continue;
    const item = { frase, id, tokens: t };
    for (const chave of new Set(t)) {
      const lista = indice.get(chave);
      if (!lista) indice.set(chave, [item]);
      else if (lista.length < maxCandidatas) lista.push(item);
    }
  }
  return indice;
}

/**
 * `null` quando nenhuma candidata serve. Devolve `{ frase, id }`. `vocabulario`: Set da faixa.
 *
 * `traduzidas` (Set de ids) entra como o critério MAIS PESADO quando existe: uma frase sem
 * tradução não abre os jogos de frase, então uma candidata traduzida com duas palavras difíceis
 * vale mais que a frase perfeita que ninguém pode jogar. Sem esse peso a cobertura de tradução
 * ficava em 20% — a melhor frase raramente era uma das traduzidas.
 */
export function escolherFrase(palavra, indice, vocabulario, traduzidas) {
  const candidatas = indice.get(chaveComparavel(palavra));
  if (!candidatas?.length) return null;
  let melhor = null;
  let melhorCusto = Infinity;
  for (const c of candidatas) {
    let fora = 0;
    for (const t of c.tokens) if (!vocabulario.has(t)) fora++;
    const semTraducao = traduzidas && !(c.id && traduzidas.has(c.id)) ? 1 : 0;
    const custo = semTraducao * 100000 + fora * 100 + c.tokens.length; // empate: a mais curta
    if (custo < melhorCusto) { melhorCusto = custo; melhor = c; }
  }
  return melhor ? { frase: melhor.frase, id: melhor.id } : null;
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
