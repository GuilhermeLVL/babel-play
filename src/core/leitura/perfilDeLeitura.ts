/**
 * O PERFIL DE LEITURA (ACE01, ACE02, ACE04): fonte, tamanho, espaçamentos, largura, margens,
 * alinhamento, tema e modo — escolhido uma vez e aplicado a TODO livro. Puro: a tela guarda o JSON e
 * passa o CSS gerado aqui para dentro do documento do livro.
 *
 * Os temas nunca usam preto nem branco puros (o contraste máximo cansa e "vibra" para quem tem
 * dislexia ou baixa visão); todos passam o AA de texto (4,5:1) com folga.
 */

export const FONTES_DE_LEITURA = ['original', 'serifa', 'sem-serifa', 'atkinson'] as const;
export type FonteDeLeitura = (typeof FONTES_DE_LEITURA)[number];

export const TEMAS_DE_LEITURA = ['claro', 'sepia', 'creme', 'escuro', 'cinza', 'contraste'] as const;
export type TemaDeLeitura = (typeof TEMAS_DE_LEITURA)[number];

export type ModoDeLeitura = 'paginado' | 'rolagem';
export type Alinhamento = 'esquerda' | 'justificado';

export interface PerfilDeLeitura {
  fonte: FonteDeLeitura;
  /** Tamanho da letra em px (CSS do documento). */
  tamanho: number;
  /** Entrelinha (multiplicador). */
  entrelinha: number;
  /** Espaço entre letras, em em. */
  espacoLetra: number;
  /** Espaço entre palavras, em em. */
  espacoPalavra: number;
  /** Largura máxima da coluna, em px. */
  largura: number;
  /** Margem lateral (o "gap" do paginador), em % da página. */
  margem: number;
  alinhamento: Alinhamento;
  hifenizar: boolean;
  tema: TemaDeLeitura;
  modo: ModoDeLeitura;
}

/** Os limites de cada controle (a tela usa os mesmos nos sliders). */
export const LIMITES = {
  tamanho: { min: 14, max: 34, passo: 1 },
  entrelinha: { min: 1.2, max: 2.4, passo: 0.1 },
  espacoLetra: { min: 0, max: 0.12, passo: 0.01 },
  espacoPalavra: { min: 0, max: 0.4, passo: 0.02 },
  largura: { min: 420, max: 960, passo: 20 },
  margem: { min: 2, max: 16, passo: 1 },
} as const;

/** O padrão: alinhado à esquerda (a spec pede, ACE01), serifa, entrelinha generosa. */
export const PERFIL_PADRAO: PerfilDeLeitura = {
  fonte: 'serifa',
  tamanho: 19,
  entrelinha: 1.6,
  espacoLetra: 0,
  espacoPalavra: 0,
  largura: 680,
  margem: 6,
  alinhamento: 'esquerda',
  hifenizar: false,
  tema: 'claro',
  modo: 'paginado',
};

export interface CoresDoTema {
  fundo: string;
  texto: string;
  link: string;
  /** Cor do texto secundário (rodapé, progresso). */
  suave: string;
  /** `color-scheme` do documento. */
  esquema: 'light' | 'dark';
}

/** Contrastes medidos (texto/fundo · suave/fundo · link/fundo): claro 15,6/6,6/6,2 · sépia 11,0/5,6/7,1 · creme 13,3/6,4/6,5 · escuro 13,3/6,8/8,4 · cinza 9,5/5,5/7,3 · contraste 17,0/11,6/13,4. Teste: `tests/leitor-perfil.test.ts`. */
export const CORES_DOS_TEMAS: Record<TemaDeLeitura, CoresDoTema> = {
  claro: { fundo: '#fbfaf7', texto: '#22201c', link: '#1f5fa8', suave: '#5f5a52', esquema: 'light' },
  sepia: { fundo: '#f4ecd8', texto: '#3b2f22', link: '#7a3e12', suave: '#6b5a45', esquema: 'light' },
  creme: { fundo: '#fdf6e3', texto: '#2c2a25', link: '#245c8a', suave: '#605a4c', esquema: 'light' },
  escuro: { fundo: '#1c1c1e', texto: '#e6e3dc', link: '#8cb8ff', suave: '#a8a49b', esquema: 'dark' },
  cinza: { fundo: '#2e3033', texto: '#dcdad5', link: '#9cc2ff', suave: '#a9a7a2', esquema: 'dark' },
  contraste: { fundo: '#101114', texto: '#f6f3ea', link: '#ffd479', suave: '#cfcac0', esquema: 'dark' },
};

