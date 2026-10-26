/**
 * O CAPÍTULO DO LIVRO SEM SCRIPT E SEM NADA DE FORA (revisões de segurança de 26/10/2026).
 *
 * O foliate-js mostra cada capítulo num `iframe` com documento `blob:` da MESMA origem do app. O motor
 * (`motor.ts`) passa toda marcação do livro por aqui antes de virar `blob:`. As barreiras:
 *
 *  1. o NAVEGADOR: o capítulo sai SEMPRE como HTML (`text/html`) montado por esta função, com a CSP em
 *     `<meta>` como a PRIMEIRA coisa que o parser vê (`CSP_DO_CAPITULO`: só `blob:`/`data:`, nenhum script).
 *     No XHTML (parser de XML) o Chromium e o WebKit ignoram a CSP em `<meta>`; por isso nada sai como XHTML;
 *  2. o `sandbox` do iframe sem `allow-scripts` (`foliate/PATCHES.md`);
 *  3. o DOMPurify (Apache-2.0/MPL-2.0), no MESMO modo em que o capítulo será lido (HTML), repetido até ficar
 *     estável (no máximo 2 passadas além da primeira; instável = recusado). Ganchos tiram toda URL que,
 *     normalizada, não seja `blob:`/`data:`/caminho do livro, e o CSS que puxa algo de fora (`limparCss`).
 *
 * O XHTML (e a raiz SVG) é convertido para HTML ANTES do DOMPurify: a diferença entre serializar em XML e ler
 * em HTML (o `</style>` dentro de um `<style>` do XHTML, por exemplo) é exatamente onde mora o mXSS — e o
 * DOMPurify só vê o que o navegador verá. Raiz que não é HTML nem SVG é recusada.
 */
import createDOMPurify, { type Config, type DOMPurify } from 'dompurify';

/** A CSP de todo capítulo: o livro só vê o que é dele (`blob:`/`data:`), e nada executa. */
export const CSP_DO_CAPITULO =
  "default-src 'none'; img-src blob: data:; style-src blob: 'unsafe-inline'; font-src blob: data:; " +
  "media-src blob: data:; script-src 'none'; object-src 'none'; base-uri 'none'; form-action 'none'";

/** Tira das pontas os caracteres de controle C0 e o espaço (U+0000–U+0020), como o parser de URL faz. */
function aparar(s: string): string {
  let a = 0;
  let b = s.length;
  while (a < b && s.charCodeAt(a) <= 0x20) a++;
  while (b > a && s.charCodeAt(b - 1) <= 0x20) b--;
  return s.slice(a, b);
}

/**
 * PRIVACIDADE: o livro só carrega o que é DELE. Depois do foliate-js, todo recurso interno do EPUB virou
 * `blob:`; o que sobrar com esquema é de fora. A URL é NORMALIZADA como o navegador faria antes de decidir:
 * controles e espaços das pontas saem, `\t\n\r` somem de dentro, `\` vira `/`; aí `new URL` decide o esquema.
 * Caminho relativo (sem esquema e sem `//`) é do livro. Não deu para entender = remoto.
 */
export function ehRemoto(url: string | null | undefined): boolean {
  if (url == null) return false;
  const u = aparar(url)
    .replace(/[\t\n\r]/g, '')
    .replace(/\\/g, '/');
  if (!u) return false;
  if (u.startsWith('//')) return true;
  if (!/^[a-z][a-z0-9+.-]*:/i.test(u)) return false; // relativo: do livro (ou um caminho que não existe)
  try {
    const p = new URL(u).protocol;
    return p !== 'blob:' && p !== 'data:';
  } catch {
    return true;
  }
}

/** Os escapes de CSS decodificados (`\75 rl` → `url`), e os comentários fora — para decidir pelo que o navegador lê. */
function decodificarCss(s: string): string {
  return s
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/\\([0-9a-fA-F]{1,6})[ \t\n\r\f]?/g, (_, h: string) => {
      const n = parseInt(h, 16);
      return n > 0 && n <= 0x10ffff ? String.fromCodePoint(n) : '';
    })
    .replace(/\\(.)/g, '$1');
}

