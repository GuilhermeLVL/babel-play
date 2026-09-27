/**
 * O CLIENTE DAS ROTAS DE ECONOMIA — Seeds, presença, créditos, maestria e temporada.
 *
 * Espelho de `src/data/efemero/rotas/economia.ts`. As três primeiras têm caminho HTTP de métrica,
 * mas o domínio é a economia — o mesmo corte é feito do outro lado. As rotas de cobrança
 * (`/api/billing/gastar`) NÃO têm espelho: moeda comprada com
 * dinheiro nasce e morre no servidor, e o motivo está em `tests/contratos/rotas-espelhadas`.
 *
 * Rotas: POST `/api/metrics/seeds/gastar`, POST `/api/metrics/seeds/creditar`,
 * POST `/api/metrics/presenca`, GET `/api/metrics/maestria`, GET `/api/metrics/temporada`,
 * POST `/api/billing/gastar`.
 */
import { fusoDoAmbiente, type MaestriaDoJogo, type Temporada } from '@core'

import { apiFetch, type ErroDaApi,lerErro } from '../funil'

/**
 * Gasta seeds — idempotente por `spendId`.
 *
 * QUEM CHAMA GERA O `spendId` ANTES de enviar, e reenvia o MESMO id em qualquer retry. É isso que
 * impede o duplo-clique de cobrar duas vezes: o botão que gasta vive numa tela de fim de rodada,
 * onde se clica rápido, e o servidor precisa poder dizer "esta é a mesma compra".
 *
 * Devolve `null` em falha (rede ou recusa). Quem chamou deve tratar como "não comprou" e NÃO
 * entregar o benefício — ao contrário das outras leituras, aqui degradar em silêncio para o
 * valor cheio seria dar o item de graça.
 */
export async function gastarSeeds(input: {
  spendId: string
  amount: number
  reason: string
  ref?: string
}): Promise<{ jaExistia: boolean; gasto: number; seedsGastas: number } | null> {
  return (await gastarSeedsEx(input)).resultado
}

/**
 * O mesmo gasto, com o MOTIVO da recusa quando ela acontece.
 *
 * `gastarSeeds` devolvia `null` para tudo — rede fora, preço divergente, saldo insuficiente — e a
 * tela não tinha como dizer "faltam 12 Seeds", que é a única informação útil naquele momento. O
 * servidor manda `code` e `detalhes`; esta função os entrega a quem chama, e a versão antiga
 * continua existindo para quem só precisa saber se deu certo.
 */
export async function gastarSeedsEx(input: {
  spendId: string
  amount: number
  reason: string
  ref?: string
}): Promise<{ resultado: { jaExistia: boolean; gasto: number; seedsGastas: number } | null; erro?: ErroDaApi }> {
  try {
    const res = await apiFetch('/api/metrics/seeds/gastar', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(input),
    })
    if (!res.ok) return { resultado: null, erro: await lerErro(res) }
    return { resultado: await res.json() }
  } catch (e) {
    return { resultado: null, erro: { status: 0, error: String((e as Error)?.message ?? e), code: 'rede' } }
  }
}

/**
 * O REEMBOLSO DO CORTE DO CATÁLOGO (recompensas v2). O corpo é vazio: o servidor decide o que é
 * devido a partir do próprio razão. `creditado` é o que entrou AGORA (0 no reenvio); `reembolsado`
 * é o total já devolvido. `null` em falha — quem chama tenta de novo noutra sessão.
 */
export async function reembolsarSeeds(): Promise<{ creditado: number; reembolsado: number } | null> {
  try {
    const res = await apiFetch('/api/metrics/seeds/reembolso', { method: 'POST' })
    if (!res.ok) return null
    return (await res.json()) as { creditado: number; reembolsado: number }
  } catch {
    return null
  }
}

/** Um jogo na resposta da maestria: pontos e nível somados no servidor, e quanto falta. */
export interface MaestriaNoServidor extends MaestriaDoJogo {
  proximo: number | null
  pctNoNivel: number
}

/**
 * A MAESTRIA DOS 18 JOGOS (recompensas v2, onda 3). Os pontos são do servidor (linhas gravadas,
 * uma vez por `roundId`); `creditados` são os `maestria:<jogo>:<nível>` já lançados. `null` em
 * falha — a tela esconde a barra em vez de inventar número.
 */
