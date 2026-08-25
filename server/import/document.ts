/**
 * Importação de documento (lado SERVIDOR) — extrai TEXTO de .txt/.pdf/.docx.
 *
 * Honesto: PDF digitalizado (sem camada de texto) não é "adivinhado" — lançamos erro claro
 * (o OCR via tesseract.js fica para depois). Nada de conteúdo fabricado.
 */
import mammoth from 'mammoth'

const stripExt = (name: string) => name.replace(/\.[^.]+$/, '').trim() || 'Documento'

/** Extrai o texto de um PDF com camada de texto (pdfjs, build legacy p/ Node). */
async function extractPdfText(buf: Buffer): Promise<string> {
  // Import dinâmico: o build legacy é ESM e só é carregado quando um PDF chega.
  const pdfjs: any = await import('pdfjs-dist/legacy/build/pdf.mjs')
  const data = new Uint8Array(buf)
  const doc = await pdfjs.getDocument({ data, useSystemFonts: true, isEvalSupported: false }).promise
  const parts: string[] = []
  for (let p = 1; p <= doc.numPages; p++) {
    const page = await doc.getPage(p)
    const content = await page.getTextContent()
    parts.push(content.items.map((it: any) => it.str ?? '').join(' '))
  }
  await doc.cleanup?.()
  return parts.join('\n\n').replace(/[ \t]+\n/g, '\n').trim()
}

export async function extractDocument(
  buf: Buffer,
  filename: string,
  mime: string
): Promise<{ title: string; text: string }> {
  const name = filename || 'documento'
  const lower = name.toLowerCase()
  const type = (mime || '').toLowerCase()

  if (lower.endsWith('.docx') || type.includes('officedocument.wordprocessingml')) {
    const { value } = await mammoth.extractRawText({ buffer: buf })
    const text = value.trim()
    if (!text) throw new Error('o .docx não tinha texto extraível')
    return { title: stripExt(name), text }
  }

  if (lower.endsWith('.pdf') || type.includes('pdf')) {
    const text = await extractPdfText(buf)
    if (!text) throw new Error('PDF sem texto selecionável (parece digitalizado). OCR ainda não é suportado.')
    return { title: stripExt(name), text }
  }

  // .txt e qualquer text/* — trata como UTF-8.
  if (lower.endsWith('.txt') || type.startsWith('text/') || !type) {
    const text = buf.toString('utf8').trim()
    if (!text) throw new Error('o arquivo de texto estava vazio')
    return { title: stripExt(name), text }
  }

  throw new Error('formato não suportado — envie .txt, .pdf ou .docx')
}
