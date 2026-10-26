/**
 * O CATÁLOGO DE LIVROS (L1 de `docs/specs/2026-10-26-livros-e-leitura.md`): os tipos.
 *
 * O catálogo é um JSON estático (`public/catalogo/livros.json`), montado uma vez por pessoa com
 * `scripts/livros/montar-catalogo.mjs` e versionado junto com o código. O cliente só lê. Nada aqui
 * fala com rede, disco ou DOM: o script de montagem e a tela usam as mesmas funções.
 */

export const NIVEIS_DO_LIVRO = ['A1', 'A2', 'B1', 'B2', 'C1', 'C2'] as const;
export type NivelDoLivro = (typeof NIVEIS_DO_LIVRO)[number];

/**
 * DE ONDE O TEXTO VEM. `gutenberg-curado` é a cópia revisada no R2 (sem o cabeçalho e a marca do Project
 * Gutenberg): nada é baixado do Gutenberg em tempo de uso. `internet-archive-aberto` fica previsto pela spec
 * e ainda não tem livro.
 */
export const FONTES_DO_LIVRO = [
  'standard-ebooks',
  'wikisource',
  'gutenberg-curado',
  'internet-archive-aberto',
] as const;
export type FonteDoLivro = (typeof FONTES_DO_LIVRO)[number];

/**
 * A CLASSIFICAÇÃO ETÁRIA, sempre MANUAL (`scripts/livros/classificacao.json`, revisada por pessoa). `null` é
 * "a revisar": o livro não aparece para menor de idade; para adulto aparece tudo.
 */
export const CLASSIFICACOES = ['livre', '12', '14', '16', '18'] as const;
export type Classificacao = (typeof CLASSIFICACOES)[number];

export const CATEGORIAS_DO_LIVRO = [
  'classicos',
  'aventura',
  'contos',
  'misterio',
  'poesia',
  'teatro',
  'infantojuvenil',
  'didaticos',
  'simples',
  'enem',
] as const;
export type CategoriaDoLivro = (typeof CATEGORIAS_DO_LIVRO)[number];

export interface Pessoa {
  nome: string;
  /** Ano da morte. `null` = desconhecido, e quem não tem ano não entra no catálogo (ver `filtroLegal`). */
  anoMorte: number | null;
  /**
   * Os idiomas em que a pessoa escrevia (códigos de duas letras), da Wikidata ou da lista manual revisada.
   * Ausente = desconhecido, e autor de idioma desconhecido faz a obra contar como tradução (`ehTraducao`).
   */
  idiomas?: string[];
}

/** Como abrir o texto. Só o que a fonte oferece; o cliente escolhe. */
export interface FormatosDoLivro {
  /** EPUB com CORS (Standard Ebooks): o navegador baixa direto da fonte. */
  epub?: string;
  /**
   * A cópia curada do Gutenberg no R2: a CHAVE no bucket (`livros/pg-1342.epub`). A base pública vem do
   * deploy (`VITE_LIVROS_URL`), porque o catálogo é o mesmo em staging e em produção.
   */
  r2?: string;
  /**
   * Wikisource: a API (com `origin=*`) e a página principal da obra. Os capítulos saem dela na hora de abrir
   * (os links para as subpáginas, na ordem do sumário): guardá-los aqui triplicaria o catálogo.
   */
  wikisource?: { api: string; pagina: string };
  /** A página pública da obra na fonte, para o crédito e o "ver na fonte". */
  pagina?: string;
}

export interface LivroDoCatalogo {
  id: string;
  titulo: string;
  autores: Pessoa[];
  tradutores: Pessoa[];
  /** O idioma do TEXTO (código de duas letras). */
  idioma: string;
  fonte: FonteDoLivro;
  /** O identificador na fonte (número do Gutenberg, caminho no Standard Ebooks, título na Wikisource). */
  fonteId: string;
  formatos: FormatosDoLivro;
  categorias: CategoriaDoLivro[];
  classificacao: Classificacao | null;
  nivel: NivelDoLivro | null;
  /** De onde saiu o nível: as duas medidas, quando houve, e quantas amostras de 1000 palavras. */
  nivelDetalhe?: { cobertura: NivelDoLivro | null; legibilidade: NivelDoLivro | null; amostras: number };
  palavras: number;
  minutosEstimados: number;
  /** Downloads (ou o equivalente da fonte) normalizados dentro do idioma e da fonte: 0..1. */
  popularidade: number;
  /** O número bruto da fonte (`download_count` do Gutendex, ligações da Wikidata), para quem audita. */
  downloads: number;
  /** A linha de crédito que acompanha o texto. */
  credito: string;
  /** "Domínio público no Brasil" + a justificativa curta. */
  licenca: string;
  resumo?: string;
  /** A fonte ou o texto dizem que é tradução (mesmo sem dizer de quem). Entra no filtro do cliente. */
  traducaoDeclarada?: boolean;
}

/** Por que um livro que a fonte tem NÃO está no catálogo. A tela usa para responder "por que não está?". */
export const MOTIVOS_DE_EXCLUSAO = [
  'autor-protegido',
  'autor-sem-ano-de-morte',
  'sem-autor',
  'tradutor-protegido',
  'tradutor-sem-ano-de-morte',
  'traducao-sem-tradutor',
  'fonte-nao-aceita',
  'direitos-declarados-na-fonte',
] as const;
export type MotivoDeExclusao = (typeof MOTIVOS_DE_EXCLUSAO)[number];

export interface LivroExcluido {
  titulo: string;
  autores: string[];
  idioma: string;
  fonte: string;
  motivo: MotivoDeExclusao;
  /** O detalhe que a pessoa lê: "autor morto em 1998", "tradução sem tradutor identificado". */
  detalhe: string;
}

export interface Catalogo {
  versao: 1;
  /** O ano de quem montou (`--ano`), nunca o relógio do cliente. */
  ano: number;
  /** `ano − 71`: o ano de morte mais recente que entra. O cliente recusa livro que passe dele. */
  anoLimite: number;
  geradoEm: string;
  livros: LivroDoCatalogo[];
  exclusoes: LivroExcluido[];
}