export async function lerMaestria(): Promise<{ jogos: MaestriaNoServidor[]; creditados: string[] } | null> {
  try {
    const res = await apiFetch('/api/metrics/maestria')
    if (!res.ok) return null
    return (await res.json()) as { jogos: MaestriaNoServidor[]; creditados: string[] }
  } catch {
    return null
  }
}

/** A temporada como o servidor a vê: datas, XP da janela, nível, assinatura e casas já creditadas. */
export interface TemporadaNoServidor {
  temporada: Temporada | null
  proxima: Temporada | null
  xp: number
  nivel: number
  assinante: boolean
  creditados: string[]
}

/**
 * A TEMPORADA (recompensas v2, onda 5). O XP é o da conta ganho dentro da janela, somado no
 * servidor; `creditados` são os `temporada:<id>:<nível>:<trilha>` já lançados. `null` em falha — a
 * tela mostra as trilhas sem inventar progresso.
 */
export async function lerTemporada(): Promise<TemporadaNoServidor | null> {
  try {
    const res = await apiFetch('/api/metrics/temporada')
    if (!res.ok) return null
    return (await res.json()) as TemporadaNoServidor
  } catch {
    return null
  }
}

/* ── ECONOMIA v2 (2026-08-28) ── */

/** Registra a presença do dia. Idempotente por dia; `null` em falha (a tela não credita nada). */
export async function registrarPresenca(dia: number): Promise<{ jaExistia: boolean; dia: number; streakPresenca: number } | null> {
  try {
    const res = await apiFetch('/api/metrics/presenca', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ dia }),
    })
    if (!res.ok) return null
    return await res.json()
  } catch {
    return null
  }
}

/**
 * GASTA CRÉDITOS — a moeda comprada com dinheiro.
 *
 * Gêmeo de `gastarSeeds`, e o contrato é o mesmo: `spendId` é a chave de idempotência, e o
 * servidor recusa quando o `amount` não bate com o catálogo, em vez de cobrar em silêncio um
 * valor que a tela não mostrou.
 */

export async function gastarCreditos(payload: { spendId: string; amount: number; reason: string; ref?: string }):
  Promise<{ jaExistia: boolean; gasto: number; saldo: number } | null> {
  const r = await apiFetch('/api/billing/gastar', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });
  if (!r.ok) return null;
  return (await r.json()) as { jaExistia: boolean; gasto: number; saldo: number };
}

/**
 * Credita Seeds/XP de um evento — conquista ou cofre do passe. Idempotente por `creditoId`.
 *
 * O CORPO É SÓ O `creditoId`. `amount`, `xp` e `reason` saíram: quem decide quanto vale é
 * `valorDoCredito`, no servidor (e, sem conta, no servidor efêmero, com a mesma função). Enquanto
 * o valor vinha daqui, o cliente era a autoridade sobre a própria moeda.
 *
 * `item` só vem na família `drop:<roundId>`: é o id do cosmético que o SERVIDOR sorteou. Ele
 * estava sendo devolvido e descartado aqui — o bau concedia e ninguem via.
 *
 * `null` em falha — quem chamou NÃO marca a conquista, senão seria "conquistada sem as Seeds".
 */
/** O que o baú da rodada devolve além dos totais (recompensas v2). Só na família `drop:`. */
export interface RespostaDoBau {
  item?: string | null
  /** Faixa sorteada sem peça nova: virou Seeds (`seeds`). */
  repetido?: boolean
  /** Quanto ESTE baú pagou — não o saldo da conta. */
  seeds?: number
  raridade?: 'comum' | 'raro'
  chances?: { comum: number; raro: number }
  proximoRaroGarantidoEm?: number
  /** Teto do dia alcançado: nada foi creditado. */
  semBau?: 'teto'
  bausHoje?: number
  limite?: number
}

export async function creditarSeeds(input: {
  creditoId: string
}): Promise<({ jaExistia: boolean; seedsCreditadas: number; xpCreditado: number } & RespostaDoBau) | null> {
  try {
    /* O FUSO VAI JUNTO (recompensas v2): a meta do dia e o teto do baú contam o dia LOCAL de quem
       joga, e o servidor não tem outro jeito de saber qual é. Ausente, vale São Paulo. */
    const res = await apiFetch('/api/metrics/seeds/creditar', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ...input, fuso: fusoDoAmbiente() }),
    })
    if (!res.ok) return null
    return await res.json()
  } catch {
    return null
  }
}
