/**
 * COTA DE ARMAZENAMENTO por usuário (F4-03). Irmã de `usageQuota.ts`, com duas diferenças de fundo:
 *
 *  - o recurso é BYTE EM DISCO, e o disco é o MESMO volume de `DATABASE_URL` — enchê-lo derruba o
 *    banco junto. Por isso degrada FECHADO: falha ao resolver a cota recusa o upload, ao contrário
 *    do fair-use de IA, que nunca bloqueia pagante por falha de infra.
 *  - armazenamento é ESTOQUE, não fluxo: a janela é fixa (`total`), não reseta por mês.
 *
 * DECISÃO (contador × soma do disco): CONTADOR em `usage_counters`. Somar o disco a cada upload é
 * O(n) sobre a base inteira (já são 688 arquivos com UM usuário) e, pior, é read-then-write — a
 * mesma race que o P0-1 (20 chamadas aceitas contra teto de 5). O contador decide e contabiliza na
 * MESMA instrução. A divergência que ele admite é tratada por reconciliação: `semearSeAusente`
 * inicializa do disco na primeira vez (cobre as linhas que já existem) e `reconciliarArmazenamento`
 * reescreve o contador a partir do disco quando se quiser conferir.
 */
import { randomUUID } from 'node:crypto'
import { statSync } from 'node:fs'
import path from 'node:path'
import { and, eq, sql } from 'drizzle-orm'
import { db } from '../db/db'
import { usageCounters } from '../db/schema'
import { sessionsRepo } from '../db/repositories/sessions'
import { armazenamentoDoAmbiente } from './armazenamento'
import type { UserId } from './authContext'
import { getPlanForUser } from './entitlements'
import type { Plan } from '../db/repositories/subscriptions'
import { log } from './logger'

export const METRIC_STORAGE = 'storage_bytes'
export const WINDOW_STORAGE = 'total'

const MB = 1024 * 1024

function envMb(nome: string, padrao: number): number {
  const n = Number(process.env[nome])
  return Number.isFinite(n) && n > 0 ? n : padrao
}

/** Teto em BYTES por plano. selfhost ∞ (mesma regra da quota de IA); pro e free do env. */
export function capDeArmazenamento(plan: Plan): number {
  if (plan === 'selfhost') return Infinity
  const mb = plan === 'pro' ? envMb('PRO_STORAGE_MB', 5_000) : envMb('FREE_STORAGE_MB', 500)
  return Math.floor(mb * MB)
}

export interface ResultadoDeCota {
  ok: boolean
  capBytes: number
  usadoBytes: number
  /** 'cheio' = teto atingido; 'indisponivel' = não deu para decidir (degradou fechado). */
  motivo?: 'cheio' | 'indisponivel'
}

/** Espelha `AUDIO_DIR` de server/routes/sessions.ts, lido em CHAMADA — importá-lo criaria ciclo. */
export function diretorioDeAudio(): string {
  return process.env.AUDIO_DIR ? path.resolve(process.env.AUDIO_DIR) : path.join(process.cwd(), 'data', 'audio')
}

/** Tamanho de um arquivo, 0 se ele não existe. */
export function tamanhoNoDisco(caminho: string): number {
  try { return statSync(caminho).size } catch { return 0 }
}

async function lerUso(userId: UserId): Promise<number | null> {
  const rows = await db
    .select({ count: usageCounters.count })
    .from(usageCounters)
    .where(and(
      eq(usageCounters.userId, userId),
      eq(usageCounters.metric, METRIC_STORAGE),
      eq(usageCounters.window, WINDOW_STORAGE),
    ))
    .limit(1)
  return rows[0]?.count ?? null
}

/**
 * Bytes que o usuário realmente ocupa no STORE (fonte da reconciliação). Passa pelo seam F5-02 para
 * a conta continuar valendo quando a mídia estiver em S3 — `armazenamentoDoAmbiente` é criado aqui,
 * e não importado de `routes/sessions`, porque aquele módulo importa ESTE (ciclo).
 */
export async function somarBytesEmDisco(userId: UserId, audioDir = diretorioDeAudio()): Promise<number> {
  const store = armazenamentoDoAmbiente(path.resolve(audioDir))
  let total = 0
  for (const s of await sessionsRepo.list(userId)) {
    let nome: unknown
    try { nome = s.meta ? (JSON.parse(s.meta) as Record<string, unknown>).audioFile : null } catch { continue }
    if (typeof nome !== 'string' || !nome) continue
    // S-14: nome que escaparia do diretório lança no store e não entra na conta.
    try { total += (await store.tamanho(nome)) ?? 0 } catch { continue }
  }
  return total
}

