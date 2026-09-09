/**
 * O CLIENTE DAS ROTAS DE ECONOMIA — Seeds, presença, créditos e passe.
 *
 * Espelho de `src/data/efemero/rotas/economia.ts`. As três primeiras têm caminho HTTP de métrica,
 * mas o domínio é a economia — o mesmo corte é feito do outro lado. As rotas de cobrança
 * (`/api/billing/gastar`, `/api/billing/creditar-passe`) NÃO têm espelho: moeda comprada com
 * dinheiro nasce e morre no servidor, e o motivo está em `tests/contratos/rotas-espelhadas`.
 *
 * Rotas: POST `/api/metrics/seeds/gastar`, POST `/api/metrics/seeds/creditar`,
 * POST `/api/metrics/presenca`, POST `/api/billing/gastar`, POST `/api/billing/creditar-passe`.
 */
import { apiFetch, lerErro, type ErroDaApi } from '../api'

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
/**
 * OS CRÉDITOS DA TRILHA PAGA. O servidor decide QUAIS casas foram alcançadas (do nível que ele
 * mesmo calcula) e credita cada uma uma vez. Sem o passe devolve `creditado: 0` — não é erro,
 * é a resposta honesta de quem não comprou.
 */
export async function creditarPasse(): Promise<{ creditado: number; temPasse: boolean; saldo?: number } | null> {
  const r = await apiFetch('/api/billing/creditar-passe', { method: 'POST' });
  if (!r.ok) return null;
  return (await r.json()) as { creditado: number; temPasse: boolean; saldo?: number };
}

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
export async function creditarSeeds(input: {
  creditoId: string
}): Promise<{ jaExistia: boolean; seedsCreditadas: number; xpCreditado: number; item?: string | null } | null> {
  try {
    const res = await apiFetch('/api/metrics/seeds/creditar', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(input),
    })
    if (!res.ok) return null
    return await res.json()
  } catch {
    return null
  }
}
