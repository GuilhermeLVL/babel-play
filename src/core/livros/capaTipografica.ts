/**
 * A CAPA TIPOGRÁFICA (spec `docs/specs/2026-10-28-livros-capas.md`): tudo o que decide COMO ela se parece, sem
 * DOM. Determinística por (id, título, autor, idioma): o mesmo livro tem sempre a mesma capa, e livros
 * diferentes variam em matiz, esquema (papel claro ou cor forte) e ornamento. A tela (`CapaTipografica.tsx`)
 * só desenha o plano.
 *
 * Contraste: o texto sobre o fundo (título, autor e selo) passa de 4,5:1 (WCAG AA) em TODAS as paletas, nos
 * dois temas; `paletaDe` empurra a luminosidade da tinta até passar, e o teste cobre uma amostra grande.
 */

/** O desenho é feito num quadro fixo de 200 x 300 (2:3) e escala com o tamanho da capa. */
export const LARGURA = 200;
export const ALTURA = 300;
export const ORNAMENTOS = 6;

/* ── Cor ─────────────────────────────────────────────────────────────────────────────────────── */

function hslParaRgb(h: number, s: number, l: number): [number, number, number] {
  const sat = s / 100;
  const lum = l / 100;
  const a = sat * Math.min(lum, 1 - lum);
  const f = (n: number) => {
    const k = (n + h / 30) % 12;
    return lum - a * Math.max(-1, Math.min(k - 3, 9 - k, 1));
  };
  return [Math.round(f(0) * 255), Math.round(f(8) * 255), Math.round(f(4) * 255)];
}

const hex2 = (n: number) => n.toString(16).padStart(2, '0');
export const hslParaHex = (h: number, s: number, l: number): string =>
  `#${hslParaRgb(((h % 360) + 360) % 360, s, l)
    .map(hex2)
    .join('')}`;

function luminancia(hex: string): number {
  const canais = [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16) / 255);
  const [r, g, b] = canais.map((c) => (c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4));
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

/** Razão de contraste da WCAG entre duas cores `#rrggbb` (1 a 21). */
export function contraste(a: string, b: string): number {
  const [x, y] = [luminancia(a), luminancia(b)].sort((p, q) => q - p);
  return (x + 0.05) / (y + 0.05);
}

export interface PaletaDaCapa {
  fundo: string;
  /** Título e autor. */
  tinta: string;
  /** Só enfeite (moldura, ornamento, faixa): não carrega texto. */
  enfeite: string;
  /** O fundo do selo do idioma (a tinta é o texto dele, e o fundo da capa vira a cor da letra). */
  selo: string;
}

const MINIMO_AA = 4.5;

/** Afasta a luminosidade da tinta do fundo até o contraste passar do mínimo (sobe se o fundo é escuro, desce se claro). */
function tintaLegivel(h: number, s: number, l: number, fundo: string): string {
  const sobeParaClaro = luminancia(fundo) < 0.4;
  let luz = l;
  let tinta = hslParaHex(h, s, luz);
  for (let i = 0; i < 40 && contraste(tinta, fundo) < MINIMO_AA; i++) {
    luz = sobeParaClaro ? Math.min(100, luz + 2) : Math.max(0, luz - 2);
    tinta = hslParaHex(h, s, luz);
  }
  return tinta;
}

/**
 * As cores num tema. `forte` = fundo colorido com tinta clara; senão papel claro com tinta escura (e, no tema
 * escuro, fundo profundo com tinta clara em ambos).
 */
export function paletaDe(matiz: number, forte: boolean, escuro: boolean, variacao = 0): PaletaDaCapa {
  const s = 36 + (variacao % 5) * 6;
  let fundo: string;
  let tinta: string;
  if (escuro) {
    fundo = hslParaHex(matiz, forte ? 42 : 26, forte ? 24 : 15);
    tinta = tintaLegivel(matiz, 30, 93, fundo);
  } else if (forte) {
    fundo = hslParaHex(matiz, s + 14, 27);
    tinta = tintaLegivel(matiz, 35, 95, fundo);
  } else {
    fundo = hslParaHex(matiz, s, 91);
    tinta = tintaLegivel(matiz, 45, 18, fundo);
  }
  const enfeite = escuro
    ? hslParaHex(matiz, 55, forte ? 62 : 58)
    : forte
      ? hslParaHex(matiz, 55, 72)
      : hslParaHex(matiz, 50, 42);
  return { fundo, tinta, enfeite, selo: tinta };
}

