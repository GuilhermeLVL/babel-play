/**
 * SNAPSHOT DIÁRIO DO BANCO NO R2, E A VOLTA DELE (Fase 5 do lançamento).
 *
 * O Litestream (ver `Dockerfile` e `litestream.yml`) replica o WAL para o R2 continuamente — é a
 * defesa contra perder a máquina, com perda máxima de segundos. Este é o SEGUNDO cinto, e existe
 * por um motivo diferente: o Litestream copia fielmente o que acontece no banco, INCLUSIVE o erro.
 * Um `DELETE` sem `WHERE` ou uma migração ruim chega à réplica em um segundo. O snapshot diário é
 * uma fotografia independente, com um arquivo por dia, que nenhum processo reescreve depois.
 *
 * POR QUE NA MESMA MÁQUINA, e não num cron do Fly ou do GitHub Actions: o volume `/data` do Fly
 * monta em UMA máquina só. Uma máquina agendada separada não enxerga o banco, e uma rota admin
 * chamada pelo Actions abriria uma porta HTTP que dispara trabalho pesado. Aqui o próprio servidor
 * (sempre ligado: `min_machines_running = 1`) AGENDA o snapshot uma vez por dia. O alarme de quando
 * ele NÃO roda — processo morto, timer perdido — é externo: o ping do `BACKUP_HEARTBEAT_URL`
 * (UptimeRobot heartbeat) que só acontece depois de um envio conferido.
 *
 * MAS NUM PROCESSO FILHO, e não no event loop de quem atende (auditoria de prontidão, Fase 2 §2.4).
 * O driver do libsql é SÍNCRONO: `VACUUM INTO` e `integrity_check` param o laço inteiro, e o
 * `gzipSync(level 9)` do arquivo lido com `readFile` somava mais. Medido em 25/09: 3,7 s de bloqueio
 * contínuo com 46 MB, 20,1 s com 191 MB, 34,3 s com 479 MB — e o health check do Fly tem timeout de
 * 5 s. Agora o servidor chama `fazerSnapshotEmProcessoFilho`, que dá `fork` na CLI de operação
 * (`cli.ts` em dev, `dist-server/operacao.cjs` em produção) e só espera a mensagem de conclusão. O
 * filho tem conexão própria ao banco, comprime em STREAMING (gzip nível 6, sem o arquivo inteiro na
 * memória) e envia o `.gz` ao R2 lendo do disco (`enviarArquivoAoS3`).
 *
 * As três garantias do `scripts/backup.mjs` valem aqui também: `VACUUM INTO` e não cópia de
 * arquivo (sob WAL são três arquivos), `PRAGMA integrity_check` ANTES de considerar feito, e falha
 * alta — `log('error', { event: 'backup_diario_falhou' })`, que o diário e o Sentry recebem.
 */
import { fork } from 'node:child_process'
import { createReadStream, createWriteStream, existsSync } from 'node:fs'
import { rm, stat } from 'node:fs/promises'
import { setPriority } from 'node:os'
import path from 'node:path'
import { Readable } from 'node:stream'
import { pipeline } from 'node:stream/promises'
import { createGunzip, createGzip } from 'node:zlib'

import { createClient } from '@libsql/client'

import { type Armazenamento, armazenamentoS3, type ConfigS3, enviarArquivoAoS3 } from '../lib/armazenamento'
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
  /**
   * Quem envia o `.gz` já pronto no disco. Injetável para a medição (um destino falso); o padrão é
   * o PUT em streaming de `enviarArquivoAoS3`.
   */
  enviar?: (chave: string, arquivoGz: string) => Promise<void>
}

/** Nível do gzip. 6 e não 9: medido em 25/09, o 9 custa ~2× o tempo por ~2% de arquivo a menos. */
const NIVEL_DO_GZIP = 6

