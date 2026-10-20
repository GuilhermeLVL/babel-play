/**
 * O BUNDLE DO WORKER (Fase 2, Task 12): o que entra no isolate.
 *
 * Gera o bundle de verdade (`scripts/worker/build.mjs` → `wrangler deploy --dry-run`, o MESMO esbuild e os
 * mesmos `alias` do `wrangler dev`/`deploy`) e lê o metafile do esbuild. Trava:
 *
 *  - o tamanho bruto (≤ 10 MB: o teto do plano pago é sobre o comprimido, mas um bundle bruto acima disso já
 *    significa que algum WASM ou dependência do Node entrou);
 *  - os pacotes que só existem no Node (PGlite, jsdom, Readability, prom-client, loopback-capture, pdfjs,
 *    mammoth, undici) chegam SÓ como stubs de `server/stubs/`;
 *  - `node:child_process` não é importado por ninguém fora dos stubs;
 *  - `node:fs` (que o workerd tem, virtual, com `nodejs_compat`: importar não quebra; o que não pode é o
 *    caminho do Worker gravar ou ler disco de verdade) só vem de quem está nas listas abaixo, cada um com o
 *    motivo de não chegar no disco no Worker. Um importador novo precisa entrar aqui de propósito.
 */
import { execFileSync } from 'node:child_process'
import { readFileSync, statSync } from 'node:fs'
import { join } from 'node:path'

import { beforeAll, describe, expect, it } from 'vitest'

const RAIZ = join(__dirname, '..', '..')
const SAIDA = join(RAIZ, 'dist-worker')

interface Metafile {
  inputs: Record<string, { imports: Array<{ path: string; external?: boolean }> }>
  outputs: Record<string, { bytes: number }>
}

/** Os módulos do APP que importam `node:fs`: todos se guardam com `temDisco()`/`ehWorker()` ou só servem ao Node. */
const NODE_FS_PERMITIDO = new Set([
  'server/crypto.ts',
  'server/ai/registroDeProvedores.ts',
  'server/db/db.ts',
  'server/db/manutencao.ts',
  'server/db/travaDoPglite.ts',
  'server/lib/armazenamento.ts',
  'server/lib/armazenamentoR2.ts',
  'server/lib/corpoRecebido.ts',
  'server/lib/diarioDeErros.ts',
  'server/lib/langfuse.ts',
  'server/lib/storageQuota.ts',
  'server/lib/versao.ts',
  'server/routes/sessions.ts',
])

/**
 * As DEPENDÊNCIAS que fazem `require('fs')` e não tocam disco no caminho do Worker: `pg-connection-string`
 * (só com `sslcert`/`sslkey` na URL, que a do Hyperdrive não tem), `pgpass` (só sem senha na URL; a do
 * Hyperdrive tem), e a família de arquivos estáticos do Express (`send`, `etag`, `destroy`, `mime`,
 * `express/lib/view.js`), que no Worker não serve nada: os estáticos vêm do binding `ASSETS`.
 */
const NODE_FS_EM_DEPENDENCIA = new Set([
  'node_modules/pg-connection-string/index.js',
  'node_modules/pgpass/lib/index.js',
  'node_modules/destroy/index.js',
  'node_modules/express/lib/view.js',
  'node_modules/etag/index.js',
  'node_modules/mime/mime.js',
  'node_modules/send/index.js',
])

const SO_NO_NODE = [
  '@electric-sql/pglite',
  'jsdom',
  '@mozilla/readability',
  'prom-client',
  'loopback-capture',
  'pdfjs-dist',
  'mammoth',
  'undici',
]

const ehStub = (p: string) => p.startsWith('server/stubs/')

let meta: Metafile

beforeAll(() => {
  execFileSync(process.execPath, [join(RAIZ, 'scripts', 'worker', 'build.mjs')], { cwd: RAIZ, stdio: 'pipe' })
  meta = JSON.parse(readFileSync(join(SAIDA, 'meta.json'), 'utf8')) as Metafile
}, 180_000)

/**
 * Quem (entrada do bundle) importa o módulo `node:<nome>` (ou um subcaminho dele). O `require('fs')` nu de
 * uma dependência chega pelo módulo virtual `node-built-in-modules:fs` do wrangler, que conta igual.
 */
function importadores(nome: string): string[] {
  const alvos = [`node:${nome}`, `node-built-in-modules:${nome}`]
  const casa = (p: string) => alvos.some((a) => p === a || p.startsWith(`${a}/`))
  return Object.entries(meta.inputs)
    .filter(([p, e]) => !casa(p) && e.imports.some((i) => casa(i.path)))
    .map(([p]) => p)
}

describe('bundle do Worker', () => {
  it('cabe em 10 MB bruto', () => {
    const bytes = statSync(join(SAIDA, 'worker.js')).size
    expect(bytes).toBeLessThanOrEqual(10 * 1024 * 1024)
  })

  it.each(SO_NO_NODE)('%s fica fora (só o stub entra)', (pacote) => {
    const dentro = Object.keys(meta.inputs).filter((p) => p.includes(`node_modules/${pacote}/`))
    expect(dentro).toEqual([])
  })

  it('@libsql/client e jszip não entram no bundle do Worker', () => {
    const dentro = Object.keys(meta.inputs).filter(
      (p) => p.includes('node_modules/@libsql/') || p.includes('node_modules/jszip/'),
    )
    expect(dentro).toEqual([])
  })

  it('node:child_process: ninguém fora dos stubs importa', () => {
    expect(importadores('child_process').filter((p) => !ehStub(p))).toEqual([])
  })

  it('node:fs: só os importadores conhecidos (app e dependências)', () => {
    const fora = importadores('fs').filter((p) => !ehStub(p))
    expect(fora.length).toBeGreaterThan(0) // o metafile foi lido de verdade
    expect(fora.filter((p) => !NODE_FS_PERMITIDO.has(p) && !NODE_FS_EM_DEPENDENCIA.has(p))).toEqual([])
  })

  it('o ponto de entrada é o worker.ts', () => {
    expect(Object.keys(meta.inputs)).toContain('worker.ts')
  })
})
