/**
 * O CLIENTE DAS ROTAS DE MÉTRICA — o perfil.
 *
 * Espelho de `src/data/efemero/rotas/metricas.ts`. As rotas de Seeds e de presença têm caminho
 * HTTP parecido e moram em `./economia.ts`, dos dois lados: o domínio delas é a economia.
 *
 * Rotas: GET `/api/metrics/profile`.
 */
import { apiFetch } from '../api'

// M-06: contrato ÚNICO — `AppMetrics` vem de src/core/learning/contract.ts (era duplicado aqui e no
// servidor, e já divergia: `seedsGastas` era opcional aqui e obrigatório lá). Re-exportado para os
// consumidores que importavam de `data/api`.
export type { AppMetrics } from '@core'
import type { AppMetrics } from '@core'

/**
 * Métricas do perfil. Com `sessionId`, só daquela gravação.
 *
 * O parâmetro é opcional de propósito: toda chamada existente continua pedindo a conta inteira,
 * e a aba de métricas da Sessão passa a ter o que chamar — antes ela não tinha, e preenchia o
 * vazio com dado global renderizado dentro de um painel de sessão.
 */
export async function fetchMetrics(sessionId?: string | null): Promise<AppMetrics | null> {
  const qs = sessionId ? `?sessao=${encodeURIComponent(sessionId)}` : ''
  const res = await apiFetch(`/api/metrics/profile${qs}`)
  if (!res.ok) return null
  return (await res.json()) as AppMetrics
}
