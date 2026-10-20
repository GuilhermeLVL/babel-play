/**
 * O EXECUTOR DOS JOBS (Fase 2, Task 9): o mesmo caminho para o `setTimeout` do Node, o `scheduled` do
 * Worker e o `npm run job -- <nome>` de quem opera.
 *
 * A LEASE. O Cron Trigger pode disparar a mesma expressão em dois isolates ao mesmo tempo, e um job longo
 * (a limpeza diária, a retenção de áudio) não cabe numa transação: segurar `travarGlobal` por minutos
 * prenderia uma conexão do Hyperdrive e uma transação aberta no Postgres. Então a passada toma uma LEASE —
 * a linha `g:job:<nome>` da tabela `travas`, com `criado_em` = quando foi tomada — numa instrução só, em
 * autocommit:
 *
 *   INSERT … ON CONFLICT (chave) DO UPDATE SET criado_em = <agora> WHERE travas.criado_em < <agora − prazo>
 *   RETURNING chave
 *
 * Linha nova ou vencida: a instrução devolve a linha e esta passada roda. Linha recente: não devolve nada,
 * e a passada é `job_pulado` (outra está rodando). No fim (dando certo ou não), a linha sai — só se ainda
 * for a NOSSA (`criado_em` igual ao que gravamos): se o prazo venceu e outra passada a tomou, não a
 * soltamos por ela. Uma passada que morreu no meio (isolate derrubado, processo morto) deixa a linha, que
 * vence em `PRAZO_DA_LEASE_MS` (15 min, o teto de duração de um Cron Trigger): a próxima roda.
 *
 * O MESMO MECANISMO PARA TODOS OS JOBS, curtos ou longos. Os jobs já são idempotentes (apagar o que venceu
 * duas vezes não apaga nada a mais); a lease tira o trabalho em dobro e as corridas entre duas passadas.
 * O prefixo `g:` é o espaço das travas globais (`travarGlobal`); a poda de `travas` da limpeza diária só
 * mexe em `u:`.
 */
import { sql } from 'drizzle-orm'

import { db, linhas } from '../db/db'
import { log } from '../lib/logger'
import { type Job, JOBS } from './registro'

/** Prazo da lease: depois disso, uma passada que não soltou a linha é dada como morta. */
export const PRAZO_DA_LEASE_MS = 15 * 60_000

export interface ResultadoDoJob {
  nome: string
  estado: 'ok' | 'pulado' | 'falhou'
  /** Por que foi pulado: condição falsa ou outra passada com a lease. */
  motivo?: 'condicao' | 'em_andamento'
  resumo?: Record<string, number | boolean>
  ms: number
}

export interface OpcoesDoExecutor {
  agora?: number
  env?: NodeJS.ProcessEnv
  /** O registro (os testes passam jobs falsos); padrão, `JOBS`. */
  jobs?: readonly Job[]
}

const chaveDaLease = (nome: string) => `g:job:${nome}`

/** Toma a lease; devolve o carimbo gravado (o "token" para soltar) ou `null` se outra passada a tem. */
async function tomarLease(nome: string): Promise<number | null> {
  const carimbo = Date.now()
  const r = await db.execute(sql`INSERT INTO travas (chave, criado_em) VALUES (${chaveDaLease(nome)}, ${carimbo})
    ON CONFLICT (chave) DO UPDATE SET criado_em = EXCLUDED.criado_em
    WHERE travas.criado_em < ${carimbo - PRAZO_DA_LEASE_MS}
    RETURNING chave`)
  return linhas(r).length > 0 ? carimbo : null
}

async function soltarLease(nome: string, carimbo: number): Promise<void> {
  try {
    await db.execute(sql`DELETE FROM travas WHERE chave = ${chaveDaLease(nome)} AND criado_em = ${carimbo}`)
  } catch (err) {
    // Sem soltar, a lease vence sozinha no prazo; a próxima passada só espera mais.
    log('warn', { event: 'job_lease_nao_solta', job: nome, error: mensagem(err) })
  }
}

const mensagem = (err: unknown) => String((err as Error)?.message ?? err).slice(0, 300)

/** Só números e booleanos do resumo vão para o log (nada de id de usuário, por construção). */
function resumoNumerico(r: unknown): Record<string, number | boolean> {
  const out: Record<string, number | boolean> = {}
  if (!r || typeof r !== 'object') return out
  for (const [k, v] of Object.entries(r)) if (typeof v === 'number' || typeof v === 'boolean') out[k] = v
  return out
}

/**
 * Roda UMA passada do job `nome`: condição → lease → `rodar` → solta a lease. Nunca lança por falha do
 * job (devolve `falhou` e loga `job_falhou`): o agendador do Node e o `scheduled` seguem. Lança só para
 * nome desconhecido (erro de quem chamou).
 */
export async function executarJob(nome: string, o: OpcoesDoExecutor = {}): Promise<ResultadoDoJob> {
  const job = (o.jobs ?? JOBS).find((j) => j.nome === nome)
  if (!job) throw new Error(`job desconhecido: ${nome}`)
  const env = o.env ?? process.env
  const inicio = Date.now()

  if (job.condicao && !job.condicao(env)) {
    log('info', { event: 'job_pulado', job: nome, situacao: 'condicao' })
    return { nome, estado: 'pulado', motivo: 'condicao', ms: 0 }
  }
  const carimbo = await tomarLease(nome)
  if (carimbo === null) {
    log('info', { event: 'job_pulado', job: nome, situacao: 'em_andamento' })
    return { nome, estado: 'pulado', motivo: 'em_andamento', ms: Date.now() - inicio }
  }

  log('info', { event: 'job_inicio', job: nome })
  try {
    const resumo = resumoNumerico(await job.rodar({ agora: o.agora ?? Date.now(), env }))
    const ms = Date.now() - inicio
    log('info', { event: 'job_fim', job: nome, latencyMs: ms, resumo })
    return { nome, estado: 'ok', resumo, ms }
  } catch (err) {
    const ms = Date.now() - inicio
    log('error', { event: 'job_falhou', job: nome, latencyMs: ms, error: mensagem(err) })
    return { nome, estado: 'falhou', ms }
  } finally {
    await soltarLease(nome, carimbo)
  }
}

/**
 * Roda, em sequência, todos os jobs cuja expressão é `cron` — o que o `scheduled` do Worker recebe em
 * `controller.cron`. Expressão sem job: nada roda.
 *
 * @public — a Task 12 (`worker.ts`, `scheduled`) é quem chama; por ora, só os testes.
 */
export async function executarJobsDoCron(cron: string, o: OpcoesDoExecutor = {}): Promise<ResultadoDoJob[]> {
  const resultados: ResultadoDoJob[] = []
  for (const job of (o.jobs ?? JOBS).filter((j) => j.cron === cron)) resultados.push(await executarJob(job.nome, o))
  return resultados
}
