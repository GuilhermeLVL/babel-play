/**
 * SNAPSHOT DIÁRIO DO BANCO NO R2, E A VOLTA DELE (Fase 5 do lançamento).
 *
 * O Litestream (ver `Dockerfile` e `litestream.yml`) replica o WAL para o R2 continuamente — é a
 * defesa contra perder a máquina, com perda máxima de segundos. Este é o SEGUNDO cinto, e existe
 * por um motivo diferente: o Litestream copia fielmente o que acontece no banco, INCLUSIVE o erro.
 * Um `DELETE` sem `WHERE` ou uma migração ruim chega à réplica em um segundo. O snapshot diário é
 * uma fotografia independente, com um arquivo por dia, que nenhum processo reescreve depois.
 *
 * POR QUE DENTRO DO PROCESSO, e não num cron do Fly ou do GitHub Actions: o volume `/data` do Fly
 * monta em UMA máquina só. Uma máquina agendada separada não enxerga o banco, e uma rota admin
 * chamada pelo Actions abriria uma porta HTTP que dispara trabalho pesado. Aqui o próprio servidor
 * (sempre ligado: `min_machines_running = 1`) roda o `VACUUM INTO` uma vez por dia, confere, comprime
 * e envia. O alarme de quando ele NÃO roda — processo morto, timer perdido — é externo: o ping do
 * `BACKUP_HEARTBEAT_URL` (UptimeRobot heartbeat) que só acontece depois de um envio conferido.
 *
 * As três garantias do `scripts/backup.mjs` valem aqui também: `VACUUM INTO` e não cópia de
 * arquivo (sob WAL são três arquivos), `PRAGMA integrity_check` ANTES de considerar feito, e falha
 * alta — `log('error', { event: 'backup_diario_falhou' })`, que o diário e o Sentry recebem.
 */
import { existsSync } from 'node:fs'
import { readFile, rm, writeFile } from 'node:fs/promises'
import path from 'node:path'
import { gunzipSync, gzipSync } from 'node:zlib'

import { createClient } from '@libsql/client'

import { type Armazenamento, armazenamentoS3, type ConfigS3 } from '../lib/armazenamento'
import { log } from '../lib/logger'

/** Tabelas que a verificação conta — as mesmas de `scripts/backup.mjs`. */
const TABELAS = [
  'sessions',
  'utterances',
  'vocab_cards',
  'vocab_occurrences',
  'review_logs',
  'exercise_results',
  'users',
]

export const PREFIXO_PADRAO = 'backups/diario/'

/**
 * Para onde vão os snapshots: `BACKUP_S3_BUCKET`, ou o mesmo bucket da mídia (`S3_BUCKET`), com as
 * credenciais `S3_*`. `null` quando falta alguma peça — aí o agendador nem liga.
 */
export function destinoDoBackup(env: NodeJS.ProcessEnv = process.env): { cfg: ConfigS3; prefixo: string } | null {
  const bucket = env.BACKUP_S3_BUCKET?.trim() || env.S3_BUCKET?.trim()
  if (!env.S3_ENDPOINT || !bucket || !env.S3_ACCESS_KEY_ID || !env.S3_SECRET_ACCESS_KEY) return null
  return {
    cfg: {
      endpoint: env.S3_ENDPOINT,
      bucket,
      regiao: env.S3_REGION || 'auto',
      accessKeyId: env.S3_ACCESS_KEY_ID,
      secretAccessKey: env.S3_SECRET_ACCESS_KEY,
    },
    prefixo: PREFIXO_PADRAO,
  }
}

/** `2026-09-24` — o nome do objeto do dia. */
export function nomeDoDia(agora: Date): string {
  return agora.toISOString().slice(0, 10)
}

export interface Verificacao {
  ok: boolean
  integridade: string
  contagens: Record<string, number | null>
}

/** Abre um arquivo de banco, roda `PRAGMA integrity_check` e conta as tabelas principais. */
export async function verificarBanco(arquivo: string): Promise<Verificacao> {
  const cliente = createClient({ url: `file:${arquivo.replace(/\\/g, '/')}` })
  try {
    const linha = (await cliente.execute('PRAGMA integrity_check')).rows[0]
    const integridade = String(Object.values(linha ?? {})[0] ?? '')
    const contagens: Record<string, number | null> = {}
    for (const t of TABELAS) {
      try {
        contagens[t] = Number(Object.values((await cliente.execute(`SELECT COUNT(*) FROM ${t}`)).rows[0])[0])
      } catch {
        contagens[t] = null
      }
    }
    return { ok: integridade.toLowerCase() === 'ok', integridade, contagens }
  } finally {
    cliente.close()
  }
}

