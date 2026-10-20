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
import { statfsSync, statSync } from 'node:fs'
import path from 'node:path'

import { and, eq, isNull, lte, or, sql } from 'drizzle-orm'

import { definicaoDoPlano, type PlanoEfetivo } from '../../src/core/planos'
import { db, emTransacao, type ExecutorDb, linhas, linhasAfetadas, travarGlobal, travarUsuario } from '../db/db'
import { sessionsRepo } from '../db/repositories/sessions'
import { usageCounters, users } from '../db/schema'
import { armazenamentoDoAmbiente, armazenamentoExterno, NomeDeArquivoInvalido } from './armazenamento'
import type { UserId } from './authContext'
import { getPlanForUser } from './entitlements'
import { log } from './logger'
import { type EnvelopeDeErro, envelopeDeErro } from './respostaDeErro'
import { temDisco } from './runtime'
import { lerTetoDoR2, observarUsoDoR2, registrarRecusaDoR2, semTeto } from './tetoDoR2'

export const METRIC_STORAGE = 'storage_bytes'
export const WINDOW_STORAGE = 'total'

const MB = 1024 * 1024

function envMb(nome: string, padrao: number): number {
  const n = Number(process.env[nome])
  return Number.isFinite(n) && n > 0 ? n : padrao
}

/** Teto em BYTES por plano — default da MATRIZ, override por env (`PREMIUM_STORAGE_MB`, `FREE_STORAGE_MB`…). */
export function capDeArmazenamento(plan: PlanoEfetivo): number {
  const padraoMb = definicaoDoPlano(plan).quotas.armazenamentoMb
  if (padraoMb === null) return Infinity
  return Math.floor(envMb(`${plan.toUpperCase()}_STORAGE_MB`, padraoMb) * MB)
}

export interface ResultadoDeCota {
  ok: boolean
  capBytes: number
  usadoBytes: number
  /**
   * 'usuario' = o teto do plano da pessoa; 'conta' = o teto global do R2 (`R2_TETO_MB`), que não é
   * culpa dela; 'indisponivel' = não deu para decidir (degradou fechado).
   */
  motivo?: 'usuario' | 'conta' | 'indisponivel'
}

/** Espelha `AUDIO_DIR` de server/routes/sessions.ts, lido em CHAMADA — importá-lo criaria ciclo. */
export function diretorioDeAudio(): string {
  return process.env.AUDIO_DIR ? path.resolve(process.env.AUDIO_DIR) : path.join(process.cwd(), 'data', 'audio')
}

/** Tamanho de um arquivo, 0 se ele não existe. */
export function tamanhoNoDisco(caminho: string): number {
  try {
    return statSync(caminho).size
  } catch {
    return 0
  }
}

async function lerUso(userId: UserId): Promise<number | null> {
  const rows = await db
    .select({ count: usageCounters.count })
    .from(usageCounters)
    .where(
      and(
        eq(usageCounters.userId, userId),
        eq(usageCounters.metric, METRIC_STORAGE),
        eq(usageCounters.window, WINDOW_STORAGE),
      ),
    )
    .limit(1)
  return rows[0]?.count ?? null
}

/**
 * Bytes que o usuário realmente ocupa no STORE (fonte da reconciliação). Passa pelo seam F5-02 para
 * a conta continuar valendo quando a mídia estiver em S3 — `armazenamentoDoAmbiente` é criado aqui,
 * e não importado de `routes/sessions`, porque aquele módulo importa ESTE (ciclo).
 */
