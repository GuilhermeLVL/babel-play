/**
 * O NÍVEL ESTIMADO DE UM LIVRO (spec de Livros & Leitura, Design §2). Calculado NA MONTAGEM do catálogo,
 * nunca no cliente: o script baixa o texto uma vez e grava o resultado.
 *
 * Duas medidas, sobre amostras de 1000 palavras, e a MEDIANA das amostras:
 *   · COBERTURA das listas CEFR da trilha (`src/data/trilha/niveis/<idioma>.json`): o menor nível em que as
 *     palavras conhecidas até ali cobrem 95% do que a lista inteira cobre. Normalizar pelo que a lista
 *     cobre (e não por 100%) é o que deixa a medida justa com listas pequenas e sem flexão: elas nunca
 *     chegam perto de 100% num romance, e um corte absoluto poria todo livro em C2.
 *   · LEGIBILIDADE por fórmula do idioma: Flesch-Kincaid (inglês), Fernández-Huerta (espanhol) e a Flesch
 *     adaptada ao português por Martins et al. (1996). Nos outros idiomas, só a cobertura; no português,
 *     que não tem lista na trilha, só a fórmula.
 * Com as duas, o nível é o teto da média dos dois índices (empate sobe: é mais honesto dizer "um pouco
 * difícil" a quem está começando).
 *
 * É uma ESTIMATIVA, e a tela diz isso. Ela ordena e filtra bem; não substitui a pessoa folhear o livro.
 */
import { dobrarTexto } from '../texto/palavra';
import { NIVEIS_DO_LIVRO, type NivelDoLivro } from './tipos';

export type ListasCefr = Partial<Record<NivelDoLivro, string>>;

/** Palavra normalizada → índice do nível (0 = A1 … 5 = C2). */
export type IndiceCefr = Map<string, number>;

export function montarIndiceCefr(listas: ListasCefr): IndiceCefr {
  const mapa: IndiceCefr = new Map();
  NIVEIS_DO_LIVRO.forEach((nivel, i) => {
    for (const p of (listas[nivel] ?? '').split('|')) if (p && !mapa.has(p)) mapa.set(p, i);
  });
  return mapa;
}

const PALAVRAS_POR_AMOSTRA = 1000;
/*
 * As listas da trilha são de palavras de CONTEÚDO: artigos, preposições e pronomes ("the", "de", "la") não
 * estão nelas, e num texto corrido eles são metade das palavras. Por isso a fração conhecida de um romance
 * fica perto de 25–40%, e o corte de sanidade (lista do idioma errado, tokenização que não casa: < 5%) é baixo.
 */
const COBERTURA_MINIMA = 0.15;
/**
 * O nível da amostra é aquele em que as palavras conhecidas até ali somam esta fração das conhecidas.
 * Calibrado em 26/10/2026 sobre os livros do catálogo (ver `docs/livros-catalogo.md`).
 */
export const CORTE_DA_COBERTURA = 0.9;
const MAXIMO_DE_AMOSTRAS = 24;

const base = (lang: string) => (lang || '').toLowerCase().split('-')[0];

/** Palavras do texto (`Intl.Segmenter`: funciona em chinês e japonês, que não separam por espaço). */
export function palavrasDe(texto: string, lang: string): string[] {
  const seg = new Intl.Segmenter(base(lang) || 'und', { granularity: 'word' });
  const saida: string[] = [];
  for (const s of seg.segment(texto)) if (s.isWordLike) saida.push(s.segment);
  return saida;
}

/* ── Sílabas ─────────────────────────────────────────────────────────────────────────────────── */

const VOGAIS_EN = /[aeiouy]+/g;

/** Sílabas em inglês: grupos de vogais, menos o "e" mudo do fim. Aproximação clássica do Flesch. */
export function silabasEn(palavra: string): number {
  const p = palavra.toLowerCase().replace(/[^a-z]/g, '');
  if (!p) return 0;
  if (p.length <= 3) return 1;
  const semMudo = p.replace(/(?:[^laeiouy]es|ed|[^laeiouy]e)$/, '').replace(/^y/, '');
  return Math.max(1, (semMudo.match(VOGAIS_EN) ?? []).length);
}

/* Sem "ã" e "õ": os ditongos nasais (ão, ãe, õe) são uma sílaba só. */
const FORTES = 'aeoáéóâêôà';
const VOGAIS_ROMANICAS = 'aeiouáéíóúâêôãõàüï';

/**
 * Sílabas em espanhol e português: cada grupo de vogais é um núcleo, menos o hiato. Duas vogais fortes
 * juntas (a, e, o) são duas sílabas; vogal fraca acentuada (í, ú) também quebra o grupo.
 */
export function silabasRomanicas(palavra: string): number {
  const p = palavra.toLowerCase();
  let silabas = 0;
  let anterior = '';
  for (const c of p) {
    const ehVogal = VOGAIS_ROMANICAS.includes(c);
    if (!ehVogal) {
      anterior = '';
      continue;
    }
    if (!anterior) silabas++;
    else if (
      (FORTES.includes(anterior) && FORTES.includes(c)) ||
      c === 'í' ||
      c === 'ú' ||
      anterior === 'í' ||
      anterior === 'ú'
    )
      silabas++;
    anterior = c;
  }
  return Math.max(silabas, p.replace(/[^\p{L}]/gu, '') ? 1 : 0);
}

