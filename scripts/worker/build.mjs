#!/usr/bin/env node
/**
 * BUNDLE DO WORKER (Fase 2, Task 12): `npm run worker:build`.
 *
 * Quem empacota é o PRÓPRIO wrangler (`deploy --dry-run`), com o esbuild, as condições do workerd e os
 * `alias` do `wrangler.jsonc` — o mesmo bundle que o `wrangler dev` roda e o `deploy` subiria. Um esbuild à
 * parte, com outra lista de stubs, poderia passar aqui e quebrar lá.
 *
 * Saída em `dist-worker/`: `worker.js`, `worker.js.map` e `meta.json` (metafile do esbuild, lido por
 * `tests/worker/bundle.test.ts`). Relatório: tamanho bruto e gzip, os maiores pacotes e quem ainda importa
 * `node:fs`/`node:child_process` fora de `server/stubs/`.
 */
import { spawnSync } from 'node:child_process'
import { mkdirSync, readFileSync, rmSync, statSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { gzipSync } from 'node:zlib'

const RAIZ = join(dirname(fileURLToPath(import.meta.url)), '..', '..')
const SAIDA = join(RAIZ, 'dist-worker')
const WRANGLER = join(RAIZ, 'node_modules', 'wrangler', 'bin', 'wrangler.js')

rmSync(SAIDA, { recursive: true, force: true })
// O dry-run exige que `assets.directory` (dist/) EXISTA, não o conteúdo: num checkout limpo (o job `worker` do CI
// não roda o Vite) ele ainda não existe e o wrangler recusa. Criar vazio não apaga um build que já esteja lá.
mkdirSync(join(RAIZ, 'dist'), { recursive: true })
const r = spawnSync(
  process.execPath,
  [
    WRANGLER,
    'deploy',
    '-c',
    'wrangler.jsonc',
    '--env=',
    '--dry-run',
    '--outdir',
    SAIDA,
    '--metafile',
    join(SAIDA, 'meta.json'),
  ],
  { cwd: RAIZ, encoding: 'utf8', env: { ...process.env, WRANGLER_SEND_METRICS: 'false', NO_COLOR: '1' } },
)
if (r.status !== 0) {
  process.stderr.write(r.stdout + r.stderr)
  console.error('worker:build falhou')
  process.exit(r.status ?? 1)
}

const js = join(SAIDA, 'worker.js')
const bruto = statSync(js).size
const gzip = gzipSync(readFileSync(js)).length
const meta = JSON.parse(readFileSync(join(SAIDA, 'meta.json'), 'utf8'))
const entradas = Object.entries(meta.inputs)

const porPacote = new Map()
for (const [caminho, e] of entradas) {
  const m = /node_modules\/((?:@[^/]+\/)?[^/]+)/.exec(caminho)
  const nome = m ? m[1] : caminho.startsWith('src/') ? '(app: src/)' : '(app: server/ + worker.ts)'
  porPacote.set(nome, (porPacote.get(nome) ?? 0) + e.bytes)
}

const fora = (alvo) =>
  entradas
    .filter(
      ([p, e]) =>
        !p.startsWith('server/stubs/') && e.imports.some((i) => i.path === alvo || i.path.startsWith(`${alvo}/`)),
    )
    .map(([p]) => p)

const kb = (n) => `${(n / 1024).toFixed(0)} KB`
console.log(`bundle do Worker: ${kb(bruto)} bruto, ${kb(gzip)} gzip (${entradas.length} módulos)`)
console.log('maiores (bytes de entrada):')
for (const [nome, bytes] of [...porPacote].sort((a, b) => b[1] - a[1]).slice(0, 15))
  console.log(`  ${kb(bytes).padStart(8)}  ${nome}`)
for (const alvo of ['node:fs', 'node:child_process']) {
  const lista = fora(alvo)
  console.log(`${alvo} fora dos stubs: ${lista.length === 0 ? 'nenhum' : ''}`)
  for (const p of lista) console.log(`  ${p}`)
}