const limitar = (v: unknown, { min, max }: { min: number; max: number }, padrao: number): number =>
  typeof v === 'number' && Number.isFinite(v) ? Math.min(max, Math.max(min, v)) : padrao;
const umDe = <T extends string>(v: unknown, lista: readonly T[], padrao: T): T =>
  (lista as readonly unknown[]).includes(v) ? (v as T) : padrao;

/** Lê um perfil guardado (o disco pode ter qualquer coisa): o que faltar ou passar do limite vira o padrão/limite. */
export function normalizarPerfil(x: unknown): PerfilDeLeitura {
  const o = (x && typeof x === 'object' ? x : {}) as Record<string, unknown>;
  const p = PERFIL_PADRAO;
  return {
    fonte: umDe(o.fonte, FONTES_DE_LEITURA, p.fonte),
    tamanho: Math.round(limitar(o.tamanho, LIMITES.tamanho, p.tamanho)),
    entrelinha: Math.round(limitar(o.entrelinha, LIMITES.entrelinha, p.entrelinha) * 100) / 100,
    espacoLetra: Math.round(limitar(o.espacoLetra, LIMITES.espacoLetra, p.espacoLetra) * 1000) / 1000,
    espacoPalavra: Math.round(limitar(o.espacoPalavra, LIMITES.espacoPalavra, p.espacoPalavra) * 1000) / 1000,
    largura: Math.round(limitar(o.largura, LIMITES.largura, p.largura)),
    margem: Math.round(limitar(o.margem, LIMITES.margem, p.margem)),
    alinhamento: umDe(o.alinhamento, ['esquerda', 'justificado'] as const, p.alinhamento),
    hifenizar: typeof o.hifenizar === 'boolean' ? o.hifenizar : p.hifenizar,
    tema: umDe(o.tema, TEMAS_DE_LEITURA, p.tema),
    modo: umDe(o.modo, ['paginado', 'rolagem'] as const, p.modo),
  };
}

/** A família CSS de cada fonte. As faces (`@font-face`) vêm de quem chama: o núcleo não conhece URLs. */
export const FAMILIA_DA_FONTE: Record<Exclude<FonteDeLeitura, 'original'>, string> = {
  serifa: "'Merriweather Variable', Georgia, 'Times New Roman', serif",
  'sem-serifa': "'Inter Variable', system-ui, -apple-system, 'Segoe UI', Roboto, sans-serif",
  atkinson: "'Atkinson Hyperlegible', 'Inter Variable', system-ui, sans-serif",
};

/**
 * O CSS que vai DENTRO do documento do livro (o `setStyles` do paginador). `facesDeFonte` é o bloco de
 * `@font-face` (com URLs absolutas: o documento do livro é um `blob:` e não herda as fontes da página).
 */
export function cssDoLivro(perfil: PerfilDeLeitura, facesDeFonte = ''): string {
  const c = CORES_DOS_TEMAS[perfil.tema];
  const familia = perfil.fonte === 'original' ? '' : FAMILIA_DA_FONTE[perfil.fonte];
  const hifen = perfil.hifenizar ? 'auto' : 'manual';
  return `${facesDeFonte}
@namespace epub "http://www.idpf.org/2007/ops";
html {
  color-scheme: ${c.esquema};
  background: ${c.fundo} !important;
  color: ${c.texto} !important;
  font-size: ${perfil.tamanho}px !important;
}
body {
  background: transparent !important;
  color: inherit !important;
  ${familia ? `font-family: ${familia} !important;` : ''}
  letter-spacing: ${perfil.espacoLetra}em;
  word-spacing: ${perfil.espacoPalavra}em;
}
${familia ? `body *:not(pre):not(code) { font-family: inherit !important; }` : ''}
p, li, blockquote, dd, div {
  line-height: ${perfil.entrelinha} !important;
  text-align: ${perfil.alinhamento === 'justificado' ? 'justify' : 'start'};
  -webkit-hyphens: ${hifen};
  hyphens: ${hifen};
  widows: 2;
  orphans: 2;
}
[align="center"] { text-align: center; }
[align="right"] { text-align: right; }
a:link, a:visited, a[data-href] { color: ${c.link} !important; }
a[data-href] { text-decoration: underline; cursor: pointer; }
pre { white-space: pre-wrap !important; }
img, svg { max-width: 100%; height: auto; }
::selection { background: ${c.esquema === 'dark' ? 'rgba(140,184,255,0.35)' : 'rgba(31,95,168,0.22)'}; }
aside[epub|type~="footnote"], aside[epub|type~="endnote"], aside[epub|type~="rearnote"] { display: none; }
`;
}
