/**
 * A CÓPIA CURADA DO PROJECT GUTENBERG (spec de Livros & Leitura, Design §2 e critério 3).
 *
 * O Gutenberg não manda CORS e só permite robôs por espelho; a licença da marca dele exige que quem
 * redistribui o texto num serviço com cobrança (o Frasy tem planos pagos) tire o cabeçalho, o rodapé, a
 * licença e toda menção ao nome. Sem isso o que sobra é texto em domínio público, que se pode usar livremente.
 *
 * Por isso a cópia NÃO é o EPUB do Gutenberg retocado: é um EPUB NOVO montado a partir do texto puro, entre os
 * marcadores `*** START OF …` e `*** END OF …`, com toda linha que ainda cite o projeto removida, e uma página
 * de crédito. Perde-se a formatação rica (itálico, imagens); ganha-se a certeza de que nada da moldura ficou.
 * A única menção permitida é a LINHA DE CRÉDITO, e `contemMarcaDoGutenberg` é o teste que varre o resultado.
 *
 * Funções puras: quem baixa (do espelho) e quem compacta (fflate) é o script `scripts/livros/curar-gutenberg.mjs`.
 */

export const LINHA_DE_CREDITO = 'Texto de domínio público obtido do Project Gutenberg.';

/** O que denuncia a moldura, a licença ou a marca. Comparado sem caixa. */
const MARCAS = [
  /project\s+gutenberg/i,
  /gutenberg[\s-]*tm/i,
  /gutenberg\.(?:org|net|ph|ca|au|de|eu)\b/i,
  /proje(?:c|k|kt)?to(?:ng)?\s+gutenberg/i,
  /proyekto(?:ng)?\s+gutenberg/i,
  /small\s+print!/i,
  /gutenberg\s+literary\s+archive/i,
  /pglaf/i,
  /\bPG\s+(?:e-?book|edition|license)/i,
  /\*\*\*\s*(?:start|end)\s+of\s+(?:the|this)/i,
];

/** O texto (já sem a linha de crédito) ainda cita o Gutenberg? */
export function contemMarcaDoGutenberg(texto: string): boolean {
  const semCredito = texto.split(LINHA_DE_CREDITO).join('');
  return MARCAS.some((m) => m.test(semCredito));
}

const INICIO = /^\s*\*{3}\s*START OF (?:THE|THIS) PROJECT GUTENBERG E-?BOOK[^\n]*$/im;
/* O formato antigo (até ~2002): a licença vem no topo e termina na linha "*END*THE SMALL PRINT! … *END*". */
const INICIO_ANTIGO = /^[^\n]*SMALL PRINT![^\n]*\*END\*[^\n]*$/im;
/* "This is a COPYRIGHTED Project Gutenberg Etext": o projeto distribuía, com permissão, obra AINDA protegida. */
const COM_DIREITOS = /COPYRIGHTED\s+Project\s+Gutenberg|COPYRIGHT\s+PROTECTED\s+ETEXTS/i;

/** O texto declara que tem direitos autorais (o Gutenberg distribuía algumas obras protegidas com permissão). */
export class TextoComDireitosDeclarados extends Error {
  constructor() {
    super('o próprio texto do Gutenberg declara direitos autorais (COPYRIGHTED etext)');
    this.name = 'TextoComDireitosDeclarados';
  }
}
const FIM = /^\s*\*{3}\s*END OF (?:THE|THIS) PROJECT GUTENBERG E-?BOOK[^\n]*$/im;
/* Textos antigos usam "*END*THE SMALL PRINT!" e afins; o rodapé de alguns começa com "End of the Project…". */
const FIM_ANTIGO = /^\s*End of (?:the )?Project Gutenberg[^\n]*$/im;

export interface TextoLimpo {
  texto: string;
  /** Quantas linhas foram tiradas DEPOIS do corte (menções soltas no meio do texto). */
  linhasRemovidas: number;
}

/**
 * Corta a moldura do Gutenberg e tira as menções que sobrarem. Sem o marcador de início, recusa: um texto
 * sem moldura reconhecível pode ter a licença espalhada de um jeito que este corte não vê.
 */
