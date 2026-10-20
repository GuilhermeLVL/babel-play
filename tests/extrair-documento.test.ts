/**
 * Extração de documento (.txt/.pdf/.docx) no navegador. O servidor não vê mais o arquivo.
 * Ambiente node: o pdfjs entra pelo build legacy, injetado em `carregarPdfjs`.
 */
import { strToU8, zipSync } from 'fflate'
import { describe, expect, it, vi } from 'vitest'

import { type DependenciasDoExtrator, extrairDocumento } from '../src/lib/import/extrairDocumento'

const carregarPdfjs: DependenciasDoExtrator['carregarPdfjs'] = () => import('pdfjs-dist/legacy/build/pdf.mjs') as never

function docx(paragrafos: string[], extra: Record<string, Uint8Array> = {}): Uint8Array {
  const corpo = paragrafos.map((p) => `<w:p><w:r><w:t>${p}</w:t></w:r></w:p>`).join('')
  return zipSync({
    '[Content_Types].xml': strToU8(
      '<?xml version="1.0"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">' +
        '<Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>' +
        '<Default Extension="xml" ContentType="application/xml"/>' +
        '<Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/></Types>',
    ),
    '_rels/.rels': strToU8(
      '<?xml version="1.0"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">' +
        '<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/></Relationships>',
    ),
    'word/document.xml': strToU8(
      `<?xml version="1.0"?><w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"><w:body>${corpo}</w:body></w:document>`,
    ),
    ...extra,
  })
}

/** PDF mínimo escrito à mão: 1 catálogo, 2 páginas, 3 fonte, depois (conteúdo, página) por página; xref calculado. */
function pdfMinimo(conteudos: string[]): Uint8Array {
  const kids = conteudos.map((_, i) => 5 + i * 2)
  const objs = [
    '<< /Type /Catalog /Pages 2 0 R >>',
    `<< /Type /Pages /Kids [${kids.map((k) => `${k} 0 R`).join(' ')}] /Count ${conteudos.length} >>`,
    '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>',
  ]
  conteudos.forEach((c, i) => {
    objs.push(`<< /Length ${c.length} >>\nstream\n${c}\nendstream`)
    objs.push(
      `<< /Type /Page /Parent 2 0 R /MediaBox [0 0 300 200] /Resources << /Font << /F1 3 0 R >> >> /Contents ${4 + i * 2} 0 R >>`,
    )
  })
  let out = '%PDF-1.4\n'
  const offsets: number[] = []
  objs.forEach((o, i) => {
    offsets.push(out.length)
    out += `${i + 1} 0 obj\n${o}\nendobj\n`
  })
  const xref = out.length
  out += `xref\n0 ${objs.length + 1}\n0000000000 65535 f \n`
  for (const o of offsets) out += `${String(o).padStart(10, '0')} 00000 n \n`
  out += `trailer\n<< /Size ${objs.length + 1} /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF`
  return strToU8(out)
}

const arq = (partes: BlobPart[], nome: string, type = '') => new File(partes, nome, { type })

describe('extrairDocumento', () => {
  it('.docx simples → texto', async () => {
    const r = await extrairDocumento(arq([docx(['Primeira linha', 'Segunda linha'])], 'aula.docx'))
    expect(r.title).toBe('aula')
    expect(r.text).toContain('Primeira linha')
    expect(r.text).toContain('Segunda linha')
  })

  it('.docx que expande para 300 MB é recusado antes do mammoth', async () => {
    const zip = zipSync({ 'word/document.xml': new Uint8Array(300 * 1024 * 1024).fill(0x61) }, { level: 9 })
    expect(zip.length).toBeLessThan(1024 * 1024)
    const mammoth = vi.fn()
    await expect(extrairDocumento(arq([zip], 'bomba.docx'), { extrairDocx: mammoth as never })).rejects.toThrow(
      'o .docx expande demais ao abrir; arquivo recusado',
    )
    expect(mammoth).not.toHaveBeenCalled()
  }, 60_000)

  it('.pdf com texto → texto por página separado por linha em branco', async () => {
    const pdf = pdfMinimo(['BT /F1 12 Tf 20 100 Td (Ola mundo) Tj ET', 'BT /F1 12 Tf 20 100 Td (Segunda pagina) Tj ET'])
    const r = await extrairDocumento(arq([pdf], 'livro.pdf', 'application/pdf'), { carregarPdfjs })
    expect(r.title).toBe('livro')
    expect(r.text).toBe('Ola mundo\n\nSegunda pagina')
  })

  it('.pdf sem camada de texto → "PDF sem texto selecionável…"', async () => {
    const pdf = pdfMinimo(['0 0 100 100 re f'])
    await expect(extrairDocumento(arq([pdf], 'scan.pdf'), { carregarPdfjs })).rejects.toThrow(
      'PDF sem texto selecionável (parece digitalizado). OCR ainda não é suportado.',
    )
  })

  it('.txt vazio → erro; .exe → formato não suportado', async () => {
    await expect(extrairDocumento(arq(['  \n'], 'a.txt'))).rejects.toThrow('o arquivo de texto estava vazio')
    await expect(extrairDocumento(arq(['MZ'], 'a.exe', 'application/x-msdownload'))).rejects.toThrow(
      'formato não suportado — envie .txt, .pdf ou .docx',
    )
  })

  it('.txt com texto → UTF-8', async () => {
    const r = await extrairDocumento(arq(['olá, mundo'], 'nota.txt', 'text/plain'))
    expect(r).toEqual({ title: 'nota', text: 'olá, mundo' })
  })

  it('arquivo acima de 30 MB → mensagem de limite sem ler o conteúdo', async () => {
    const f = arq([new Uint8Array(31 * 1024 * 1024)], 'grande.pdf')
    const spy = vi.spyOn(f, 'arrayBuffer')
    await expect(extrairDocumento(f, { carregarPdfjs })).rejects.toThrow('o documento passa do limite de 30 MB')
    expect(spy).not.toHaveBeenCalled()
  })
})
