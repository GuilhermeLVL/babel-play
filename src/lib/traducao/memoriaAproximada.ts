/**
 * MEMÓRIA DE TRADUÇÃO APROXIMADA — a frase QUASE igual reaproveita a tradução guardada (harness
 * adaptativo, §1.2, degrau M2: "exata e aproximada (3-gramas, ≥ 0,9)").
 *
 * A chave exata (`origem|destino|texto normalizado`) só acerta a frase repetida letra por letra. O
 * reconhecimento de fala não repete: "I think we should go home now" volta como "I think we shoud go
 * home now", com vírgula a mais, sem o ponto — e cada variação pagava uma tradução inteira. Aqui a
 * falta exata ganha uma segunda chance: a guardada mais parecida, se for parecida o bastante E se a
 * diferença não mexer no sentido.
 *
 * A RÉGUA: Jaccard dos 3-gramas de caractere do texto (minúsculo, sem pontuação, com as bordas das
 * palavras). Escolhida sobre Levenshtein porque é de conjunto — dá para INDEXAR — e porque troca de
 * ordem ou pontuação custa pouco, enquanto palavra trocada custa muito. Limiar 0,9: numa frase de
 * 30 letras, cabe um erro de uma ou duas letras, não uma palavra de conteúdo.
 *
 * O ÍNDICE (filtro de prefixo, Bayardo et al., "All-Pairs", WWW 2007): com os 3-gramas de cada
 * frase numa ordem global fixa (hash), duas frases com Jaccard ≥ t compartilham pelo menos um dos
 * primeiros `n − ⌈t·n⌉ + 1` 3-gramas de cada uma. Só esses entram no índice invertido — ~4 por
 * frase a t = 0,9 — e a busca só confere as que caem no mesmo balde e têm tamanho compatível. É
 * exato (não perde vizinha nenhuma, ao contrário do MinHash) e, em 5.000 entradas, custa uma fração
 * de milissegundo (teste de desempenho em `tests/memoriaAproximada.test.ts`).
 *
 * A SEGURANÇA não é a régua: "I can go" e "I can't go" ficam a 0,8 de distância e dizem o
 * contrário; "he is my best friend" e "she is my best friend" passam de 0,9. Por isso a diferença
 * de palavras entre as duas frases é conferida à parte (`diferencaSegura`): número, negação,
 * pronome e nome próprio têm de ser IDÊNTICOS, senão é falta e a frase vai ao tradutor. Pronome
 * não estava na lista da auditoria; entra porque o par "he/she" passa na régua e troca o sujeito.
 */

/** Similaridade mínima para reaproveitar uma tradução guardada. */
export const LIMIAR_APROXIMADA = 0.9;
/**
 * Limiar de quem PAGA pela nuvem. A tradução que ele compra é a do contexto exato; o aproximado só
 * serve quando a diferença é de pontuação ou de uma letra numa frase longa.
 */
export const LIMIAR_APROXIMADA_NUVEM = 0.97;

const NEGACOES = new Set([
  // en
  'not',
  'no',
  'never',
  'nor',
  'nothing',
  'nobody',
  'none',
  'nowhere',
  'neither',
  'cannot',
  // pt
  'não',
  'nunca',
  'nem',
  'nada',
  'ninguém',
  'nenhum',
  'nenhuma',
  'jamais',
  // es
  'ni',
  'nadie',
  'ninguno',
  'ninguna',
  'jamás',
  'tampoco',
  // fr
  'ne',
  'pas',
  'rien',
  'aucun',
  'aucune',
  'non',
  'personne',
  // it
  'mai',
  'niente',
  'nessuno',
  'nessuna',
  'né',
  // de
  'nicht',
  'kein',
  'keine',
  'keinen',
  'keinem',
  'keiner',
  'nie',
  'niemals',
  'nichts',
  'niemand',
  'nein',
]);

/** Número por extenso. Artigos que também são numerais ("um", "une") entram: errar para o lado da falta. */
const NUMEROS = new Set([
  // en
  'zero',
  'one',
  'two',
  'three',
  'four',
  'five',
  'six',
  'seven',
  'eight',
  'nine',
  'ten',
  'eleven',
  'twelve',
  'twenty',
  'thirty',
  'hundred',
  'thousand',
  'million',
  'first',
  'second',
  'third',
  'half',
  // pt
  'um',
  'uma',
  'dois',
  'duas',
  'três',
  'quatro',
  'cinco',
  'seis',
  'sete',
  'oito',
  'nove',
  'dez',
  'onze',
  'doze',
  'vinte',
  'trinta',
  'cem',
  'cento',
  'mil',
  'milhão',
  'primeiro',
  'primeira',
  'meio',
  'meia',
  // es
  'uno',
  'dos',
  'tres',
  'cuatro',
  'siete',
  'ocho',
  'nueve',
  'diez',
  'cien',
  'millón',
  // fr
  'un',
  'une',
  'deux',
  'trois',
  'quatre',
  'cinq',
  'sept',
  'huit',
  'neuf',
  'dix',
  'cent',
  'mille',
  // it
  'due',
  'tre',
  'quattro',
  'cinque',
  'sei',
  'sette',
  'otto',
  'dieci',
  // de
  'eins',
  'zwei',
  'drei',
  'vier',
  'fünf',
  'sechs',
  'sieben',
  'acht',
  'neun',
  'zehn',
  'hundert',
  'tausend',
]);