/* ── Hash ────────────────────────────────────────────────────────────────────────────────────── */

/** FNV-1a de 32 bits: barato, estável entre execuções e bem espalhado. */
export function hash32(texto: string): number {
  let h = 0x811c9dc5;
  for (let i = 0; i < texto.length; i++) {
    h ^= texto.charCodeAt(i);
    h = Math.imul(h, 0x01000193) >>> 0;
  }
  /* Mistura final (murmur3): ids parecidos (pg-1, pg-2…) espalham os bits baixos. */
  h ^= h >>> 16;
  h = Math.imul(h, 0x85ebca6b) >>> 0;
  h ^= h >>> 13;
  h = Math.imul(h, 0xc2b2ae35) >>> 0;
  h ^= h >>> 16;
  return h >>> 0;
}

/* ── Texto ───────────────────────────────────────────────────────────────────────────────────── */

/** Largura média de um caractere, em fração do corpo da fonte (conservadora: maiúsculas e negrito). */
const LARGURA_DO_CARACTERE = 0.6;
const ALTURA_DA_LINHA = 1.18;
/** O retângulo do título: 150 x 118 dentro do quadro. */
export const CAIXA_DO_TITULO = { largura: 150, altura: 118, topo: 92 } as const;
const CORPOS_DO_TITULO = [27, 23, 20, 17, 15, 13] as const;
export const MAX_LINHAS_DO_TITULO = 4;

/** O título sem o subtítulo ("Moby Dick; or, The Whale" vira "Moby Dick") quando ele é longo; o inteiro vai no alt. */
export function tituloPrincipal(titulo: string): string {
  const t = titulo.replace(/\s+/g, ' ').trim();
  if (t.length <= 38) return t;
  const corte = t.search(/\s*[:;—–]\s|\s+or,\s/i);
  return corte >= 3 ? t.slice(0, corte).trim() : t;
}

function guloso(palavras: string[], colunas: number): string[] | null {
  const linhas: string[] = [];
  let atual = '';
  for (const p of palavras) {
    if (p.length > colunas) return null;
    if (!atual) atual = p;
    else if (atual.length + 1 + p.length <= colunas) atual += ` ${p}`;
    else {
      linhas.push(atual);
      atual = p;
    }
  }
  if (atual) linhas.push(atual);
  return linhas;
}

/**
 * Quebra em linhas EQUILIBRADAS: acha o menor número de linhas que cabe em `colunas` e depois estreita a coluna
 * até a quebra não aumentar, para as linhas ficarem parecidas (e não uma longa e uma curta).
 */
export function quebrarEmLinhas(texto: string, colunas: number): string[] | null {
  const palavras = texto.split(' ').filter(Boolean);
  if (!palavras.length) return [];
  const base = guloso(palavras, colunas);
  if (!base) return null;
  let melhor = base;
  const maiorPalavra = Math.max(...palavras.map((p) => p.length));
  for (let c = colunas - 1; c >= maiorPalavra; c--) {
    const linhas = guloso(palavras, c);
    if (!linhas || linhas.length > base.length) break;
    melhor = linhas;
  }
  return melhor;
}

/** Sempre termina em reticências, cabendo em `colunas`. */
function terminarComReticencias(linha: string, colunas: number): string {
  return `${linha.slice(0, Math.max(1, colunas - 1)).trimEnd()}…`;
}

function cortarComReticencias(linha: string, colunas: number): string {
  return linha.length <= colunas ? linha : `${linha.slice(0, Math.max(1, colunas - 1)).trimEnd()}…`;
}

export interface TituloDiagramado {
  linhas: string[];
  corpo: number;
  /** A posição vertical (no quadro) da linha de base de cada linha. */
  ys: number[];
  /** Houve corte com reticências (o título inteiro continua no alt). */
  cortado: boolean;
}

