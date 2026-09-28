import { speechErrorMessage } from '../../lib/mediaErrors'
import type { SttCallbacks, SttProvider, SttSession } from '../capabilities'

/**
 * STT via Web Speech API (`SpeechRecognition`) — grátis, nativo do navegador
 * (Chrome/Edge; em outros, `isAvailable()` retorna false e o gateway cai no
 * próximo binding). Consome o microfone e emite partials + finais. Faz
 * auto-restart contínuo (o Web Speech encerra em silêncio) — mesmo padrão do
 * ditado contínuo do desktop.
 *
 * Nota de privacidade: no Chrome, o Web Speech (modo NUVEM) envia áudio aos
 * servidores do Google — por isso exige o consentimento de nuvem (registro de
 * motores). O modo LOCAL (`processLocally: true`, Chrome 139+ com o pacote do
 * idioma instalado) não sai do aparelho; quem o escolhe é a captura
 * (`lib/captura/motorDoMicrofone.ts`). E ele FALHA FECHADO: se o navegador não
 * conhece a propriedade, lança em vez de reconhecer na nuvem calado.
 *
 * TRILHA (áudio da aba/sistema): `start(trilha)` (Chrome 133+) reconhece uma `MediaStreamTrack` em vez
 * do microfone. SÓ no modo local — o áudio de um vídeo é a fala de TERCEIROS, e o modo nuvem o
 * mandaria ao Google; sem `processLocally`, lança. Se `start(trilha)` combina com `processLocally` não
 * está documentado: um `start` que lança sobe como exceção (não como erro assíncrono), e os erros
 * que dizem "isto não vai funcionar aqui" (`ERROS_FATAIS_DA_TRILHA`) sobem com o `codigo` e param o
 * religar — quem chama (`lib/captura/webSpeechDoSistema.ts`) cai no Whisper.
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
  stop(): void
  abort(): void
  onresult: ((e: SpeechRecognitionEventLike) => void) | null
  onerror: ((e: { error?: string }) => void) | null
  onend: (() => void) | null
  /** Chrome 133+: `start(trilha)` reconhece a trilha dada em vez do microfone. */
  start(trilha?: MediaStreamTrack): void
  /** Chrome 139+: reconhecer NO aparelho. Ausente = navegador que só conhece o modo nuvem. */
  processLocally?: boolean
}

export interface OpcoesDaWebSpeech {
  /** Exigir o reconhecimento no aparelho (`processLocally`). Sem suporte, `startLive` lança. */
  processLocally?: boolean
  /**
   * Reconhecer esta TRILHA (áudio da aba/sistema) em vez do microfone. Exige `processLocally`: a fala
   * de terceiros nunca vai à nuvem do navegador.
   */
  trilha?: MediaStreamTrack
}

/**
 * Erros que, com uma trilha, dizem "não funciona neste aparelho" — religar só repetiria o erro.
 * `language-not-supported`: o pacote do idioma não serve à trilha; `not-allowed`/`service-not-allowed`:
 * o navegador recusou o reconhecimento da trilha. Vão ao `onError` com o `codigo` e encerram a sessão.
 */
export const ERROS_FATAIS_DA_TRILHA: ReadonlySet<string> = new Set([
  'language-not-supported',
  'not-allowed',
  'service-not-allowed',
])

/** O erro que sobe ao `onError`, com o código cru do Web Speech (a captura decide o que fazer). */
export type ErroDaWebSpeech = Error & { codigo?: string }

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

  constructor(private readonly opcoes: OpcoesDaWebSpeech = {}) {}

  isAvailable(): boolean {
    return getRecognitionCtor() != null
  }

  startLive(lang: string, cb: SttCallbacks): SttSession {
    const Ctor = getRecognitionCtor()
    if (!Ctor) throw new Error('Web Speech API indisponível neste navegador')
    const trilha = this.opcoes.trilha
    if (trilha && !this.opcoes.processLocally)
      throw new Error('O áudio da aba/sistema só é reconhecido no aparelho (nunca na nuvem do navegador)')

    const rec = new Ctor()
    rec.lang = lang
    rec.continuous = true
    rec.interimResults = true
    rec.maxAlternatives = 1
    if (this.opcoes.processLocally) {
      // `in` e não leitura: no Chrome que a suporta, a propriedade existe (e vale false).
      if (!('processLocally' in rec)) throw new Error('Este navegador não reconhece a fala no aparelho')
      rec.processLocally = true
    }

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

    /** Liga o reconhecedor: com a trilha, ela; sem, o microfone (a chamada de sempre). */
    const iniciar = () => (trilha ? rec.start(trilha) : rec.start())

    rec.onerror = (e) => {
      // 'no-speech' é recuperável; deixamos o onend religar. 'aborted' (parada normal) vira `null`
      // em `speechErrorMessage`. O resto sobe já traduzido — o código cru não dizia o que fazer.
      if (!e?.error || e.error === 'no-speech') return
      // Com trilha, o erro que diz "não funciona aqui" encerra: religar só o repetiria.
      if (trilha && ERROS_FATAIS_DA_TRILHA.has(e.error)) stopped = true
      const msg = speechErrorMessage(e.error)
      if (msg) cb.onError?.(Object.assign(new Error(msg), { codigo: e.error }) as ErroDaWebSpeech)
    }

    // Web Speech encerra sozinho em silêncio — religa enquanto não paramos.
    rec.onend = () => {
      if (!stopped) {
        try {
          iniciar()
        } catch {
          /* já reiniciando */
        }
      }
    }

    try {
      iniciar()
    } catch (e) {
      // Com trilha, o `start` que lança É o teste da combinação trilha + no aparelho: sobe já.
      if (trilha) throw e
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