const PRONOMES = new Set([
  // en
  'i',
  'me',
  'my',
  'mine',
  'we',
  'us',
  'our',
  'you',
  'your',
  'he',
  'him',
  'his',
  'she',
  'her',
  'it',
  'its',
  'they',
  'them',
  'their',
  // pt
  'eu',
  'mim',
  'meu',
  'minha',
  'nós',
  'nos',
  'nosso',
  'nossa',
  'você',
  'vocês',
  'tu',
  'te',
  'teu',
  'tua',
  'ele',
  'ela',
  'eles',
  'elas',
  'dele',
  'dela',
  'lhe',
  // es
  'yo',
  'mí',
  'mi',
  'tú',
  'usted',
  'él',
  'ella',
  'nosotros',
  'nosotras',
  'ellos',
  'ellas',
  'su',
  'sus',
  'le',
  'les',
  // fr
  'je',
  'moi',
  'toi',
  'il',
  'elle',
  'nous',
  'vous',
  'ils',
  'elles',
  'lui',
  'leur',
  'mon',
  'ma',
  'ton',
  'ta',
  'son',
  'sa',
  // it
  'io',
  'lei',
  'noi',
  'voi',
  'loro',
  'mio',
  'mia',
  // de
  'ich',
  'du',
  'er',
  'sie',
  'es',
  'wir',
  'ihr',
  'mich',
  'dich',
  'ihn',
  'uns',
  'euch',
  'mein',
  'dein',
  'sein',
]);

