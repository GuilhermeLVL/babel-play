/**
 * O TEXTO DE UM LIVRO, BUSCADO PELO NAVEGADOR DIRETO DA FONTE (critério 6 da spec: abrir um livro do Standard
 * Ebooks ou da Wikisource não passa pelo servidor do Frasy).
 *
 *   · Standard Ebooks: o EPUB, com CORS `*` (o `?source=download` pula a página de agradecimento);
 *   · Wikisource: a API do MediaWiki com `origin=*`; a página principal dá o sumário, e cada capítulo é
 *     pedido quando a pessoa chega nele;
 *   · Gutenberg: a cópia curada no R2 (`VITE_LIVROS_URL` + a chave do catálogo). Nunca o gutenberg.org;
 *
 * O leitor da L2 usa a Wikisource daqui (`src/lib/livros/doCatalogo.ts`); o EPUB e o R2, pelo `prepararLivro`.
 */
import type { CapituloDeTexto } from '../../core/livros/epub';
import type { LivroDoCatalogo } from '../../core/livros/tipos';
import { extrairEpub } from '../import/epub';

export interface TextoAberto {
  titulos: string[];
  lerCapitulo(indice: number): Promise<string>;
}

/** A cópia curada ainda não foi publicada neste ambiente (sem `VITE_LIVROS_URL`). */
export class CopiaIndisponivel extends Error {
  constructor() {
    super('a cópia revisada deste livro ainda não foi publicada');
    this.name = 'CopiaIndisponivel';
  }
}

const deCapitulos = (capitulos: CapituloDeTexto[], rotulo: (i: number) => string): TextoAberto => ({
  titulos: capitulos.map((c, i) => c.titulo || rotulo(i)),
  lerCapitulo: async (i) => capitulos[i]?.texto ?? '',
});

async function doEpub(url: string, rotulo: (i: number) => string): Promise<TextoAberto> {
  const r = await fetch(url, { credentials: 'omit' });
  if (!r.ok) throw new Error(`a fonte respondeu ${r.status}`);
  const epub = await extrairEpub(await r.blob());
  return deCapitulos(epub.capitulos, rotulo);
}

/** O texto de uma página da Wikisource, sem cabeçalho, notas de edição e o que não é a obra. */
export function textoDaWikisource(html: string): string {
  const doc = new DOMParser().parseFromString(`<!doctype html><body>${html}`, 'text/html');
  doc
    .querySelectorAll(
      '.ws-noexport, .noprint, .ws-header, #headertemplate, .mw-editsection, sup.reference, style, script, .reference',
    )
    .forEach((n) => n.remove());
  const blocos = [...doc.body.querySelectorAll('p, h2, h3, h4, dd, li, .poem')]
    .filter((b) => !b.parentElement?.closest('p, .poem'))
    .map((b) => (b.textContent ?? '').replace(/[ \t]+/g, ' ').trim())
    .filter(Boolean);
  return blocos.join('\n\n');
}

async function daWikisource(api: string, pagina: string): Promise<TextoAberto> {
  const pedir = async (titulo: string) => {
    const u = `${api}?action=parse&page=${encodeURIComponent(titulo)}&prop=text&redirects=1&format=json&formatversion=2&origin=*`;
    const r = await fetch(u, { credentials: 'omit' });
    if (!r.ok) throw new Error(`a Wikisource respondeu ${r.status}`);
    const j = (await r.json()) as { parse?: { title: string; text: string } };
    if (!j.parse) throw new Error('a Wikisource não achou a página');
    return j.parse;
  };
  const principal = await pedir(pagina);
  const prefixo = `/wiki/${encodeURIComponent(principal.title.replace(/ /g, '_')).replace(/%2F/g, '/')}/`;
  const subpaginas = [
    ...new Set(
      [...principal.text.matchAll(/href="(\/wiki\/[^"#?]+)"/g)]
        .map((m) => m[1])
        .filter((h) => h.startsWith(prefixo))
        .map((h) => decodeURIComponent(h.slice('/wiki/'.length)).replace(/_/g, ' ')),
    ),
  ];
  if (subpaginas.length === 0) {
    const texto = textoDaWikisource(principal.text);
    return { titulos: [principal.title], lerCapitulo: async () => texto };
  }
  const cache = new Map<number, Promise<string>>();
  return {
    titulos: subpaginas.map((s) => s.slice(principal.title.length + 1) || s),
    lerCapitulo: (i) => {
      if (!cache.has(i))
        cache.set(
          i,
          pedir(subpaginas[i]).then((p) => textoDaWikisource(p.text)),
        );
      return cache.get(i) as Promise<string>;
    },
  };
}

export async function abrirTextoDoCatalogo(
  livro: LivroDoCatalogo,
  rotulo: (i: number) => string,
): Promise<TextoAberto> {
  const { formatos } = livro;
  if (livro.fonte === 'standard-ebooks' && formatos.epub) return doEpub(`${formatos.epub}?source=download`, rotulo);
  if (livro.fonte === 'wikisource' && formatos.wikisource)
    return daWikisource(formatos.wikisource.api, formatos.wikisource.pagina);
  if (livro.fonte === 'gutenberg-curado' && formatos.r2) {
    const base = (import.meta.env?.VITE_LIVROS_URL as string | undefined)?.replace(/\/+$/, '');
    if (!base) throw new CopiaIndisponivel();
    return doEpub(`${base}/${formatos.r2}`, rotulo);
  }
  throw new Error('este livro não tem um formato que o navegador abra');
}