export async function somarBytesEmDisco(userId: UserId, audioDir = diretorioDeAudio()): Promise<number> {
  // Sem teto: medir para a cota não pode depender do teto mensal do R2 (subcontagem burlaria a cota).
  const store = semTeto(armazenamentoDoAmbiente(path.resolve(audioDir)))
  let total = 0
  for (const s of await sessionsRepo.list(userId)) {
    let nome: unknown
    try {
      nome = s.meta ? (JSON.parse(s.meta) as Record<string, unknown>).audioFile : null
    } catch {
      continue
    }
    if (typeof nome !== 'string' || !nome) continue
    /* S-14: nome que escaparia do diretório lança no store e não entra na conta. Objeto ausente já
       volta `null`. QUALQUER OUTRA falha (rede, R2) sobe: somar 0 gravaria subcontagem na
       reconciliação, e a pessoa ganharia cota que não tem. */
    try {
      total += (await store.tamanho(nome)) ?? 0
    } catch (err) {
      if (err instanceof NomeDeArquivoInvalido) continue
      throw err
    }
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
    .values({
      id: randomUUID(),
      userId,
      createdAt: now,
      updatedAt: now,
      metric: METRIC_STORAGE,
      window: WINDOW_STORAGE,
      count: disco,
    })
    .onConflictDoNothing()
  return disco
}

/** Decide e contabiliza numa instrução só: quem perde a corrida não afeta linha nenhuma. */
async function reservaAtomica(userId: UserId, bytes: number, cap: number, ex: ExecutorDb = db): Promise<boolean> {
  const now = Date.now()
  const r = await ex
    .insert(usageCounters)
    .values({
      id: randomUUID(),
      userId,
      createdAt: now,
      updatedAt: now,
      metric: METRIC_STORAGE,
      window: WINDOW_STORAGE,
      count: bytes,
    })
    .onConflictDoUpdate({
      target: [usageCounters.userId, usageCounters.metric, usageCounters.window],
      set: { count: sql`${usageCounters.count} + ${bytes}`, updatedAt: now },
      setWhere: sql`${usageCounters.count} + ${bytes} <= ${cap}`,
    })
  return linhasAfetadas(r) > 0
}

/** Nome da trava global do teto da conta no R2 (`travarGlobal`). */
const TRAVA_DO_TETO_DA_CONTA = 'r2-teto-armazenamento'

/** Teto da CONTA em bytes: só com o R2 (binding ou S3; no disco a folga do volume é quem protege). */
function tetoDaConta(): number {
  return armazenamentoExterno() ? lerTetoDoR2().bytes : Infinity
}

/**
 * Reserva com o TETO DA CONTA (decisão 2 de `openspec/changes/r2-teto-de-uso`). Ler a soma da conta e
 * depois reservar é read-then-write: dois uploads de usuários diferentes leriam a mesma soma e passariam
 * juntos pelo teto. Por isso a soma e a reserva vão numa transação com a trava do usuário e, depois
 * dela, a trava GLOBAL — quem chega segundo espera e já lê a soma com a reserva do primeiro.
 */
async function reservaComTetoDaConta(
  userId: UserId,
  bytes: number,
  cap: number,
  teto: number,
): Promise<'ok' | 'usuario' | 'conta'> {
  const { resultado, soma } = await emTransacao(async (tx) => {
    await travarUsuario(tx, userId)
    await travarGlobal(tx, TRAVA_DO_TETO_DA_CONTA)
    const soma = await somaDaConta(tx)
    if (soma + bytes > teto) return { resultado: 'conta' as const, soma }
    const ok = await reservaAtomica(userId, bytes, cap, tx)
    return ok ? { resultado: 'ok' as const, soma: soma + bytes } : { resultado: 'usuario' as const, soma }
  })
  // Aviso e métrica FORA da transação: log não segura trava.
  if (resultado === 'conta') registrarRecusaDoR2('armazenamento', teto)
  observarUsoDoR2('armazenamento', soma, teto, WINDOW_STORAGE)
  return resultado
}

/** Bytes guardados somando todos os usuários (o contador de cada um, metric `storage_bytes`). */
async function somaDaConta(ex: ExecutorDb): Promise<number> {
  const r = await ex.execute(
    sql`select coalesce(sum(${usageCounters.count}), 0)::bigint as total from ${usageCounters} where ${usageCounters.metric} = ${METRIC_STORAGE} and ${usageCounters.window} = ${WINDOW_STORAGE}`,
  )
  return Number(linhas<{ total: number | string }>(r)[0]?.total ?? 0)
}

/**
 * RESERVA `bytes` — chame ANTES de o arquivo tocar o disco. `bytes` negativo (reupload menor)
 * devolve espaço. Plano vem de `getPlanForUser`; `settings.ui.plan` nunca é consultado.
 */
/**
 * FOLGA DO VOLUME. Sem S3 o áudio mora no MESMO volume do banco, e o teto é por conta: várias contas
 * dentro do teto enchem o disco e derrubam o SQLite junto. Abaixo desta folga o upload é recusado
 * (`indisponivel`) e o resto do app segue. Com S3 ou o binding R2, sem disco (Worker: não há `statfs`), ou
 * sem `AUDIO_DIR` legível, não se aplica.
 */
const FOLGA_MINIMA_DO_VOLUME = 200 * 1024 * 1024

export function volumeSemFolga(bytes: number, env: NodeJS.ProcessEnv = process.env): boolean {
  if (!temDisco() || armazenamentoExterno(env) || !env.AUDIO_DIR) return false
  try {
    const s = statfsSync(env.AUDIO_DIR)
    return s.bavail * s.bsize - bytes < FOLGA_MINIMA_DO_VOLUME
  } catch {
    return false
  }
}

export async function reservarArmazenamento(userId: UserId, bytes: number): Promise<ResultadoDeCota> {
  const b = Math.ceil(bytes)
  try {
    if (b > 0 && volumeSemFolga(b)) {
      log('error', { event: 'storage_volume_sem_folga' })
      return { ok: false, capBytes: 0, usadoBytes: 0, motivo: 'indisponivel' }
    }
    const cap = capDeArmazenamento(await getPlanForUser(userId))
    if (!Number.isFinite(cap)) return { ok: true, capBytes: cap, usadoBytes: 0 } // selfhost: nem contabiliza
    if (b <= 0) {
      if (b < 0) await liberarArmazenamento(userId, -b)
      return { ok: true, capBytes: cap, usadoBytes: (await lerUso(userId)) ?? 0 }
    }
    const teto = tetoDaConta()
    const usado = await semearSeAusente(userId)
    // Guarda do caminho de INSERT (linha ausente), que não passa pelo `setWhere`.
    if (b > cap) return { ok: false, capBytes: cap, usadoBytes: usado, motivo: 'usuario' }
    const r = Number.isFinite(teto)
      ? await reservaComTetoDaConta(userId, b, cap, teto)
      : (await reservaAtomica(userId, b, cap))
        ? 'ok'
        : 'usuario'
    if (r === 'ok') return { ok: true, capBytes: cap, usadoBytes: usado + b }
    if (r === 'conta') return { ok: false, capBytes: cap, usadoBytes: usado, motivo: 'conta' }
    return { ok: false, capBytes: cap, usadoBytes: (await lerUso(userId)) ?? usado, motivo: 'usuario' }
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
      .set({ count: sql`GREATEST(0, ${usageCounters.count} - ${b})`, updatedAt: Date.now() })
      .where(
        and(
          eq(usageCounters.userId, userId),
          eq(usageCounters.metric, METRIC_STORAGE),
          eq(usageCounters.window, WINDOW_STORAGE),
        ),
      )
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
      .values({
        id: randomUUID(),
        userId,
        createdAt: now,
        updatedAt: now,
        metric: METRIC_STORAGE,
        window: WINDOW_STORAGE,
        count: d,
      })
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
    .values({
      id: randomUUID(),
      userId,
      createdAt: now,
      updatedAt: now,
      metric: METRIC_STORAGE,
      window: WINDOW_STORAGE,
      count: disco,
    })
    .onConflictDoUpdate({
      target: [usageCounters.userId, usageCounters.metric, usageCounters.window],
      set: { count: disco, updatedAt: now },
    })
  return disco
}

/**
 * MODO DA RECONCILIAÇÃO. `oportunista` (padrão) varre no caminho do `GET /api/me/entitlements`;
 * `job` tira a varredura desse caminho e deixa quem opera chamar
 * `POST /api/admin/armazenamento/reconciliar` por cron.
 *
 * O modo existe porque a varredura é O(n sessões) com `stat`/`HEAD` por arquivo, e ela acontecia
 * dentro de uma rota que TODO usuário ativo atravessa. Num deploy grande isso é trabalho de
 * limpeza pago pela latência de quem está usando o app.
 */
export function modoDeReconciliacao(): 'oportunista' | 'job' {
  return process.env.STORAGE_RECONCILE_MODE === 'job' ? 'job' : 'oportunista'
}

/** Janela de frescor do contador. `STORAGE_RECONCILE_HOURS=0` desliga a reconciliação oportunista. */
function horasDeReconciliacao(): number {
  const bruto = process.env.STORAGE_RECONCILE_HOURS
  if (bruto === undefined || bruto === '') return 24
  const n = Number(bruto)
  return Number.isFinite(n) && n >= 0 ? n : 24
}

/**
 * A RECONCILIAÇÃO EM LOTE (`STORAGE_RECONCILE_MODE=job`): os até `limite` usuários cujo contador está
 * mais velho que `horas` (ou nem existe), do mais velho para o mais novo, reconciliados em sequência.
 * Quem chama: o job `reconciliarArmazenamento` do registro (com teto por passada; o que sobrar sai na
 * seguinte) e `POST /api/admin/armazenamento/reconciliar` (todo mundo, `horas: 0`).
 *
 * Sequencial de propósito: é trabalho de limpeza, e paralelizar `stat`/`HEAD` sobre o mesmo disco ou
 * balde só antecipa a contenção que o modo `job` existe para evitar. A falha de um usuário é logada e
 * a varredura segue.
 */
export async function reconciliarVencidos(o: { limite: number; horas?: number; audioDir?: string }): Promise<{
  candidatos: number
  reconciliados: number
  falhas: number
  porUsuario: Array<{ userId: string; bytes: number }>
}> {
  const horas = o.horas ?? (horasDeReconciliacao() || 24)
  const corte = Math.floor(Date.now() - horas * 3_600_000)
  const candidatos = await db
    .select({ id: users.id })
    .from(users)
    .leftJoin(
      usageCounters,
      and(
        eq(usageCounters.userId, users.id),
        eq(usageCounters.metric, METRIC_STORAGE),
        eq(usageCounters.window, WINDOW_STORAGE),
      ),
    )
    .where(or(isNull(usageCounters.updatedAt), lte(usageCounters.updatedAt, corte)))
    .orderBy(sql`${usageCounters.updatedAt} ASC NULLS FIRST`, users.id)
    .limit(o.limite)
  const porUsuario: Array<{ userId: string; bytes: number }> = []
  let falhas = 0
  for (const { id } of candidatos) {
    try {
      porUsuario.push({ userId: id, bytes: await reconciliarArmazenamento(id as UserId, o.audioDir) })
    } catch (err) {
      falhas++
      log('warn', {
        event: 'storage_reconcile_job_failed',
        error: String((err as Error)?.message ?? err).slice(0, 120),
      })
    }
  }
  return { candidatos: candidatos.length, reconciliados: porUsuario.length, falhas, porUsuario }
}

/**
 * Reivindica a janela de varredura. Devolve `true` para NO MÁXIMO um chamador por janela.
 *
 * O carimbo de `updatedAt` é a própria reserva: um `UPDATE ... WHERE updated_at <= limite` só
 * afeta linha se ninguém tiver carimbado antes, e o SQLite serializa as escritas. Quando a linha
 * ainda não existe, o INSERT com `onConflictDoNothing` faz o mesmo papel: quem consegue criar,
 * varre.
 *
 * Efeito colateral aceito e declarado: se a varredura falhar depois da reivindicação, o contador
 * fica com o valor antigo até a próxima janela. Era assim antes também — o que muda é não pagar a
 * varredura duas vezes.
 *
 * EXPORTADA PARA O TESTE, e isso é deliberado: espionar a chamada interna de `reconciliarSeVencido`
 * não funciona (a referência é interna ao módulo, o espião fica do lado de fora), então o teste de
 * concorrência afirma sobre o MECANISMO — dez reivindicações simultâneas, uma verdadeira.
 */
export async function reivindicarJanela(userId: UserId, horas: number): Promise<boolean> {
  const agora = Date.now()
  // Inteiro: `updated_at` é bigint e o Postgres recusa um parâmetro fracionário (horas como 0,5).
  const limite = Math.floor(agora - horas * 3_600_000)
  const criado = await db
    .insert(usageCounters)
    .values({
      id: randomUUID(),
      userId,
      createdAt: agora,
      updatedAt: agora,
      metric: METRIC_STORAGE,
      window: WINDOW_STORAGE,
      count: 0,
    })
    .onConflictDoNothing({ target: [usageCounters.userId, usageCounters.metric, usageCounters.window] })
  if (linhasAfetadas(criado) > 0) return true

  const marcado = await db
    .update(usageCounters)
    .set({ updatedAt: agora })
    .where(
      and(
        eq(usageCounters.userId, userId),
        eq(usageCounters.metric, METRIC_STORAGE),
        eq(usageCounters.window, WINDOW_STORAGE),
        lte(usageCounters.updatedAt, limite),
      ),
    )
  return linhasAfetadas(marcado) > 0
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
      .where(
        and(
          eq(usageCounters.userId, userId),
          eq(usageCounters.metric, METRIC_STORAGE),
          eq(usageCounters.window, WINDOW_STORAGE),
        ),
      )
      .limit(1)
    const linha = rows[0]
    if (horas === 0) return linha?.count ?? 0
    // Modo job: a varredura sai do caminho de quem está usando o app (ver `modoDeReconciliacao`).
    if (modoDeReconciliacao() === 'job') return linha?.count ?? 0
    if (linha && Number(linha.updatedAt) > Date.now() - horas * 3_600_000) return linha.count
    /* A JANELA É REIVINDICADA ANTES DE VARRER. Ler-decidir-varrer é uma corrida clássica: duas
       requisições simultâneas do mesmo usuário liam o mesmo `updatedAt` vencido e varriam as duas,
       dobrando o `stat` por arquivo (achado A33). A reivindicação é um UPDATE condicional — quem
       consegue mudar a linha varre, quem não consegue devolve o número que já existe. */
    if (!(await reivindicarJanela(userId, horas))) return linha?.count ?? (await lerUso(userId)) ?? 0
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
export function corpoDeRecusa(r: ResultadoDeCota): { status: number; body: EnvelopeDeErro } {
  if (r.motivo === 'indisponivel') {
    return {
      status: 503,
      body: envelopeDeErro('não foi possível verificar a cota de armazenamento agora', 'storage_quota_unavailable'),
    }
  }
  if (r.motivo === 'conta') {
    // Neutra de propósito: não é culpa da pessoa e não revela números da conta.
    return {
      status: 507,
      body: envelopeDeErro('o serviço está no limite de armazenamento; tente mais tarde', 'r2_teto_armazenamento'),
    }
  }
  const mb = (b: number) => Math.round((b / MB) * 10) / 10
  /* `usedBytes`/`capBytes` em `detalhes`, e não soltos no topo: é o envelope único (achado A30).
     Eles existem para a tela dizer "1,8 GB de 2 GB" em vez de "armazenamento cheio". */
  return {
    status: 507,
    body: envelopeDeErro(
      `armazenamento cheio: ${mb(r.usadoBytes)} MB de ${mb(r.capBytes)} MB usados. Apague sessões antigas ou mude de plano.`,
      'storage_quota_exceeded',
      { usedBytes: r.usadoBytes, capBytes: r.capBytes },
    ),
  }
}