/**
 * `VACUUM INTO` → `integrity_check` → gzip (streaming) → PUT `<prefixo><AAAA-MM-DD>.db.gz`. Lança
 * em qualquer falha; as cópias temporárias são apagadas nos dois caminhos.
 *
 * TRABALHO PESADO E SÍNCRONO: quem atende requisições NÃO chama isto direto — chama
 * `fazerSnapshotEmProcessoFilho`, abaixo. Aqui é o corpo do processo filho (e da CLI manual).
 */
export async function fazerSnapshot(
  o: OpcoesDoSnapshot,
): Promise<{ chave: string; bytes: number; verificacao: Verificacao }> {
  const agora = o.agora ?? new Date()
  const temporario = path.join(o.dirTemporario, `.snapshot-${agora.getTime()}.db`)
  const comprimido = `${temporario}.gz`
  const origem = createClient({ url: o.urlDoBanco })
  try {
    if (existsSync(temporario)) await rm(temporario, { force: true })
    await origem.execute(`VACUUM INTO '${temporario.replace(/\\/g, '/').replace(/'/g, "''")}'`)
    const verificacao = await verificarBanco(temporario)
    if (!verificacao.ok) throw new Error(`integrity_check da cópia devolveu "${verificacao.integridade}"`)
    /* Em STREAMING, de arquivo para arquivo: a memória fica no tamanho do buffer do zlib, e não
       em +1× o banco (o `readFile` + `gzipSync` de antes). */
    await pipeline(createReadStream(temporario), createGzip({ level: NIVEL_DO_GZIP }), createWriteStream(comprimido))
    const bytes = (await stat(comprimido)).size
    const chave = `${o.destino.prefixo}${nomeDoDia(agora)}.db.gz`
    if (o.enviar) await o.enviar(chave, comprimido)
    else await enviarArquivoAoS3(o.destino.cfg, chave, comprimido, 'application/gzip')
    return { chave, bytes, verificacao }
  } finally {
    origem.close()
    await rm(temporario, { force: true }).catch(() => {})
    await rm(comprimido, { force: true }).catch(() => {})
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
  /* Descomprime em streaming (o banco inteiro descomprimido nunca fica na memória); `wx` recusa
     sobrescrever, fechando a janela entre o `existsSync` acima e a escrita. */
  await pipeline(Readable.from([bytes]), createGunzip(), createWriteStream(o.arquivoSaida, { flags: 'wx' }))
  return verificarBanco(o.arquivoSaida)
}

/* ─────────────────────── o processo filho ─────────────────────── */

/** O que o servidor dá `fork`: o módulo da CLI de operação e os argumentos do Node para ele. */
export interface CliDeOperacao {
  modulo: string
  execArgv: string[]
}

/**
 * Onde está a CLI de operação, nos dois jeitos de o servidor rodar:
 *
 *   produção — `node dist-server/server.cjs`: o `npm run build` gera `dist-server/operacao.cjs` AO
 *              LADO (package.json), e o Dockerfile copia a pasta inteira. Sem carregador.
 *   dev      — `tsx server.ts`: o fonte `server/operacao/cli.ts`, relativo ao `server.ts`. O filho
 *              precisa do carregador do tsx: herda o do pai (o `tsx` põe `--import …/loader.mjs` no
 *              `execArgv`) ou, se o pai não o tem (vitest), recebe `--import tsx`.
 *
 * Pelo `process.argv[1]` (o script principal) e não por `import.meta.url`/`__dirname`: o servidor é
 * ESM em dev e CJS no bundle, e cada formato só tem um dos dois. O `argv[1]` vale nos dois.
 */
export function resolverCliDeOperacao(
  o: { principal?: string; execArgv?: string[]; existe?: (arquivo: string) => boolean } = {},
): CliDeOperacao {
  const principal = path.resolve(o.principal ?? process.argv[1] ?? '')
  const execArgvDoPai = o.execArgv ?? process.execArgv
  const existe = o.existe ?? existsSync
  const pasta = path.dirname(principal)
  if (principal.endsWith('.cjs')) {
    const bundle = path.join(pasta, 'operacao.cjs')
    if (existe(bundle)) return { modulo: bundle, execArgv: [] }
    throw new Error(`CLI de operação não encontrada: ${bundle} (falta o npm run build?)`)
  }
  const fonte = path.join(pasta, 'server', 'operacao', 'cli.ts')
  if (!existe(fonte)) throw new Error(`CLI de operação não encontrada: ${fonte}`)
  const comTsx = execArgvDoPai.some((a) => a.includes('tsx'))
  return { modulo: fonte, execArgv: comTsx ? [...execArgvDoPai] : ['--import', 'tsx'] }
}

/** A mensagem que o filho manda ao pai pelo canal IPC do `fork` (ver `cli.ts`). */
export type MensagemDoSnapshot =
  | { tipo: 'snapshot_ok'; chave: string; bytes: number; integridade: string }
  | { tipo: 'snapshot_falhou'; erro: string }

/** Teto de um snapshot. O de 479 MB levou 69 s dentro do processo; 30 min é folga para disco lento. */
const LIMITE_DO_FILHO_MS = 30 * 60_000

/**
 * O snapshot diário, FORA do event loop de quem atende: `fork` da CLI de operação com o comando
 * `snapshot`, e espera a mensagem de conclusão. O filho herda o ambiente (as `S3_*`) com o
 * `DATABASE_URL` do banco a copiar; o stdout/stderr dele vai para o log do servidor.
 *
 * Prioridade de CPU mais baixa (`nice` 10): numa `shared-cpu-1x` o filho disputa o mesmo núcleo, e
 * quem tem de ganhar a disputa é quem atende. Sem permissão para isso, segue sem.
 *
 * Lança quando o filho falha (com a causa que ele mandou), sai sem mensagem, ou passa do limite —
 * aí ele é morto, para um snapshot preso não acumular processos dia após dia.
 */
export function fazerSnapshotEmProcessoFilho(o: {
  urlDoBanco: string
  cli?: CliDeOperacao
  env?: NodeJS.ProcessEnv
  limiteMs?: number
}): Promise<{ chave: string; bytes: number }> {
  const limite = o.limiteMs ?? LIMITE_DO_FILHO_MS
  return new Promise((resolver, rejeitar) => {
    const cli = o.cli ?? resolverCliDeOperacao()
    const filho = fork(cli.modulo, ['snapshot'], {
      execArgv: cli.execArgv,
      env: { ...(o.env ?? process.env), DATABASE_URL: o.urlDoBanco },
      stdio: ['ignore', 'inherit', 'inherit', 'ipc'],
    })
    try {
      if (filho.pid) setPriority(filho.pid, 10)
    } catch {
      /* sem permissão para mudar a prioridade: roda na mesma, só disputa mais o núcleo */
    }
    let mensagem: MensagemDoSnapshot | undefined
    let motivo: string | undefined
    const relogio = setTimeout(() => {
      motivo = `o snapshot passou de ${Math.round(limite / 1000)} s e foi interrompido`
      filho.kill('SIGKILL')
    }, limite)
    relogio.unref?.()
    filho.on('message', (m: MensagemDoSnapshot) => {
      if (m?.tipo === 'snapshot_ok' || m?.tipo === 'snapshot_falhou') mensagem = m
    })
    filho.once('error', (err) => {
      motivo ??= `não foi possível iniciar o processo do snapshot: ${err.message}`
    })
    filho.once('exit', (codigo, sinal) => {
      clearTimeout(relogio)
      if (codigo === 0 && mensagem?.tipo === 'snapshot_ok') {
        resolver({ chave: mensagem.chave, bytes: mensagem.bytes })
        return
      }
      const causa =
        motivo ??
        (mensagem?.tipo === 'snapshot_falhou'
          ? mensagem.erro
          : `o processo do snapshot saiu com ${codigo ?? sinal} sem avisar o resultado`)
      rejeitar(new Error(causa))
    })
  })
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
