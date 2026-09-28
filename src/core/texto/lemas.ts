/**
 * DA PALAVRA TOCADA AO VERBETE — normalização e candidatos a lema para o dicionário local (M1).
 *
 * POR QUE EXISTE. O toque entrega a palavra como ela aparece na legenda: `Houses,`, `¿qué?`,
 * `running`. O dicionário local (`public/glosas`, a trilha do inglês) indexa o LEMA em minúscula:
 * `house`, `qué`, `run`. Sem esta ponte a consulta local errava quase sempre e o toque caía no MT —
 * que era justamente o custo que o degrau M1 do harness existe para cortar (harness-adaptativo §1.2).
 *
 * A ORDEM É A REGRA DE HONESTIDADE. Candidatos saem do mais fiel ao mais especulativo:
 *   1. a forma exata (com a caixa: o alemão indexa `Haus`, não `haus`);
 *   2. a forma em minúscula;
 *   3. o mapa forma→lema do pacote (Wikidata Lexemes / Wiktextract `form_of`), quando existir;
 *   4. as regras abaixo — pequenas, por idioma.
 * Quem consulta para no PRIMEIRO candidato que o dicionário conhece. Uma regra só é tentada quando
 * a forma exata não está lá; e um candidato que o dicionário não tem não custa nada.
 *
 * O QUE AS REGRAS NÃO SÃO. Não são um lematizador: não sabem classe gramatical e erram em
 * `news` → `new`. Por isso ficam por último e o resultado leva o lema usado — a interface pode dizer
 * "forma de *new*" em vez de fingir que traduziu `news`. Idioma sem regra devolve só a forma e a
 * minúscula: melhor cair no Wiktionary do que chutar um sufixo de língua que não conhecemos.
 *
 * Núcleo isomórfico: sem DOM, sem rede — é função pura e se testa inteira.
 */

/** Tira pontuação das BORDAS e preserva a interna (`don't`, `guarda-chuva`). */
export function normalizarConsulta(s: string | undefined | null): string {
  return (s ?? '')
    .normalize('NFC')
    .trim()
    .replace(/^[^\p{L}\p{N}]+|[^\p{L}\p{N}]+$/gu, '');
}

type Regra = (w: string) => string[];

/** Raiz mínima que uma regra pode deixar. `sing` → `s` e `bed` → `b` não são palavras. */
const RAIZ_MINIMA = 3;

/** O RESULTADO precisa ter a raiz mínima — é ele que vai ao dicionário (`pães` → `pão` passa). */
const cortar = (w: string, sufixo: string, novo = ''): string | null => {
  if (!w.endsWith(sufixo) || w.length === sufixo.length) return null;
  const r = w.slice(0, w.length - sufixo.length) + novo;
  return r.length >= RAIZ_MINIMA ? r : null;
};

/** Consoante dobrada no fim (`stopp` → `stop`, `runn` → `run`). */
const semDobra = (raiz: string): string | null =>
  /([bcdfgklmnprstvz])\1$/.test(raiz) ? raiz.slice(0, -1) : null;

/* Os irregulares que mais aparecem em legenda. Poucos de propósito: a lista longa é o mapa
   forma→lema do pacote (item 3 da ordem), não código. */
const IRREGULARES_EN: Record<string, string> = {
  am: 'be', is: 'be', are: 'be', was: 'be', were: 'be', been: 'be', being: 'be',
  has: 'have', had: 'have', does: 'do', did: 'do', done: 'do',
  went: 'go', gone: 'go', goes: 'go', made: 'make', said: 'say', got: 'get', gotten: 'get',
  took: 'take', taken: 'take', came: 'come', saw: 'see', seen: 'see', knew: 'know', known: 'know',
  thought: 'think', told: 'tell', found: 'find', gave: 'give', given: 'give', felt: 'feel',
  left: 'leave', kept: 'keep', brought: 'bring', bought: 'buy', ran: 'run', wrote: 'write',
  written: 'write', spoke: 'speak', spoken: 'speak', ate: 'eat', eaten: 'eat',
  men: 'man', women: 'woman', children: 'child', people: 'person', feet: 'foot',
  teeth: 'tooth', mice: 'mouse', better: 'good', best: 'good', worse: 'bad', worst: 'bad',
};

