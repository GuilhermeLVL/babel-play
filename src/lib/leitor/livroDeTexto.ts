/**
 * UM LIVRO FEITO DE TEXTO — para o leitor abrir o que não é EPUB nem PDF: a sessão `kind:'document'` da
 * Leitura antiga (cada fala vira um parágrafo) e o TXT trazido pela pessoa. Implementa a interface de livro
 * do foliate-js (`sections` com `load()`/`createDocument()`, `toc`, `resolveHref`…): o motor trata igual a
 * um EPUB, com paginação, CFI, busca e anotações.
 *
 * O CFI é o "falso" do foliate (`/6/<2(i+1)>!` por seção), estável enquanto a ordem dos parágrafos não
 * mudar — e a citação reancora quando mudar (`src/core/leitura/reancorar.ts`).
 */
import type { ItemDoSumario, LivroDoFoliate } from './foliate/view.js';
import { CSP_DO_CAPITULO } from './limparHtml';

export interface CapituloDeTexto {
  titulo: string;
  paragrafos: string[];
}

export interface EntradaDoLivroDeTexto {
  titulo: string;
  autor?: string;
  idioma?: string;
  capitulos: CapituloDeTexto[];
}

const escapar = (s: string) =>
  s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

/** O XHTML de um capítulo. Exportado para o teste. */
export function xhtmlDoCapitulo(c: CapituloDeTexto, idioma = ''): string {
  const lang = escapar(idioma);
  return (
    `<!DOCTYPE html>\n` +
    `<html xmlns="http://www.w3.org/1999/xhtml" lang="${lang}" xml:lang="${lang}"><head>` +
    `<meta http-equiv="Content-Security-Policy" content="${CSP_DO_CAPITULO}"/><meta charset="utf-8"/>` +
    `<title>${escapar(c.titulo)}</title></head><body><section>` +
    (c.titulo ? `<h2>${escapar(c.titulo)}</h2>` : '') +
    c.paragrafos.map((p) => `<p>${escapar(p)}</p>`).join('') +
    `</section></body></html>`
  );
}

/** Corta um texto corrido em capítulos e parágrafos (TXT trazido): linha em branco separa parágrafo. */
export function capitulosDoTexto(texto: string, tituloPadrao: string, porCapitulo = 120): CapituloDeTexto[] {
  const paragrafos = texto
    .replace(/\r\n?/g, '\n')
    .split(/\n\s*\n/)
    .map((p) => p.replace(/\s*\n\s*/g, ' ').trim())
    .filter(Boolean);
  const capitulos: CapituloDeTexto[] = [];
  for (let i = 0; i < paragrafos.length; i += porCapitulo) {
    capitulos.push({
      titulo: paragrafos.length > porCapitulo ? `${tituloPadrao} ${capitulos.length + 1}` : '',
      paragrafos: paragrafos.slice(i, i + porCapitulo),
    });
  }
  return capitulos.length ? capitulos : [{ titulo: '', paragrafos: [] }];
}

export function livroDeTexto(e: EntradaDoLivroDeTexto): LivroDoFoliate {
  const urls = new Map<number, string>();
  const xhtml = e.capitulos.map((c) => xhtmlDoCapitulo(c, e.idioma));
  const sections = e.capitulos.map((c, i) => ({
    id: `cap-${i}`,
    size: xhtml[i].length,
    linear: 'yes',
    load: () => {
      let url = urls.get(i);
      if (!url) {
        url = URL.createObjectURL(new Blob([xhtml[i]], { type: 'text/html' }));
        urls.set(i, url);
      }
      return url;
    },
    unload: () => {
      const url = urls.get(i);
      if (url) URL.revokeObjectURL(url);
      urls.delete(i);
    },
    createDocument: () => new DOMParser().parseFromString(xhtml[i], 'text/html'),
  }));
  const toc: ItemDoSumario[] = e.capitulos
    .map((c, i) => ({ label: c.titulo, href: `cap-${i}` }))
    .filter((t) => t.label);
  const indice = (href: string) => Number(/^cap-(\d+)/.exec(href)?.[1] ?? -1);
  return {
    metadata: { title: e.titulo, author: e.autor, language: e.idioma },
    toc,
    sections,
    dir: 'ltr',
    resolveHref: (href: string) => ({ index: indice(href) }),
    splitTOCHref: (href: string) => [`cap-${indice(href)}`, null],
    getTOCFragment: (doc: Document) => doc.documentElement,
    isExternal: (uri: string) => /^\w+:/i.test(uri),
    destroy: () => {
      for (const url of urls.values()) URL.revokeObjectURL(url);
      urls.clear();
    },
  };
}
