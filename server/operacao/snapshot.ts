/**
 * SNAPSHOT DIÁRIO DO BANCO — APOSENTADO NA MIGRAÇÃO PARA O POSTGRES (Fase 1).
 *
 * No SQLite este módulo fazia `VACUUM INTO` → `PRAGMA integrity_check` → gzip → PUT no R2, num
 * processo filho para não prender o event loop. Nada disso tem sentido no Postgres: não há arquivo
 * único para copiar (o PGlite guarda um diretório de dados, o Postgres remoto nem está nesta
 * máquina), e o backup passa a ser `pg_dump` agendado no CI, fora do servidor.
 *
 * A FORMA PÚBLICA FICA, para o agendador do `server.ts` e a CLI de operação continuarem compilando
 * e respondendo: com `BACKUP_DIARIO=1`, o job diário ainda roda, mas só REGISTRA que o snapshot está
 * indisponível neste banco e devolve sem erro. Não pinga o heartbeat nem conta sucesso na métrica:
 * o heartbeat diz "há um backup conferido", e aqui não há.
 *
 * A VOLTA FICA: `restaurarSnapshot` e `verificarBanco` leem os snapshots SQLITE que já estão no R2
 * (`backups/diario/AAAA-MM-DD.db.gz`), feitos antes da migração. São arquivos de terceiro para este
 * servidor, como o `.apkg` do Anki, e é com eles que se volta ao estado anterior à cópia para o
 * Postgres (`.github/workflows/restauracao-drill.yml`, `docs/runbook.md`). Nunca tocam o banco vivo.
 */
import { createWriteStream, existsSync } from 'node:fs'
import { Readable } from 'node:stream'
import { pipeline } from 'node:stream/promises'
import { createGunzip } from 'node:zlib'

import { createClient } from '@libsql/client'

import { type Armazenamento, armazenamentoS3, type ConfigS3 } from '../lib/armazenamento'
import { log } from '../lib/logger'

/** O que o job registra no lugar do snapshot. */
export const SNAPSHOT_INDISPONIVEL = 'indisponível neste banco; backup por pg_dump no CI'

const PREFIXO_PADRAO = 'backups/diario/'

/**
 * Para onde iam os snapshots: `BACKUP_S3_BUCKET`, ou o mesmo bucket da mídia (`S3_BUCKET`), com as
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

export interface Verificacao {
  ok: boolean
  integridade: string
  contagens: Record<string, number | null>
}

/** Abre um arquivo SQLite (um snapshot restaurado), roda `PRAGMA integrity_check` e conta as tabelas principais. */
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

/** Baixa o snapshot SQLite de um dia, descomprime em `arquivoSaida` e confere. Não toca o banco vivo. */
export async function restaurarSnapshot(o: {
  destino: { cfg: ConfigS3; prefixo: string }
  dia: string
  arquivoSaida: string
  armazenamento?: Armazenamento
}): Promise<Verificacao> {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(o.dia)) throw new Error(`dia inválido: ${o.dia} (use AAAA-MM-DD)`)
  if (existsSync(o.arquivoSaida)) throw new Error(`${o.arquivoSaida} já existe — restaure num caminho limpo`)
  const bytes = await (o.armazenamento ?? armazenamentoS3(o.destino.cfg)).ler(`${o.destino.prefixo}${o.dia}.db.gz`)
  /* Descomprime em streaming (o banco inteiro descomprimido nunca fica na memória); `wx` recusa
     sobrescrever, fechando a janela entre o `existsSync` acima e a escrita. */
  await pipeline(Readable.from([bytes]), createGunzip(), createWriteStream(o.arquivoSaida, { flags: 'wx' }))
  return verificarBanco(o.arquivoSaida)
}

/** Um snapshot enviado (`chave` no bucket, `bytes` comprimidos) ou `null`: nada foi feito. */
export type ResultadoDoSnapshot = { chave: string; bytes: number } | null

/** O job diário: registra a indisponibilidade e devolve `null`, sem lançar. */
export async function fazerSnapshot(): Promise<ResultadoDoSnapshot> {
  log('warn', { event: 'backup_diario_indisponivel', error: SNAPSHOT_INDISPONIVEL })
  return null
}

/** Quanto falta, em ms, para a próxima `horaUtc:00` — sempre no futuro (nunca zero). */
export function msAteAProxima(horaUtc: number, agora: Date = new Date()): number {
  const alvo = new Date(Date.UTC(agora.getUTCFullYear(), agora.getUTCMonth(), agora.getUTCDate(), horaUtc, 0, 0, 0))
  if (alvo.getTime() <= agora.getTime()) alvo.setUTCDate(alvo.getUTCDate() + 1)
  return alvo.getTime() - agora.getTime()
}

/**
 * Liga o job diário. Devolve como desligar.
 *
 * Os temporizadores levam `unref()`: um job agendado nunca pode ser o motivo de o processo não
 * terminar num SIGTERM. O heartbeat só é chamado DEPOIS de um envio conferido (`executar` devolveu
 * um resultado); `null` não é sucesso e não pinga nada. Falha do heartbeat é aviso, não erro.
 */
export function agendarSnapshotDiario(o: {
  horaUtc: number
  executar: () => Promise<ResultadoDoSnapshot>
  heartbeatUrl?: string
  buscar?: typeof fetch
  /** Métricas do backup (`observarBackup` de server/http/metricas.ts) — injetado para a CLI não puxar o prom-client. */
  observar?: (r: { ok: true; bytes: number } | { ok: false }) => void
}): () => void {
  const buscar = o.buscar ?? fetch
  let relogio: NodeJS.Timeout | undefined
  const rodar = async () => {
    try {
      const r = await o.executar()
      if (!r) return
      log('info', { event: 'backup_diario_ok', route: r.chave, total: r.bytes })
      o.observar?.({ ok: true, bytes: r.bytes })
      if (o.heartbeatUrl) {
        try {
          await buscar(o.heartbeatUrl, { signal: AbortSignal.timeout(10_000) })
        } catch (err) {
          log('warn', { event: 'backup_heartbeat_falhou', error: String((err as Error)?.message || err).slice(0, 160) })
        }
      }
    } catch (err) {
      log('error', { event: 'backup_diario_falhou', error: String((err as Error)?.message || err).slice(0, 300) })
      o.observar?.({ ok: false })
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
