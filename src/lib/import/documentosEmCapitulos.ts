/**
 * DOCUMENTOS QUE VIRAM TEXTO EM CAPÍTULOS, no navegador: TXT (com detecção de codificação), HTML/MHTML,
 * Markdown e DOCX estruturado. Nada vai ao servidor. As bibliotecas (`marked`, `chardet`, `mammoth`, `dompurify`)
 * entram por `import()` só quando o formato aparece; nenhuma vai para o pacote de entrada.
 *
 * Só TEXTO sai daqui: o HTML passa pelo DOMPurify e depois só se lê `textContent`, então não há script, imagem
 * remota nem marcação que chegue ao leitor. Títulos (h1/h2) viram capítulos.
 */
import { dividirEmCapitulos } from '../../core/livros/capitulosDeTexto';
import type { CapituloDeTexto } from '../../core/livros/epub';

export interface DocumentoEmCapitulos {
  /** O título que o documento declara (`<title>`, primeiro h1), se houver. */
  titulo?: string;
  idioma?: string;
  capitulos: CapituloDeTexto[];
}

/** Texto demais: um livro de verdade não chega perto (o mesmo teto do extrator de documentos). */
export const TETO_DE_TEXTO_EM_CARACTERES = 5_000_000;

const norm = (s: string) => s.replace(/\s+/g, ' ').trim();

/* ── Codificação do TXT ───────────────────────────────────────────────────────────────────────── */

/** UTF-8/16 pelo BOM; UTF-8 se for válido; senão o `chardet` palpita e, na dúvida, windows-1252. */
export async function decodificarTexto(bytes: Uint8Array): Promise<string> {
  if (bytes[0] === 0xff && bytes[1] === 0xfe) return new TextDecoder('utf-16le').decode(bytes);
  if (bytes[0] === 0xfe && bytes[1] === 0xff) return new TextDecoder('utf-16be').decode(bytes);
  try {
    return new TextDecoder('utf-8', { fatal: true }).decode(bytes);
  } catch {
    /* não é UTF-8 */
  }
  let nome = 'windows-1252';
  try {
    const chardet = await import('chardet');
    const detectar = chardet.detect ?? chardet.default.detect;
    const palpite = detectar(bytes);
    if (palpite) nome = palpite;
  } catch {
    /* sem o detector: windows-1252 */
  }
  try {
    return new TextDecoder(nome).decode(bytes);
  } catch {
    return new TextDecoder('windows-1252').decode(bytes);
  }
}

/* ── HTML ─────────────────────────────────────────────────────────────────────────────────────── */

const IGNORADOS = new Set(['script', 'style', 'noscript', 'template', 'head', 'svg', 'math', 'iframe', 'object']);
const FOLHAS = new Set(['p', 'li', 'pre', 'dd', 'dt', 'figcaption', 'caption', 'td', 'th', 'summary', 'address']);
const CONTEINERES = new Set([
  'div',
  'section',
  'article',
  'main',
  'aside',
  'header',
  'footer',
  'nav',
  'ul',
  'ol',
  'dl',
  'table',
  'thead',
  'tbody',
  'tfoot',
  'tr',
  'body',
  'blockquote',
  'figure',
  'details',
  'center',
  'form',
]);

type Bloco = { nivel: number; texto: string }; /* nivel 0 = parágrafo; 1-6 = título */

function percorrer(no: Element, saida: Bloco[]): void {
  let corrida = '';
  const despejar = () => {
    const t = norm(corrida);
    if (t) saida.push({ nivel: 0, texto: t });
    corrida = '';
  };
  for (const filho of Array.from(no.childNodes)) {
    if (filho.nodeType === 3) {
      corrida += filho.textContent ?? '';
      continue;
    }
    if (filho.nodeType !== 1) continue;
    const el = filho as Element;
    const tag = el.tagName.toLowerCase();
    if (IGNORADOS.has(tag)) continue;
    if (tag === 'br') {
      corrida += ' ';
    } else if (/^h[1-6]$/.test(tag)) {
      despejar();
      const t = norm(el.textContent ?? '');
      if (t) saida.push({ nivel: Number(tag[1]), texto: t });
    } else if (FOLHAS.has(tag)) {
      despejar();
      const t = norm(el.textContent ?? '');
      if (t) saida.push({ nivel: 0, texto: t });
    } else if (CONTEINERES.has(tag)) {
      despejar();
      percorrer(el, saida);
    } else {
      corrida += el.textContent ?? '';
    }
  }
  despejar();
}

const palavras = (s: string) => s.split(/\s+/).filter(Boolean).length;

/** Os blocos (títulos e parágrafos) viram capítulos: um por h1/h2; sem títulos, pelo tamanho. */
function blocosEmCapitulos(
  blocos: Bloco[],
  rotulo: (i: number) => string,
): { titulo?: string; capitulos: CapituloDeTexto[] } {
  const primeiroH1 = blocos.find((b) => b.nivel === 1)?.texto;
  const divisores = blocos.filter((b) => b.nivel === 1 || b.nivel === 2).length;
  if (divisores < 1) {
    return { titulo: primeiroH1, capitulos: dividirEmCapitulos(blocos.map((b) => b.texto).join('\n\n'), rotulo) };
  }
  const capitulos: CapituloDeTexto[] = [];
  let titulo = '';
  let corpo: string[] = [];
  let tituloDoLivro: string | undefined;
  const fechar = () => {
    const texto = corpo.join('\n\n');
    /* Capítulo sem corpo (um h1 de capa, por exemplo) não vira capítulo vazio: o título fica para o livro. */
    if (texto.trim() && (titulo || palavras(texto) >= 5)) capitulos.push({ titulo: titulo || rotulo(0), texto });
    else if (!texto.trim() && titulo && !tituloDoLivro && capitulos.length === 0) tituloDoLivro = titulo;
    corpo = [];
  };
  for (const b of blocos) {
    if (b.nivel === 1 || b.nivel === 2) {
      fechar();
      titulo = b.texto;
    } else corpo.push(b.texto);
  }
  fechar();
  return { titulo: tituloDoLivro ?? primeiroH1, capitulos };
}

