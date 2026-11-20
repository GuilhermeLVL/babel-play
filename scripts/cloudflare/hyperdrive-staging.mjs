#!/usr/bin/env node
/**
 * STAGING NA CLOUDFLARE: BANCO PRÓPRIO + HYPERDRIVE PRÓPRIO (Fase 4, T5). Idempotente: o que já existe fica.
 *
 *   set -a; source .env; set +a      # SUPABASE_PROJECT_REF, SUPABASE_DB_PASSWORD, CLOUDFLARE_API_TOKEN/_ACCOUNT_ID
 *   node scripts/cloudflare/hyperdrive-staging.mjs --dry-run      # só o plano (sem senha)
 *   node scripts/cloudflare/hyperdrive-staging.mjs [--sem-migrar]
 *
 *   1. `CREATE DATABASE frasy_staging` no Supabase SP (o MESMO projeto da produção; o banco `postgres` da
 *      produção não é tocado), pela conexão direta `db.<ref>.supabase.co` com a CA `data/supabase-ca.crt`;
 *      sem rota IPv6 nesta rede, pelo pooler de sessão `aws-1-sa-east-1.pooler.supabase.com` (o script diz qual).
 *   2. Hyperdrive `frasy-staging-sp` -> `frasy_staging`, com o mesmo perfil do `babel-sp` da produção
 *      (verify-full com a CA supabase-2021 já enviada, cache desligado, 20 conexões de origem).
 *      A lista sai do `wrangler hyperdrive list`; a criação vai pela API da Cloudflare com a senha no CORPO
 *      da requisição: o `wrangler hyperdrive create` só aceita a senha em argv (`--connection-string` ou
 *      `--password`), e argv aparece no `ps` de qualquer usuário da máquina.
 *   3. `npm run db:migrate` contra `frasy_staging` (a URL vai por variável de ambiente, nunca por argv).
 *
 * Nunca imprime a senha: toda saída de erro passa por `mascarar`. O id do Hyperdrive não é segredo.
 */
