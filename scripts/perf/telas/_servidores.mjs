/* global AbortSignal */
/**
 * OS DOIS SERVIDORES QUE A AUDITORIA DE TELAS MEDE (26/09/2026).
 *
 *  - PRODUÇÃO: `dist-server/server.cjs` (o `npm run build`), `NODE_ENV=production`, self-host sem
 *    login, com o banco da suíte de carga (`suite/preparar.mjs`: o `local-owner` com 3.000 cartões e
 *    5 sessões) e o onboarding marcado — a tela medida é a de quem USA o app, não o tour. Mesmo
 *    arranque de `scripts/perf/frontend.mjs`.
 *  - EDIÇÃO ESTÁTICA: `tests/e2e-estatica/_servidor-estatico.mjs` (imita o Cloudflare Pages) sobre o
 *    `dist` do `npm run build:estatica`.
 *
 * `raiz` é a pasta que contém `dist/` (e `dist-server/`): o repositório, ou uma cópia do build de
 * ANTES guardada fora do `dist` para medir os dois lados na mesma sessão. O servidor de produção lê
 * o `dist` do `cwd`; as migrations vêm sempre do repositório (`MIGRATIONS_DIR`).
 *
 * Os dois devolvem `{ base, parar }`; `parar` derruba só o filho que foi iniciado aqui.
 */
import { spawn } from 'node:child_process'
import { randomBytes } from 'node:crypto'
import { existsSync, mkdirSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

import { preparar } from '../suite/preparar.mjs'

export const RAIZ = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..', '..')

async function esperarPronto(url, filho, prazoMs = 90_000) {
  let morreu = null
  filho.on('exit', (c, s) => (morreu = { c, s }))
  for (const t0 = Date.now(); ; ) {
    if (morreu) throw new Error(`servidor morreu no boot: ${JSON.stringify(morreu)}`)
    try {
      if ((await fetch(url, { signal: AbortSignal.timeout(2000) })).ok) return
    } catch {}
    if (Date.now() - t0 > prazoMs) throw new Error(`servidor não ficou pronto em ${prazoMs} ms`)
    await new Promise((r) => setTimeout(r, 300))
  }
}

function derrubavel(filho) {
  const parar = () => {
    if (filho.exitCode === null) filho.kill()
  }
  process.on('exit', parar) // só o processo iniciado aqui
  return parar
}

/** Sobe o servidor de produção com dados de um usuário real. */
export async function subirProducao({ raiz = RAIZ, porta = 3190, pasta }) {
  mkdirSync(pasta, { recursive: true })
  const banco = path.join(pasta, 'telas.db')
  if (!existsSync(banco)) await preparar({ db: banco, pesados: 0, medios: 0 })
  const base = `http://127.0.0.1:${porta}`
  const filho = spawn(process.execPath, [path.join(raiz, 'dist-server/server.cjs')], {
    cwd: raiz,
    env: {
      PATH: process.env.PATH,
      SystemRoot: process.env.SystemRoot,
      TEMP: process.env.TEMP,
      TMP: process.env.TMP,
      NODE_ENV: 'production',
      PORT: String(porta),
      HOST: '127.0.0.1',
      DATABASE_URL: `file:${banco.replace(/\\/g, '/')}`,
      MIGRATIONS_DIR: path.join(RAIZ, 'server/db/migrations'),
      AUDIO_DIR: path.join(pasta, 'audio'),
      BACKUP_DIARIO: '0',
      SECRET_KEY: randomBytes(32).toString('hex'),
      AUTH_REQUIRED: '0',
      SELF_HOST: '1',
      TRUST_PROXY: 'false',
      LOG_LEVEL: 'error',
    },
    stdio: ['ignore', 'ignore', 'pipe'],
  })
  const parar = derrubavel(filho)
  await esperarPronto(`${base}/api/ready`, filho)
  const r = await fetch(`${base}/api/settings`, {
    method: 'PUT',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ ui: { onboarded: true, providerMode: 'local', credentialId: null } }),
  })
  if (!r.ok) throw new Error(`PUT /api/settings ${r.status}`)
  return { base, parar, pid: filho.pid }
}

/** Sobe o servidor que imita o Cloudflare Pages sobre `<raiz>/dist`. */
export async function subirEstatica({ raiz = RAIZ, porta = 4195 }) {
  const script = path.join(raiz, 'tests/e2e-estatica/_servidor-estatico.mjs')
  if (!existsSync(script)) throw new Error(`sem ${script}`)
  const filho = spawn(process.execPath, [script, String(porta)], { cwd: raiz, stdio: ['ignore', 'ignore', 'pipe'] })
  const parar = derrubavel(filho)
  const base = `http://127.0.0.1:${porta}`
  await esperarPronto(`${base}/`, filho)
  return { base, parar, pid: filho.pid }
}
