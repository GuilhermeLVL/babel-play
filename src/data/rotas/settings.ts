/**
 * O CLIENTE DAS ROTAS DE CONFIGURAÇÃO.
 *
 * Espelho de `src/data/efemero/rotas/settings.ts` (lá o destino é o `localStorage`).
 *
 * Rotas: GET `/api/settings`, PUT `/api/settings`.
 */
import { apiFetch } from '../funil'

export interface AppSettings {
  id: string
  activeProfileId: string | null
  targetLanguage: string | null
  ui: string | null
}

export interface SettingsPayload {
  activeProfileId?: string | null
  targetLanguage?: string | null
  ui?: unknown
}

export async function fetchSettings(): Promise<AppSettings | null> {
  try {
    const res = await apiFetch('/api/settings')
    if (!res.ok) return null
    return (await res.json()) as AppSettings
  } catch {
    return null
  }
}

export async function saveSettings(payload: SettingsPayload): Promise<AppSettings | null> {
  try {
    const res = await apiFetch('/api/settings', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    })
    if (!res.ok) return null
    return (await res.json()) as AppSettings
  } catch {
    return null
  }
}

/**
 * Atualiza campos do blob `ui` MESCLANDO com o que já existe (o `ui` é compartilhado
 * por onboarding, tema, persona etc.). Evita que salvar uma pref apague as outras.
 */
export async function patchUiSettings(patch: Record<string, unknown>): Promise<AppSettings | null> {
  const s = await fetchSettings()
  let ui: Record<string, unknown>
  try { ui = s?.ui ? (JSON.parse(s.ui) as Record<string, unknown>) : {} } catch { ui = {} }
  return saveSettings({ ui: { ...ui, ...patch } })
}
