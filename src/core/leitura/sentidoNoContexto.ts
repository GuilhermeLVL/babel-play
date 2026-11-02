/**
 * O SENTIDO DA PALAVRA NO CONTEXTO — puro (sem DOM, sem rede).
 *
 * O cartão da palavra do leitor consulta o verbete do Wikcionário e mostra o sentido que serve AQUI. Dois erros
 * que isto evita:
 *
 *  1. A FORMA CONSULTADA. "Call me Ishmael." consultava a página "Call" (com maiúscula), que é a do nome
 *     próprio ("A surname"). No começo da frase a maiúscula é da frase, não da palavra: consulta-se "call",
 *     a menos que haja sinal de nome próprio. Em alemão todo substantivo é capitalizado: a forma fica como está.
 *  2. A ORDEM DOS SENTIDOS. O verbete lista as classes na ordem do editor. Aqui elas ganham pontos pelas
 *     vizinhas na frase: artigo antes puxa substantivo; pronome sujeito, modal ou "to" antes puxa verbo;
 *     pronome objeto logo depois puxa verbo ("Call me"). Nome próprio só sobe quando a palavra está
 *     capitalizada NO MEIO da frase (ou depois de um título, "Mr."); fora disso, desce para o fim.
 *
 * Só reordena, nunca esconde: o verbete inteiro continua à mão no "Mais" do cartão.
 */

export type ClasseGramatical = 'nome-proprio' | 'substantivo' | 'verbo' | 'adjetivo' | 'adverbio' | 'outra';

export interface ContextoDaPalavra {
  /** A palavra como está no texto. */
  palavra: string;
  /** A frase onde ela está. */
  frase: string;
  /** A posição da palavra na frase, contada em palavras a partir de 0. Ausente = a primeira ocorrência. */
  posicao?: number;
  /** O idioma (código curto). Muda as listas de pistas e a regra da maiúscula do alemão. */
  idioma?: string;
}

/** A classe do sentido pelo cabeçalho do Wikcionário ("Proper noun", "Nome próprio", "Verbo", "Nom"…). */
export function classeDoSentido(cabecalho: string): ClasseGramatical {
  const c = cabecalho.toLocaleLowerCase().normalize('NFD').replace(/\p{M}/gu, '');
  if (/proper noun|nome propri|substantivo propri|nombre propi|nom propre|eigenname/.test(c)) return 'nome-proprio';
  if (/\b(noun|substantivo|sustantivo|nombre|nom|substantiv)\b/.test(c)) return 'substantivo';
  if (/\b(verb|verbo|verbe)\b/.test(c)) return 'verbo';
  if (/\b(adjective|adjetivo|adjectif|adjektiv)\b/.test(c)) return 'adjetivo';
  if (/\b(adverb|adverbio|adverbe)\b/.test(c)) return 'adverbio';
  return 'outra';
}

/* As pistas, por idioma. Listas curtas e comuns: o objetivo é acertar o caso frequente, não etiquetar a frase. */
const DETERMINANTES: Record<string, string[]> = {
  en: ['the', 'a', 'an', 'this', 'that', 'these', 'those', 'my', 'your', 'his', 'its', 'our', 'their', 'every', 'each'],
  pt: [
    'o',
    'a',
    'os',
    'as',
    'um',
    'uma',
    'uns',
    'umas',
    'este',
    'esta',
    'esse',
    'essa',
    'aquele',
    'aquela',
    'meu',
    'minha',
    'seu',
    'sua',
    'nosso',
    'nossa',
    'do',
    'da',
    'dos',
    'das',
    'no',
    'na',
    'nos',
    'nas',
  ],
  es: [
    'el',
    'la',
    'los',
    'las',
    'un',
    'una',
    'unos',
    'unas',
    'este',
    'esta',
    'ese',
    'esa',
    'mi',
    'tu',
    'su',
    'del',
    'al',
  ],
  fr: ['le', 'la', 'les', 'un', 'une', 'des', 'ce', 'cette', 'mon', 'ma', 'ton', 'ta', 'son', 'sa', 'du', 'au'],
};
const ANTES_DE_VERBO: Record<string, string[]> = {
  en: [
    'to',
    'will',
    'would',
    'can',
    'could',
    'shall',
    'should',
    'may',
    'might',
    'must',
    'do',
    'does',
    'did',
    "don't",
    "didn't",
    'i',
    'you',
    'we',
    'they',
    'he',
    'she',
    'please',
    "let's",
  ],
  pt: [
    'eu',
    'tu',
    'você',
    'vocês',
    'nós',
    'eles',
    'elas',
    'ele',
    'ela',
    'não',
    'vou',
    'vai',
    'vamos',
    'pode',
    'posso',
    'quero',
    'deve',
  ],
  es: ['yo', 'tú', 'él', 'ella', 'nosotros', 'ellos', 'ellas', 'no', 'voy', 'va', 'vamos', 'puedo', 'puede', 'quiero'],
  fr: ['je', 'tu', 'il', 'elle', 'nous', 'vous', 'ils', 'elles', 'ne', 'pas'],
};
const DEPOIS_DE_VERBO: Record<string, string[]> = {
  en: ['me', 'him', 'her', 'us', 'them', 'it', 'you'],
  pt: ['me', 'te', 'lhe', 'nos', 'vos', 'lhes'],
  es: ['me', 'te', 'le', 'nos', 'les', 'lo', 'la'],
  fr: [],
};
const TITULOS = ['mr', 'mrs', 'ms', 'dr', 'sr', 'sra', 'srta', 'st', 'sir', 'dona', 'don', 'mme', 'mlle', 'prof'];

