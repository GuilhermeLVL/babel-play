/**
 * As frases de um capítulo de EPUB no Node, para o gerador de audiolivros, com A MESMA extração do leitor
 * (`frasesDoDocumento` de `src/lib/leitor/frasesDoCapitulo.ts`, por import, sem reimplementar): o índice `i` de
 * cada frase tem de ser o do app, ou o destaque desalinha do áudio em silêncio. O DOM vem do `linkedom` (já
 * dependência do servidor); o `NodeFilter` global que o leitor usa é injetado daqui quando falta.
 *
 * Precisa do `tsx` (importa um `.ts`). `tests/audiolivro-paridade.test.ts` fixa a paridade com o DOM do navegador.
 */
import { parseHTML } from 'linkedom'

import { frasesDoDocumento } from '../../src/lib/leitor/frasesDoCapitulo.ts'

/** Os valores do DOM (iguais em todo navegador) que `textoDoDocumento` lê do `NodeFilter` global. */
const NODE_FILTER = { SHOW_TEXT: 4, FILTER_ACCEPT: 1, FILTER_REJECT: 2, FILTER_SKIP: 3 }

/**
 * O `Range` do linkedom não tem `setStart`/`setEnd`, e o leitor descarta a frase cujo `Range` lança: aqui o
 * `Range` só precisa guardar as pontas (o gerador usa o texto, não o destaque).
 * @param {Record<string, unknown>} proto
 */
function completarRange(proto) {
  if (typeof proto.setStart !== 'function') {
    proto.setStart = function (no, offset) {
      this.startContainer = no
      this.startOffset = offset
    }
  }
  if (typeof proto.setEnd !== 'function') {
    proto.setEnd = function (no, offset) {
      this.endContainer = no
      this.endOffset = offset
    }
  }
}

/**
 * O `TreeWalker` do linkedom IGNORA o filtro (`acceptNode`): o texto de `<script>`, `<rt>` e `<rp>` entraria na
 * frase (o teste de paridade pegou). Este é o `TreeWalker` do DOM no que o leitor usa: `whatToShow` e
 * `acceptNode`, em ordem de documento, `nextNode()`; `FILTER_REJECT` pula a subárvore, `FILTER_SKIP` só o nó.
 * @param {any} raiz @param {number} oQueMostrar @param {{ acceptNode(n: any): number } | null} filtro
 */
function criarTreeWalker(raiz, oQueMostrar, filtro) {
  let atual = raiz
  const depois = (no, entrar) => {
    if (entrar && no.firstChild) return no.firstChild
    for (let n = no; n && n !== raiz; n = n.parentNode) if (n.nextSibling) return n.nextSibling
    return null
  }
  return {
    get currentNode() {
      return atual
    },
    nextNode() {
      let n = depois(atual, true)
      while (n) {
        const mostra = (oQueMostrar >>> (n.nodeType - 1)) & 1
        const veredito = mostra ? (filtro?.acceptNode(n) ?? NODE_FILTER.FILTER_ACCEPT) : NODE_FILTER.FILTER_SKIP
        if (veredito === NODE_FILTER.FILTER_ACCEPT) return (atual = n)
        n = depois(n, veredito !== NODE_FILTER.FILTER_REJECT)
      }
      return null
    },
  }
}

/**
 * @param {string} xhtml o documento da seção (XHTML do EPUB), lido como `text/html` como o leitor o monta
 * @param {string} idioma
 * @returns {{ texto: string, fimDeParagrafo: boolean }[]}
 */
export function frasesDoCapituloEpub(xhtml, idioma) {
  globalThis.NodeFilter ??= NODE_FILTER
  /* Sem a declaração XML: no `text/html` ela viraria um comentário; o resto do documento é igual. */
  const { document } = parseHTML(xhtml.replace(/^\s*<\?xml[^>]*\?>/, ''))
  completarRange(Object.getPrototypeOf(document.createRange()))
  document.createTreeWalker = criarTreeWalker
  return frasesDoDocumento(document, idioma).map((f) => ({ texto: f.texto, fimDeParagrafo: f.fimDeParagrafo ?? false }))
}