export function limparTextoDoGutenberg(bruto: string): TextoLimpo {
  const texto = bruto.replace(/\r\n?/g, '\n').replace(/^\uFEFF/, '');
  if (COM_DIREITOS.test(texto.slice(0, 20_000))) throw new TextoComDireitosDeclarados();
  const inicio = texto.match(INICIO) ?? texto.match(INICIO_ANTIGO);
  if (!inicio || inicio.index === undefined) throw new Error('texto sem o marcador de início do Gutenberg');
  let miolo = texto.slice(inicio.index + inicio[0].length);
  const fim = miolo.match(FIM) ?? miolo.match(FIM_ANTIGO);
  if (fim && fim.index !== undefined) miolo = miolo.slice(0, fim.index);
  let removidas = 0;
  const linhas = miolo.split('\n').filter((linha) => {
    if (MARCAS.some((m) => m.test(linha))) {
      removidas++;
      return false;
    }
    return true;
  });
  /* "Produced by …" e "This etext was prepared by …" são créditos de voluntários do projeto, no topo. */
  const primeiras = linhas.slice(0, 40);
  const corte = primeiras.findIndex((l) =>
    /^\s*(produced by|this e-?text was|transcribed by|e-?text prepared)/i.test(l),
  );
  if (corte >= 0) {
    let fimDoBloco = corte;
    while (fimDoBloco < linhas.length && linhas[fimDoBloco].trim()) fimDoBloco++;
    removidas += fimDoBloco - corte;
    linhas.splice(corte, fimDoBloco - corte);
  }
  return {
    texto: linhas
      .join('\n')
      .replace(/\n{3,}/g, '\n\n')
      .trim(),
    linhasRemovidas: removidas,
  };
}

/**
 * A CONFERÊNCIA DE UMA CÓPIA CURADA (critério 3): nenhum arquivo do EPUB cita o projeto fora da linha de
 * crédito, e a linha de crédito está lá. `arquivos` são as entradas de texto do zip. Devolve os problemas
 * (vazio = aprovada). É a mesma função no script que publica e no teste que varre os arquivos.
 */
export function conferirEpubCurado(arquivos: Readonly<Record<string, string>>): string[] {
  const problemas: string[] = [];
  let temCredito = false;
  for (const [caminho, conteudo] of Object.entries(arquivos)) {
    if (conteudo.includes(LINHA_DE_CREDITO)) temCredito = true;
    if (contemMarcaDoGutenberg(conteudo))
      problemas.push(`${caminho}: cita o Project Gutenberg fora da linha de crédito`);
  }
  if (!temCredito) problemas.push('sem a linha de crédito');
  return problemas;
}

/* ── Capítulos ───────────────────────────────────────────────────────────────────────────────── */

export interface Capitulo {
  titulo: string;
  paragrafos: string[];
}

const TITULO_DE_CAPITULO =
  /^(?:chapter|book|part|capítulo|capitulo|livro|libro|parte|cap\.|kapitel|chapitre|capitolo|hoofdstuk|rozdział|глава|kitap|bölüm)\b[^\n]{0,80}$|^[IVXLC]{1,7}\.?$/i;

const PALAVRAS_POR_PARTE = 5000;

/** Parágrafos: blocos separados por linha em branco, com as quebras internas desfeitas. */
export function paragrafosDe(texto: string): string[] {
  return texto
    .split(/\n\s*\n/)
    .map((p) => p.replace(/\s*\n\s*/g, ' ').trim())
    .filter(Boolean);
}

/**
 * Divide o texto em capítulos pelos títulos ("CHAPTER I", "Capítulo 3", um numeral romano sozinho). Sem pelo
 * menos dois títulos, divide em partes de ~5000 palavras, no fim de um parágrafo.
 */
export function dividirEmCapitulos(texto: string, rotuloDaParte = 'Parte'): Capitulo[] {
  const paragrafos = paragrafosDe(texto);
  const capitulos: Capitulo[] = [];
  let atual: Capitulo | null = null;
  const antes: string[] = [];
  for (const p of paragrafos) {
    if (p.length <= 90 && TITULO_DE_CAPITULO.test(p)) {
      atual = { titulo: p, paragrafos: [] };
      capitulos.push(atual);
    } else if (atual) atual.paragrafos.push(p);
    else antes.push(p);
  }
  const comTexto = capitulos.filter((c) => c.paragrafos.length > 0);
  if (comTexto.length >= 2) {
    if (antes.length) comTexto.unshift({ titulo: '', paragrafos: antes });
    return comTexto;
  }
  const partes: Capitulo[] = [];
  let parte: string[] = [];
  let palavras = 0;
  for (const p of paragrafos) {
    parte.push(p);
    palavras += p.split(/\s+/).length;
    if (palavras >= PALAVRAS_POR_PARTE) {
      partes.push({ titulo: `${rotuloDaParte} ${partes.length + 1}`, paragrafos: parte });
      parte = [];
      palavras = 0;
    }
  }
  if (parte.length) partes.push({ titulo: `${rotuloDaParte} ${partes.length + 1}`, paragrafos: parte });
  return partes;
}

/* ── O EPUB novo ─────────────────────────────────────────────────────────────────────────────── */

const escapar = (s: string) =>
  s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