const idiomaBase = (idioma?: string) => (idioma ?? '').toLowerCase().split(/[-_]/)[0] ?? '';
const daLista = (tabela: Record<string, string[]>, idioma: string): string[] =>
  tabela[idioma] ?? Object.values(tabela).flat();

/** As palavras da frase, sem pontuação ("Mr." vira "Mr"). */
function palavrasDaFrase(frase: string): string[] {
  return frase.match(/[\p{L}\p{M}\p{N}]+(?:['’-][\p{L}\p{M}\p{N}]+)*/gu) ?? [];
}

function ondeEsta(ctx: ContextoDaPalavra, palavras: string[]): number {
  if (ctx.posicao != null && ctx.posicao >= 0 && ctx.posicao < palavras.length) return ctx.posicao;
  const alvo = ctx.palavra.trim().toLocaleLowerCase();
  const i = palavras.findIndex((p) => p.toLocaleLowerCase() === alvo);
  return i < 0 ? 0 : i;
}

const comecaMaiuscula = (p: string) => /^\p{Lu}/u.test(p);

/**
 * A palavra parece nome próprio NESTE trecho? Só quando está capitalizada no meio da frase (ou depois de um
 * título). No começo da frase a maiúscula não diz nada; em alemão, todo substantivo é capitalizado.
 */
export function pareceNomeProprio(ctx: ContextoDaPalavra): boolean {
  const idioma = idiomaBase(ctx.idioma);
  const palavra = ctx.palavra.trim();
  if (idioma === 'de' || !comecaMaiuscula(palavra)) return false;
  const palavras = palavrasDaFrase(ctx.frase);
  const i = ondeEsta(ctx, palavras);
  const anterior = palavras[i - 1]?.toLocaleLowerCase();
  if (anterior && TITULOS.includes(anterior)) return true;
  return i > 0;
}

/** A forma a consultar no dicionário: a minúscula quando a maiúscula é só do começo da frase (ou caixa alta). */
export function formaDeConsulta(ctx: ContextoDaPalavra): string {
  const palavra = ctx.palavra.trim();
  if (idiomaBase(ctx.idioma) === 'de' || pareceNomeProprio(ctx)) return palavra;
  return palavra.toLocaleLowerCase();
}

/** Os sentidos na ordem que serve a este trecho. Ordem estável: empate mantém a do verbete. Não muda a lista. */
export function ordenarSentidos<T extends { partOfSpeech: string }>(ctx: ContextoDaPalavra, sentidos: T[]): T[] {
  const idioma = idiomaBase(ctx.idioma);
  const palavras = palavrasDaFrase(ctx.frase);
  const i = ondeEsta(ctx, palavras);
  const anterior = palavras[i - 1]?.toLocaleLowerCase() ?? '';
  const seguinte = palavras[i + 1]?.toLocaleLowerCase() ?? '';
  const proprio = pareceNomeProprio(ctx);

  const pontos: Record<ClasseGramatical, number> = {
    'nome-proprio': proprio ? 3 : -3,
    substantivo: 0,
    verbo: 0,
    adjetivo: 0,
    adverbio: 0,
    outra: 0,
  };
  if (anterior && daLista(DETERMINANTES, idioma).includes(anterior)) {
    pontos.substantivo += 2;
    pontos.adjetivo += 1;
  }
  if (anterior && daLista(ANTES_DE_VERBO, idioma).includes(anterior)) pontos.verbo += 2;
  if (seguinte && daLista(DEPOIS_DE_VERBO, idioma).includes(seguinte)) pontos.verbo += 2;

  return sentidos
    .map((s, ordem) => ({ s, ordem, p: pontos[classeDoSentido(s.partOfSpeech)] }))
    .sort((a, b) => b.p - a.p || a.ordem - b.ordem)
    .map((x) => x.s);
}
