/**
 * Transcrição OFFLINE de um arquivo de áudio (não-streaming) — a "reserva de Whisper" da
 * importação: quando um vídeo do YouTube (ou um áudio/vídeo local) não tem legenda, geramos as
 * falas COM timestamps reais aqui, reusando as MESMAS peças da captura ao vivo:
 *   - `NonRealTimeVAD` (@ricky0123/vad-web) — segmenta o áudio inteiro em falas (modo batch),
 *     devolvendo `start`/`end` em ms; o pipeline ao vivo usa `MicVAD` sobre um MediaStream.
 *   - `WhisperLocalStt` — transcreve cada segmento no navegador (WASM/WebGPU), com o mesmo cache
 *     de modelo da captura (nada re-baixa).
 *   - NUVEM, quando quem chama entrega um motor (`nuvem`): o Whisper de nuvem (large-v3-turbo) no
 *     lugar do local. Antes a importação era SEMPRE local — 57% de WER em português — mesmo para
 *     quem assina a transcrição de nuvem (24%; docs/PROXIMOS-PASSOS.md, D4). A decisão de usar ou
 *     não é de quem chama, com a mesma régua da captura ao vivo (`lib/import/nuvemDaImportacao`).
 *     Recusa DEFINITIVA da nuvem (402 plano/cota, 429 limite, 501 sem conta ou não configurada,
 *     503 orçamento) desliga a nuvem pelo resto do arquivo e o local assume; falha passageira
 *     (rede, 500) manda só aquele trecho ao local. O arquivo é transcrito inteiro de qualquer jeito.
 *
 * Honesto: timestamps vêm do VAD (reais); segmentos que o Whisper devolve vazios são descartados,
 * não preenchidos com invenção.
 */
import { NonRealTimeVAD } from '@ricky0123/vad-web'

import { WhisperLocalStt } from './adapters/whisperLocal'
import type { SttFinal } from './capabilities'
import { cortarPrompt } from './promptDeStt'

export interface OfflineSegment {
  tStartMs: number
  tEndMs: number
  text: string
  /** Motor que transcreveu ESTE trecho — o selo de procedência da fala. */
  engine: 'groq-whisper' | 'whisper-local'
}

/** O mínimo que a importação precisa de um STT de nuvem (hoje o `GroqWhisperStt`). */
export interface MotorDeNuvem {
  transcribePcm(
    pcm: Float32Array,
    sampleRate: number,
    opts?: { languageHint?: string; prompt?: string },
  ): Promise<SttFinal>
}

/** Respostas que dizem "não vai dar nesta importação": insistir só cobraria (ou recusaria) de novo. */
const RECUSA_DEFINITIVA = new Set([402, 429, 501, 503])

export interface OfflineProgress {
  phase: 'decode' | 'model' | 'segment'
  progress: number // 0..1
  label?: string
}

export interface OfflineOptions {
  languageHint?: string
  onProgress?: (p: OfflineProgress) => void
  /** Teto de duração (ms). Além dele, paramos de coletar falas (aviso honesto fica com o chamador). */
  maxDurationMs?: number
  /** STT de nuvem a preferir. Ausente = tudo local, como sempre foi. */
  nuvem?: MotorDeNuvem | null
}

/** Mixa para mono (média dos canais) — o VAD e o Whisper trabalham em mono. */
function toMono(buf: AudioBuffer): Float32Array {
  if (buf.numberOfChannels === 1) return buf.getChannelData(0)
  const n = buf.length
  const out = new Float32Array(n)
  for (let ch = 0; ch < buf.numberOfChannels; ch++) {
    const data = buf.getChannelData(ch)
    for (let i = 0; i < n; i++) out[i] += data[i]
  }
  const inv = 1 / buf.numberOfChannels
  for (let i = 0; i < n; i++) out[i] *= inv
  return out
}

export async function offlineTranscribe(blob: Blob, opts: OfflineOptions = {}): Promise<OfflineSegment[]> {
  const { languageHint, onProgress, maxDurationMs, nuvem } = opts

  // 1) Decodifica o áudio. O VAD reamostra internamente para 16 kHz, então passamos o PCM na taxa
  //    nativa + a sampleRate; não precisamos reamostrar à mão.
  onProgress?.({ phase: 'decode', progress: 0, label: 'Decodificando o áudio…' })
  const arrayBuf = await blob.arrayBuffer()
  const Ctx = (window.AudioContext || (window as any).webkitAudioContext) as typeof AudioContext
  const ctx = new Ctx()
  let decoded: AudioBuffer
  try {
    decoded = await ctx.decodeAudioData(arrayBuf.slice(0))
  } finally {
    ctx.close().catch(() => {})
  }
  const sampleRate = decoded.sampleRate
  const mono = toMono(decoded)
  onProgress?.({ phase: 'decode', progress: 1 })

  // 2) VAD em batch — assets locais (mesma origem servida em /public que a captura usa).
  const vad = await NonRealTimeVAD.new({
    modelURL: '/silero_vad_legacy.onnx',
    ortConfig: (ort: any) => { try { ort.env.wasm.wasmPaths = '/' } catch { /* usa default */ } },
  })

  // 3) Whisper local — pré-carrega uma vez (reporta o download do modelo, se houver). Com nuvem, SÓ
  //    se ela recusar: quem transcreve na nuvem não paga 300 MB de download à toa.
  let local: WhisperLocalStt | null = null
  const garantirLocal = async (): Promise<WhisperLocalStt> => {
    if (!local) {
      local = new WhisperLocalStt()
      await local.preload((progress, label) => onProgress?.({ phase: 'model', progress, label }))
    }
    return local
  }
  let nuvemAtiva = !!nuvem
  if (!nuvemAtiva) await garantirLocal()

  // Coleta os segmentos de fala primeiro (para saber o total e reportar progresso honesto).
  const segments: Array<{ audio: Float32Array; start: number; end: number }> = []
  for await (const s of vad.run(mono, sampleRate)) {
    segments.push(s)
    if (maxDurationMs && s.end >= maxDurationMs) break
  }

  const out: OfflineSegment[] = []
  // Contexto do trecho seguinte na nuvem: o texto do anterior (mesmo arquivo; e só com idioma fixo,
  // pelo mesmo motivo da captura ao vivo — prompt em outro idioma induz o Whisper a traduzir).
  let anterior = ''
  for (let i = 0; i < segments.length; i++) {
    const s = segments[i]
    onProgress?.({
      phase: 'segment',
      progress: i / Math.max(1, segments.length),
      label: `Transcrevendo fala ${i + 1}/${segments.length}…`,
    })
    let r: SttFinal | null = null
    let engine: OfflineSegment['engine'] = 'whisper-local'
    if (nuvem && nuvemAtiva) {
      try {
        const prompt = languageHint && anterior ? cortarPrompt(anterior) : undefined
        r = await nuvem.transcribePcm(s.audio, 16000, { languageHint, prompt })
        engine = 'groq-whisper'
      } catch (e) {
        const status = (e as { status?: number })?.status
        if (typeof status === 'number' && RECUSA_DEFINITIVA.has(status)) nuvemAtiva = false
      }
    }
    try {
      if (!r) r = await (await garantirLocal()).transcribePcm(s.audio, 16000, { languageHint })
      const text = (r.text || '').trim()
      if (text) {
        out.push({ tStartMs: Math.round(s.start), tEndMs: Math.round(s.end), text, engine })
        anterior = text
      }
    } catch {
      // segmento que falhou é pulado — não inventamos texto
    }
  }
  onProgress?.({ phase: 'segment', progress: 1 })
  return out
}
