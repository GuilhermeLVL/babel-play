import type { SttCallbacks, SttProvider, SttSession } from '../capabilities'
import { speechErrorMessage } from '../../lib/mediaErrors'

/**
 * STT via Web Speech API (`SpeechRecognition`) — grátis, nativo do navegador
 * (Chrome/Edge; em outros, `isAvailable()` retorna false e o gateway cai no
 * próximo binding). Consome o microfone e emite partials + finais. Faz
 * auto-restart contínuo (o Web Speech encerra em silêncio) — mesmo padrão do
 * ditado contínuo do desktop.
 *
 * Nota de privacidade: no Chrome, o Web Speech envia áudio aos servidores do
 * Google. Para 100% local, o perfil deve usar um adapter Whisper-WASM (futuro).
 */

// Tipos mínimos do Web Speech (o lib.dom do TS varia entre versões).
interface SpeechRecognitionResultLike {
  isFinal: boolean
  0: { transcript: string; confidence?: number }
  length: number
}
interface SpeechRecognitionEventLike {
  resultIndex: number
  results: { length: number; [i: number]: SpeechRecognitionResultLike }
}
interface SpeechRecognitionLike {
  lang: string
  continuous: boolean
  interimResults: boolean
  maxAlternatives: number
  start(): void
  stop(): void
  abort(): void
  onresult: ((e: SpeechRecognitionEventLike) => void) | null
  onerror: ((e: { error?: string }) => void) | null
  onend: (() => void) | null
}

function getRecognitionCtor(): (new () => SpeechRecognitionLike) | null {
  if (typeof window === 'undefined') return null
  const w = window as unknown as {
    SpeechRecognition?: new () => SpeechRecognitionLike
    webkitSpeechRecognition?: new () => SpeechRecognitionLike
  }
  return w.SpeechRecognition ?? w.webkitSpeechRecognition ?? null
}

export class WebSpeechStt implements SttProvider {
  readonly id = 'web-speech'
  readonly runtime = 'browser' as const
  readonly cost = 'free' as const
  readonly label = 'Web Speech (navegador)'
  readonly supportsLiveMic = true
  readonly supportsBlob = false

  isAvailable(): boolean {
    return getRecognitionCtor() != null
  }

  startLive(lang: string, cb: SttCallbacks): SttSession {
    const Ctor = getRecognitionCtor()
    if (!Ctor) throw new Error('Web Speech API indisponível neste navegador')

    const rec = new Ctor()
    rec.lang = lang
    rec.continuous = true
    rec.interimResults = true
    rec.maxAlternatives = 1

    let stopped = false

    rec.onresult = (e) => {
      let interim = ''
      for (let i = e.resultIndex; i < e.results.length; i++) {
        const res = e.results[i]
        const alt = res[0]
        const text = (alt?.transcript ?? '').trim()
        if (!text) continue
        if (res.isFinal) {
          cb.onFinal({ text, language: lang, confidence: alt?.confidence })
        } else {
          interim += ' ' + text
        }
      }
      if (interim.trim()) cb.onPartial(interim.trim())
    }

    rec.onerror = (e) => {
      // 'no-speech' é recuperável; deixamos o onend religar. 'aborted' (parada normal) vira `null`
      // em `speechErrorMessage`. O resto sobe já traduzido — o código cru não dizia o que fazer.
      if (!e?.error || e.error === 'no-speech') return
      const msg = speechErrorMessage(e.error)
      if (msg) cb.onError?.(new Error(msg))
    }

    // Web Speech encerra sozinho em silêncio — religa enquanto não paramos.
    rec.onend = () => {
      if (!stopped) {
        try {
          rec.start()
        } catch {
          /* já reiniciando */
        }
      }
    }

    try {
      rec.start()
    } catch (e) {
      cb.onError?.(e as Error)
    }

    return {
      stop() {
        stopped = true
        try {
          rec.stop()
        } catch {
          /* ignore */
        }
      },
    }
  }
}
