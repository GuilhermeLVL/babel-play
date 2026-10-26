/**
 * O HTML DE UMA SEÇÃO DO LIVRO SEM SCRIPT. O foliate-js mostra cada capítulo num `iframe` com documento
 * `blob:` da MESMA origem do app — um `<script>` do EPUB rodaria com acesso a tudo. O motor
 * (`motor.ts`) passa cada seção por aqui antes de virar `blob:`: tira `<script>`, atributos `on*`,
 * `javascript:` em link e as tags que embutem conteúdo ativo (`iframe`, `object`, `embed`, `form`).
 * Defesa em profundidade: o iframe do capítulo já não tem `allow-scripts` (`foliate/PATCHES.md`).
 */

const TAGS_PROIBIDAS = ['script', 'iframe', 'object', 'embed', 'frame', 'frameset', 'form', 'base', 'meta[http-equiv]'];
const ATRIBUTOS_DE_URL = ['href', 'src', 'xlink:href', 'action', 'formaction', 'data', 'poster'];

/** Limpa o documento no lugar. Exportada para o teste. */
export function limparDocumento(doc: Document): Document {
  /* XSLT: toda instrução `xml-stylesheet` sai (a de XSL transformaria o documento; o CSS do livro vem por `<link>`). */
  for (const no of Array.from(doc.childNodes)) {
    if (no.nodeType === 7 && (no as ProcessingInstruction).target === 'xml-stylesheet') doc.removeChild(no);
  }
  for (const el of Array.from(doc.querySelectorAll(TAGS_PROIBIDAS.join(',')))) el.remove();
  for (const el of Array.from(doc.querySelectorAll('*'))) {
    for (const attr of Array.from(el.attributes)) {
      const nome = attr.name.toLowerCase();
      if (nome.startsWith('on')) el.removeAttribute(attr.name);
      else if (ATRIBUTOS_DE_URL.includes(nome) && /^\s*(javascript|vbscript):/i.test(attr.value)) {
        el.removeAttribute(attr.name);
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
