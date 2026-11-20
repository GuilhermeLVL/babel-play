/**
 * OS PARÁGRAFOS DE UM CAPÍTULO, lidos do documento que o motor mostra (o leitor nunca altera o livro: isto só LÊ).
 * Servem à tradução do capítulo e ao parceiro de leitura (que recebe os trechos em volta da seleção).
 */

const BLOCOS = 'p, li, blockquote, h1, h2, h3, h4, h5, h6, dd, dt, figcaption, pre';

/** Texto de um nó com os espaços colapsados. */
const limpo = (s: string | null | undefined) => (s ?? '').replace(/\s+/g, ' ').trim();

/**
 * Os blocos de texto do documento, na ordem. Um bloco que contém outro bloco (um `li` com `p`, um `blockquote` com
 * parágrafos) fica de fora: vale o de dentro, para não repetir o texto. Sem letra, o bloco não é parágrafo.
 */
export function elementosDosParagrafos(doc: Document): Element[] {
  const raiz = doc.body ?? doc.documentElement;
  if (!raiz) return [];
  return [...raiz.querySelectorAll(BLOCOS)].filter(
    (el) => !el.querySelector(BLOCOS) && /\p{L}/u.test(el.textContent ?? ''),
  );
}

export function paragrafosDoDocumento(doc: Document): string[] {
  return elementosDosParagrafos(doc)
    .map((el) => limpo(el.textContent))
    .filter(Boolean);
}

/** Índice do parágrafo (na lista de `elementosDosParagrafos`) que contém o início do `range`, ou `-1`. */
export function indiceDoParagrafoNoRange(doc: Document, range: Range | null | undefined): number {
  if (!range || range.startContainer.ownerDocument !== doc) return -1;
  const elementos = elementosDosParagrafos(doc);
  const inicio = range.startContainer;
  const i = elementos.findIndex((el) => el.contains(inicio));
  if (i >= 0) return i;
  /* O início caiu fora de um bloco (entre eles): o primeiro bloco que começa depois dele. */
  return elementos.findIndex((el) => range.comparePoint(el, 0) >= 0);
}

/** O índice do parágrafo que contém o texto (comparação sem espaços extras), ou `-1`. */
export function indiceDoParagrafoComTexto(paragrafos: readonly string[], texto: string): number {
  const alvo = limpo(texto).slice(0, 120);
  if (!alvo) return -1;
  return paragrafos.findIndex((p) => p.includes(alvo));
}