const regrasEn: Regra = (w) => {
  const c: Array<string | null> = [];
  if (IRREGULARES_EN[w]) c.push(IRREGULARES_EN[w]);
  // Possessivo: `john's`, `dogs'`.
  c.push(cortar(w, "'s"), cortar(w, '’s'), w.endsWith("s'") ? w.slice(0, -1) : null);
  // Plurais.
  c.push(cortar(w, 'ies', 'y'), cortar(w, 'ves', 'f'), cortar(w, 'ves', 'fe'));
  if (/(?:s|x|z|ch|sh|o)es$/.test(w)) c.push(cortar(w, 'es'));
  if (!/(?:ss|us|is)$/.test(w)) c.push(cortar(w, 's'));
  // Passado / particípio.
  const ed = cortar(w, 'ed');
  c.push(cortar(w, 'ied', 'y'), ed, ed ? ed + 'e' : null, ed ? semDobra(ed) : null);
  // Gerúndio.
  const ing = cortar(w, 'ing');
  c.push(cortar(w, 'ying', 'ie'), ing, ing ? ing + 'e' : null, ing ? semDobra(ing) : null);
  // Comparativo / superlativo.
  c.push(cortar(w, 'ier', 'y'), cortar(w, 'iest', 'y'));
  return c.filter((x): x is string => !!x);
};

/** Plural → singular em português. `-ões/-ães/-ãos` → `-ão` é o caso que mais se toca. */
const singularPt = (w: string): string[] => {
  const c: Array<string | null> = [
    cortar(w, 'ões', 'ão'), cortar(w, 'ães', 'ão'), cortar(w, 'ãos', 'ão'),
    cortar(w, 'ais', 'al'), cortar(w, 'éis', 'el'), cortar(w, 'óis', 'ol'), cortar(w, 'is', 'il'),
    cortar(w, 'ns', 'm'),
    /(?:r|z|s)es$/.test(w) ? cortar(w, 'es') : null,
    cortar(w, 's'),
  ];
  return c.filter((x): x is string => !!x);
};

/** Feminino → masculino (o verbete do adjetivo/substantivo é o masculino). */
const masculinoPt = (w: string): string[] => {
  const c: Array<string | null> = [cortar(w, 'esa', 'ês'), cortar(w, 'ora', 'or'), cortar(w, 'a', 'o')];
  return c.filter((x): x is string => !!x);
};

const regrasPt: Regra = (w) => {
  const singulares = singularPt(w);
  // `bonitas` → `bonita` → `bonito`: o feminino é tentado também sobre cada singular.
  return [...singulares, ...masculinoPt(w), ...singulares.flatMap(masculinoPt)];
};

const regrasEs: Regra = (w) => {
  const s = [cortar(w, 'ces', 'z'), /(?:[^aeiou])es$/.test(w) ? cortar(w, 'es') : null, cortar(w, 's')]
    .filter((x): x is string => !!x);
  return [...s, ...[w, ...s].map((x) => cortar(x, 'a', 'o')).filter((x): x is string => !!x)];
};

const regrasFr: Regra = (w) =>
  [cortar(w, 'eaux', 'eau'), cortar(w, 'aux', 'al'), cortar(w, 'x'), cortar(w, 's'),
    cortar(w, 'euse', 'eur'), cortar(w, 'ive', 'if'), cortar(w, 'es'), cortar(w, 'e')]
    .filter((x): x is string => !!x);

const regrasIt: Regra = (w) =>
  [cortar(w, 'i', 'o'), cortar(w, 'i', 'e'), cortar(w, 'e', 'a'), cortar(w, 'a', 'o')]
    .filter((x): x is string => !!x);

/** Alemão: o dicionário guarda substantivo com maiúscula; a legenda às vezes não. */
const regrasDe: Regra = (w) => {
  const maiuscula = (x: string) => x.charAt(0).toUpperCase() + x.slice(1);
  const plurais = [cortar(w, 'en'), cortar(w, 'n'), cortar(w, 'er'), cortar(w, 'e'), cortar(w, 's')]
    .filter((x): x is string => !!x);
  return [maiuscula(w), ...plurais, ...plurais.map(maiuscula)];
};

const REGRAS: Record<string, Regra> = {
  en: regrasEn, pt: regrasPt, es: regrasEs, fr: regrasFr, it: regrasIt, de: regrasDe,
};

/**
 * Candidatos a chave do dicionário, do mais fiel ao mais especulativo, sem repetição.
 * `formas` é o mapa forma(minúscula)→lema do pacote, quando o gerador o emitiu.
 */
export function candidatosDeLema(
  palavra: string,
  lang: string,
  formas?: Readonly<Record<string, string>>,
): string[] {
  const forma = normalizarConsulta(palavra);
  if (!forma) return [];
  const min = forma.toLowerCase();
  const base = (lang || '').toLowerCase().split('-')[0];

  const lista = [forma, min];
  const doMapa = formas?.[min];
  if (doMapa) lista.push(doMapa);
  lista.push(...(REGRAS[base]?.(min) ?? []));

  return lista.filter((x, i) => x && lista.indexOf(x) === i);
}
