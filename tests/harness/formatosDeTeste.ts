/**
 * Arquivos MÍNIMOS de cada formato, construídos aqui (nenhum livro baixado, nenhum protegido de verdade), para os
 * testes de unidade e o e2e: MOBI (com o campo `encryption` à escolha), FB2, CBZ, DOCX, EPUB, MHTML.
 */
import { strToU8, zipSync } from 'fflate'

const PNG_1X1 = Uint8Array.from(
  atob('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg=='),
  (c) => c.charCodeAt(0),
)

export const TEXTO_DO_LIVRO = 'Era uma vez um barco pequeno que queria ver o mar e descobrir o mundo inteiro.'

const u16 = (v: DataView, o: number, x: number) => v.setUint16(o, x, false)
const u32 = (v: DataView, o: number, x: number) => v.setUint32(o, x, false)

/** Um MOBI (Mobipocket 6) sem compressão, com um capítulo. `encryption` != 0 imita o campo de um livro protegido. */
export function mobiMinimo({
  titulo = 'Livro Mobi de Teste',
  encryption = 0,
  texto = `<html><head></head><body><p>${TEXTO_DO_LIVRO}</p></body></html>`,
}: { titulo?: string; encryption?: number; texto?: string } = {}): Uint8Array {
  const enc = new TextEncoder()
  const t = enc.encode(titulo)
  const corpo = enc.encode(texto)
  const registro0 = new Uint8Array(256 + t.length)
  const r0 = new DataView(registro0.buffer)
  u16(r0, 0, 1) /* sem compressão */
  u32(r0, 4, corpo.length)
  u16(r0, 8, 1) /* um registro de texto */
  u16(r0, 10, 4096)
  u16(r0, 12, encryption)
  registro0.set(enc.encode('MOBI'), 16)
  u32(r0, 20, 232)
  u32(r0, 24, 2)
  u32(r0, 28, 65001)
  u32(r0, 32, 1234)
  u32(r0, 36, 6)
  u32(r0, 84, 256)
  u32(r0, 88, t.length)
  u32(r0, 108, 3)
  u32(r0, 112, 0xffffffff)
  u32(r0, 244, 0xffffffff)
  registro0.set(t, 256)

  const inicio0 = 78 + 2 * 8 + 2
  const inicio1 = inicio0 + registro0.length
  const saida = new Uint8Array(inicio1 + corpo.length)
  const v = new DataView(saida.buffer)
  saida.set(enc.encode('livro-mobi'), 0)
  saida.set(enc.encode('BOOK'), 60)
  saida.set(enc.encode('MOBI'), 64)
  u16(v, 76, 2)
  u32(v, 78, inicio0)
  u32(v, 78 + 8, inicio1)
  saida.set(registro0, inicio0)
  saida.set(corpo, inicio1)
  return saida
}

export function fb2Minimo({ titulo = 'Livro FB2 de Teste', autor = 'Autora' } = {}): Uint8Array {
  return strToU8(
    `<?xml version="1.0" encoding="utf-8"?><FictionBook xmlns="http://www.gribuser.ru/xml/fictionbook/2.0">` +
      `<description><title-info><genre>prose</genre><author><first-name>${autor}</first-name><last-name>Teste</last-name></author>` +
      `<book-title>${titulo}</book-title><lang>pt</lang></title-info></description>` +
      `<body><section><title><p>Capítulo único</p></title><p>${TEXTO_DO_LIVRO}</p></section></body></FictionBook>`,
  )
}

/** Um CBZ: um zip só de imagens (duas páginas). */
export function cbzMinimo(): Uint8Array {
  return zipSync({ '001.png': PNG_1X1, '002.PNG': PNG_1X1 })
}

export function epubMinimo({ extras = {} as Record<string, string> } = {}): Uint8Array {
  const container = `<?xml version="1.0"?><container version="1.0" xmlns="urn:oasis:names:tc:opendocument:xmlns:container"><rootfiles><rootfile full-path="OEBPS/content.opf" media-type="application/oebps-package+xml"/></rootfiles></container>`
  const opf = `<?xml version="1.0"?><package xmlns="http://www.idpf.org/2007/opf" version="3.0" unique-identifier="id"><metadata xmlns:dc="http://purl.org/dc/elements/1.1/"><dc:identifier id="id">x</dc:identifier><dc:title>Livro EPUB de Teste</dc:title><dc:language>pt</dc:language><dc:creator>Autora</dc:creator></metadata><manifest><item id="c1" href="c1.xhtml" media-type="application/xhtml+xml"/></manifest><spine><itemref idref="c1"/></spine></package>`
  return zipSync({
    mimetype: strToU8('application/epub+zip'),
    'META-INF/container.xml': strToU8(container),
    'OEBPS/content.opf': strToU8(opf),
    'OEBPS/c1.xhtml': strToU8(
      `<html xmlns="http://www.w3.org/1999/xhtml"><body><p>${TEXTO_DO_LIVRO}</p></body></html>`,
    ),
    ...Object.fromEntries(Object.entries(extras).map(([k, v]) => [k, strToU8(v)])),
  })
}

/** Um DOCX com dois títulos (Heading 1) e parágrafos. */
export function docxMinimo(): Uint8Array {
  const w = 'xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"'
  const p = (estilo: string | null, texto: string) =>
    `<w:p>${estilo ? `<w:pPr><w:pStyle w:val="${estilo}"/></w:pPr>` : ''}<w:r><w:t>${texto}</w:t></w:r></w:p>`
  return zipSync({
    '[Content_Types].xml': strToU8(
      `<?xml version="1.0"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/><Override PartName="/word/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.styles+xml"/></Types>`,
    ),
    '_rels/.rels': strToU8(
      `<?xml version="1.0"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/></Relationships>`,
    ),
    'word/_rels/document.xml.rels': strToU8(
      `<?xml version="1.0"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/></Relationships>`,
    ),
    'word/styles.xml': strToU8(
      `<?xml version="1.0"?><w:styles ${w}><w:style w:type="paragraph" w:styleId="Heading1"><w:name w:val="heading 1"/></w:style></w:styles>`,
    ),
    'word/document.xml': strToU8(
      `<?xml version="1.0"?><w:document ${w}><w:body>${p('Heading1', 'Primeiro capítulo')}${p(null, TEXTO_DO_LIVRO)}${p('Heading1', 'Segundo capítulo')}${p(null, 'Outro parágrafo do segundo capítulo.')}</w:body></w:document>`,
    ),
  })
}

/** Um MHTML como o Chrome salva: a página em quoted-printable (UTF-8, acentos em `=XX`). */
export function mhtmlMinimo(): string {
  const html = `<html><head><title>Página salva</title></head><body><h1>Título da página</h1><p>${TEXTO_DO_LIVRO} Café.</p></body></html>`
  const qp = Array.from(new TextEncoder().encode(html), (b) =>
    b > 127 ? `=${b.toString(16).toUpperCase().padStart(2, '0')}` : String.fromCharCode(b),
  ).join('')
  return [
    'From: <Saved by Blink>',
    'Subject: Pagina',
    'MIME-Version: 1.0',
    'Content-Type: multipart/related; type="text/html"; boundary="----frontera"',
    '',
    '------frontera',
    'Content-Type: text/html; charset="utf-8"',
    'Content-Transfer-Encoding: quoted-printable',
    '',
    qp,
    '------frontera--',
    '',
  ].join('\r\n')
}
