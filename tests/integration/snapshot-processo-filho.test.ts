/**
 * O SNAPSHOT DIÁRIO RODA FORA DO EVENT LOOP DE QUEM ATENDE (auditoria de prontidão, P0 da Fase 2 §2.4).
 *
 * Medido em 25/09: dentro do processo, `VACUUM INTO` + `integrity_check` (driver síncrono) +
 * `gzipSync(level 9)` do arquivo inteiro prenderam o event loop por 3,7 s num banco de 46 MB e 34 s
 * num de 479 MB — e o health check do Fly tem timeout de 5 s. Agora o servidor só DISPARA um
 * processo filho (a mesma CLI de operação, `server/operacao/cli.ts` / `dist-server/operacao.cjs`) e
 * espera a mensagem de conclusão pelo canal IPC.
 *
 * O que este arquivo trava:
 *   - o caminho do filho resolve em dev (tsx, fonte TS) e em produção (bundle cjs lado a lado);
 *   - o filho faz o trabalho inteiro e devolve `{ chave, bytes }` ao pai, com o upload em STREAMING
 *     (Content-Length explícito, que o R2 exige para PUT sem chunked assinado);
 *   - falha no filho vira rejeição no pai, com a causa;
 *   - o event loop do pai não fica preso (< 200 ms) enquanto o filho comprime um banco de vários MB.
 */
import { mkdtempSync, rmSync } from 'node:fs'
import { createServer, type Server } from 'node:http'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { performance } from 'node:perf_hooks'
import { gunzipSync } from 'node:zlib'

import { createClient } from '@libsql/client'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'

import { fazerSnapshotEmProcessoFilho, resolverCliDeOperacao } from '../../server/operacao/snapshot'

const RAIZ = path.resolve(__dirname, '../..')
/** Em teste o vitest não carrega o tsx no processo: o filho recebe o carregador explicitamente. */
const CLI_DEV = { modulo: path.join(RAIZ, 'server/operacao/cli.ts'), execArgv: ['--import', 'tsx'] }

let dir: string
let s3: Server
let endpoint: string
let recusar = false
const recebidos = new Map<string, { corpo: Buffer; contentLength: string | undefined }>()

beforeAll(async () => {
  dir = mkdtempSync(path.join(tmpdir(), 'snapshot-filho-'))
  s3 = createServer((req, res) => {
    if (recusar) {
      req.resume()
      res.statusCode = 403
      res.end()
      return
    }
    const partes: Buffer[] = []
    req.on('data', (p: Buffer) => partes.push(p))
    req.on('end', () => {
      recebidos.set(decodeURIComponent(req.url ?? ''), {
        corpo: Buffer.concat(partes),
        contentLength: req.headers['content-length'],
      })
      res.statusCode = 200
      res.end()
    })
  })
  await new Promise<void>((ok) => s3.listen(0, '127.0.0.1', () => ok()))
  const a = s3.address()
  endpoint = `http://127.0.0.1:${typeof a === 'object' && a ? a.port : 0}`

  // ~8 MB de conteúdo pouco compressível: o bastante para o trabalho síncrono em processo passar
  // de 200 ms com folga (medido: ~0,5 s aqui), e pouco para o teste continuar rápido.
  const banco = createClient({ url: `file:${path.join(dir, 'vivo.db').replace(/\\/g, '/')}` })
  await banco.execute('PRAGMA journal_mode = WAL')
  await banco.execute('CREATE TABLE sessions (id INTEGER PRIMARY KEY, titulo TEXT, corpo BLOB)')
  await banco.execute('CREATE TABLE users (id TEXT PRIMARY KEY)')
  await banco.execute(
    `WITH RECURSIVE n(i) AS (SELECT 1 UNION ALL SELECT i + 1 FROM n WHERE i < 4000)
     INSERT INTO sessions SELECT i, 'sessão ' || i, randomblob(2048) FROM n`,
  )
  await banco.execute("INSERT INTO users VALUES ('u1')")
  banco.close()
}, 60_000)

afterAll(async () => {
  await new Promise<void>((ok) => s3.close(() => ok()))
  try {
    rmSync(dir, { recursive: true, force: true })
  } catch {
    /* Windows segura o arquivo do libsql por um instante depois do close; limpeza é best-effort */
  }
})

