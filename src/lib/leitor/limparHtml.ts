/**
 * O HTML DE UMA SEÇÃO DO LIVRO SEM SCRIPT E SEM NADA DE FORA. O foliate-js mostra cada capítulo num `iframe`
 * com documento `blob:` da MESMA origem do app. O motor (`motor.ts`) passa cada seção por aqui antes de virar
 * `blob:`. As barreiras, da mais forte para a mais fraca:
 *
 *  1. o NAVEGADOR: uma CSP em `<meta>` é o primeiro filho do `<head>` de todo capítulo (`CSP_DO_CAPITULO`) —
 *     só `blob:`/`data:` carregam, nenhum script roda. Qualquer `<meta http-equiv>` do livro sai antes;
 *  2. o `sandbox` do iframe sem `allow-scripts` (`foliate/PATCHES.md`);
 *  3. esta limpeza, por nome LOCAL (com ou sem prefixo de namespace): tira `<script>`, `on*`, `javascript:`,
 *     o conteúdo ativo (`iframe`, `object`, `embed`, `form`), as animações SMIL (`set`, `animate…`, que trocam
 *     `href` depois da limpeza) e toda URL que, normalizada, não seja `blob:`/`data:` (`ehRemoto`); no CSS, a
 *     declaração que puxa algo de fora sai inteira, inclusive a escondida em escape (`limparCss`).
 *
 * Revisão de segurança de 26/10/2026 (seis desvios do filtro por regex): por isso a 1 manda e a 3 falha fechada.
 */

/** A CSP de todo capítulo: o livro só vê o que é dele (`blob:`/`data:`), e nada executa. */
export const CSP_DO_CAPITULO =
  "default-src 'none'; img-src blob: data:; style-src blob: 'unsafe-inline'; font-src blob: data:; " +
  "media-src blob: data:; script-src 'none'; object-src 'none'; base-uri 'none'; form-action 'none'";

const ELEMENTOS_PROIBIDOS = new Set([
  'script',
  'iframe',
  'object',
  'embed',
  'frame',
  'frameset',
  'form',
  'base',
  'portal',
  'applet',
  // SMIL: troca atributos (inclusive `href`) depois da limpeza.
  'set',
  'animate',
  'animatemotion',
  'animatetransform',
  'animatecolor',
  'discard',
]);

/** Atributos que CARREGAM um recurso (ou navegam, no `<a>`), pelo nome LOCAL. */
const ATRIBUTOS_DE_URL = new Set([
  'href',
  'src',
  'action',
  'formaction',
  'data',
  'poster',
  'background',
  'lowsrc',
  'dynsrc',
  'longdesc',
  'manifest',
  'codebase',
  'cite',
]);

/**
 * PRIVACIDADE: o livro só carrega o que é DELE. Depois do foliate-js, todo recurso interno do EPUB virou
 * `blob:`; o que sobrar com esquema é de fora. A URL é NORMALIZADA como o navegador faria antes de decidir:
 * controles e espaços das pontas saem, `\t\n\r` somem de dentro, `\` vira `/`; aí `new URL` decide o esquema.
 * Caminho relativo (sem esquema e sem `//`) é do livro. Não deu para entender = remoto.
 */
/** Tira das pontas os caracteres de controle C0 e o espaço (U+0000–U+0020), como o parser de URL faz. */
function aparar(s: string): string {
  let a = 0;
  let b = s.length;
  while (a < b && s.charCodeAt(a) <= 0x20) a++;
  while (b > a && s.charCodeAt(b - 1) <= 0x20) b--;
  return s.slice(a, b);
}

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
 * `blob:`/`data:` — `url()`, `image-set()`, `@import` — sai inteiro. O resto fica como veio (escape de
 * `content: "\201C"` continua valendo).
 */
export function limparCss(css: string): string {
  return css
    .split(/([;{}])/)
    .map((pedaco) => {
      if (pedaco === ';' || pedaco === '{' || pedaco === '}') return pedaco;
      const lido = decodificarCss(pedaco);
      const importa = /@import/i.test(lido);
      const alvos = alvosDoCss(lido);
      if (importa && !alvos.length) return ''; // @import url sem forma reconhecível: fora
      return alvos.some((a) => ehRemoto(a)) ? '' : pedaco;
    })
    .join('');
}

const ehLink = (el: Element) => el.localName.toLowerCase() === 'a';