/** Os alvos que um trecho de CSS carrega: `url(...)`, as strings de `image-set(...)` e do `@import`. */
function alvosDoCss(trecho: string): string[] {
  const alvos: string[] = [];
  for (const m of trecho.matchAll(/url\(\s*(['"]?)([^'")]*)/gi)) alvos.push(m[2]);
  for (const m of trecho.matchAll(/image-set\(([^)]*)/gi))
    for (const s of m[1].matchAll(/(['"])(.*?)\1/g)) alvos.push(s[2]);
  for (const m of trecho.matchAll(/@import\s*(['"])(.*?)\1/gi)) alvos.push(m[2]);
  return alvos;
}

/**
 * O CSS do livro sem nada de fora, FALHANDO FECHADO: o texto é cortado em declarações e regras (`;`, `{`, `}`)
 * e cada pedaço é lido DECODIFICADO (escapes e comentários resolvidos); o que carrega algo que não seja
 * `blob:`/`data:` — `url()`, `image-set()`, `@import` — sai inteiro. O resto fica como veio (o escape de
 * `content: "\201C"` continua valendo). A CSP do capítulo é a barreira de verdade; isto é a segunda.
 */
export function limparCss(css: string): string {
  return css
    .split(/([;{}])/)
    .map((pedaco) => {
      if (pedaco === ';' || pedaco === '{' || pedaco === '}') return pedaco;
      const lido = decodificarCss(pedaco);
      const alvos = alvosDoCss(lido);
      if (/@import/i.test(lido) && !alvos.length) return ''; // @import sem forma reconhecível: fora
      return alvos.some((a) => ehRemoto(a)) ? '' : pedaco;
    })
    .join('');
}

/** Atributos que CARREGAM um recurso (ou navegam, no `<a>`), pelo nome LOCAL (sem o prefixo). */
const ATRIBUTOS_DE_URL = new Set([
  'href',
  'src',
  'poster',
  'background',
  'cite',
  'longdesc',
  'action',
  'formaction',
  'data',
  'lowsrc',
  'dynsrc',
  'manifest',
  'codebase',
  'usemap',
]);

const TAGS_PROIBIDAS = [
  'script',
  'object',
  'embed',
  'iframe',
  'frame',
  'frameset',
  'base',
  'form',
  'meta',
  'set',
  'animate',
  'animatemotion',
  'animatetransform',
  'animatecolor',
  'discard',
  'foreignobject',
  'noscript',
  'xmp',
  'noembed',
  'noframes',
  'plaintext',
  'template',
  'portal',
];
const ATRIBUTOS_PROIBIDOS = ['ping', 'srcdoc', 'formaction', 'action'];

const CONFIG = {
  WHOLE_DOCUMENT: true,
  PARSER_MEDIA_TYPE: 'text/html',
  ADD_TAGS: ['link'],
  FORBID_TAGS: TAGS_PROIBIDAS,
  FORBID_ATTR: ATRIBUTOS_PROIBIDOS,
  ALLOW_UNKNOWN_PROTOCOLS: false,
  /* O de sempre do DOMPurify, mais `blob:` (o motor troca o caminho interno do livro por `blob:`). O que é de fora
     sai pelo gancho de privacidade, antes. */
  ALLOWED_URI_REGEXP: /^(?:(?:https?|mailto|tel|blob):|[^a-z]|[a-z+.-]+(?:[^a-z+.:-]|$))/i,
  ADD_DATA_URI_TAGS: ['image', 'feimage'],
} satisfies Config;

let purificador: DOMPurify | null = null;

/** O DOMPurify do leitor, com os ganchos de privacidade (uma instância só, só nossa). */
function dompurify(): DOMPurify {
  if (purificador) return purificador;
  const p = createDOMPurify(window);
  p.addHook('uponSanitizeElement', (no, dados) => {
    if (dados.tagName === 'style' && no.textContent) no.textContent = limparCss(no.textContent);
  });
  p.addHook('uponSanitizeAttribute', (no, dados) => {
    const local = (dados.attrName.split(':').pop() ?? '').toLowerCase();
    const el = no as Element;
    if (local === 'style') {
      dados.attrValue = limparCss(dados.attrValue);
      return;
    }
    if (local === 'srcset' || local === 'imagesrcset') {
      if (dados.attrValue.split(',').some((c) => ehRemoto(c.trim().split(/\s+/)[0]))) dados.keepAttr = false;
      return;
    }
    if (!ATRIBUTOS_DE_URL.has(local)) return;
    const nome = el.localName?.toLowerCase();
    /* O `<link>` só serve para a folha do próprio livro; o resto (preconnect, prefetch, ícone…) sai. */
    if (nome === 'link' && local === 'href') {
      const rel = (el.getAttribute('rel') ?? '').toLowerCase();
      if (!/\bstylesheet\b/.test(rel) || ehRemoto(dados.attrValue)) dados.keepAttr = false;
      return;
    }
    if (!ehRemoto(dados.attrValue)) return;
    /* Link de NAVEGAÇÃO para fora fica (o motor só abre http(s), em aba nova, sem opener). */
    if (nome === 'a' && local === 'href' && /^https?:\/\//i.test(aparar(dados.attrValue))) return;
    dados.keepAttr = false;
  });
  purificador = p;
  return p;
}

export type TipoDeMarcacao = 'html' | 'xhtml' | 'svg';

/** O tipo de mídia sem parâmetros, minúsculo. */
const normalizar = (t: string) => t.split(';')[0].trim().toLowerCase();

/**
 * O PREDICADO ÚNICO do motor: este conteúdo é marcação? E de que tipo? (Pelo tipo declarado; se ele não disser
 * nada de marcação, pelo começo do conteúdo.) `null` = não é marcação e não passa por `limparCapitulo`.
 */
export function tipoDeMarcacao(tipo: string, inicio: string): TipoDeMarcacao | null {
  const t = normalizar(tipo);
  if (t === 'application/xhtml+xml') return 'xhtml';
  if (t === 'text/html') return 'html';
  if (t === 'image/svg+xml') return 'svg';
  if (!/^\uFEFF?\s*<(\?xml|!doctype|html|svg|xsl|body|head|script|iframe)\b/i.test(inicio)) return null;
  if (/<svg\b/i.test(inicio) && !/<html\b/i.test(inicio)) return 'svg';
  return /^\uFEFF?\s*<\?xml/i.test(inicio) ? 'xhtml' : 'html';
}

const escaparAtributo = (s: string) =>
  s.replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

/** A entrada (no modo dela) como UMA string de HTML — a forma em que o navegador vai ler. `null` = raiz recusada. */
function comoHtml(texto: string, tipo: TipoDeMarcacao): string | null {
  if (tipo === 'html') return texto;
  const xml = new DOMParser().parseFromString(texto, tipo === 'svg' ? 'image/svg+xml' : 'application/xhtml+xml');
  const quebrado = !!xml.getElementsByTagName('parsererror').length || !xml.documentElement;
  if (quebrado) return tipo === 'xhtml' ? texto : null; // XHTML malformado: o parser de HTML lê como der
  const raiz = xml.documentElement;
  const nome = raiz.localName.toLowerCase();
  const html = document.implementation.createHTMLDocument('');
  if (nome === 'html' && raiz.namespaceURI === NS_XHTML) {
    const copia = copiarSemPrefixo(html, raiz);
    if (!(copia instanceof Element)) return null;
    html.replaceChild(copia, html.documentElement);
  } else if (nome === 'svg' && raiz.namespaceURI === NS_SVG) {
    const copia = copiarSemPrefixo(html, raiz);
    if (copia) html.body.appendChild(copia);
  } else return null; // outra raiz XML: não é capítulo
  return '<!DOCTYPE html>' + html.documentElement.outerHTML;
}

const NS_XHTML = 'http://www.w3.org/1999/xhtml';
const NS_SVG = 'http://www.w3.org/2000/svg';
const NS_MATHML = 'http://www.w3.org/1998/Math/MathML';
const NS_XLINK = 'http://www.w3.org/1999/xlink';
const NS_XML = 'http://www.w3.org/XML/1998/namespace';

/**
 * A árvore XML copiada para o documento HTML SEM PREFIXOS: cada elemento é recriado pelo NOME LOCAL no seu
 * namespace (`svg:style` vira `<style>` do SVG, `h:script` vira `<script>`), para que o DOMPurify veja o que o
 * navegador vai ver. Elemento de outro namespace some (o conteúdo fica); atributo de namespace estranho some;
 * instrução de processamento (`xml-stylesheet`) e comentário somem.
 */
function copiarSemPrefixo(destino: Document, no: Node): Node | DocumentFragment | null {
  if (no.nodeType === Node.TEXT_NODE || no.nodeType === Node.CDATA_SECTION_NODE) {
    return destino.createTextNode(no.nodeValue ?? '');
  }
  if (no.nodeType !== Node.ELEMENT_NODE) return null;
  const el = no as Element;
  const filhos = () => {
    const f = destino.createDocumentFragment();
    for (const c of el.childNodes) {
      const copia = copiarSemPrefixo(destino, c);
      if (copia) f.appendChild(copia);
    }
    return f;
  };
  const ns = el.namespaceURI;
  if (ns !== NS_XHTML && ns !== NS_SVG && ns !== NS_MATHML) return filhos();
  const novo = destino.createElementNS(ns, el.localName);
  for (const a of el.attributes) {
    if (a.namespaceURI == null) novo.setAttribute(a.localName, a.value);
    else if (a.namespaceURI === NS_XLINK) novo.setAttributeNS(NS_XLINK, 'xlink:' + a.localName, a.value);
    else if (a.namespaceURI === NS_XML && a.localName === 'lang') novo.setAttribute('lang', a.value);
  }
  novo.appendChild(filhos());
  return novo;
}

const sanitizar = (html: string): string => dompurify().sanitize(html, CONFIG) as unknown as string;

/**
 * O CAPÍTULO LIMPO, como o documento HTML final (`text/html`), com a CSP primeiro. `null` = recusado (raiz que
 * não é HTML nem SVG, saída instável do DOMPurify, ou a montagem final não ficou como devia): quem chama não
 * mostra nada — falha fechada.
 */
export function limparCapitulo(texto: string, tipo: TipoDeMarcacao): string | null {
  const html = comoHtml(texto, tipo);
  if (html == null) return null;
  let limpo = sanitizar(html);
  let estavel = false;
  for (let i = 0; i < 2 && !estavel; i++) {
    const deNovo = sanitizar(limpo);
    estavel = deNovo === limpo;
    limpo = deNovo;
  }
  if (!estavel) return null;
  const doc = new DOMParser().parseFromString(limpo, 'text/html');
  const lang = doc.documentElement.getAttribute('lang') ?? '';
  const dir = doc.documentElement.getAttribute('dir') ?? '';
  const classe = doc.body.getAttribute('class') ?? '';
  const final =
    '<!DOCTYPE html><html' +
    (lang ? ` lang="${escaparAtributo(lang)}"` : '') +
    (dir ? ` dir="${escaparAtributo(dir)}"` : '') +
    `><head><meta http-equiv="Content-Security-Policy" content="${CSP_DO_CAPITULO}">` +
    doc.head.innerHTML +
    '</head><body' +
    (classe ? ` class="${escaparAtributo(classe)}"` : '') +
    '>' +
    doc.body.innerHTML +
    '</body></html>';
  /* Conferência da montagem: a CSP é o primeiro elemento do <head> e a única `meta http-equiv`; nada ativo. */
  const prova = new DOMParser().parseFromString(final, 'text/html');
  const primeira = prova.head.firstElementChild;
  if (
    primeira?.localName !== 'meta' ||
    primeira.getAttribute('http-equiv') !== 'Content-Security-Policy' ||
    primeira.getAttribute('content') !== CSP_DO_CAPITULO ||
    prova.querySelectorAll('meta[http-equiv]').length !== 1 ||
    prova.querySelector('script, iframe, object, embed, base, frame, noscript, template')
  ) {
    return null;
  }
  return final;
}

/**
 * Uma imagem SVG do livro (referida por `<img>`/CSS, e não um capítulo): limpa pelo DOMPurify no modo SVG,
 * com os mesmos ganchos, e continua `image/svg+xml` — SVG como imagem não executa nem busca nada de fora, e a
 * limpeza é a segunda barreira. `null` = recusada.
 */
export function limparSvgDeImagem(texto: string): string | null {
  const limpo = dompurify().sanitize(texto, {
    USE_PROFILES: { svg: true, svgFilters: true },
    PARSER_MEDIA_TYPE: 'application/xhtml+xml',
    FORBID_TAGS: TAGS_PROIBIDAS,
    FORBID_ATTR: ATRIBUTOS_PROIBIDOS,
  }) as unknown as string;
  return limpo && /<svg\b/i.test(limpo) ? limpo : null;
}
