/**
 * Importação de documento (lado NAVEGADOR): extrai TEXTO de .txt/.pdf/.docx sem mandar o arquivo a servidor.
 *
 * Honesto: PDF digitalizado (sem camada de texto) não é "adivinhado": lançamos erro claro (o OCR via
 * tesseract.js fica para depois). Nada de conteúdo fabricado.
 */
import { ExpansaoAcimaDoTeto, medirExpansaoDoZip } from '../zip/zipComTeto';
import { carregarPdfjs as carregarPdfjsPadrao } from './pdfjsNoNavegador';

/** O pdfjs, na forma mínima que usamos (o build normal e o legacy cabem aqui). */
export interface PdfjsMinimo {
  getDocument(args: { data: Uint8Array; isEvalSupported: false; useSystemFonts?: boolean }): {
    promise: Promise<{
      numPages: number;
      getPage(n: number): Promise<{ getTextContent(): Promise<{ items: Array<{ str?: string }> }> }>;
      cleanup?(): Promise<unknown>;
      destroy?(): Promise<unknown>;
    }>;
  };
}

export interface DependenciasDoExtrator {
  carregarPdfjs?: () => Promise<PdfjsMinimo>;
  /** Extrai o texto cru de um .docx; o padrão é o mammoth (build de navegador, carregado sob demanda). */
  extrairDocx?: (arrayBuffer: ArrayBuffer) => Promise<string>;
}

/** Tamanho máximo do arquivo aceito (o mesmo teto que o servidor aplicava). */
const TETO_DO_ARQUIVO = 30 * 1024 * 1024;
/** Teto de expansão de um .docx (por entrada e no total): um texto de verdade não chega perto. */
const TETO_DO_DOCX_POR_ENTRADA = 20 * 1024 * 1024;
const TETO_DO_DOCX_TOTAL = 40 * 1024 * 1024;
/** Páginas e texto de um PDF: o suficiente para um livro; acima disso é abuso ou erro. */
const TETO_DE_PAGINAS_DO_PDF = 500;
const TETO_DE_TEXTO = 5_000_000;

const semExtensao = (nome: string) => nome.replace(/\.[^.]+$/, '').trim() || 'Documento';

async function extrairDocxComMammoth(arrayBuffer: ArrayBuffer): Promise<string> {
  const mammoth = (await import('mammoth/mammoth.browser')).default;
  return (await mammoth.extractRawText({ arrayBuffer })).value;
}

/**
 * Recusa a bomba de descompressão ANTES do mammoth: um .docx de 300 KB com um `document.xml` de 300 MB virava
 * 1,4 GB de memória (reproduzido no servidor) e agora travaria a aba. Conta os bytes conforme saem da inflação,
 * sem confiar no cabeçalho do zip.
 */
async function conferirTamanhoDoDocx(arquivo: File): Promise<void> {
  try {
    await medirExpansaoDoZip(arquivo, TETO_DO_DOCX_POR_ENTRADA, TETO_DO_DOCX_TOTAL);
  } catch (e) {
    if (e instanceof ExpansaoAcimaDoTeto) throw new Error('o .docx expande demais ao abrir; arquivo recusado');
    throw e;
  }
}

/** Extrai o texto de um PDF com camada de texto. */
async function extrairTextoDoPdf(buf: ArrayBuffer, pdfjs: PdfjsMinimo): Promise<string> {
  const doc = await pdfjs.getDocument({ data: new Uint8Array(buf), isEvalSupported: false, useSystemFonts: true })
    .promise;
  try {
    if (doc.numPages > TETO_DE_PAGINAS_DO_PDF)
      throw new Error(`PDF com mais de ${TETO_DE_PAGINAS_DO_PDF} páginas; divida o arquivo`);
    const partes: string[] = [];
    let tamanho = 0;
    for (let p = 1; p <= doc.numPages; p++) {
      const pagina = await doc.getPage(p);
      const conteudo = await pagina.getTextContent();
      const texto = conteudo.items.map((it) => it.str ?? '').join(' ');
      tamanho += texto.length;
      if (tamanho > TETO_DE_TEXTO) throw new Error('o texto do PDF é grande demais; divida o arquivo');
      partes.push(texto);
    }
    return partes
      .join('\n\n')
      .replace(/[ \t]+\n/g, '\n')
      .trim();
  } finally {
    await doc.cleanup?.();
    await doc.destroy?.();
  }
}

export async function extrairDocumento(
  arquivo: File,
  deps: DependenciasDoExtrator = {},
): Promise<{ title: string; text: string }> {
  if (arquivo.size > TETO_DO_ARQUIVO) throw new Error('o documento passa do limite de 30 MB');
  const nome = arquivo.name || 'documento';
  const minusculo = nome.toLowerCase();
  const tipo = (arquivo.type || '').toLowerCase();

  if (minusculo.endsWith('.docx') || tipo.includes('officedocument.wordprocessingml')) {
    await conferirTamanhoDoDocx(arquivo);
    const bruto = await (deps.extrairDocx ?? extrairDocxComMammoth)(await arquivo.arrayBuffer());
    const texto = bruto.trim();
    if (!texto) throw new Error('o .docx não tinha texto extraível');
    if (texto.length > TETO_DE_TEXTO) throw new Error('o texto do .docx é grande demais; divida o arquivo');
    return { title: semExtensao(nome), text: texto };
  }

  if (minusculo.endsWith('.pdf') || tipo.includes('pdf')) {
    const pdfjs = await (deps.carregarPdfjs ?? carregarPdfjsPadrao)();
    const texto = await extrairTextoDoPdf(await arquivo.arrayBuffer(), pdfjs);
    if (!texto) throw new Error('PDF sem texto selecionável (parece digitalizado). OCR ainda não é suportado.');
    return { title: semExtensao(nome), text: texto };
  }

  // .txt e qualquer text/* (ou sem tipo): UTF-8.
  if (minusculo.endsWith('.txt') || tipo.startsWith('text/') || !tipo) {
    const texto = (await arquivo.text()).trim();
    if (!texto) throw new Error('o arquivo de texto estava vazio');
    return { title: semExtensao(nome), text: texto };
  }

  throw new Error('formato não suportado — envie .txt, .pdf ou .docx');
}