const envDoFilho = (): NodeJS.ProcessEnv => ({
  ...process.env,
  S3_ENDPOINT: endpoint,
  S3_BUCKET: 'midia',
  BACKUP_S3_BUCKET: 'backups-babel',
  S3_ACCESS_KEY_ID: 'chave',
  S3_SECRET_ACCESS_KEY: 'segredo',
})

describe('resolverCliDeOperacao', () => {
  it('produção: o bundle `operacao.cjs` ao lado do `server.cjs`, sem carregador', () => {
    const principal = path.join('/app', 'dist-server', 'server.cjs')
    const cli = resolverCliDeOperacao({ principal, execArgv: [], existe: () => true })
    expect(cli).toEqual({ modulo: path.resolve('/app', 'dist-server', 'operacao.cjs'), execArgv: [] })
  })

  it('dev: o fonte `server/operacao/cli.ts` ao lado do `server.ts`, herdando o carregador do tsx', () => {
    const principal = path.join('/repo', 'server.ts')
    const execArgv = ['--require', '/x/tsx/dist/preflight.cjs', '--import', 'file:///x/tsx/dist/loader.mjs']
    const cli = resolverCliDeOperacao({ principal, execArgv, existe: () => true })
    expect(cli).toEqual({ modulo: path.resolve('/repo', 'server', 'operacao', 'cli.ts'), execArgv })
  })

  it('dev sem o tsx no processo: pede `--import tsx` para o filho', () => {
    const cli = resolverCliDeOperacao({ principal: path.join('/repo', 'server.ts'), execArgv: [], existe: () => true })
    expect(cli.execArgv).toEqual(['--import', 'tsx'])
  })

  it('não achou nenhum dos dois: falha alto, com o caminho procurado', () => {
    expect(() =>
      resolverCliDeOperacao({
        principal: path.join('/app', 'dist-server', 'server.cjs'),
        execArgv: [],
        existe: () => false,
      }),
    ).toThrow(/operacao/)
  })
})

describe('fazerSnapshotEmProcessoFilho', () => {
  it('o filho faz o snapshot e devolve chave e bytes; o objeto chega íntegro, com Content-Length', async () => {
    const r = await fazerSnapshotEmProcessoFilho({
      urlDoBanco: `file:${path.join(dir, 'vivo.db').replace(/\\/g, '/')}`,
      cli: CLI_DEV,
      env: envDoFilho(),
    })
    expect(r.chave).toMatch(/^backups\/diario\/\d{4}-\d{2}-\d{2}\.db\.gz$/)
    const objeto = recebidos.get(`/backups-babel/${r.chave}`)
    expect(objeto).toBeTruthy()
    expect(objeto?.corpo.length).toBe(r.bytes)
    expect(objeto?.contentLength).toBe(String(r.bytes))
    // É um SQLite de verdade depois do gunzip.
    expect(gunzipSync(objeto!.corpo).subarray(0, 15).toString()).toBe('SQLite format 3')
  }, 60_000)

  it('falha no filho (R2 recusando) vira rejeição no pai, com a causa', async () => {
    recusar = true
    try {
      await expect(
        fazerSnapshotEmProcessoFilho({
          urlDoBanco: `file:${path.join(dir, 'vivo.db').replace(/\\/g, '/')}`,
          cli: CLI_DEV,
          env: envDoFilho(),
        }),
      ).rejects.toThrow(/403/)
    } finally {
      recusar = false
    }
  }, 60_000)

  it('o event loop do pai não fica preso: maior intervalo < 200 ms durante o snapshot', async () => {
    let maior = 0
    let ultimo = performance.now()
    const batimento = setInterval(() => {
      const agora = performance.now()
      maior = Math.max(maior, agora - ultimo)
      ultimo = agora
    }, 1)
    try {
      await fazerSnapshotEmProcessoFilho({
        urlDoBanco: `file:${path.join(dir, 'vivo.db').replace(/\\/g, '/')}`,
        cli: CLI_DEV,
        env: envDoFilho(),
      })
    } finally {
      clearInterval(batimento)
    }
    expect(maior).toBeLessThan(200)
  }, 60_000)
})
