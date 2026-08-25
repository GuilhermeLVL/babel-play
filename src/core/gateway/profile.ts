/**
 * Perfis e bindings do AI Gateway (provider-agnóstico). Puro/isomórfico.
 *
 * Um Perfil mapeia cada CAPACIDADE (stt|mt|tts|embed|vlm|llm) para uma CADEIA
 * ORDENADA de bindings (primário + fallbacks). Isto generaliza o roteamento
 * binário local/nuvem do desktop (`translation/router.ts`) para N passos.
 */

export type Capability = 'stt' | 'mt' | 'tts' | 'embed' | 'vlm' | 'llm'

export const CAPABILITIES: readonly Capability[] = ['stt', 'mt', 'tts', 'embed', 'vlm', 'llm']

/** Onde o adapter roda e quanto custa (herdado do `isLocalProvider` do desktop). */
export type AdapterRuntime = 'browser' | 'proxy'
export type AdapterCost = 'free' | 'local' | 'byo-cloud'

/** Uma escolha concreta de adapter para uma capacidade, dentro de um perfil. */
export interface CapabilityBinding {
  /** Id do adapter registrado (ex.: 'mymemory', 'web-speech', 'openai-compatible'). */
  adapterId: string
  /** Modelo específico, quando aplicável. */
  model?: string
  /** Referência à credencial (server-side) para adapters de nuvem. */
  credentialId?: string
  /** baseUrl para adapters OpenAI-compatible (localhost do usuário ou provedor). */
  baseUrl?: string
  /** Opções livres por adapter. */
  options?: Record<string, unknown>
}

/** Orçamento de nuvem por sessão (degrada para local ao esgotar; nunca silencia). */
export interface Budget {
  /** Máx. de requisições de nuvem (-1 = ilimitado). */
  maxCloudRequests: number
  /** Máx. de tokens de nuvem (-1 = ilimitado). */
  maxTokens: number
}

export interface Profile {
  id: string
  name: string
  builtin: boolean
  /** capacidade → cadeia ordenada de bindings (primário primeiro). */
  bindings: Partial<Record<Capability, CapabilityBinding[]>>
  budget: Budget
  /** Modo econômico: bloqueia nuvem mesmo com consentimento (context-coach do desktop). */
  economyMode: boolean
}
