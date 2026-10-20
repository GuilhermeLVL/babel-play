/**
 * Importação de documento (lado SERVIDOR) — extrai TEXTO de .txt/.pdf/.docx.
 *
 * Honesto: PDF digitalizado (sem camada de texto) não é "adivinhado" — lançamos erro claro
 * (o OCR via tesseract.js fica para depois). Nada de conteúdo fabricado.
 */
import JSZip from 'jszip'
import mammoth from 'mammoth'

/** O fluxo de leitura por pedaços do JSZip, na forma mínima que usamos. */
interface FluxoDaEntrada {
  on(evento: 'data', fn: (pedaco: Uint8Array) => void): FluxoDaEntrada
  on(evento: 'error', fn: (erro: Error) => void): FluxoDaEntrada
  on(evento: 'end', fn: () => void): FluxoDaEntrada
  resume(): void
}

/**
 * `internalStream` EXISTE no JSZip 3 e é o único jeito de ler a entrada em PEDAÇOS — mas não está
 * nos tipos publicados. O cast fica isolado aqui, num ponto só, em vez de espalhar `any` pelo
 * corpo da função. E a checagem em runtime não é cerimônia: se uma versão futura remover o
 * método, isto denuncia com mensagem legível em vez de estourar "is not a function" — e, mais
 * importante, RECUSA o arquivo em vez de cair silenciosamente num caminho sem teto.
 */
function abrirFluxo(arquivo: JSZip.JSZipObject): FluxoDaEntrada {
  const bruto = arquivo as unknown as { internalStream?: (tipo: 'uint8array') => FluxoDaEntrada }
  if (typeof bruto.internalStream !== 'function') {
    throw new Error('esta versão do JSZip não expõe internalStream; o teto de expansão não pode ser garantido')
  }
  return bruto.internalStream('uint8array')
}

/**
 * Descompacta UMA entrada com teto, contando os bytes conforme eles saem.
 *
 * NÃO CONFIA NO CABEÇALHO. O `uncompressedSize` declarado no ZIP é escrito por quem gerou o
 * arquivo e um zip malicioso mente. Ele serve para recusar CEDO e barato; o que garante é a
 * contagem durante o fluxo, que não tem como ser falsificada.
 */
async function descompactarComTeto(arquivo: JSZip.JSZipObject, nome: string, teto: number): Promise<Buffer> {
  const declarado = (arquivo as unknown as { _data?: { uncompressedSize?: number } })._data?.uncompressedSize
  if (typeof declarado === 'number' && declarado > teto) {
    throw new Error(
      `${nome} declara ${Math.round(declarado / 1048576)} MB descompactados; o teto é ${teto / 1048576} MB`,
    )
  }

  const fluxo = abrirFluxo(arquivo)

  return new Promise<Buffer>((resolve, reject) => {
    const pedacos: Buffer[] = []
    let total = 0
    let abortado = false
    fluxo
      .on('data', (pedaco: Uint8Array) => {
        if (abortado) return
        total += pedaco.length
        if (total > teto) {
          abortado = true
          // Solta o que já foi acumulado antes de rejeitar — sem isto, o pico de memória que
          // estamos evitando aconteceria mesmo assim, só que na hora do erro.
          pedacos.length = 0
          reject(new Error(`${nome} passou de ${teto / 1048576} MB ao descompactar; arquivo recusado`))
          return
        }
        pedacos.push(Buffer.from(pedaco))
      })
      .on('error', reject)
      .on('end', () => {
        if (!abortado) resolve(Buffer.concat(pedacos))
      })
      .resume()
  })
}

/** Teto de expansão de um .docx (por entrada e no total): um texto de verdade não chega perto; o container tem 1 GB. */
const TETO_DO_DOCX_POR_ENTRADA = 20 * 1024 * 1024
const TETO_DO_DOCX_TOTAL = 40 * 1024 * 1024
/** Páginas e texto de um PDF: o suficiente para um livro; acima disso é abuso ou erro. */
const TETO_DE_PAGINAS_DO_PDF = 500
const TETO_DE_TEXTO = 5_000_000

/**
 * Recusa a bomba de descompressão ANTES do mammoth: um .docx de 300 KB com um `document.xml` de 300 MB virava 1,4 GB de
 * memória (reproduzido) e derrubava o servidor de todo mundo. Conta os bytes conforme saem, sem confiar no cabeçalho.
 */
async function conferirTamanhoDoDocx(buf: Buffer): Promise<void> {
  const zip = await JSZip.loadAsync(buf)
  let total = 0
  for (const entrada of Object.values(zip.files)) {
    if (entrada.dir) continue
    const bytes = await descompactarComTeto(entrada, entrada.name, TETO_DO_DOCX_POR_ENTRADA)
    total += bytes.length
    if (total > TETO_DO_DOCX_TOTAL) throw new Error('o .docx expande demais ao abrir; arquivo recusado')
  }
}

const stripExt = (name: string) => name.replace(/\.[^.]+$/, '').trim() || 'Documento'

/** Extrai o texto de um PDF com camada de texto (pdfjs, build legacy p/ Node). */
async function extractPdfText(buf: Buffer): Promise<string> {
  // Import dinâmico: o build legacy é ESM e só é carregado quando um PDF chega.
  const pdfjs: any = await import('pdfjs-dist/legacy/build/pdf.mjs')
  const data = new Uint8Array(buf)
  const doc = await pdfjs.getDocument({ data, useSystemFonts: true, isEvalSupported: false }).promise
  const parts: string[] = []
  if (doc.numPages > TETO_DE_PAGINAS_DO_PDF)
    throw new Error(`PDF com mais de ${TETO_DE_PAGINAS_DO_PDF} páginas; divida o arquivo`)
  let tamanho = 0
  for (let p = 1; p <= doc.numPages; p++) {
    const page = await doc.getPage(p)
    const content = await page.getTextContent()
    const texto = content.items.map((it: any) => it.str ?? '').join(' ')
    tamanho += texto.length
    if (tamanho > TETO_DE_TEXTO) throw new Error('o texto do PDF é grande demais; divida o arquivo')
    parts.push(texto)
  }
  await doc.cleanup?.()
  return parts
    .join('\n\n')
    .replace(/[ \t]+\n/g, '\n')
    .trim()
}

export async function extractDocument(
  buf: Buffer,
  filename: string,
  mime: string,
): Promise<{ title: string; text: string }> {
  const name = filename || 'documento'
  const lower = name.toLowerCase()
  const type = (mime || '').toLowerCase()

  if (lower.endsWith('.docx') || type.includes('officedocument.wordprocessingml')) {
    await conferirTamanhoDoDocx(buf)
    const { value } = await mammoth.extractRawText({ buffer: buf })
    const text = value.trim()
    if (text.length > TETO_DE_TEXTO) throw new Error('o texto do .docx é grande demais; divida o arquivo')
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
