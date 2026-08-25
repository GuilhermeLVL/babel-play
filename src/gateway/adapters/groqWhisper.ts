/**
 * Adapter Groq Whisper via proxy do servidor — áudio do sistema/aba (PCM → WAV) chega ao
 * modelo whisper-large-v3-turbo na nuvem. A chave da API nunca chega ao cliente; o servidor
 * injeta via `x-credential-id`.
 */
import type { SttFinal, SttProvider } from '../capabilities'
import { encodeWav } from '../audio/wav'
import { apiFetch } from '../../data/api'

export interface GroqWhisperConfig {
  model: string
  credentialId?: string
  endpoint?: string
}

export class GroqWhisperStt implements SttProvider {
  readonly id = 'groq-whisper'
  readonly runtime = 'proxy' as const
  readonly cost = 'byo-cloud' as const
  readonly label = 'Nuvem STT (Groq/OpenAI)'

  readonly supportsLiveMic = false
  readonly supportsBlob = true

  private endpoint: string

  constructor(private cfg: GroqWhisperConfig) {
    this.endpoint = cfg.endpoint ?? '/api/ai/stt'
  }

  isAvailable(): boolean {
    return typeof fetch !== 'undefined'
  }

  async preload(): Promise<void> {
    // No-op; nada para baixar no cliente.
  }

  async transcribePcm(
    pcm: Float32Array,
    sampleRate: number,
    opts?: { languageHint?: string; signal?: AbortSignal }
  ): Promise<SttFinal> {
    const wav = encodeWav(pcm, sampleRate)

    const headers: Record<string, string> = {
      'Content-Type': 'audio/wav',
      'x-model': this.cfg.model,
    }
    if (this.cfg.credentialId) {
      headers['x-credential-id'] = this.cfg.credentialId
    }
    if (opts?.languageHint) {
      headers['x-language'] = opts.languageHint
    }

    // Pelo funil (`apiFetch`): injeta o Bearer no modo público — este `fetch` cru não injetava, e
    // a STT de nuvem respondia 401 com login — e, sem conta, responde 501 sem tocar a rede.
    const res = await apiFetch(this.endpoint, {
      method: 'POST',
      headers,
      body: wav,
      signal: opts?.signal,
    })

    if (!res.ok) {
      const errorText = await res.text().catch(() => '')
      throw new Error(`groq-whisper HTTP ${res.status}: ${errorText.slice(0, 160)}`)
    }

    /* `language` vem do DECODE, não de um palpite sobre o texto: o Whisper identifica o idioma a
       partir do áudio. O servidor pede `verbose_json` e normaliza para ISO-639-1 (ver
       `server/lib/idiomaDoWhisper.ts`); '' significa "o provedor não informou".

       A dica do usuário NÃO entra aqui. `language` significa "o que o motor identificou", e
       ecoar a dica de volta faria o chamador tomar a própria pergunta por resposta. */
    const json = (await res.json()) as { text?: string; language?: string }
    return {
      text: (json.text ?? '').trim(),
      language: json.language || undefined,
    }
  }
}
