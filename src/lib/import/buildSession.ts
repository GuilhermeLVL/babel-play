/**
 * Monta a SESSÃO a partir do que a importação extraiu — a "cola" entre os parsers do servidor e o
 * formato canônico de sessão que o resto da app consome.
 *
 * Invariante do projeto: idioma DETECTADO do texto (reconciliado com o hint do servidor), nunca
 * chutado; documento/web ficam SEM timestamps (Análise narra por TTS com espaçamento honesto).
 */
import { detectLanguage } from '../langDetect'
import { fetchLangConfig } from '../langConfig'
import { toBcp47 } from '../languages'
import { apiFetch, createSession, replaceSessionUtterances, type NewUtterancePayload } from '../../data/api'
import { offlineTranscribe, type OfflineProgress } from '../../gateway/offlineTranscribe'
import type { Recording } from '../../types'

/**
 * Segmenta um texto em frases, CIENTE de idioma via `Intl.Segmenter` (não regex ingênua). Fallback
 * por pontuação/linha quando o `Intl.Segmenter` não existe ou não devolve nada.
 */
function segmentSentences(text: string, lang?: string): string[] {
  const clean = text.replace(/\r/g, '').replace(/[ \t]+\n/g, '\n').trim()
  if (!clean) return []
  const SegAny = (Intl as unknown as { Segmenter?: any }).Segmenter
  if (SegAny) {
    try {
      const seg = new SegAny(lang || undefined, { granularity: 'sentence' })
      const out: string[] = []
      for (const part of seg.segment(clean)) {
        const s = String(part.segment).trim()
        if (s) out.push(s)
      }
      if (out.length) return out
    } catch {
      /* cai no fallback */
    }
  }
  return clean
    .split(/(?<=[.!?。！？])\s+|\n+/)
    .map((s) => s.trim())
    .filter(Boolean)
}

export interface BuildResult {
  recording: Recording
  sentences: number
}

/**
 * Sessão-DOCUMENTO a partir de texto importado (web/documento). Idioma do conteúdo:
 * detecção do texto > hint do servidor > o idioma que você estuda. `targetLang` = o idioma que
 * você fala (`mine`), que orienta a direção de tradução do vocabulário.
 */
export async function buildDocumentSession(input: {
  title: string
  text: string
  langHint?: string
}): Promise<BuildResult> {
  const cfg = await fetchLangConfig()
  const det = await detectLanguage(input.text)
  const detected = det?.lang ? toBcp47(det.lang) : undefined
  const sourceLang = detected || (input.langHint ? toBcp47(input.langHint) : undefined) || cfg.studying
  const targetLang = cfg.mine

  const sentences = segmentSentences(input.text, sourceLang)
  const utterances: NewUtterancePayload[] = sentences.map((s, i) => ({
    idx: i,
    source: 'tab',
    sourceLang,
    sourceText: s,
    targetLang,
    engine: 'import-text', // selo de procedência: texto importado (sem timestamps — sem áudio)
  }))

  const recording = await createSession({
    kind: 'document',
    title: input.title,
    sourceLang,
    targetLang,
    status: 'ready',
    utterances,
  })
  return { recording, sentences: sentences.length }
}

/**
 * Reserva de Whisper: transcreve o áudio JÁ baixado de uma sessão importada (YouTube sem legenda /
 * áudio local) e substitui as falas por segmentos com timestamps reais. `engine:'whisper-local'`.
 */
export async function transcribeImportedAudio(
  sessionId: string,
  sourceLang: string | undefined,
  onProgress?: (p: OfflineProgress) => void,
): Promise<number> {
  const res = await apiFetch(`/api/sessions/${sessionId}/audio`)
  if (!res.ok) throw new Error('não consegui ler o áudio baixado para transcrever')
  const blob = await res.blob()
  const segs = await offlineTranscribe(blob, {
    languageHint: sourceLang ? sourceLang.split('-')[0] : undefined,
    onProgress,
  })
  const utterances: NewUtterancePayload[] = segs.map((s, i) => ({
    idx: i,
    source: 'tab',
    sourceLang,
    sourceText: s.text,
    tStartMs: s.tStartMs,
    tEndMs: s.tEndMs,
    engine: 'whisper-local',
  }))
  await replaceSessionUtterances(sessionId, utterances)
  return utterances.length
}