export interface DadosDoEpub {
  id: string;
  titulo: string;
  autores: string[];
  idioma: string;
  capitulos: Capitulo[];
  /** "Domínio público no Brasil: autor †1817." */
  licenca: string;
  /** Data de montagem (ISO), para o `dcterms:modified` obrigatório do EPUB 3. */
  modificadoEm: string;
}

function xhtml(idioma: string, titulo: string, corpo: string): string {
  return `<?xml version="1.0" encoding="utf-8"?>
<!DOCTYPE html>
<html xmlns="http://www.w3.org/1999/xhtml" xmlns:epub="http://www.idpf.org/2007/ops" lang="${escapar(idioma)}" xml:lang="${escapar(idioma)}">
<head><meta charset="utf-8"/><title>${escapar(titulo)}</title></head>
<body>
${corpo}
</body>
</html>
`;
}

/**
 * Os arquivos de um EPUB 3 mínimo e válido: `mimetype` (que o zip guarda primeiro e sem compressão), o
 * `container.xml`, o OPF, o sumário de navegação, a página de crédito e um XHTML por capítulo.
 */
export function arquivosDoEpub(d: DadosDoEpub): Array<[caminho: string, conteudo: string]> {
  const caps = d.capitulos.map((c, i) => {
    const nome = `cap-${String(i + 1).padStart(3, '0')}.xhtml`;
    const titulo = c.titulo || d.titulo;
    const corpo = [c.titulo ? `<h2>${escapar(c.titulo)}</h2>` : '', ...c.paragrafos.map((p) => `<p>${escapar(p)}</p>`)]
      .filter(Boolean)
      .join('\n');
    return { nome, titulo, corpo };
  });
  const credito = xhtml(
    d.idioma,
    'Créditos',
    `<section epub:type="colophon">
<h2>${escapar(d.titulo)}</h2>
<p>${escapar(d.autores.join(', '))}</p>
<p>${escapar(d.licenca)}</p>
<p>${escapar(LINHA_DE_CREDITO)}</p>
<p>Edição montada pelo Frasy a partir do texto puro, sem alterações no conteúdo da obra.</p>
</section>`,
  );
  const nav = xhtml(
    d.idioma,
    d.titulo,
    `<nav epub:type="toc" id="toc"><h1>${escapar(d.titulo)}</h1><ol>
<li><a href="creditos.xhtml">Créditos</a></li>
${caps.map((c) => `<li><a href="${c.nome}">${escapar(c.titulo)}</a></li>`).join('\n')}
</ol></nav>`,
  );
  const opf = `<?xml version="1.0" encoding="utf-8"?>
<package xmlns="http://www.idpf.org/2007/opf" version="3.0" unique-identifier="uid" xml:lang="${escapar(d.idioma)}">
<metadata xmlns:dc="http://purl.org/dc/elements/1.1/">
<dc:identifier id="uid">urn:frasy:livro:${escapar(d.id)}</dc:identifier>
<dc:title>${escapar(d.titulo)}</dc:title>
${d.autores.map((a) => `<dc:creator>${escapar(a)}</dc:creator>`).join('\n')}
<dc:language>${escapar(d.idioma)}</dc:language>
<dc:rights>${escapar(d.licenca)}</dc:rights>
<meta property="dcterms:modified">${escapar(d.modificadoEm.replace(/\.\d{3}Z$/, 'Z'))}</meta>
</metadata>
<manifest>
<item id="nav" href="nav.xhtml" media-type="application/xhtml+xml" properties="nav"/>
<item id="creditos" href="creditos.xhtml" media-type="application/xhtml+xml"/>
${caps.map((c, i) => `<item id="c${i + 1}" href="${c.nome}" media-type="application/xhtml+xml"/>`).join('\n')}
</manifest>
<spine>
<itemref idref="creditos"/>
${caps.map((_, i) => `<itemref idref="c${i + 1}"/>`).join('\n')}
</spine>
</package>
`;
  const container = `<?xml version="1.0" encoding="utf-8"?>
<container version="1.0" xmlns="urn:oasis:names:tc:opendocument:xmlns:container">
<rootfiles><rootfile full-path="OEBPS/livro.opf" media-type="application/oebps-package+xml"/></rootfiles>
</container>
`;
  return [
    ['mimetype', 'application/epub+zip'],
    ['META-INF/container.xml', container],
    ['OEBPS/livro.opf', opf],
    ['OEBPS/nav.xhtml', nav],
    ['OEBPS/creditos.xhtml', credito],
    ...caps.map((c): [string, string] => [`OEBPS/${c.nome}`, xhtml(d.idioma, c.titulo, c.corpo)]),
  ];
}
