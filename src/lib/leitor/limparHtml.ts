/**
 * O HTML DE UMA SEÇÃO DO LIVRO SEM SCRIPT. O foliate-js mostra cada capítulo num `iframe` com documento
 * `blob:` da MESMA origem do app — um `<script>` do EPUB rodaria com acesso a tudo. O motor
 * (`motor.ts`) passa cada seção por aqui antes de virar `blob:`: tira `<script>`, atributos `on*`,
 * `javascript:` em link e as tags que embutem conteúdo ativo (`iframe`, `object`, `embed`, `form`).
 * Defesa em profundidade: o iframe do capítulo já não tem `allow-scripts` (`foliate/PATCHES.md`).
 */

const TAGS_PROIBIDAS = ['script', 'iframe', 'object', 'embed', 'frame', 'frameset', 'form', 'base', 'meta[http-equiv]'];
/** Atributos que CARREGAM um recurso (ou navegam, no `<a>`). */
const ATRIBUTOS_DE_URL = [
  'href',
  'src',
  'xlink:href',
  'action',
  'formaction',
  'data',
  'poster',
  'background',
  'lowsrc',
  'dynsrc',
  'longdesc',
  'manifest',
];

/**
 * PRIVACIDADE (revisão de 26/10/2026): o livro só carrega o que é DELE. Depois do foliate-js, todo recurso
 * interno do EPUB virou `blob:`; o que sobrar com esquema (`https:`, `http:`, `ftp:`…) ou começando por `//`
 * é de fora — um pixel de rastreio, uma fonte da web, um vídeo remoto — e sai. `data:` é do próprio arquivo.
 * Link de navegação (`<a href>`) fica: abrir é escolha da pessoa, e o motor só abre `http(s)` com noopener.
 */
export function ehRemoto(url: string | null | undefined): boolean {
  const u = (url ?? '').trim();
  if (!u) return false;
  if (u.startsWith('//')) return true;
  const esquema = /^([a-z][a-z0-9+.-]*):/i.exec(u)?.[1]?.toLowerCase();
  return !!esquema && esquema !== 'blob' && esquema !== 'data';
}

/**
 * O CSS do livro sem nada de fora: `url(...)` remoto vira `url("")` e `@import` remoto sai. Vale para a folha
 * do EPUB (evento `data` do motor), para o `<style>` e para o atributo `style` do capítulo.
 */
export function limparCss(css: string): string {
  return css
    .replace(/@import\s+(?:url\(\s*)?(['"]?)([^'")\s;]+)\1\s*\)?[^;]*;?/gi, (todo, _a, url: string) =>
      ehRemoto(url) ? '' : todo,
    )
    .replace(/url\(\s*(['"]?)(.*?)\1\s*\)/gi, (todo, _a, url: string) => (ehRemoto(url) ? 'url("")' : todo));
}

const ehLink = (el: Element) => el.localName === 'a';

/** Limpa o documento no lugar. Exportada para o teste. */
export function limparDocumento(doc: Document): Document {
  /* XSLT: toda instrução `xml-stylesheet` sai (a de XSL transformaria o documento; o CSS do livro vem por `<link>`). */
  for (const no of Array.from(doc.childNodes)) {
    if (no.nodeType === 7 && (no as ProcessingInstruction).target === 'xml-stylesheet') doc.removeChild(no);
  }
  for (const el of Array.from(doc.querySelectorAll(TAGS_PROIBIDAS.join(',')))) el.remove();
  for (const el of Array.from(doc.getElementsByTagName('style'))) {
    if (el.textContent) el.textContent = limparCss(el.textContent);
  }
  for (const el of Array.from(doc.querySelectorAll('*'))) {
    for (const attr of Array.from(el.attributes)) {
      const nome = attr.name.toLowerCase();
      if (nome.startsWith('on') || nome === 'ping') el.removeAttribute(attr.name);
      else if (nome === 'style') el.setAttribute(attr.name, limparCss(attr.value));
      else if (nome === 'srcset' || nome === 'imagesrcset') {
        if (attr.value.split(',').some((c) => ehRemoto(c.trim().split(/\s+/)[0]))) el.removeAttribute(attr.name);
      } else if (ATRIBUTOS_DE_URL.includes(nome)) {
        if (/^\s*(javascript|vbscript):/i.test(attr.value)) el.removeAttribute(attr.name);
        else if (ehRemoto(attr.value) && !(ehLink(el) && (nome === 'href' || nome === 'xlink:href'))) {
          el.removeAttribute(attr.name);
        }
      }
    }
  }
  return doc;
}

/** Limpa uma string de XHTML/HTML/SVG. Se o parser não entender, devolve vazio (não um HTML sujo). */
export function limparHtml(texto: string, tipo: string): string {
  const mime = (
    /xhtml/.test(tipo) ? 'application/xhtml+xml' : /svg/.test(tipo) ? 'image/svg+xml' : 'text/html'
  ) as DOMParserSupportedType;
  let doc = new DOMParser().parseFromString(texto, mime);
  if (mime !== 'text/html' && doc.querySelector('parsererror'))
    doc = new DOMParser().parseFromString(texto, 'text/html');
  limparDocumento(doc);
  return mime === 'text/html' && !doc.querySelector('parsererror')
    ? '<!DOCTYPE html>' + doc.documentElement.outerHTML
    : new XMLSerializer().serializeToString(doc);
}