import { spawnSync } from 'node:child_process'
import { existsSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'

import pg from 'pg'

const RAIZ = fileURLToPath(new URL('../..', import.meta.url))
const WRANGLER = join(RAIZ, 'node_modules', 'wrangler', 'bin', 'wrangler.js')
const CA = join(RAIZ, 'data', 'supabase-ca.crt')

const BANCO = 'frasy_staging'
const HYPERDRIVE = 'frasy-staging-sp'
const CA_CERT_ID = '011bac50-d7ab-4034-b878-ff0a5d5c3cf5'
const LIMITE_DE_ORIGEM = 20
const POOLER = 'aws-1-sa-east-1.pooler.supabase.com'

function exigir(nome) {
  const v = process.env[nome]
  if (!v) throw new Error(`${nome} ausente (set -a; source .env; set +a)`)
  return v
}

const senhas = () =>
  [
    process.env.SUPABASE_DB_PASSWORD,
    process.env.SUPABASE_DB_PASSWORD && encodeURIComponent(process.env.SUPABASE_DB_PASSWORD),
  ]
    .concat(process.env.CLOUDFLARE_API_TOKEN)
    .filter(Boolean)

/** Tira a senha do banco e o token da Cloudflare de qualquer texto (cru e codificado para URL). */
function mascarar(texto) {
  let t = String(texto)
  for (const s of senhas()) t = t.split(s).join('***')
  return t
}

function wrangler(args) {
  const r = spawnSync(process.execPath, [WRANGLER, ...args], { cwd: RAIZ, encoding: 'utf8', env: process.env })
  const saida = `${r.stdout ?? ''}${r.stderr ?? ''}`
  if (r.status !== 0) throw new Error(`wrangler ${args.join(' ')} falhou (${r.status}):\n${mascarar(saida.trim())}`)
  return saida
}

/** Conexão direta (IPv6) primeiro; sem rota, o pooler de sessão. Devolve o client aberto e por onde foi. */
async function conectar(ref, senha) {
  const ssl = { ca: readFileSync(CA, 'utf8'), rejectUnauthorized: true }
  const opcoes = [
    { via: 'direta', host: `db.${ref}.supabase.co`, user: 'postgres' },
    { via: 'pooler', host: POOLER, user: `postgres.${ref}` },
  ]
  let ultimo
  for (const o of opcoes) {
    const c = new pg.Client({
      host: o.host,
      port: 5432,
      user: o.user,
      password: senha,
      database: 'postgres',
      ssl,
      connectionTimeoutMillis: 10_000,
    })
    try {
      await c.connect()
      return { client: c, via: o.via }
    } catch (err) {
      ultimo = err
      console.warn(`[staging] conexão ${o.via} falhou: ${mascarar(err.message)}`)
      await c.end().catch(() => {})
    }
  }
  throw new Error(`sem conexão ao Supabase SP: ${mascarar(ultimo?.message)}`)
}

async function garantirBanco(ref, senha) {
  const { client, via } = await conectar(ref, senha)
  try {
    const { rowCount } = await client.query('SELECT 1 FROM pg_database WHERE datname = $1', [BANCO])
    if (rowCount) return `já existe (conexão ${via})`
    // CREATE DATABASE não roda dentro de transação: consulta simples, fora de BEGIN.
    await client.query(`CREATE DATABASE ${BANCO}`)
    return `criado (conexão ${via})`
  } finally {
    await client.end().catch(() => {})
  }
}

/** `wrangler hyperdrive list` imprime uma tabela; a linha do nome traz o id de 32 hex. */
function hyperdriveExistente() {
  const saida = wrangler(['hyperdrive', 'list'])
  for (const linha of saida.split('\n')) {
    if (!new RegExp(`(^|[\\s│|])${HYPERDRIVE}([\\s│|]|$)`).test(linha)) continue
    const id = linha.match(/\b[0-9a-f]{32}\b/)?.[0]
    if (id) return id
  }
  return null
}

async function criarHyperdrive(ref, senha) {
  const conta = exigir('CLOUDFLARE_ACCOUNT_ID')
  const token = exigir('CLOUDFLARE_API_TOKEN')
  const resp = await fetch(`https://api.cloudflare.com/client/v4/accounts/${conta}/hyperdrive/configs`, {
    method: 'POST',
    headers: { authorization: `Bearer ${token}`, 'content-type': 'application/json' },
    body: JSON.stringify({
      name: HYPERDRIVE,
      origin: {
        scheme: 'postgresql',
        host: `db.${ref}.supabase.co`,
        port: 5432,
        database: BANCO,
        user: 'postgres',
        password: senha,
      },
      caching: { disabled: true },
      mtls: { ca_certificate_id: CA_CERT_ID, sslmode: 'verify-full' },
      origin_connection_limit: LIMITE_DE_ORIGEM,
    }),
  })
  const corpo = await resp.json().catch(() => ({}))
  if (!resp.ok || !corpo.success || !corpo.result?.id)
    throw new Error(`criar o Hyperdrive falhou (${resp.status}): ${mascarar(JSON.stringify(corpo.errors ?? corpo))}`)
  return corpo.result.id
}

function migrar(ref, senha) {
  const url =
    `postgres://postgres:${encodeURIComponent(senha)}@db.${ref}.supabase.co:5432/${BANCO}` +
    `?sslmode=verify-full&sslrootcert=${encodeURIComponent(CA)}`
  const r = spawnSync('npm', ['run', 'db:migrate'], {
    cwd: RAIZ,
    encoding: 'utf8',
    env: { ...process.env, DATABASE_URL: url },
  })
  const saida = mascarar(`${r.stdout ?? ''}${r.stderr ?? ''}`.trim())
  if (r.status !== 0) throw new Error(`db:migrate falhou (${r.status}):\n${saida}`)
  return saida
}

async function principal() {
  const argv = process.argv.slice(2)
  const seco = argv.includes('--dry-run')
  const semMigrar = argv.includes('--sem-migrar')
  const ref = exigir('SUPABASE_PROJECT_REF')

  if (seco) {
    console.log('[staging] plano (--dry-run, nada é alterado):')
    console.log(`  1. CREATE DATABASE ${BANCO} se faltar (direta db.${ref}.supabase.co; reserva: ${POOLER})`)
    console.log(
      `  2. Hyperdrive ${HYPERDRIVE} se faltar: postgresql://postgres:***@db.${ref}.supabase.co:5432/${BANCO}` +
        ` | CA ${CA_CERT_ID} verify-full | cache desligado | origem ${LIMITE_DE_ORIGEM}`,
    )
    console.log(semMigrar ? '  3. (--sem-migrar) sem migrações' : `  3. npm run db:migrate contra ${BANCO}`)
    return
  }

  const senha = exigir('SUPABASE_DB_PASSWORD')
  exigir('CLOUDFLARE_API_TOKEN')
  if (!existsSync(CA)) throw new Error(`CA ausente: ${CA} (a supabase-2021, baixada do painel)`)

  console.log(`[staging] banco ${BANCO}: ${await garantirBanco(ref, senha)}`)

  let id = hyperdriveExistente()
  if (id) console.log(`[staging] Hyperdrive ${HYPERDRIVE}: já existe (${id})`)
  else {
    id = await criarHyperdrive(ref, senha)
    console.log(`[staging] Hyperdrive ${HYPERDRIVE}: criado (${id})`)
  }

  if (!semMigrar) {
    const saida = migrar(ref, senha)
    console.log(`[staging] migrações em ${BANCO}:\n${saida.split('\n').slice(-5).join('\n')}`)
  }

  console.log('\n[staging] no env.staging do wrangler.jsonc:')
  console.log(
    JSON.stringify(
      {
        hyperdrive: [
          { binding: 'HYPERDRIVE', id, localConnectionString: 'postgres://postgres:teste@localhost:5433/postgres' },
        ],
      },
      null,
      2,
    ),
  )
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  principal().catch((err) => {
    console.error(`[staging] FALHOU: ${mascarar(err.message)}`)
    process.exit(1)
  })
}
