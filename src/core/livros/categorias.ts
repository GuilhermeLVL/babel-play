/**
 * AS CATEGORIAS DE UM LIVRO, a partir dos assuntos que a fonte declara (LCSH no Gutenberg e no Standard
 * Ebooks, os gêneros do Standard Ebooks, as estantes do Gutendex). Usado na montagem do catálogo.
 *
 * `classicos` e `simples` não saem dos assuntos: `classicos` são os mais baixados do idioma e `simples` os de
 * nível A1–A2, decididos depois de medir. `enem` vem da lista de autores da literatura brasileira e
 * portuguesa que o vestibular pede, só para livro em português.
 */
import type { CategoriaDoLivro } from './tipos';

const REGRAS: Array<[CategoriaDoLivro, RegExp]> = [
  ['aventura', /adventure|aventura|sea stories|voyages and travels|pirates|robinsonades|western stories|abenteuer/i],
  ['misterio', /myster|detective|crime|polic[ií]a|suspense|ghost stories|horror/i],
  ['contos', /short stor|\btales\b|contos|cuentos|nouvelles|racconti|erzählungen|novellas/i],
  ['poesia', /poetry|poesia|poes[ií]a|\bpoems\b|po[eè]mes|gedichte|\bverse\b|sonnets/i],
  ['teatro', /drama|\bplays\b|teatro|th[ée][âa]tre|tragedies|comedies|tragedy/i],
  ['infantojuvenil', /juvenile|children|infantil|fairy tales|young adult|kinder|fables/i],
  [
    'didaticos',
    /history|philosophy|science(?!\s*fiction)|essays|economics|politic|biography|autobiograph|nonfiction|non-fiction|ensaios|sociology|psychology|education|ethics|travel/i,
  ],
];

export function categoriasDosAssuntos(assuntos: readonly string[]): CategoriaDoLivro[] {
  const texto = assuntos.join(' | ');
  /* "Great Britain--History--Fiction" é romance histórico, não livro de história: ficção nunca é não ficção. */
  const ficcao = /fiction|novel|romance|stories|\btales\b|poe|drama|\bplays\b|contos|cuentos/i.test(texto);
  return REGRAS.filter(([c, re]) => re.test(texto) && !(c === 'didaticos' && ficcao)).map(([c]) => c);
}

/**
 * Autores cobrados no vestibular e no ENEM (listas de leitura obrigatória da Fuvest, Unicamp e afins, e os
 * autores mais frequentes nas provas do ENEM). Comparado sem acento e sem caixa, pelo sobrenome mais usado.
 */
const AUTORES_DO_VESTIBULAR = [
  'machado de assis',
  'jose de alencar',
  'aluisio azevedo',
  'lima barreto',
  'euclides da cunha',
  'eca de queiros',
  'eca de queiroz',
  'camoes',
  'gil vicente',
  'castro alves',
  'goncalves dias',
  'alvares de azevedo',
  'manuel antonio de almeida',
  'raul pompeia',
  'graciliano ramos',
  'mario de andrade',
  'oswald de andrade',
  'cruz e sousa',
  'augusto dos anjos',
  'bernardo guimaraes',
  'taunay',
  'joaquim manuel de macedo',
  'adolfo caminha',
  'monteiro lobato',
  'olavo bilac',
  'tomas antonio gonzaga',
  'gregorio de matos',
  'padre antonio vieira',
  'antonio vieira',
  'camilo castelo branco',
  'almeida garrett',
  'julio dinis',
  'basilio da gama',
  'martins pena',
  'simoes lopes neto',
  'florbela espanca',
  'fernando pessoa',
  'alexandre herculano',
  'coelho neto',
  'domingos olimpio',
  'franklin tavora',
];

const semAcento = (s: string) => s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();

export function ehAutorDoVestibular(nome: string): boolean {
  const n = semAcento(nome);
  return AUTORES_DO_VESTIBULAR.some((a) => n.includes(a));
}

/** Um identificador estável e legível: minúsculas, sem acento, hífens. */
export function slug(s: string): string {
  return semAcento(s)
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 80);
}

/** "Austen, Jane" → "Jane Austen"; "Twain, Mark (Samuel Langhorne)" → "Mark Twain". */
export function nomeNaOrdemDireta(nome: string): string {
  const limpo = nome.replace(/\s*\([^)]*\)\s*/g, ' ').trim();
  const [sobrenome, ...resto] = limpo.split(',').map((p) => p.trim());
  if (!resto.length) return limpo;
  const prenome = resto.filter((p) => !/^(?:sir|jr\.?|sr\.?|\d.*)$/i.test(p)).join(' ');
  return prenome ? `${prenome} ${sobrenome}` : sobrenome;
}