/** Limpa o documento no lugar e põe a CSP do capítulo. Exportada para o teste. */
export function limparDocumento(doc: Document): Document {
  /* XSLT: toda instrução `xml-stylesheet` sai (a de XSL transformaria o documento; o CSS do livro vem por `<link>`). */
  for (const no of Array.from(doc.childNodes)) {
    if (no.nodeType === 7 && (no as ProcessingInstruction).target === 'xml-stylesheet') doc.removeChild(no);
  }
  const todos = Array.from(doc.getElementsByTagName('*'));
  for (const el of todos) {
    const nome = el.localName.toLowerCase();
    if (ELEMENTOS_PROIBIDOS.has(nome) || (nome === 'meta' && el.hasAttribute('http-equiv'))) {
      el.remove();
      continue;
    }
    if (nome === 'style' && el.textContent) el.textContent = limparCss(el.textContent);
    for (const attr of Array.from(el.attributes)) {
      const local = (attr.localName || attr.name).toLowerCase();
      if (local.startsWith('on') || local === 'ping') el.removeAttributeNode(attr);
      else if (local === 'style') attr.value = limparCss(attr.value);
      else if (local === 'srcset' || local === 'imagesrcset') {
        if (attr.value.split(',').some((c) => ehRemoto(c.trim().split(/\s+/)[0]))) el.removeAttributeNode(attr);
      } else if (ATRIBUTOS_DE_URL.has(local)) {
        const v = attr.value;
        const normal = Array.from(v)
          .filter((c) => c.charCodeAt(0) > 0x20)
          .join('')
          .toLowerCase();
        if (/^(javascript|vbscript):/.test(normal)) el.removeAttributeNode(attr);
        else if (ehRemoto(v) && !(ehLink(el) && local === 'href')) el.removeAttributeNode(attr);
      }
    }
  }
  porCsp(doc);
  return doc;
}

/** A CSP do capítulo como PRIMEIRO filho do `<head>` (que é criado, se faltar). Só em (X)HTML. */
function porCsp(doc: Document) {
  const raiz = doc.documentElement;
  if (!raiz || raiz.localName.toLowerCase() !== 'html') return;
  const ns = raiz.namespaceURI;
  const criar = (n: string) => (ns ? doc.createElementNS(ns, n) : doc.createElement(n));
  let head = Array.from(raiz.children).find((c) => c.localName.toLowerCase() === 'head');
  if (!head) {
    head = criar('head');
    raiz.insertBefore(head, raiz.firstChild);
  }
  const meta = criar('meta');
  meta.setAttribute('http-equiv', 'Content-Security-Policy');
  meta.setAttribute('content', CSP_DO_CAPITULO);
  head.insertBefore(meta, head.firstChild);
}

/**
 * Limpa uma string de XHTML/HTML/SVG. (X)HTML SAI COMO HTML: a CSP em `<meta>` só é lida pelo parser de HTML —
 * no XHTML (parser de XML) o Chromium e o WebKit a ignoram, e a barreira 1 não existiria. A árvore limpa é
 * importada num documento HTML (os elementos XHTML já são do namespace do HTML; o SVG continua SVG), o que
 * também serializa `<a id="x"/>` como `<a id="x"></a>`. SVG sai como XML. Quem grava o capítulo usa
 * `tipoDoCapituloLimpo` para o tipo do `blob:`.
 */
export function limparHtml(texto: string, tipo: string): string {
  const mime = (
    /xhtml/.test(tipo) ? 'application/xhtml+xml' : /svg/.test(tipo) ? 'image/svg+xml' : 'text/html'
  ) as DOMParserSupportedType;
  let doc = new DOMParser().parseFromString(texto, mime);
  if (mime !== 'text/html' && doc.querySelector('parsererror'))
    doc = new DOMParser().parseFromString(texto, 'text/html');
  const ehHtml = doc.documentElement?.localName.toLowerCase() === 'html';
  if (!ehHtml) {
    limparDocumento(doc);
    return new XMLSerializer().serializeToString(doc);
  }
  const html = doc.implementation.createHTMLDocument('');
  html.replaceChild(html.importNode(doc.documentElement, true), html.documentElement);
  limparDocumento(html);
  return '<!DOCTYPE html>' + html.documentElement.outerHTML;
}

/** O tipo do `blob:` do capítulo limpo: (X)HTML vira `text/html` (ver `limparHtml`); o resto fica. */
export const tipoDoCapituloLimpo = (tipo: string) => (/x?html/i.test(tipo) ? 'text/html' : tipo);
