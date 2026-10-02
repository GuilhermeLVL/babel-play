#!/usr/bin/env node
/**
 * VITRINE: o app completo na sua máquina, com login e cobrança de mentira e uma conta pronta em
 * cada estado de plano.
 *
 *     npm run vitrine                 sobe (e repõe cada conta no estado do rótulo dela)
 *     npm run vitrine -- --do-zero    apaga o banco da vitrine antes de subir
 *     npm run vitrine -- --com-ia     deixa as chaves de IA do seu `.env` valerem (gasta a sua cota)
 *
 * POR QUE EXISTE. A produção de hoje é a edição estática, sem conta: Planos, checkout, assinatura,
 * consumo, avisos de limite e telas de menor não aparecem nela. `npm run dev:local` abre tudo, mas
 * como dono do self-host, com tudo liberado: não mostra o Grátis, o teste, o Premium, o atraso. Aqui
 * o servidor roda no modo PÚBLICO de verdade (`AUTH_REQUIRED=1`), só que apontado para um Supabase
 * falso e um Asaas falso, os dois nesta máquina.
 *
 * Quatro processos, todos em 127.0.0.1:
 *   1. Supabase falso   tests/e2e-publico/_supabase-falso.mjs (o mesmo do e2e, com as contas da vitrine)
 *   2. Asaas falso      scripts/vitrine/asaas-falso.mjs (API, fatura de mentira e o PAINEL)
 *   3. semeador         scripts/vitrine/semear.ts (uma vez, antes do app)
 *   4. o app            server.ts em modo dev, banco próprio em data/vitrine/
 *
 * NADA DE FORA É TOCADO. Toda variável do seu `.env` é passada VAZIA ao servidor (o dotenv só
 * preenche o que falta), então nem Supabase, nem Asaas, nem R2, nem e-mail, nem Sentry de verdade
 * recebem nada. `--com-ia` abre a exceção das chaves de IA, e só delas.
 *
 * Roda em primeiro plano, como o `subir-dev.mjs`: Ctrl+C encerra os quatro.
 */
import { spawn, spawnSync } from 'node:child_process'
import { randomBytes } from 'node:crypto'
import { existsSync, mkdirSync, readFileSync, rmSync } from 'node:fs'
import path from 'node:path'

if (process.env.NODE_ENV === 'production') {
  console.error('A vitrine não sobe com NODE_ENV=production.')
  process.exit(2)
}

const opcoes = new Set(process.argv.slice(2))
const PORTA_APP = Number(process.env.VITRINE_PORTA || 4360)
const PORTA_ASAAS = Number(process.env.VITRINE_ASAAS_PORTA || 4361)
const PORTA_SUPABASE = Number(process.env.VITRINE_SUPABASE_PORTA || 54360)
const APP = `http://localhost:${PORTA_APP}`
const ASAAS = `http://127.0.0.1:${PORTA_ASAAS}`
const SUPABASE = `http://127.0.0.1:${PORTA_SUPABASE}`
const PASTA = path.join('data', 'vitrine')
const AQUI = path.join('scripts', 'vitrine')

if (opcoes.has('--do-zero')) rmSync(PASTA, { recursive: true, force: true })
mkdirSync(PASTA, { recursive: true })

/** As chaves do `.env` do dono, para passá-las vazias. Só os NOMES importam aqui. */
function chavesDoEnv() {
  if (!existsSync('.env')) return []
  return readFileSync('.env', 'utf8')
    .split(/\r?\n/)
    .map((linha) => /^\s*(?:export\s+)?([A-Za-z_][A-Za-z0-9_]*)\s*=/.exec(linha)?.[1])
    .filter(Boolean)
}
const EH_DE_IA = /^(LLM_|STT_|GROQ_|OPENROUTER_|DEEPINFRA_|CEREBRAS_|IA_|AI_)/
const apagadas = Object.fromEntries(
  chavesDoEnv()
    .filter((nome) => !(opcoes.has('--com-ia') && EH_DE_IA.test(nome)))
    .map((nome) => [nome, '']),
)

