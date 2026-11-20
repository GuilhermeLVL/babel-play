#!/usr/bin/env node
/**
 * USUÁRIOS DE CARGA NO STAGING (para `carga.k6.js` com `TOKENS`).
 *
 *   # criar: grava BASE, TOKENS e VUS num arquivo com modo 0600 (nada de segredo vai ao terminal)
 *   STAGING_URL=... SUPABASE_URL=... SUPABASE_ANON_KEY=... SUPABASE_SERVICE_ROLE_KEY=... \
 *     node scripts/perf/staging-usuarios.mjs --n 10 --saida /caminho/k6.env
 *
 *   # apagar os mesmos usuários (admin API); não toca em mais nada
 *   SUPABASE_URL=... SUPABASE_SERVICE_ROLE_KEY=... node scripts/perf/staging-usuarios.mjs --apagar --n 10
 *
 * ATENÇÃO: o staging compartilha o `auth.users` com a PRODUÇÃO (mesmo projeto Supabase). Os usuários
 * `carga-<i>@frasy-teste.dev` ficam lá até o `--apagar`: não esqueça de rodá-lo ao fim da corrida.
 *
 * Por usuário `carga-<i>@frasy-teste.dev`: cria no Supabase Auth (senha aleatória desta execução, nunca
 * gravada), declara a data de nascimento (`PUT /api/me/idade`, sem a qual a nuvem responde 403
 * `idade_nao_informada`) e faz login por senha para obter o JWT. Um usuário só bateria no limitador de
 * escrita por usuário (429) e a latência medida seria a do limitador; por isso N usuários.
 *
 * O JWT vale ~1 h: crie os usuários pouco antes de rodar o k6. O arquivo `--saida` é formato `--env-file`
 * do Docker (`CHAVE=valor`, uma por linha).
 */
import { randomBytes } from 'node:crypto'
import { chmodSync, writeFileSync } from 'node:fs'
import { isAbsolute, relative, resolve, sep } from 'node:path'

import { acharUsuario, apagarUsuario, chamar, entrar, prepararUsuario, trecho } from './_supabase-usuario.mjs'

const env = (nome) => {
  const v = process.env[nome]
  if (!v) throw new Error(`variável de ambiente ausente: ${nome}`)
  return v
}

const emailDe = (i) => `carga-${i}@frasy-teste.dev`

function argumentos(argv) {
  const a = { n: 10, saida: null, apagar: false }
  for (let i = 0; i < argv.length; i++) {
    if (argv[i] === '--n') a.n = Number(argv[++i])
    else if (argv[i] === '--saida') a.saida = argv[++i]
    else if (argv[i] === '--apagar') a.apagar = true
    else throw new Error(`argumento desconhecido: ${argv[i]}`)
  }
  if (!Number.isInteger(a.n) || a.n < 1 || a.n > 100) throw new Error('--n precisa ser um inteiro de 1 a 100')
  return a
}

async function criar({ n, saida }) {
  if (!saida) throw new Error('--saida <arquivo> é obrigatório ao criar')
  // Tokens (JWT de usuários) não podem parar dentro do repositório, onde um `git add .` os versionaria.
  const rel = relative(process.cwd(), resolve(saida))
  if (!isAbsolute(rel) && rel !== '..' && !rel.startsWith(`..${sep}`)) {
    throw new Error(
      `--saida dentro do repositório (${saida}) recusada: use um caminho sob $TMPDIR (ex.: $TMPDIR/k6.env)`,
    )
  }
  const base = env('STAGING_URL').replace(/\/+$/, '')
  const supa = env('SUPABASE_URL').replace(/\/+$/, '')
  const anon = env('SUPABASE_ANON_KEY')
  const admin = env('SUPABASE_SERVICE_ROLE_KEY')

  const tokens = []
  for (let i = 1; i <= n; i++) {
    const email = emailDe(i)
    const senha = randomBytes(24).toString('base64url')
    await prepararUsuario(supa, admin, email, senha)
    const token = await entrar(supa, anon, email, senha)
    const idade = await chamar(`${base}/api/me/idade`, {
      method: 'PUT',
      headers: { Authorization: `Bearer ${token}`, 'content-type': 'application/json' },
      body: JSON.stringify({ nascimento: '1990-01-01' }),
    })
    if (idade.status !== 200)
      throw new Error(`PUT /api/me/idade (usuário ${i}): ${idade.status} ${trecho(idade.corpo)}`)
    tokens.push(token)
  }
  // Modo 0600 só vale se o arquivo for novo; o scratch do operador não deve conter um antigo.
  writeFileSync(saida, `BASE=${base}\nTOKENS=${tokens.join(',')}\nVUS=${n * 2}\n`, { mode: 0o600 })
  chmodSync(saida, 0o600) // o `mode` acima não vale para um arquivo que já existia
  console.log(`${n} usuários prontos`)
}

async function apagar({ n }) {
  const supa = env('SUPABASE_URL').replace(/\/+$/, '')
  const admin = env('SUPABASE_SERVICE_ROLE_KEY')
  let apagados = 0
  for (let i = 1; i <= n; i++) {
    const u = await acharUsuario(supa, admin, emailDe(i))
    if (!u?.id) continue
    const st = await apagarUsuario(supa, admin, u.id)
    if (st >= 200 && st < 300) apagados++
    else console.error(`aviso: não consegui apagar ${emailDe(i)} (${st})`)
  }
  console.log(`${apagados} usuários apagados`)
}

const args = argumentos(process.argv.slice(2))
;(args.apagar ? apagar(args) : criar(args)).catch((e) => {
  console.error(`erro: ${e?.message ?? e}`)
  process.exit(1)
})
