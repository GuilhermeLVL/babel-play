/**
 * Resolve o PERFIL ATIVO do gateway a partir da escolha do usuário (onboarding):
 * id do perfil + (opcional) credencial de nuvem. Centraliza a "cola" que injeta o
 * `credentialId` escolhido nos bindings de nuvem — sem isso o perfil `cloud-quality`
 * fica sem chave e a nuvem nunca é usada.
 *
 * Fonte de verdade no cliente = localStorage (espelhado de `settings` no servidor):
 *  - `babel.activeProfileId`  → qual perfil (free-web | local-private | cloud-quality)
 *  - `babel.credentialId`     → credencial de nuvem a injetar (quando modo = nuvem)
 *  - `babel.providerMode`     → 'local' | 'cloud' (a escolha do onboarding)
 */
import type { CapabilityBinding, Profile } from '@core'
import { getBuiltinProfile, DEFAULT_PROFILE_ID } from './profiles'

export const PROFILE_KEY = 'babel.activeProfileId'
export const CREDENTIAL_KEY = 'babel.credentialId'
export const MODE_KEY = 'babel.providerMode'

export type ProviderMode = 'local' | 'cloud'

const LOCAL_RE = /^https?:\/\/(127\.0\.0\.1|localhost|\[::1\])/i
const isLocalUrl = (u?: string): boolean => !!u && LOCAL_RE.test(u)

function read(key: string): string | null {
  try { return localStorage.getItem(key) } catch { return null }
}

function getActiveProfileId(): string {
  return read(PROFILE_KEY) ?? DEFAULT_PROFILE_ID
}

function getCredentialId(): string | null {
  return read(CREDENTIAL_KEY)
}

export function getProviderMode(): ProviderMode {
  return read(MODE_KEY) === 'cloud' ? 'cloud' : 'local'
}

/** Injeta o `credentialId` nos bindings de NUVEM (LLM via proxy, groq-whisper). */
function injectCredential(bindings: CapabilityBinding[] | undefined, credentialId: string): CapabilityBinding[] | undefined {
  return bindings?.map((b) => {
    if (b.adapterId === 'openai-compatible' && !isLocalUrl(b.baseUrl)) return { ...b, credentialId }
    if (b.adapterId === 'groq-whisper') return { ...b, credentialId }
    return b
  })
}

/**
 * Perfil efetivo para `buildGateway`. Se houver credencial escolhida, ela é
 * injetada nos bindings de nuvem do perfil ativo (torna-os `isCloud`).
 */
export function getActiveProfile(): Profile {
  const base = getBuiltinProfile(getActiveProfileId())
  const credentialId = getCredentialId()
  if (!credentialId) return base
  return {
    ...base,
    bindings: {
      ...base.bindings,
      llm: injectCredential(base.bindings.llm, credentialId),
      stt: injectCredential(base.bindings.stt, credentialId),
    },
  }
}

/** Persiste a escolha do onboarding no localStorage (espelho do `settings`). */
export function setProviderChoice(opts: { mode: ProviderMode; profileId: string; credentialId?: string | null }): void {
  try {
    localStorage.setItem(MODE_KEY, opts.mode)
    localStorage.setItem(PROFILE_KEY, opts.profileId)
    if (opts.credentialId) localStorage.setItem(CREDENTIAL_KEY, opts.credentialId)
    else localStorage.removeItem(CREDENTIAL_KEY)
  } catch { /* ignore */ }
}
