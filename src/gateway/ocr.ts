/**
 * OCR REAL no navegador com Tesseract.js v7. Encapsula o ciclo de vida do worker
 * (criar → reconhecer → terminar) e devolve um shape estável (`OcrResult`) com as
 * palavras e suas caixas em PIXELS da imagem de origem — a UI converte px → % para
 * posicionar os hotspots.
 *
 * O Tesseract busca o worker, o core (WASM) e o traineddata do idioma de um CDN na
 * PRIMEIRA execução (mesma natureza do Whisper, que baixa da HF). Por isso a função
 * REPORTA progresso e NUNCA "inventa" palavras: se o motor não carregar, propaga o
 * erro para a UI mostrar mensagem honesta + botão de tentar de novo.
 */
import Tesseract from 'tesseract.js'

export interface OcrWord {
  text: string
  bbox: { x0: number; y0: number; x1: number; y1: number }
  /** Confiança do reconhecimento (0–100), direto do Tesseract. */
  confidence: number
}

export interface OcrResult {
  text: string
  words: OcrWord[]
  /** Dimensões (px) da imagem de origem — base para converter as bbox em %. */
  width: number
  height: number
}

/**
 * Mapeia o idioma-alvo da UI (ex.: 'en-US', 'pt-BR', 'es-ES') para o código de
 * traineddata do Tesseract. Só cobrimos os idiomas que a tela oferece; qualquer
 * outro cai em inglês (o traineddata mais provável de já estar em cache).
 */
export function tesseractLang(uiLang: string): string {
  const base = (uiLang || '').split('-')[0].toLowerCase()
  switch (base) {
    case 'pt':
      return 'por'
    case 'es':
      return 'spa'
    case 'en':
    default:
      return 'eng'
  }
}

/** Lê as dimensões reais (px) de uma imagem (data URL, URL ou Blob). */
function imageDimensions(src: string | Blob): Promise<{ width: number; height: number }> {
  return new Promise((resolve) => {
    const url = typeof src === 'string' ? src : URL.createObjectURL(src)
    const img = new Image()
    img.onload = () => {
      const dims = { width: img.naturalWidth || img.width, height: img.naturalHeight || img.height }
      if (typeof src !== 'string') URL.revokeObjectURL(url)
      resolve(dims)
    }
    img.onerror = () => {
      if (typeof src !== 'string') URL.revokeObjectURL(url)
      resolve({ width: 0, height: 0 }) // sem dims a UI apenas não posiciona hotspots
    }
    img.src = url
  })
}

/** Achata a hierarquia blocos → parágrafos → linhas → palavras num array plano. */
function collectWords(blocks: any[] | undefined | null): OcrWord[] {
  const out: OcrWord[] = []
  for (const block of blocks ?? []) {
    for (const para of block.paragraphs ?? []) {
      for (const line of para.lines ?? []) {
        for (const w of (line.words ?? []) as any[]) {
          const text = (w.text ?? '').trim()
          if (!text) continue
          out.push({
            text,
            bbox: {
              x0: w.bbox?.x0 ?? 0,
              y0: w.bbox?.y0 ?? 0,
              x1: w.bbox?.x1 ?? 0,
              y1: w.bbox?.y1 ?? 0,
            },
            confidence: typeof w.confidence === 'number' ? w.confidence : 0,
          })
        }
      }
    }
  }
  return out
}

/**
 * Reconhece o texto de uma imagem. `onProgress` recebe 0–1 durante a fase de
 * reconhecimento (e o download inicial do modelo). Lança em caso de falha —
 * jamais devolve palavras falsas.
 */
export async function recognizeImage(
  src: string | Blob,
  lang: string,
  onProgress?: (p: number) => void,
): Promise<OcrResult> {
  const dims = await imageDimensions(src)

  const worker = await Tesseract.createWorker(tesseractLang(lang), 1, {
    logger: (m: { progress: number; status: string }) => {
      // 'recognizing text' vai de 0→1; os status anteriores (download/init) também
      // trazem progress — repassamos para a barra não ficar "presa" no primeiro carregamento.
      if (onProgress && typeof m.progress === 'number') onProgress(m.progress)
    },
  })

  try {
    const { data } = await worker.recognize(src, {}, { text: true, blocks: true })
    return {
      text: data.text ?? '',
      // A v7 entrega as palavras só dentro da hierarquia de blocos (`data.words` saiu).
      words: collectWords((data as any).blocks),
      width: dims.width,
      height: dims.height,
    }
  } finally {
    // Libera o worker (thread + memória do WASM) sempre — sucesso ou erro.
    try {
      await worker.terminate()
    } catch {
      /* nada a fazer */
    }
  }
}