/**
 * Cria a linha do contador a partir do DISCO quando ela ainda não existe — é o que impede que os
 * arquivos já gravados (176,9 MB hoje) entrem como zero. `onConflictDoNothing` para que semear
 * concorrente com uma reserva nunca sobrescreva a reserva.
 */
async function semearSeAusente(userId: UserId): Promise<number> {
  const atual = await lerUso(userId)
  if (atual !== null) return atual
  const disco = await somarBytesEmDisco(userId)
  const now = Date.now()
  await db
    .insert(usageCounters)
    .values({ id: randomUUID(), userId, createdAt: now, updatedAt: now, metric: METRIC_STORAGE, window: WINDOW_STORAGE, count: disco })
    .onConflictDoNothing()
  return disco
}

/** Decide e contabiliza numa instrução só: quem perde a corrida não afeta linha nenhuma. */
async function reservaAtomica(userId: UserId, bytes: number, cap: number): Promise<boolean> {
  const now = Date.now()
  const r = await db
    .insert(usageCounters)
    .values({ id: randomUUID(), userId, createdAt: now, updatedAt: now, metric: METRIC_STORAGE, window: WINDOW_STORAGE, count: bytes })
    .onConflictDoUpdate({
      target: [usageCounters.userId, usageCounters.metric, usageCounters.window],
      set: { count: sql`${usageCounters.count} + ${bytes}`, updatedAt: now },
      setWhere: sql`${usageCounters.count} + ${bytes} <= ${cap}`,
    })
  return r.rowsAffected > 0
}

/**
 * RESERVA `bytes` — chame ANTES de o arquivo tocar o disco. `bytes` negativo (reupload menor)
 * devolve espaço. Plano vem de `getPlanForUser`; `settings.ui.plan` nunca é consultado.
 */
export async function reservarArmazenamento(userId: UserId, bytes: number): Promise<ResultadoDeCota> {
  const b = Math.ceil(bytes)
  try {
    const cap = capDeArmazenamento(await getPlanForUser(userId))
    if (!Number.isFinite(cap)) return { ok: true, capBytes: cap, usadoBytes: 0 } // selfhost: nem contabiliza
    if (b <= 0) {
      if (b < 0) await liberarArmazenamento(userId, -b)
      return { ok: true, capBytes: cap, usadoBytes: (await lerUso(userId)) ?? 0 }
    }
    const usado = await semearSeAusente(userId)
    // Guarda do caminho de INSERT (linha ausente), que não passa pelo `setWhere`.
    if (b > cap) return { ok: false, capBytes: cap, usadoBytes: usado, motivo: 'cheio' }
    if (await reservaAtomica(userId, b, cap)) return { ok: true, capBytes: cap, usadoBytes: usado + b }
    return { ok: false, capBytes: cap, usadoBytes: (await lerUso(userId)) ?? usado, motivo: 'cheio' }
  } catch (err) {
    log('error', { event: 'storage_quota_failed_closed', error: String((err as Error)?.message || err).slice(0, 120) })
    return { ok: false, capBytes: 0, usadoBytes: 0, motivo: 'indisponivel' }
  }
}

/** DEVOLVE bytes ao contador (arquivo removido, ou escrita que falhou depois da reserva). */
export async function liberarArmazenamento(userId: UserId, bytes: number): Promise<void> {
  const b = Math.ceil(bytes)
  if (b <= 0) return
  try {
    await db
      .update(usageCounters)
      .set({ count: sql`max(0, ${usageCounters.count} - ${b})`, updatedAt: Date.now() })
      .where(and(
        eq(usageCounters.userId, userId),
        eq(usageCounters.metric, METRIC_STORAGE),
        eq(usageCounters.window, WINDOW_STORAGE),
      ))
  } catch (err) {
    log('warn', { event: 'storage_release_failed', error: String((err as Error)?.message || err).slice(0, 120) })
  }
}

/**
 * Corrige uma reserva feita por ESTIMATIVA depois que o tamanho real é conhecido (download do
 * YouTube). Delta positivo soma SEM teto de propósito: o arquivo já está no disco e negá-lo agora
 * não devolveria byte nenhum — estourar o contador bloqueia o PRÓXIMO upload, que é o efeito certo.
 */