/** Palavras do texto: minúsculas, apóstrofo tipográfico unificado, pontuação vira espaço. */
export function tokensDe(texto: string): string[] {
  return texto
    .normalize('NFC')
    .toLowerCase()
    .replace(/[’`´]/g, "'")
    .split(/[^\p{L}\p{N}']+/u)
    .map((t) => t.replace(/^'+|'+$/g, ''))
    .filter(Boolean);
}

const ehNegacao = (t: string) => NEGACOES.has(t) || t.endsWith("n't") || t.startsWith("n'");
const ehNumero = (t: string) => /\p{N}/u.test(t) || NUMEROS.has(t);
const ehPronome = (t: string) => PRONOMES.has(t);

/**
 * Palavras com cara de NOME: maiúscula que não abre frase (nem o "I" inglês). Sem a caixa original
 * não há como saber — a chave da memória é minúscula —, por isso quem chama passa o texto cru.
 */
function nomesDe(original: string | undefined): Set<string> {
  const fora = new Set<string>();
  if (!original) return fora;
  for (const frase of original.split(/[.!?…]+\s+/)) {
    const partes = frase
      .replace(/[’`´]/g, "'")
      .split(/[^\p{L}\p{N}']+/u)
      .filter(Boolean);
    partes.forEach((p, k) => {
      if (k > 0 && /^\p{Lu}/u.test(p) && p !== 'I') fora.add(p.toLowerCase());
    });
  }
  return fora;
}

/** Diferença de multiconjuntos: o que `a` tem a mais que `b`, e vice-versa. */
function diferenca(a: string[], b: string[]): string[] {
  const conta = new Map<string, number>();
  for (const t of a) conta.set(t, (conta.get(t) ?? 0) + 1);
  for (const t of b) conta.set(t, (conta.get(t) ?? 0) - 1);
  return [...conta].filter(([, n]) => n !== 0).map(([t]) => t);
}

export interface OpcoesDaDiferenca {
  /** O texto da consulta com a caixa original (nome próprio só se vê pela maiúscula). */
  consultaOriginal?: string;
  /** A tradução guardada da candidata: nome costuma passar para a tradução em maiúscula. */
  traducaoCandidata?: string;
}

/**
 * A diferença entre a consulta e a candidata pode ser ignorada? Só quando nenhuma das palavras
 * que mudam é número, negação, pronome ou nome — as quatro coisas que viram o sentido com uma
 * letra. Erro de digitação, pontuação e variação de grafia passam.
 */
export function diferencaSegura(consulta: string, candidata: string, opts: OpcoesDaDiferenca = {}): boolean {
  const muda = diferenca(tokensDe(consulta), tokensDe(candidata));
  if (muda.length === 0) return true;
  const nomes = nomesDe(opts.consultaOriginal);
  for (const n of nomesDe(opts.traducaoCandidata)) nomes.add(n);
  return !muda.some((t) => ehNegacao(t) || ehNumero(t) || ehPronome(t) || nomes.has(t));
}

/** FNV-1a de 32 bits: a ordem global dos 3-gramas (qualquer ordem fixa serve ao filtro de prefixo). */
function hash(s: string): number {
  let h = 0x811c9dc5;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return h >>> 0;
}

/** Os 3-gramas distintos do texto, na ordem global (hash, depois o próprio texto). */
function trigramasOrdenados(texto: string): string[] {
  const t = ` ${tokensDe(texto).join(' ')} `;
  const conjunto = new Set<string>();
  const chars = [...t];
  for (let i = 0; i + 3 <= chars.length; i++) conjunto.add(chars.slice(i, i + 3).join(''));
  if (t.trim() === '') return [];
  return [...conjunto]
    .map((g) => [hash(g), g] as const)
    .sort((a, b) => a[0] - b[0] || (a[1] < b[1] ? -1 : a[1] > b[1] ? 1 : 0))
    .map(([, g]) => g);
}

/** Jaccard dos 3-gramas de caractere, depois de tirar caixa e pontuação. */
export function similaridade(a: string, b: string): number {
  const x = new Set(trigramasOrdenados(a));
  const y = trigramasOrdenados(b);
  if (x.size === 0 && y.length === 0) return 1;
  let comum = 0;
  for (const g of y) if (x.has(g)) comum++;
  return comum / (x.size + y.length - comum);
}

/** `origem|destino|texto` → o par e o texto (o texto pode ter `|`; o par nunca tem). */
export function separarChave(chave: string): { par: string; texto: string } {
  const a = chave.indexOf('|');
  const b = a < 0 ? -1 : chave.indexOf('|', a + 1);
  if (b < 0) return { par: '', texto: chave };
  return { par: chave.slice(0, b), texto: chave.slice(b + 1) };
}

/** Quantos 3-gramas do começo (na ordem global) bastam para não perder vizinha a Jaccard ≥ t. */
const prefixo = (n: number, t: number) => n - Math.ceil(t * n - 1e-9) + 1;

interface Registro {
  chave: string;
  par: string;
  conjunto: Set<string>;
  baldes: string[];
}

export interface Vizinha {
  chave: string;
  similaridade: number;
}

export interface IndiceAproximado {
  adicionar(chave: string): void;
  remover(chave: string): void;
  /** As guardadas do MESMO par com similaridade ≥ `limiar`, da mais parecida à menos. Nunca a própria chave. */
  buscar(chave: string, limiar: number): Vizinha[];
  readonly tamanho: number;
}

/**
 * O índice só das CHAVES: a tradução continua no armazém de sempre (IndexedDB, memória, semente),
 * e quem busca lê a vizinha lá — assim uma entrada vencida ou podada vira falta, não fantasma.
 * Só aceita limiar ≥ `LIMIAR_APROXIMADA`: o prefixo indexado é o desse limiar.
 */
export function criarIndiceAproximado(): IndiceAproximado {
  const registros = new Map<string, Registro>();
  const baldes = new Map<string, Set<Registro>>();
  const balde = (par: string, g: string) => `${par}\u0000${g}`;

  const remover = (chave: string) => {
    const r = registros.get(chave);
    if (!r) return;
    registros.delete(chave);
    for (const b of r.baldes) {
      const s = baldes.get(b);
      s?.delete(r);
      if (s && s.size === 0) baldes.delete(b);
    }
  };

  return {
    adicionar(chave) {
      if (registros.has(chave)) return;
      const { par, texto } = separarChave(chave);
      const gramas = trigramasOrdenados(texto);
      if (gramas.length === 0) return;
      const meus = gramas.slice(0, prefixo(gramas.length, LIMIAR_APROXIMADA)).map((g) => balde(par, g));
      const r: Registro = { chave, par, conjunto: new Set(gramas), baldes: meus };
      registros.set(chave, r);
      for (const b of meus) {
        const s = baldes.get(b);
        if (s) s.add(r);
        else baldes.set(b, new Set([r]));
      }
    },
    remover,
    buscar(chave, limiar) {
      const t = Math.max(limiar, LIMIAR_APROXIMADA);
      const { par, texto } = separarChave(chave);
      const gramas = trigramasOrdenados(texto);
      const n = gramas.length;
      if (n === 0) return [];
      const vistas = new Set<Registro>();
      const fora: Vizinha[] = [];
      const menor = t * n - 1e-9;
      const maior = n / t + 1e-9;
      for (const g of gramas.slice(0, prefixo(n, LIMIAR_APROXIMADA))) {
        const s = baldes.get(balde(par, g));
        if (!s) continue;
        for (const r of s) {
          if (vistas.has(r)) continue;
          vistas.add(r);
          if (r.chave === chave) continue;
          const m = r.conjunto.size;
          if (m < menor || m > maior) continue;
          let comum = 0;
          for (const x of gramas) if (r.conjunto.has(x)) comum++;
          const j = comum / (n + m - comum);
          if (j >= t) fora.push({ chave: r.chave, similaridade: j });
        }
      }
      return fora.sort((a, b) => b.similaridade - a.similaridade);
    },
    get tamanho() {
      return registros.size;
    },
  };
}
