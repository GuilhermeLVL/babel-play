/**
 * O FUNIL da camada de dados do cliente.
 *
 * Toda a camada fala com as rotas do servidor por AQUI, e mapeia as linhas do banco para os shapes
 * que a UI já usa (`Recording`, `VocabCard`).
 *
 * ─── O QUE FICA NESTE ARQUIVO, E POR QUÊ ───
 *
 * Só o funil: `apiFetch` (o único ponto que decide entre a rede e o servidor em memória do modo
 * sem conta) e `lerErro` (o envelope de erro do servidor, deste lado). Este caminho é citado
 * LITERALMENTE por `audit/rules/ast-grep/fetch-fora-do-funil.yml`, a regra que proíbe
 * `fetch('/api/…')` em qualquer outro lugar de `src/` — mover o `fetch` daqui desligaria a regra.
 *
 * As funções por rota moram em `./rotas/<domínio>.ts`, com o MESMO recorte do espelho anônimo
 * (`./efemero/rotas/<domínio>.ts`): este contrato tem dois lados, e enquanto cada um era um
 * arquivo de ~1000 linhas não havia como comparar `sessoes` com `sessoes`. Agora há.
 *
 * Este arquivo REEXPORTA tudo: os ~50 importadores de `data/api` continuam valendo, e nenhum
 * símbolo público mudou de nome ou de lugar do ponto de vista de quem consome.
 */
import { authHeaders } from '../lib/authHeaders'
import { supabase, authRequired } from '../lib/supabase'
import { aguardarIdentidade } from '../lib/identidade'
import { servidorEfemero } from './efemero/servidor'

// ───────────────────────────── fetch com teto de tempo (A-05) ─────────────────────────────
// Toda a camada de dados usava `fetch` SEM timeout: uma resposta que nunca chega deixava a UI presa
// em "carregando…" para sempre, sem caminho de recuperação a não ser recarregar. `apiFetch` injeta um
// AbortSignal.timeout; rotas longas (import/upload) passam `timeoutMs` maior no próprio init.
const DEFAULT_TIMEOUT_MS = 30_000
/** yt-dlp (300s no servidor), anki até 200MB, uploads grandes — teto folgado para não cortar import. */
export const IMPORT_TIMEOUT_MS = 600_000
type ApiInit = RequestInit & { timeoutMs?: number }
export async function apiFetch(input: string, init?: ApiInit): Promise<Response> {
  const { timeoutMs, ...rest } = init ?? {}
  // Sem conta, NADA sai para a rede: o servidor em memória responde (ver data/efemero). Este é o
  // único ponto de corte — toda a camada de dados passa por aqui.
  if ((await aguardarIdentidade()) === 'anonimo') return servidorEfemero(input, rest)
  const signal = rest.signal ?? AbortSignal.timeout(timeoutMs ?? DEFAULT_TIMEOUT_MS)
  const send = async (): Promise<Response> => {
    // Marco 1: injeta o Authorization quando há sessão (no-op no uso local sem login).
    const auth = await authHeaders()
    return fetch(input, { ...rest, headers: { ...auth, ...(rest.headers ?? {}) }, signal })
  }
  let res = await send()
  // Sessão expirada (modo público): 1 refresh + retry; persistindo, encerra a sessão (→ tela de login).
  if (res.status === 401 && authRequired && supabase) {
    const { data } = await supabase.auth.refreshSession()
    if (data?.session) res = await send()
    if (res.status === 401) await supabase.auth.signOut()
  }
  return res
}

/**
 * O ENVELOPE DE ERRO DO SERVIDOR, do lado de cá (auditoria de 2026-09-07, achado A30).
 *
 * O servidor responde `{ error, code?, detalhes? }`. Antes, cada rota inventava a sua forma e o
 * cliente respondia a todas com `return null`: "saldo insuficiente, faltam 12 Seeds" e "preço
 * divergente do catálogo" viravam a mesma tela muda. O dado existia e não atravessava.
 */
export interface ErroDaApi {
  status: number
  error: string
  code?: string
  detalhes?: Record<string, unknown>
}

/** Lê o envelope de uma resposta que já se sabe ser de erro. Nunca lança. */
export async function lerErro(res: Response): Promise<ErroDaApi> {
  try {
    const corpo = await res.json() as Partial<ErroDaApi> & { error?: unknown }
    const texto = typeof corpo?.error === 'string' ? corpo.error : `o servidor respondeu ${res.status}`
    return { status: res.status, error: texto, code: corpo?.code, detalhes: corpo?.detalhes }
  } catch {
    return { status: res.status, error: `o servidor respondeu ${res.status}` }
  }
}

// ───────────────────────────── As rotas, por domínio ─────────────────────────────
// Um arquivo por domínio de rota, na MESMA divisão do espelho sem conta (./efemero/rotas/).
// Onde um domínio existe só de um lado, isso está escrito no cabeçalho do arquivo e cobrado por
// `tests/contratos/rotas-espelhadas.test.ts`.

export * from './rotas/sessoes'
export * from './rotas/importacao'
export * from './rotas/vocabulario'
export * from './rotas/metricas'
export * from './rotas/exercicios'
export * from './rotas/economia'
export * from './rotas/settings'
export * from './rotas/credenciais'
export * from './rotas/imagens'
export * from './rotas/conta'