export async function ajustarArmazenamento(userId: UserId, delta: number): Promise<void> {
  const d = Math.round(delta)
  if (d === 0) return
  if (d < 0) return liberarArmazenamento(userId, -d)
  try {
    const now = Date.now()
    await db
      .insert(usageCounters)
      .values({ id: randomUUID(), userId, createdAt: now, updatedAt: now, metric: METRIC_STORAGE, window: WINDOW_STORAGE, count: d })
      .onConflictDoUpdate({
        target: [usageCounters.userId, usageCounters.metric, usageCounters.window],
        set: { count: sql`${usageCounters.count} + ${d}`, updatedAt: now },
      })
  } catch (err) {
    log('warn', { event: 'storage_adjust_failed', error: String((err as Error)?.message || err).slice(0, 120) })
  }
}

/** Uso contabilizado (diagnóstico/teste). */
export async function usoDeArmazenamento(userId: UserId): Promise<number> {
  return (await lerUso(userId)) ?? 0
}

/** RECONCILIAÇÃO: reescreve o contador a partir do disco. Devolve os bytes medidos. */
export async function reconciliarArmazenamento(userId: UserId, audioDir = diretorioDeAudio()): Promise<number> {
  const disco = await somarBytesEmDisco(userId, audioDir)
  const now = Date.now()
  await db
    .insert(usageCounters)
    .values({ id: randomUUID(), userId, createdAt: now, updatedAt: now, metric: METRIC_STORAGE, window: WINDOW_STORAGE, count: disco })
    .onConflictDoUpdate({
      target: [usageCounters.userId, usageCounters.metric, usageCounters.window],
      set: { count: disco, updatedAt: now },
    })
  return disco
}

/** Janela de frescor do contador. `STORAGE_RECONCILE_HOURS=0` desliga a reconciliação oportunista. */
function horasDeReconciliacao(): number {
  const bruto = process.env.STORAGE_RECONCILE_HOURS
  if (bruto === undefined || bruto === '') return 24
  const n = Number(bruto)
  return Number.isFinite(n) && n >= 0 ? n : 24
}

/**
 * F9-02 — o CHAMADOR de `reconciliarArmazenamento`, que não existia.
 *
 * Oportunista, no `GET /api/me/entitlements`: é a única rota por onde todo usuário ativo passa, ela
 * já lê o contador para mostrar o uso, e a divergência a corrigir (arquivo órfão de upload que
 * falhou, remoção que não liberou) só importa quando ALGUÉM olha o número. Um job periódico exigiria
 * scheduler — infra que este servidor não tem. O custo é limitado pela janela: no máximo uma varredura
 * por usuário a cada `STORAGE_RECONCILE_HOURS` (24h por padrão).
 *
 * Nunca lança: a rota de entitlements não pode cair por causa de uma correção de contador.
 */
export async function reconciliarSeVencido(userId: UserId, audioDir = diretorioDeAudio()): Promise<number> {
  const horas = horasDeReconciliacao()
  try {
    const rows = await db
      .select({ count: usageCounters.count, updatedAt: usageCounters.updatedAt })
      .from(usageCounters)
      .where(and(
        eq(usageCounters.userId, userId),
        eq(usageCounters.metric, METRIC_STORAGE),
        eq(usageCounters.window, WINDOW_STORAGE),
      ))
      .limit(1)
    const linha = rows[0]
    if (horas === 0) return linha?.count ?? 0
    if (linha && Number(linha.updatedAt) > Date.now() - horas * 3_600_000) return linha.count
    return await reconciliarArmazenamento(userId, audioDir)
  } catch (err) {
    log('warn', { event: 'storage_reconcile_failed', error: String((err as Error)?.message || err).slice(0, 120) })
    return (await lerUso(userId).catch(() => 0)) ?? 0
  }
}

/** O yt-dlp não informa o tamanho antes de baixar: 16 KB/s (~128 kbps), piso de 1 MB. */
export function estimarBytesDeAudio(durationMs?: number | null): number {
  const s = Number(durationMs) > 0 ? Number(durationMs) / 1000 : 0
  return Math.max(MB, Math.ceil(s * 16 * 1024))
}

/** Resposta HTTP da recusa, igual nas duas rotas que gravam arquivo. */
export function corpoDeRecusa(r: ResultadoDeCota): { status: number; body: Record<string, unknown> } {
  if (r.motivo === 'indisponivel') {
    return { status: 503, body: { error: 'não foi possível verificar a cota de armazenamento agora', code: 'storage_quota_unavailable' } }
  }
  const mb = (b: number) => Math.round((b / MB) * 10) / 10
  return {
    status: 507,
    body: {
      error: `armazenamento cheio: ${mb(r.usadoBytes)} MB de ${mb(r.capBytes)} MB usados. Apague sessões antigas ou mude de plano.`,
      code: 'storage_quota_exceeded',
      usedBytes: r.usadoBytes,
      capBytes: r.capBytes,
    },
  }
}