/** Um HTML (já como texto) vira capítulos de texto. Passa pelo DOMPurify; só `textContent` sai. */
export async function htmlEmCapitulos(html: string, rotulo: (i: number) => string): Promise<DocumentoEmCapitulos> {
  const { default: DOMPurify } = await import('dompurify');
  const limpo = DOMPurify.sanitize(html, {
    WHOLE_DOCUMENT: true,
    FORBID_TAGS: ['style', 'script', 'img', 'picture', 'video', 'audio', 'source', 'link', 'meta', 'base', 'form'],
    FORBID_ATTR: ['style', 'src', 'srcset', 'href', 'xlink:href'],
  });
  const doc = new DOMParser().parseFromString(limpo, 'text/html');
  const idioma = doc.documentElement.getAttribute('lang') || undefined;
  const tituloDaPagina = norm(doc.querySelector('title')?.textContent ?? '') || undefined;
  const blocos: Bloco[] = [];
  percorrer(doc.body, blocos);
  const total = blocos.reduce((s, b) => s + b.texto.length, 0);
  if (total > TETO_DE_TEXTO_EM_CARACTERES) throw new Error('o texto do documento é grande demais; divida o arquivo');
  const { titulo, capitulos } = blocosEmCapitulos(blocos, rotulo);
  return { titulo: tituloDaPagina ?? titulo, idioma, capitulos };
}

/* ── MHTML ────────────────────────────────────────────────────────────────────────────────────── */

function decodificarParte(corpo: string, codificacao: string, charset: string): string {
  let bytes: Uint8Array;
  if (/base64/i.test(codificacao)) {
    try {
      const bin = atob(corpo.replace(/\s+/g, ''));
      bytes = Uint8Array.from(bin, (c) => c.charCodeAt(0));
    } catch {
      return '';
    }
  } else if (/quoted-printable/i.test(codificacao)) {
    const semQuebras = corpo.replace(/=\r?\n/g, '');
    const lista: number[] = [];
    for (let i = 0; i < semQuebras.length; i++) {
      const c = semQuebras[i];
      if (c === '=' && /^[0-9A-Fa-f]{2}$/.test(semQuebras.slice(i + 1, i + 3))) {
        lista.push(parseInt(semQuebras.slice(i + 1, i + 3), 16));
        i += 2;
      } else lista.push(c.charCodeAt(0) & 0xff);
    }
    bytes = Uint8Array.from(lista);
  } else {
    bytes = Uint8Array.from(corpo, (c) => c.charCodeAt(0) & 0xff);
  }
  try {
    return new TextDecoder(charset || 'utf-8').decode(bytes);
  } catch {
    return new TextDecoder('utf-8').decode(bytes);
  }
}

/** A parte `text/html` de um arquivo MHTML (página salva como "arquivo único"); `null` se não houver. */
export function htmlDoMhtml(texto: string): string | null {
  const cabecalho = texto.split(/\r?\n\r?\n/, 1)[0];
  const limite = /boundary="?([^";\r\n]+)"?/i.exec(cabecalho)?.[1];
  if (!limite) return null;
  for (const parte of texto.split(`--${limite}`)) {
    const [cab, ...resto] = parte.replace(/^\r?\n/, '').split(/\r?\n\r?\n/);
    if (!/content-type:\s*text\/html/i.test(cab)) continue;
    const codificacao = /content-transfer-encoding:\s*(\S+)/i.exec(cab)?.[1] ?? '';
    const charset = /charset="?([\w-]+)"?/i.exec(cab)?.[1] ?? 'utf-8';
    return decodificarParte(resto.join('\n\n'), codificacao, charset);
  }
  return null;
}

/* ── Markdown e DOCX ──────────────────────────────────────────────────────────────────────────── */

export async function markdownEmCapitulos(md: string, rotulo: (i: number) => string): Promise<DocumentoEmCapitulos> {
  const { marked } = await import('marked');
  const html = await marked.parse(md, { gfm: true, async: true });
  return htmlEmCapitulos(`<html><body>${html}</body></html>`, rotulo);
}

/** DOCX estruturado: o `mammoth` converte para HTML (títulos e parágrafos) e as imagens ficam de fora. */
export async function docxEmCapitulos(
  arrayBuffer: ArrayBuffer,
  rotulo: (i: number) => string,
): Promise<DocumentoEmCapitulos> {
  const mammoth = (await import('mammoth/mammoth.browser')).default;
  const { value } = await mammoth.convertToHtml(
    { arrayBuffer },
    { convertImage: mammoth.images.imgElement(async () => ({ src: '' })) },
  );
  return htmlEmCapitulos(`<html><body>${value}</body></html>`, rotulo);
}

/** O texto cru vira capítulos (TXT). */
export function textoEmCapitulos(texto: string, rotulo: (i: number) => string): DocumentoEmCapitulos {
  return { capitulos: dividirEmCapitulos(texto, rotulo) };
}