/** Frases: fim em ponto, interrogação, exclamação ou reticências. */
export function contarFrases(texto: string): number {
  const n = (texto.match(/[.!?…]+(?=\s|$|["'»”’)\]])/g) ?? []).length;
  return Math.max(1, n);
}

/* ── Legibilidade ────────────────────────────────────────────────────────────────────────────── */

export interface MedidasDoTexto {
  palavras: number;
  frases: number;
  silabas: number;
}

export function medirTexto(texto: string, lang: string): MedidasDoTexto | null {
  const l = base(lang);
  const contar = l === 'en' ? silabasEn : l === 'es' || l === 'pt' ? silabasRomanicas : null;
  if (!contar) return null;
  const palavras = palavrasDe(texto, l);
  if (palavras.length === 0) return null;
  const silabas = palavras.reduce((s, p) => s + contar(p), 0);
  return { palavras: palavras.length, frases: contarFrases(texto), silabas };
}

/** Flesch-Kincaid (série escolar dos EUA): maior = mais difícil. */
export const fleschKincaid = (m: MedidasDoTexto) =>
  0.39 * (m.palavras / m.frases) + 11.8 * (m.silabas / m.palavras) - 15.59;

/**
 * Fernández-Huerta (0..100+): maior = mais fácil. L = 206,84 − 0,60·P − 1,02·F, com P = sílabas por 100
 * palavras e F = palavras por frase (o par do comprimento médio de frase da Flesch, de onde a fórmula vem). A
 * leitura que circula com F = "frases por 100 palavras" inverte o sentido: frase mais curta deixaria o texto
 * mais DIFÍCIL. O teste confere a direção.
 */
export const fernandezHuerta = (m: MedidasDoTexto) =>
  206.84 - 0.6 * ((m.silabas / m.palavras) * 100) - 1.02 * (m.palavras / m.frases);

/** Flesch adaptada ao português (Martins et al., 1996): maior = mais fácil. */
export const fleschPortugues = (m: MedidasDoTexto) =>
  248.835 - 1.015 * (m.palavras / m.frases) - 84.6 * (m.silabas / m.palavras);

/** O índice de nível (0..5) que a fórmula do idioma dá, ou `null` quando o idioma não tem fórmula. */
export function indiceDeLegibilidade(texto: string, lang: string): number | null {
  const l = base(lang);
  const m = medirTexto(texto, l);
  if (!m) return null;
  if (l === 'en') {
    const serie = fleschKincaid(m);
    return serie <= 2 ? 0 : serie <= 4 ? 1 : serie <= 6 ? 2 : serie <= 8 ? 3 : serie <= 11 ? 4 : 5;
  }
  const nota = l === 'es' ? fernandezHuerta(m) : fleschPortugues(m);
  if (l === 'es') return nota >= 90 ? 0 : nota >= 80 ? 1 : nota >= 70 ? 2 : nota >= 60 ? 3 : nota >= 50 ? 4 : 5;
  /* A escala de Martins vai de 0 a 100 para LEITOR NATIVO (75+ é texto de primeiras séries). Para quem
     aprende, os cortes sobem: um romance de frase curta (Machado) não é A1 só porque a frase é curta. */
  return nota >= 90 ? 0 : nota >= 80 ? 1 : nota >= 70 ? 2 : nota >= 55 ? 3 : nota >= 40 ? 4 : 5;
}

/* ── Cobertura ───────────────────────────────────────────────────────────────────────────────── */

/** Formas de dicionário prováveis de uma palavra flexionada (as listas da trilha guardam o lema). */
export function lemasProvaveis(chave: string, lang: string): string[] {
  const l = base(lang);
  const c = [chave];
  const tira = (suf: string, poe = '') => {
    if (chave.length > suf.length + 2 && chave.endsWith(suf)) c.push(chave.slice(0, -suf.length) + poe);
  };
  if (l === 'en') {
    tira('ies', 'y');
    tira('ied', 'y');
    tira('es');
    tira('s');
    tira('ed');
    tira('ed', 'e');
    tira('ing');
    tira('ing', 'e');
    tira('ly');
    tira('er');
    tira('est');
  } else if (l === 'es' || l === 'pt' || l === 'it' || l === 'fr') {
    tira('es');
    tira('s');
    tira('a', 'o');
    tira('as', 'o');
    tira('e');
  } else if (l === 'de' || l === 'nl' || l === 'sv') {
    tira('en');
    tira('e');
    tira('n');
    tira('s');
    tira('er');
  }
  return c;
}

/** Nível (0..5) de uma palavra pela lista, ou `null` se a lista não a conhece. */
function nivelDaPalavra(palavra: string, lang: string, indice: IndiceCefr): number | null {
  const chave = dobrarTexto(palavra, { espacos: 'aparar' });
  for (const c of lemasProvaveis(chave, lang)) {
    const n = indice.get(c);
    if (n !== undefined) return n;
  }
  return null;
}

/**
 * Índice de nível pela cobertura de UMA amostra. Nomes próprios (palavra que começa com maiúscula) não
 * contam: não estão em lista nenhuma e não dizem nada sobre a dificuldade. Lista que não cobre nem 40%
 * da amostra (tokenização que não casa, lista de outro alfabeto) não mede nada: `null`.
 */
export function indiceDeCobertura(
  palavras: readonly string[],
  lang: string,
  indice: IndiceCefr,
  corte = CORTE_DA_COBERTURA,
): number | null {
  if (indice.size === 0) return null;
  const contagem = [0, 0, 0, 0, 0, 0];
  let total = 0;
  for (const p of palavras) {
    if (/^\p{Lu}/u.test(p)) continue;
    total++;
    const n = nivelDaPalavra(p, lang, indice);
    if (n !== null) contagem[n]++;
  }
  if (total === 0) return null;
  const conhecidas = contagem.reduce((s, n) => s + n, 0);
  if (conhecidas / total < COBERTURA_MINIMA) return null;
  let acumulado = 0;
  for (let i = 0; i < 6; i++) {
    acumulado += contagem[i];
    if (acumulado >= corte * conhecidas) return i;
  }
  return 5;
}

/* ── O nível do livro ────────────────────────────────────────────────────────────────────────── */

/** Mediana (a de baixo, em número par: o empate de amostras fica com a mais fácil). */
export function mediana(valores: readonly number[]): number | null {
  if (valores.length === 0) return null;
  const v = [...valores].sort((a, b) => a - b);
  return v[Math.floor((v.length - 1) / 2)];
}

export interface Amostra {
  /** O texto da amostra como estava, com a pontuação (a fórmula precisa das frases). */
  texto: string;
  palavras: string[];
}

/**
 * O texto cortado em amostras de 1000 palavras, e até 24 delas espalhadas pelo livro inteiro (o começo de
 * um livro engana: prefácio, dedicatória, a primeira página escrita com mais cuidado). Texto com menos de
 * 1000 palavras vira uma amostra só, se tiver pelo menos 200.
 */
export function amostrasDoTexto(texto: string, lang: string): Amostra[] {
  const seg = new Intl.Segmenter(base(lang) || 'und', { granularity: 'word' });
  const todas: Amostra[] = [];
  let atual: Amostra = { texto: '', palavras: [] };
  for (const s of seg.segment(texto)) {
    atual.texto += s.segment;
    if (!s.isWordLike) continue;
    atual.palavras.push(s.segment);
    if (atual.palavras.length === PALAVRAS_POR_AMOSTRA) {
      todas.push(atual);
      atual = { texto: '', palavras: [] };
    }
  }
  if (todas.length === 0) return atual.palavras.length >= 200 ? [atual] : [];
  if (todas.length <= MAXIMO_DE_AMOSTRAS) return todas;
  const passo = todas.length / MAXIMO_DE_AMOSTRAS;
  return Array.from({ length: MAXIMO_DE_AMOSTRAS }, (_, i) => todas[Math.floor(i * passo)]);
}

export interface NivelEstimado {
  nivel: NivelDoLivro | null;
  cobertura: NivelDoLivro | null;
  legibilidade: NivelDoLivro | null;
  amostras: number;
}

const nomeDoNivel = (i: number | null): NivelDoLivro | null =>
  i === null ? null : NIVEIS_DO_LIVRO[Math.max(0, Math.min(5, i))];

/** Estima o nível de um livro. `indice` é o da lista do idioma (vazio quando o idioma não tem lista). */
export function estimarNivel(
  texto: string,
  lang: string,
  indice: IndiceCefr,
  opcoes: { corte?: number; semLegibilidade?: boolean } = {},
): NivelEstimado {
  const pedacos = amostrasDoTexto(texto, lang);
  const porCobertura: number[] = [];
  const porLegibilidade: number[] = [];
  for (const p of pedacos) {
    const c = indiceDeCobertura(p.palavras, lang, indice, opcoes.corte);
    if (c !== null) porCobertura.push(c);
    /* Verso e teatro quebram as fórmulas (linha curta não é frase curta): nesses, só a cobertura. */
    const l = opcoes.semLegibilidade ? null : indiceDeLegibilidade(p.texto, lang);
    if (l !== null) porLegibilidade.push(l);
  }
  const c = mediana(porCobertura);
  const l = mediana(porLegibilidade);
  const combinado = c !== null && l !== null ? Math.ceil((c + l) / 2) : (c ?? l);
  return {
    nivel: nomeDoNivel(combinado),
    cobertura: nomeDoNivel(c),
    legibilidade: nomeDoNivel(l),
    amostras: pedacos.length,
  };
}

/** Quantas palavras o texto tem (a mesma segmentação das amostras). */
export function contarPalavras(texto: string, lang: string): number {
  return palavrasDe(texto, lang).length;
}
