/**
 * LER UM EPUB COMO TEXTO, sem DOM e sem rede: o script do catálogo (para medir o nível) e o navegador (o
 * "Trazer o seu" e a leitura provisória da L1) usam a mesma função. Quem descompacta é o chamador (no
 * navegador, com teto de expansão: `lib/zip/zipComTeto`); aqui chegam os arquivos de texto já lidos.
 *
 * Não é um leitor de EPUB (paginação, CFI, estilos ficam com o leitor da L2): é o texto de cada item do
 * `spine`, na ordem, com os parágrafos separados por linha em branco.
 */

export interface PessoaDoOpf {
  nome: string;
  /** Os papéis MARC (`aut`, `trl`, `ill`…) que o OPF declara para ela. */
  papeis: string[];
  /** Os `sameAs` (Wikipedia, autoridade da Biblioteca do Congresso) quando o OPF traz. */
  links: string[];
}

export interface MetadadosDoOpf {
  titulo: string;
  idioma: string;
  autores: PessoaDoOpf[];
  colaboradores: PessoaDoOpf[];
  assuntos: string[];
  fontes: string[];
  palavras: number | null;
  descricao: string;
}

export interface CapituloDeTexto {
  titulo: string;
  texto: string;
}

export interface EpubComoTexto {
  metadados: MetadadosDoOpf;
  capitulos: CapituloDeTexto[];
}

const ENTIDADES: Record<string, string> = {
  amp: '&',
  lt: '<',
  gt: '>',
  quot: '"',
  apos: "'",
  nbsp: ' ',
  mdash: '—',
  ndash: '–',
  hellip: '…',
  lsquo: '‘',
  rsquo: '’',
  ldquo: '“',
  rdquo: '”',
  shy: '',
};

export function decodificarEntidades(s: string): string {
  return s.replace(/&(#x[0-9a-f]+|#\d+|[a-z]+);/gi, (inteira, e: string) => {
    if (e[0] === '#') {
      const n = e[1] === 'x' || e[1] === 'X' ? parseInt(e.slice(2), 16) : parseInt(e.slice(1), 10);
      return Number.isFinite(n) && n > 0 && n <= 0x10ffff ? String.fromCodePoint(n) : '';
    }
    return ENTIDADES[e.toLowerCase()] ?? inteira;
  });
}

