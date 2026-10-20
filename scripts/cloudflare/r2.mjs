#!/usr/bin/env node
/**
 * CRIA E CONFERE OS BUCKETS R2 DO FRASY (Fase 4, T3). Idempotente: o que já existe fica como está.
 *
 *   set -a; source .env; set +a                 # CLOUDFLARE_API_TOKEN (e CLOUDFLARE_ACCOUNT_ID)
 *   node scripts/cloudflare/r2.mjs --dry-run    # só imprime o plano
 *   node scripts/cloudflare/r2.mjs [--origens https://frasy.com.br,https://frasy-staging.…,http://localhost:3100]
 *
 *   frasy-midia            áudio e anexos da produção (binding MIDIA do `wrangler.jsonc`)
 *   frasy-midia-staging    o mesmo, do `env.staging`
 *   frasy-backups          `scripts/backup/enviar-ao-r2.ts`; regra `semanal`: `semanal/` expira em 56 dias
 *   frasy-modelos          pesos e runtime do ONNX (`scripts/modelos/publicar-*-r2.ts`); CORS de GET/HEAD
 *                          para as `--origens` (o navegador busca de outra origem)
 *
 * Localização: o wrangler só aceita `weur|eeur|apac|wnam|enam|oc` em `--location` (não há América do Sul),
 * então os buckets nascem sem dica e a Cloudflare escolhe pela origem da requisição de criação.
 *
 * Usa o wrangler do `node_modules`. Comando que falha (inclusive por falta de permissão do token) para o
 * script com a mensagem do wrangler; não há segunda tentativa com outra credencial.
 */
import { spawnSync } from 'node:child_process'
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'

const RAIZ = fileURLToPath(new URL('../..', import.meta.url))
const WRANGLER = join(RAIZ, 'node_modules', 'wrangler', 'bin', 'wrangler.js')

const BUCKETS = ['frasy-midia', 'frasy-midia-staging', 'frasy-backups', 'frasy-modelos']
const BACKUPS = 'frasy-backups'
const MODELOS = 'frasy-modelos'
const REGRA = { nome: 'semanal', prefixo: 'semanal/', dias: 56 }
const ORIGENS_PADRAO = [
  'https://frasy.com.br',
  'https://frasy-staging.guigui-cruzeiro.workers.dev',
  'http://localhost:3100',
]

function lerArgs(argv) {
  const seco = argv.includes('--dry-run')
  const i = argv.indexOf('--origens')
  const bruto = i >= 0 ? argv[i + 1] : argv.find((a) => a.startsWith('--origens='))?.slice('--origens='.length)
  const origens = bruto
    ? bruto
        .split(',')
        .map((o) => o.trim())
        .filter(Boolean)
    : ORIGENS_PADRAO
  for (const o of origens) {
    let u
    try {
      u = new URL(o)
    } catch {
      throw new Error(`--origens: "${o}" não é URL`)
    }
    if (u.origin !== o.replace(/\/$/, ''))
      throw new Error(`--origens: "${o}" tem de ser só a origem (esquema://host[:porta])`)
  }
  return { seco, origens: origens.map((o) => o.replace(/\/$/, '')) }
}

/** Roda o wrangler; erro = exceção com o que ele disse (stderr/stdout), sem nada do ambiente. */
function wrangler(args) {
  const r = spawnSync(process.execPath, [WRANGLER, ...args], { cwd: RAIZ, encoding: 'utf8', env: process.env })
  const saida = `${r.stdout ?? ''}${r.stderr ?? ''}`
  if (r.status !== 0) throw new Error(`wrangler ${args.join(' ')} falhou (${r.status}):\n${saida.trim()}`)
  return saida
}

const bucketsExistentes = () => [...wrangler(['r2', 'bucket', 'list']).matchAll(/^name:\s+(\S+)/gm)].map((m) => m[1])

function corsDosModelos(origens) {
  return {
    rules: [{ allowed: { origins: origens, methods: ['GET', 'HEAD'], headers: ['*'] }, maxAgeSeconds: 86400 }],
  }
}

function principal() {
  const { seco, origens } = lerArgs(process.argv.slice(2))
  const tabela = []

  if (seco) {
    console.log('[r2] plano (--dry-run, nada é alterado):')
    for (const b of BUCKETS) console.log(`  criar se faltar: ${b}`)
    console.log(
      `  lifecycle ${BACKUPS}: regra "${REGRA.nome}" — ${REGRA.prefixo} expira em ${REGRA.dias} dias (se faltar)`,
    )
    console.log(`  CORS ${MODELOS}: ${JSON.stringify(corsDosModelos(origens))}`)
    return
  }

  const existentes = new Set(bucketsExistentes())
  for (const b of BUCKETS) {
    if (existentes.has(b)) {
      tabela.push({ bucket: b, acao: 'já existia' })
      continue
    }
    wrangler(['r2', 'bucket', 'create', b])
    tabela.push({ bucket: b, acao: 'criado' })
  }

  const regras = wrangler(['r2', 'bucket', 'lifecycle', 'list', BACKUPS])
  const temRegra = new RegExp(`^name:\\s+${REGRA.nome}\\s*$`, 'm').test(regras)
  if (!temRegra)
    wrangler([
      'r2',
      'bucket',
      'lifecycle',
      'add',
      BACKUPS,
      REGRA.nome,
      REGRA.prefixo,
      '--expire-days',
      String(REGRA.dias),
      '--force',
    ])
  tabela.find((l) => l.bucket === BACKUPS).extra =
    `lifecycle ${REGRA.nome} (${REGRA.prefixo} ${REGRA.dias}d): ${temRegra ? 'já existia' : 'criada'}`

  // `cors set` sobrescreve: aplicar a mesma configuração de novo é o próprio idempotente.
  const dir = mkdtempSync(join(tmpdir(), 'frasy-r2-'))
  try {
    const arq = join(dir, 'cors.json')
    writeFileSync(arq, JSON.stringify(corsDosModelos(origens), null, 2))
    wrangler(['r2', 'bucket', 'cors', 'set', MODELOS, '--file', arq, '--force'])
  } finally {
    rmSync(dir, { recursive: true, force: true })
  }
  tabela.find((l) => l.bucket === MODELOS).extra = `CORS GET/HEAD: ${origens.join(', ')}`

  console.table(tabela.map(({ bucket, acao, extra }) => ({ bucket, acao, extra: extra ?? '' })))
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  try {
    principal()
  } catch (err) {
    console.error(`[r2] FALHOU: ${err.message}`)
    process.exit(1)
  }
}