const tokenDoWebhook = randomBytes(24).toString('hex')
const ambienteDoApp = {
  ...process.env,
  ...apagadas,
  PORT: String(PORTA_APP),
  NODE_ENV: 'development',
  AUTH_REQUIRED: '1',
  SUPABASE_URL: SUPABASE,
  SUPABASE_SERVICE_ROLE_KEY: 'service-role-vitrine',
  VITE_AUTH_REQUIRED: '1',
  VITE_SUPABASE_URL: SUPABASE,
  VITE_SUPABASE_ANON_KEY: 'anon-vitrine',
  DATABASE_URL: `file:./${PASTA.replaceAll('\\', '/')}/vitrine.db`,
  ASAAS_BASE_URL: `${ASAAS}/v3`,
  ASAAS_API_KEY: 'chave-da-vitrine',
  ASAAS_WEBHOOK_TOKEN: tokenDoWebhook,
  APP_URL: APP,
  // O convite ao responsável não tem e-mail para onde ir: o link aparece na tela.
  CONVITE_LINK_NA_TELA: '1',
  VITE_CACHE_DIR: path.join('node_modules', '.vite-vitrine'),
}

const filhos = []
function subir(nome, args, env) {
  const filho = spawn(process.execPath, args, { cwd: process.cwd(), env, stdio: 'inherit' })
  filho.on('exit', (codigo) => {
    if (encerrando) return
    console.error(`\n[vitrine] ${nome} parou (código ${codigo ?? '?'}); encerrando o resto.`)
    encerrar(codigo ?? 1)
  })
  filhos.push(filho)
  return filho
}

let encerrando = false
function encerrar(codigo = 0) {
  if (encerrando) return
  encerrando = true
  for (const f of filhos) f.kill()
  process.exit(codigo)
}
process.on('SIGINT', () => encerrar(0))
process.on('SIGTERM', () => encerrar(0))

async function esperar(url, nome, limiteMs = 180_000) {
  const fim = Date.now() + limiteMs
  while (Date.now() < fim) {
    try {
      if ((await fetch(url)).ok) return
    } catch {
      /* ainda subindo */
    }
    await new Promise((r) => setTimeout(r, 400))
  }
  console.error(`[vitrine] ${nome} não respondeu em ${url}`)
  encerrar(1)
}

console.log('\n  Babel Play — vitrine local (login e cobrança de mentira)\n')

subir('o Supabase falso', [path.join('tests', 'e2e-publico', '_supabase-falso.mjs')], {
  ...process.env,
  SUPABASE_FALSO_PORTA: String(PORTA_SUPABASE),
  SUPABASE_FALSO_CONTAS: path.join(AQUI, 'contas.json'),
  SUPABASE_FALSO_ESTADO: path.join(PASTA, 'contas-criadas.json'),
})
subir('o Asaas falso', [path.join(AQUI, 'asaas-falso.mjs')], {
  ...process.env,
  VITRINE_ASAAS_PORTA: String(PORTA_ASAAS),
  VITRINE_ASAAS_ESTADO: path.join(PASTA, 'asaas.json'),
  VITRINE_APP_URL: APP,
  VITRINE_SUPABASE_URL: SUPABASE,
  ASAAS_WEBHOOK_TOKEN: tokenDoWebhook,
})

await esperar(`${SUPABASE}/auth/v1/.well-known/jwks.json`, 'o Supabase falso', 30_000)
await esperar(`${ASAAS}/vitrine/saude`, 'o Asaas falso', 30_000)

const tsx = path.join('node_modules', 'tsx', 'dist', 'cli.mjs')
const semeio = spawnSync(process.execPath, [tsx, path.join(AQUI, 'semear.ts')], {
  cwd: process.cwd(),
  env: ambienteDoApp,
  stdio: 'inherit',
})
if (semeio.status !== 0) encerrar(semeio.status ?? 1)

subir('o app', [tsx, 'server.ts'], ambienteDoApp)
await esperar(`${APP}/api/health`, 'o app')

console.log(`
  Pronto.

    Painel da vitrine   ${ASAAS}      (comece por aqui: um clique entra em cada conta)
    O app               ${APP}

  IA de nuvem: ${opcoes.has('--com-ia') ? 'LIGADA com as chaves do seu .env' : 'desligada (use --com-ia para ligar)'}.
  Ctrl+C encerra tudo. Mantenha este terminal aberto.
`)