export interface OpcoesDoSnapshot {
  /** URL libsql do banco de origem (`file:/data/babel.db`). */
  urlDoBanco: string
  /** Onde o `VACUUM INTO` escreve a cópia temporária. Precisa estar no MESMO volume, com espaço. */
  dirTemporario: string
  destino: { cfg: ConfigS3; prefixo: string }
  agora?: Date
  /** Injetável para o teste (um S3 falso). */
  armazenamento?: Armazenamento
}

/**
 * `VACUUM INTO` → `integrity_check` → gzip → PUT `<prefixo><AAAA-MM-DD>.db.gz`. Lança em qualquer
 * falha; a cópia temporária é apagada nos dois caminhos.
 */
export async function fazerSnapshot(
  o: OpcoesDoSnapshot,
): Promise<{ chave: string; bytes: number; verificacao: Verificacao }> {
  const agora = o.agora ?? new Date()
  const temporario = path.join(o.dirTemporario, `.snapshot-${agora.getTime()}.db`)
  const origem = createClient({ url: o.urlDoBanco })
  try {
    if (existsSync(temporario)) await rm(temporario, { force: true })
    await origem.execute(`VACUUM INTO '${temporario.replace(/\\/g, '/').replace(/'/g, "''")}'`)
    const verificacao = await verificarBanco(temporario)
    if (!verificacao.ok) throw new Error(`integrity_check da cópia devolveu "${verificacao.integridade}"`)
    const comprimido = gzipSync(await readFile(temporario), { level: 9 })
    const chave = `${o.destino.prefixo}${nomeDoDia(agora)}.db.gz`
    await (o.armazenamento ?? armazenamentoS3(o.destino.cfg)).gravar(chave, comprimido, 'application/gzip')
    return { chave, bytes: comprimido.length, verificacao }
  } finally {
    origem.close()
    await rm(temporario, { force: true }).catch(() => {})
  }
}

/** Baixa o snapshot de um dia, descomprime em `arquivoSaida` e confere. Não toca o banco vivo. */
export async function restaurarSnapshot(o: {
  destino: { cfg: ConfigS3; prefixo: string }
  dia: string
  arquivoSaida: string
  armazenamento?: Armazenamento
}): Promise<Verificacao> {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(o.dia)) throw new Error(`dia inválido: ${o.dia} (use AAAA-MM-DD)`)
  if (existsSync(o.arquivoSaida)) throw new Error(`${o.arquivoSaida} já existe — restaure num caminho limpo`)
  const bytes = await (o.armazenamento ?? armazenamentoS3(o.destino.cfg)).ler(`${o.destino.prefixo}${o.dia}.db.gz`)
  await writeFile(o.arquivoSaida, gunzipSync(bytes))
  return verificarBanco(o.arquivoSaida)
}

/** Quanto falta, em ms, para a próxima `horaUtc:00` — sempre no futuro (nunca zero). */
export function msAteAProxima(horaUtc: number, agora: Date = new Date()): number {
  const alvo = new Date(Date.UTC(agora.getUTCFullYear(), agora.getUTCMonth(), agora.getUTCDate(), horaUtc, 0, 0, 0))
  if (alvo.getTime() <= agora.getTime()) alvo.setUTCDate(alvo.getUTCDate() + 1)
  return alvo.getTime() - agora.getTime()
}

/**
 * Liga o snapshot diário. Devolve como desligar (o teste usa; o servidor não precisa).
 *
 * Os temporizadores levam `unref()`: um backup agendado nunca pode ser o motivo de o processo não
 * terminar num SIGTERM. O heartbeat só é chamado DEPOIS de um envio conferido; falha dele é aviso,
 * não erro — o snapshot existe, quem falhou foi o alarme.
 */
export function agendarSnapshotDiario(o: {
  horaUtc: number
  executar: () => Promise<{ chave: string; bytes: number }>
  heartbeatUrl?: string
  buscar?: typeof fetch
}): () => void {
  const buscar = o.buscar ?? fetch
  let relogio: NodeJS.Timeout | undefined
  const rodar = async () => {
    try {
      const r = await o.executar()
      log('info', { event: 'backup_diario_ok', route: r.chave, total: r.bytes })
      if (o.heartbeatUrl) {
        try {
          await buscar(o.heartbeatUrl, { signal: AbortSignal.timeout(10_000) })
        } catch (err) {
          log('warn', { event: 'backup_heartbeat_falhou', error: String((err as Error)?.message || err).slice(0, 160) })
        }
      }
    } catch (err) {
      log('error', { event: 'backup_diario_falhou', error: String((err as Error)?.message || err).slice(0, 300) })
    }
  }
  const armar = () => {
    relogio = setTimeout(() => {
      void rodar().finally(armar)
    }, msAteAProxima(o.horaUtc))
    relogio.unref?.()
  }
  armar()
  return () => {
    if (relogio) clearTimeout(relogio)
  }
}
