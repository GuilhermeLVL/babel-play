/**
 * O CLIENTE DAS ROTAS DE CREDENCIAL DE IA (chave de nuvem).
 *
 * O segredo é enviado UMA vez (POST), cifrado no servidor e nunca devolvido. O cliente
 * só guarda o `id` (credentialId) para referenciar nos bindings do perfil.
 *
 * NÃO HÁ ESPELHO deste arquivo em `src/data/efemero/rotas/`, e é essa a informação: a credencial
 * é cifrada no servidor, nunca no navegador. O motivo está escrito em
 * `tests/contratos/rotas-espelhadas.test.ts`.
 *
 * Rotas: GET/POST `/api/ai/credentials`, POST `/api/ai/providers/test`.
 */
import { apiFetch } from '../api'

export interface CredentialMeta {
  id: string
  label: string | null
  kind: string | null
  baseUrl: string | null
  defaultModel: string | null
}

export interface NewCredentialPayload {
  label?: string
  kind?: string
  baseUrl?: string
  defaultModel?: string
  secret?: string
}

export async function listCredentials(): Promise<CredentialMeta[]> {
  try {
    const res = await apiFetch('/api/ai/credentials')
    if (!res.ok) return []
    return (await res.json()) as CredentialMeta[]
  } catch {
    return []
  }
}

export async function createCredential(payload: NewCredentialPayload): Promise<CredentialMeta | null> {
  try {
    const res = await apiFetch('/api/ai/credentials', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    })
    if (!res.ok) return null
    return (await res.json()) as CredentialMeta
  } catch {
    return null
  }
}


/** Testa um provider por credentialId (ou baseUrl+apiKey cru). Chave nunca no cliente. */
export async function testProvider(payload: { credentialId?: string; baseUrl?: string; model?: string; apiKey?: string }): Promise<{ ok: boolean; latencyMs?: number; message?: string }> {
  try {
    const res = await apiFetch('/api/ai/providers/test', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    })
    return (await res.json()) as { ok: boolean; latencyMs?: number; message?: string }
  } catch (e) {
    return { ok: false, message: String((e as Error)?.message ?? e) }
  }
}
