/**
 * STUB documentado — STT de NUVEM com streaming real (WebSocket).
 *
 * O áudio do sistema hoje usa Whisper local com "rolling partials" (grátis/offline), que
 * aproxima o tempo real re-decodificando o buffer. Para streaming token-a-token DE VERDADE
 * (igual ao Web Speech do microfone), um provedor de nuvem — Deepgram, AssemblyAI, Gladia —
 * expõe um WebSocket: você envia PCM continuamente e recebe `partial`/`final` à medida que
 * o modelo decodifica.
 *
 * Este adapter implementa o MESMO contrato `StreamingSttSession` do Whisper local, então
 * LiveCapture não muda ao trocar de provedor — é o mandato provider-agnóstico do produto.
 * Fica como stub porque exige o usuário trazer uma API key (não é grátis por padrão).
 *
 * Para ativar no futuro:
 *  1. Registrar o adapter em `resolveStt` (src/gateway/index.ts) com um `adapterId`, ex. 'deepgram-stream'.
 *  2. Adicionar o binding no perfil de nuvem (src/gateway/profiles.ts) com `credentialId`.
 *  3. Abrir o WSS com token temporário (o server emite via /api/ai/*, sem expor o segredo ao cliente),
 *     enviar PCM 16 kHz Int16, e mapear as mensagens do provedor para onPartial/onFinal.
 */
import type {
  SttProvider,
  SttFinal,
  StreamingSttOptions,
  StreamingSttSession,
} from '../capabilities'

export interface StreamingCloudSttConfig {
  id: string
  label: string
  /** URL base do endpoint WSS do provedor (ou do proxy do server). */
  wssUrl: string
  model?: string
  credentialId?: string
}

export class StreamingCloudStt implements SttProvider {
  readonly id: string
  readonly runtime = 'proxy' as const
  readonly cost = 'byo-cloud' as const
  readonly label: string

  readonly supportsLiveMic = false
  readonly supportsBlob = true
  readonly supportsStreaming = true

  constructor(private cfg: StreamingCloudSttConfig) {
    this.id = cfg.id
    this.label = cfg.label
  }

  isAvailable(): boolean {
    // Disponível quando houver credencial configurada (validada no server).
    return !!this.cfg.credentialId && typeof WebSocket !== 'undefined'
  }

  /** TODO: abrir o WSS, enviar PCM e emitir onPartial/onFinal. */
  startStream(_opts: StreamingSttOptions): StreamingSttSession {
    throw new Error(
      `${this.id}: streaming de nuvem ainda não implementado — traga uma API key e registre o adapter (ver comentário no topo do arquivo).`
    )
  }

  /** Fallback em lote (o provedor também aceita POST de WAV) — a implementar junto. */
  transcribePcm(_pcm: Float32Array, _sampleRate: number): Promise<SttFinal> {
    return Promise.reject(new Error(`${this.id}: transcribePcm ainda não implementado (stub).`))
  }
}