/** Escolhe o maior corpo em que o título cabe na caixa em até 4 linhas; no menor corpo corta com reticências. */
export function diagramarTitulo(titulo: string): TituloDiagramado {
  const texto = tituloPrincipal(titulo) || '·';
  let escolhido: { linhas: string[]; corpo: number; cortado: boolean } | null = null;
  for (const corpo of CORPOS_DO_TITULO) {
    const colunas = Math.floor(CAIXA_DO_TITULO.largura / (corpo * LARGURA_DO_CARACTERE));
    const maxLinhas = Math.min(MAX_LINHAS_DO_TITULO, Math.floor(CAIXA_DO_TITULO.altura / (corpo * ALTURA_DA_LINHA)));
    const linhas = quebrarEmLinhas(texto, colunas);
    if (linhas && linhas.length <= maxLinhas) {
      escolhido = { linhas, corpo, cortado: false };
      break;
    }
  }
  if (!escolhido) {
    const corpo = CORPOS_DO_TITULO[CORPOS_DO_TITULO.length - 1];
    const colunas = Math.floor(CAIXA_DO_TITULO.largura / (corpo * LARGURA_DO_CARACTERE));
    const maxLinhas = Math.min(MAX_LINHAS_DO_TITULO, Math.floor(CAIXA_DO_TITULO.altura / (corpo * ALTURA_DA_LINHA)));
    const original = texto.split(' ');
    const palavras = original.map((p) => cortarComReticencias(p, colunas));
    let linhas = guloso(palavras, colunas) ?? [];
    const cortado = linhas.length > maxLinhas || palavras.some((p, i) => p !== original[i]);
    if (linhas.length > maxLinhas) {
      linhas = linhas.slice(0, maxLinhas);
      linhas[maxLinhas - 1] = terminarComReticencias(linhas[maxLinhas - 1], colunas);
    }
    escolhido = { linhas, corpo, cortado };
  }
  const passo = escolhido.corpo * ALTURA_DA_LINHA;
  const total = passo * escolhido.linhas.length;
  const inicio = CAIXA_DO_TITULO.topo + (CAIXA_DO_TITULO.altura - total) / 2 + escolhido.corpo * 0.85;
  return { ...escolhido, ys: escolhido.linhas.map((_, i) => Math.round((inicio + i * passo) * 10) / 10) };
}

/** O autor em até 2 linhas, no corpo 12, cortado com reticências. */
export function diagramarAutor(autor: string | undefined): string[] {
  const texto = (autor ?? '').replace(/\s+/g, ' ').trim();
  if (!texto) return [];
  const colunas = Math.floor(160 / (12 * 0.56));
  const linhas = quebrarEmLinhas(texto, colunas);
  if (linhas && linhas.length <= 2) return linhas;
  const palavras = texto.split(' ').map((p) => cortarComReticencias(p, colunas));
  const l = guloso(palavras, colunas) ?? [palavras[0]];
  if (l.length <= 2) return l;
  return [l[0], terminarComReticencias(l[1], colunas)];
}

/** Idiomas escritos da direita para a esquerda (o selo e o texto mudam de sentido). */
export const ehRtl = (idioma: string | undefined): boolean => /^(ar|he|fa|ur|yi)/i.test(idioma ?? '');

/* ── O plano ─────────────────────────────────────────────────────────────────────────────────── */

export interface PlanoDaCapa {
  matiz: number;
  forte: boolean;
  ornamento: number;
  claro: PaletaDaCapa;
  escuro: PaletaDaCapa;
  titulo: TituloDiagramado;
  autor: string[];
  /** O código do idioma em maiúsculas ("PT"), ou vazio. */
  selo: string;
  rtl: boolean;
}

export function planoDaCapa(l: { id: string; titulo: string; autor?: string; idioma?: string }): PlanoDaCapa {
  const h = hash32(`${l.id}|${l.titulo}|${l.autor ?? ''}|${l.idioma ?? ''}`);
  const matiz = h % 360;
  const forte = (h >>> 9) % 3 === 0;
  const ornamento = (h >>> 13) % ORNAMENTOS;
  const variacao = (h >>> 17) & 7;
  return {
    matiz,
    forte,
    ornamento,
    claro: paletaDe(matiz, forte, false, variacao),
    escuro: paletaDe(matiz, forte, true, variacao),
    titulo: diagramarTitulo(l.titulo),
    autor: diagramarAutor(l.autor),
    selo: (l.idioma ?? '').slice(0, 2).toUpperCase(),
    rtl: ehRtl(l.idioma),
  };
}
