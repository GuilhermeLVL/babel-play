/**
 * O CLIENTE DAS OPÇÕES DA REVISÃO NA CONTA E DO LIMITE DIÁRIO (openspec `cartoes`, 2.1 e 2.2).
 *
 * Rotas: GET e PUT `/api/vocab/opcoes-da-revisao` (o PUT leva só o que mudou). A resposta traz as opções, se a
 * pessoa já gravou alguma na conta e o que foi estudado hoje (no dia da pessoa, contado pelo servidor).
 *
 * Sem conta (modo anônimo) o espelho responde com `hoje: null`: não há contador de dia para o servidor
 * garantir, e a tela não inventa um (`src/data/efemero/rotas/opcoesDaRevisao.ts`). Erro ou sem rede: `null`, e
 * quem chama segue com as opções do aparelho.
 */
import { normalizarOpcoes, type OpcoesDaConta } from '../../core/learning/opcoesDaRevisao'
import { apiFetch } from '../funil'

export interface HojeDaRevisao {
  novas: number
  revisoes: number
  restamNovas: number
  restamRevisoes: number
}

export interface OpcoesDaContaComHoje {
  opcoes: OpcoesDaConta
  /** `true` se a pessoa já gravou opções na conta. */
  naConta: boolean
  /** O feito de hoje; `null` quando não há conta para contar (modo anônimo). */
  hoje: HojeDaRevisao | null
}

const numero = (v: unknown): number => (typeof v === 'number' && Number.isFinite(v) ? Math.max(0, v) : 0)

function lerResposta(bruto: unknown): OpcoesDaContaComHoje | null {
  if (!bruto || typeof bruto !== 'object') return null
  const b = bruto as { opcoes?: unknown; naConta?: unknown; hoje?: unknown }
  const h = b.hoje as Record<string, unknown> | null | undefined
  return {
    opcoes: normalizarOpcoes(b.opcoes),
    naConta: b.naConta === true,
    hoje: h
      ? {
          novas: numero(h.novas),
          revisoes: numero(h.revisoes),
          restamNovas: numero(h.restamNovas),
          restamRevisoes: numero(h.restamRevisoes),
        }
      : null,
  }
}

/** As opções da conta e o feito de hoje; `null` com erro ou sem rede (a tela segue com o que tem). */
export async function fetchOpcoesDaRevisao(): Promise<OpcoesDaContaComHoje | null> {
  try {
    const res = await apiFetch('/api/vocab/opcoes-da-revisao')
    if (!res.ok) return null
    return lerResposta(await res.json())
  } catch {
    return null
  }
}

/** Grava na conta só o que mudou. `null` com erro ou sem rede: a escolha continua valendo neste aparelho. */
export async function gravarOpcoesDaRevisaoNaConta(mudou: Partial<OpcoesDaConta>): Promise<OpcoesDaContaComHoje | null> {
  try {
    const res = await apiFetch('/api/vocab/opcoes-da-revisao', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(mudou),
    })
    if (!res.ok) return null
    return lerResposta(await res.json())
  } catch {
    return null
  }
}
