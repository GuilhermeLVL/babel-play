import { EDICAO_LEVE } from '../lib/edicao'
import type { Profile } from '@core'

/**
 * Perfis embutidos (código, não DB) — espelham os presets "muitas formas de rodar"
 * do desktop. Cada um mapeia capacidade → cadeia de bindings. Perfis Custom (DB) e
 * mais adapters (WebLLM, Chrome AI, Transformers.js Whisper) entram depois SEM mudar telas.
 */

const OLLAMA_LOCAL = 'http://localhost:11434/v1'

export const BUILTIN_PROFILES: Profile[] = [
  {
    id: 'free-web',
    name: 'Grátis/Web',
    builtin: true,
    economyMode: true,
    budget: { maxCloudRequests: 0, maxTokens: 0 },
    bindings: {
      // Mic = Web Speech (rápido). Sistema/aba = Whisper LOCAL por PADRÃO (WASM: roda em qualquer
      // navegador/dispositivo, on-device, SEM chave nenhuma) → Groq nuvem só como fallback OPCIONAL
      // quando houver GROQ_API_KEY no servidor (o proxy responde 501 sem chave e a cadeia segue).
      // Isso faz o app "abrir e funcionar de graça" e é o objetivo da versão local/distribuível.
      stt: [{ adapterId: 'web-speech' }, { adapterId: 'whisper-local' }, { adapterId: 'groq-whisper', model: 'whisper-large-v3-turbo' }],
      // Cadeia de tradução: nativo do Chrome (mais rápido, se disponível) → opus-mt local
      // (on-device, offline) → MyMemory (rede, último recurso).
      mt: [{ adapterId: 'chrome-translator' }, { adapterId: 'opus-mt-local' }, ...(EDICAO_LEVE ? [] : [{ adapterId: 'server-llm-mt' }]), { adapterId: 'mymemory' }],
      // LLM grátis-sem-chave (WebLLM / Chrome Prompt API) entra numa próxima etapa.
    },
  },
  {
    id: 'local-private',
    name: 'Privado/Local',
    builtin: true,
    economyMode: true,
    budget: { maxCloudRequests: 0, maxTokens: 0 },
    bindings: {
      // Mic = Web Speech; Sistema/aba = Whisper local (WebGPU) — 100% offline.
      stt: [{ adapterId: 'web-speech' }, { adapterId: 'whisper-local' }],
      llm: [{ adapterId: 'openai-compatible', baseUrl: OLLAMA_LOCAL, model: 'llama3.2' }],
      // Cadeia de tradução: nativo do Chrome (mais rápido, se disponível) → opus-mt local
      // (on-device, offline) → MyMemory (rede, último recurso).
      mt: [{ adapterId: 'chrome-translator' }, { adapterId: 'opus-mt-local' }, { adapterId: 'mymemory' }],
    },
  },
  {
    id: 'cloud-quality',
    name: 'Qualidade/Nuvem',
    builtin: true,
    economyMode: false,
    budget: { maxCloudRequests: 500, maxTokens: 500_000 },
    bindings: {
      // Mic = Web Speech; Sistema/aba = Groq nuvem (qualidade máxima) → Whisper local fallback.
      // Para BYO-key por usuário, acrescente `credentialId` ao binding do groq-whisper.
      stt: [{ adapterId: 'web-speech' }, { adapterId: 'groq-whisper', model: 'whisper-large-v3-turbo' }, { adapterId: 'whisper-local' }],
      // `credentialId` é preenchido quando o usuário cadastra e escolhe uma credencial.
      llm: [{ adapterId: 'openai-compatible' }],
      // Cadeia de tradução: nativo do Chrome (mais rápido, se disponível) → opus-mt local
      // (on-device, offline) → MyMemory (rede, último recurso).
      mt: [{ adapterId: 'chrome-translator' }, { adapterId: 'opus-mt-local' }, { adapterId: 'server-llm-mt' }, { adapterId: 'mymemory' }],
    },
  },
]

export const DEFAULT_PROFILE_ID = 'free-web'

export function getBuiltinProfile(id: string): Profile {
  return BUILTIN_PROFILES.find((p) => p.id === id) ?? BUILTIN_PROFILES[0]
}
