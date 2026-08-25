/**
 * Header Authorization para as chamadas ao próprio servidor (/api/*). Marco 1.
 *
 * Devolve `{ Authorization: 'Bearer <jwt>' }` quando há sessão Supabase; `{}` caso contrário — no
 * uso local/self-host (sem login) não há token e o servidor não o exige. Usado pelo apiFetch e
 * pelos poucos fetches que não passam por ele.
 */
import { getAccessToken } from './supabase'

export async function authHeaders(): Promise<Record<string, string>> {
  const token = await getAccessToken()
  return token ? { Authorization: `Bearer ${token}` } : {}
}
