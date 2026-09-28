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
  onstart?: (() => void) | null
  onaudiostart?: (() => void) | null
  onsoundstart?: (() => void) | null
  onsoundend?: (() => void) | null
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

/**
 * Erros que, no MICROFONE, dizem "não vai funcionar aqui" — religar só repetiria o erro, e a tela
 * ficava em "Ouvindo…" sem legenda nenhuma (relato do dono no celular, 2026-09-28). `not-allowed`: a
 * permissão foi negada; `service-not-allowed`: o navegador recusou o serviço (no iPhone, Siri/Ditado
 * desligados); `audio-capture`: o microfone não abriu (ocupado, ou o Android deu a outro app);
 * `network`: o reconhecimento na nuvem não alcança o servidor — no Chrome ele é contínuo, então o
 * religar batia no mesmo erro a cada volta. Vão ao `onError` com `fatal` e a sessão para.
 */
export const ERROS_FATAIS_DO_MIC: ReadonlySet<string> = new Set([
  'not-allowed',
  'service-not-allowed',
  'audio-capture',
  'network',
  'language-not-supported',
])

/**
 * Quantas voltas seguidas (`onend` → `start`) sem NENHUM `onaudiostart` contam como "o reconhecedor
 * não abre o microfone". Com o áudio aberto, o religar do silêncio é o normal (o Chrome encerra
 * sozinho); sem ele, é o laço que prendia a tela em "Ouvindo…". Sobe como `codigo: 'sem-audio'`.
 */
export const VOLTAS_SEM_AUDIO = 5

/**
 * O erro que sobe ao `onError`, com o código cru do Web Speech (a captura decide o que fazer).
 * `fatal`: a sessão acabou (o adaptador já parou de religar); sem ele, é aviso (`no-speech`).
 */
export type ErroDaWebSpeech = Error & { codigo?: string; fatal?: boolean }

/**
 * O ciclo de vida que o microfone precisa ver (opcional; o gateway continua falando `SttCallbacks`).
 * `onAudioAberto`: o navegador abriu o áudio (`onaudiostart`; `onstart` onde não há o primeiro) —
 * UMA vez por sessão; é o "o microfone abriu de verdade" que liga o relógio. `onSom`: entrou/saiu
 * som (`onsoundstart`/`onsoundend`) — anima o indicador sem abrir um segundo `getUserMedia`.
 */
export interface CallbacksDaWebSpeech extends SttCallbacks {
  onAudioAberto?(): void
  onSom?(ha: boolean): void
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

  constructor(private readonly opcoes: OpcoesDaWebSpeech = {}) {}

  isAvailable(): boolean {
    return getRecognitionCtor() != null
  }

  startLive(lang: string, cb: CallbacksDaWebSpeech): SttSession {
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
    /** O áudio já abriu nesta sessão (o `onAudioAberto` sai uma vez só). */
    let abriu = false
    /** Voltas seguidas sem `onaudiostart` (ver `VOLTAS_SEM_AUDIO`). Só no microfone. */
    let voltasSemAudio = 0
    let audioNestaVolta = false
    const falhar = (codigo: string, msg: string) => {
      stopped = true
      cb.onError?.(Object.assign(new Error(msg), { codigo, fatal: true }) as ErroDaWebSpeech)
    }
    const audioAberto = () => {
      audioNestaVolta = true
      voltasSemAudio = 0
      if (abriu) return
      abriu = true
      cb.onAudioAberto?.()
    }
    /* `onstart` só serve de "abriu" onde o navegador não conhece `onaudiostart` (o Safari antigo). */
    const temAudioStart = 'onaudiostart' in rec
    rec.onstart = () => {
      if (!temAudioStart) audioAberto()
    }
    rec.onaudiostart = audioAberto
    rec.onsoundstart = () => cb.onSom?.(true)
    rec.onsoundend = () => cb.onSom?.(false)

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
      // 'aborted' (parada normal) vira `null` em `speechErrorMessage`. O resto sobe já traduzido — o
      // código cru não dizia o que fazer.
      if (!e?.error) return
      if (e.error === 'no-speech') {
        // Recuperável: o onend religa. No microfone sobe como AVISO ("fale mais perto"); na trilha, não.
        if (!trilha) {
          const aviso = speechErrorMessage('no-speech')
          if (aviso) cb.onError?.(Object.assign(new Error(aviso), { codigo: 'no-speech' }) as ErroDaWebSpeech)
        }
        return
      }
      const msg = speechErrorMessage(e.error)
      if (!msg) return
      // O erro que diz "não funciona aqui" encerra: religar só o repetiria.
      if ((trilha ? ERROS_FATAIS_DA_TRILHA : ERROS_FATAIS_DO_MIC).has(e.error)) {
        if (trilha) {
          stopped = true
          cb.onError?.(Object.assign(new Error(msg), { codigo: e.error }) as ErroDaWebSpeech)
        } else falhar(e.error, msg)
        return
      }
      cb.onError?.(Object.assign(new Error(msg), { codigo: e.error }) as ErroDaWebSpeech)
    }

    // Web Speech encerra sozinho em silêncio — religa enquanto não paramos.
    rec.onend = () => {
      if (!trilha && !stopped) {
        voltasSemAudio = audioNestaVolta ? 0 : voltasSemAudio + 1
        audioNestaVolta = false
        if (voltasSemAudio >= VOLTAS_SEM_AUDIO) {
          falhar('sem-audio', speechErrorMessage('sem-audio') ?? 'O reconhecimento de fala falhou.')
          return
        }
      }
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