/** O texto de um XHTML: blocos viram parágrafos, as chamadas de nota somem, as tags saem. */
export function textoDoXhtml(xhtml: string): string {
  const corpo = xhtml.replace(/^[\s\S]*?<body[^>]*>/i, '').replace(/<\/body>[\s\S]*$/i, '');
  return decodificarEntidades(
    corpo
      .replace(/<(script|style|head)[\s\S]*?<\/\1>/gi, '')
      .replace(/<a[^>]*epub:type="noteref"[^>]*>[\s\S]*?<\/a>/gi, '')
      .replace(/<br\s*\/?>/gi, '\n')
      .replace(/<\/(p|div|h[1-6]|li|blockquote|tr|section|article|header|footer|figcaption|dt|dd)>/gi, '\n\n')
      .replace(/<[^>]+>/g, ''),
  )
    .replace(/[ \t\u00a0]+/g, ' ')
    .replace(/ *\n */g, '\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

const atributo = (tag: string, nome: string) =>
  tag.match(new RegExp(`\\s${nome}\\s*=\\s*"([^"]*)"`, 'i'))?.[1] ??
  tag.match(new RegExp(`\\s${nome}\\s*=\\s*'([^']*)'`, 'i'))?.[1];

/** Os metadados do OPF que o catálogo usa. Tolerante: campo ausente vira vazio, nunca erro. */
export function lerOpf(opf: string): MetadadosDoOpf {
  const meta = opf.match(/<metadata[\s\S]*?<\/metadata>/i)?.[0] ?? '';
  const texto = (re: RegExp) => decodificarEntidades((meta.match(re)?.[1] ?? '').trim());
  const papeisPorId = new Map<string, string[]>();
  for (const m of meta.matchAll(/<meta\b[^>]*property="role"[^>]*>([^<]*)<\/meta>/gi)) {
    const id = (atributo(m[0], 'refines') ?? '').replace(/^#/, '');
    papeisPorId.set(id, [...(papeisPorId.get(id) ?? []), m[1].trim()]);
  }
  const linksPorId = new Map<string, string[]>();
  for (const m of meta.matchAll(/<link\b[^>]*>/gi)) {
    const id = (atributo(m[0], 'refines') ?? '').replace(/^#/, '');
    const href = atributo(m[0], 'href');
    if (id && href) linksPorId.set(id, [...(linksPorId.get(id) ?? []), href]);
  }
  const pessoas = (tag: 'creator' | 'contributor'): PessoaDoOpf[] =>
    [...meta.matchAll(new RegExp(`<dc:${tag}\\b([^>]*)>([^<]*)</dc:${tag}>`, 'gi'))].map((m) => {
      const id = atributo(m[0], 'id') ?? '';
      const papelNoTag = atributo(m[0], 'opf:role');
      return {
        nome: decodificarEntidades(m[2].trim()),
        papeis: [...(papeisPorId.get(id) ?? []), ...(papelNoTag ? [papelNoTag] : [])],
        links: linksPorId.get(id) ?? [],
      };
    });
  const palavras = Number(texto(/<meta[^>]*property="se:word-count"[^>]*>([^<]*)</i));
  return {
    titulo: texto(/<dc:title\b[^>]*>([^<]*)<\/dc:title>/i),
    idioma: texto(/<dc:language\b[^>]*>([^<]*)<\/dc:language>/i)
      .toLowerCase()
      .split('-')[0],
    autores: pessoas('creator'),
    colaboradores: pessoas('contributor'),
    assuntos: [
      ...[...meta.matchAll(/<dc:subject\b[^>]*>([^<]*)<\/dc:subject>/gi)].map((m) => decodificarEntidades(m[1].trim())),
      ...[...meta.matchAll(/<meta[^>]*property="se:subject"[^>]*>([^<]*)<\/meta>/gi)].map((m) => m[1].trim()),
      ...[...meta.matchAll(/<meta[^>]*property="schema:genre"[^>]*>([^<]*)<\/meta>/gi)].map((m) => m[1].trim()),
    ],
    fontes: [...meta.matchAll(/<dc:source\b[^>]*>([^<]*)<\/dc:source>/gi)].map((m) => m[1].trim()),
    palavras: Number.isFinite(palavras) && palavras > 0 ? palavras : null,
    descricao: textoDoXhtml(
      `<body>${decodificarEntidades(texto(/<dc:description\b[^>]*>([\s\S]*?)<\/dc:description>/i))}</body>`,
    ),
  };
}

/** Itens do `spine` que não são a obra: página de rosto, colofão, licença, sumário, notas. */
const NAO_E_A_OBRA =
  /(?:^|\/)(?:titlepage|halftitlepage|imprint|colophon|uncopyright|copyright|toc|nav|loi|endnotes|cover)[^/]*\.x?html?$/i;

function resolver(base: string, href: string): string {
  const partes = (base ? base.split('/') : []).concat(decodeURIComponent(href.split('#')[0]).split('/'));
  const saida: string[] = [];
  for (const p of partes) {
    if (p === '..') saida.pop();
    else if (p && p !== '.') saida.push(p);
  }
  return saida.join('/');
}

/**
 * O texto do EPUB, item a item do `spine`. `arquivos` são as entradas de texto do zip (caminho → conteúdo);
 * imagens e fontes não precisam vir. Sem `container.xml` ou sem OPF, lança: não é um EPUB.
 */
export function lerEpubComoTexto(arquivos: Readonly<Record<string, string>>): EpubComoTexto {
  const container = arquivos['META-INF/container.xml'];
  const caminhoDoOpf = container ? atributo(container.match(/<rootfile\b[^>]*>/i)?.[0] ?? '', 'full-path') : undefined;
  const opf = caminhoDoOpf ? arquivos[caminhoDoOpf] : undefined;
  if (!caminhoDoOpf || !opf) throw new Error('não é um EPUB (sem container.xml ou sem o pacote OPF)');
  const base = caminhoDoOpf.includes('/') ? caminhoDoOpf.slice(0, caminhoDoOpf.lastIndexOf('/')) : '';
  const manifesto = new Map<string, string>();
  for (const m of opf.matchAll(/<item\b[^>]*>/gi)) {
    const id = atributo(m[0], 'id');
    const href = atributo(m[0], 'href');
    const tipo = atributo(m[0], 'media-type') ?? '';
    if (id && href && /html/.test(tipo)) manifesto.set(id, resolver(base, href));
  }
  const capitulos: CapituloDeTexto[] = [];
  for (const m of opf.matchAll(/<itemref\b[^>]*>/gi)) {
    const caminho = manifesto.get(atributo(m[0], 'idref') ?? '');
    if (!caminho || NAO_E_A_OBRA.test(caminho)) continue;
    const xhtml = arquivos[caminho];
    if (!xhtml) continue;
    const texto = textoDoXhtml(xhtml);
    if (!texto) continue;
    const titulo = textoDoXhtml(`<body>${xhtml.match(/<h[1-3][^>]*>([\s\S]*?)<\/h[1-3]>/i)?.[1] ?? ''}</body>`);
    capitulos.push({ titulo: titulo.slice(0, 120), texto });
  }
  return { metadados: lerOpf(opf), capitulos };
}
