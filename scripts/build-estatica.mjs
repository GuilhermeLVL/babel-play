#!/usr/bin/env node
/**
 * BUILD DA EDIÇÃO ESTÁTICA — o `dist/` que vai para o Cloudflare Pages, sem servidor Node atrás.
 *
 *   npm run build:estatica
 *   npx wrangler pages deploy dist --project-name babel-play
 *
 * O que muda em relação ao `npm run build`:
 *  - `VITE_RECOMPENSAS_V2=1`: as recompensas v2 (Personalizar em cinco abas, maestria, temporada)
 *    ligadas — a flag `recompensas_v2` não tem servidor de flags para vir daqui (`core/flags.ts`);
 *  - `VITE_EDICAO_ESTATICA=1`: identidade anônima desde o arranque, nada de `/api` na rede, e o
 *    que depende de servidor (login, planos, IA de nuvem, importação pelo servidor) fora da tela
 *    (`src/lib/edicaoEstatica.ts`);
 *  - as variáveis do Supabase e do login saem VAZIAS, mesmo que o ambiente de quem compila as
 *    tenha: variável já presente no processo vence os arquivos `.env` no Vite. (O cliente também
 *    ignora o Supabase na edição estática — são duas travas para a mesma coisa.);
 *  - só o `vite build`: o servidor (`dist-server/`) não existe no Pages.
 *
 * Por que um script e não `VAR=1 vite build` no package.json: no Windows o npm roda os scripts
 * no cmd, que não entende a atribuição inline.
 *
 * No fim confere o que o Pages precisa encontrar (`_headers`, `index.html`) e o que NÃO pode ir
 * (protótipo de design, `lucide.min.js`) — e falha se algo estiver fora do lugar.
 */
import { spawnSync } from 'node:child_process'
import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs'
import { createRequire } from 'node:module'
import { dirname, join, relative } from 'node:path'
import { fileURLToPath } from 'node:url'

const RAIZ = join(dirname(fileURLToPath(import.meta.url)), '..')
const DIST = join(RAIZ, 'dist')

const env = {
  ...process.env,
  VITE_EDICAO_ESTATICA: '1',
  // Recompensas v2 ligadas na edição estática (onda 5): não há servidor de flags aqui.
  VITE_RECOMPENSAS_V2: '1',
  VITE_SUPABASE_URL: '',
  VITE_SUPABASE_ANON_KEY: '',
  VITE_AUTH_REQUIRED: '',
}

// `vite/bin/vite.js` não está nos "exports" do pacote: acha a raiz pelo package.json e monta o caminho.
const vite = join(dirname(createRequire(import.meta.url).resolve('vite/package.json')), 'bin', 'vite.js')
const r = spawnSync(process.execPath, [vite, 'build'], { cwd: RAIZ, env, stdio: 'inherit' })
if (r.status !== 0) process.exit(r.status ?? 1)

// ───────────────────────────── conferência do dist ─────────────────────────────

function arquivos(dir, fora = []) {
  for (const nome of readdirSync(dir)) {
    const caminho = join(dir, nome)
    if (statSync(caminho).isDirectory()) arquivos(caminho, fora)
    else fora.push(relative(DIST, caminho).replace(/\\/g, '/'))
  }
  return fora
}

const problemas = []
if (!existsSync(join(DIST, 'index.html'))) problemas.push('dist/index.html não existe')
const headers = join(DIST, '_headers')
if (!existsSync(headers)) problemas.push('dist/_headers não saiu no build (vem de public/_headers)')
else {
  const h = readFileSync(headers, 'utf8')
  if (!/Cross-Origin-Embedder-Policy:\s*credentialless/.test(h)) problemas.push('dist/_headers sem COEP credentialless')
  if (!/Cross-Origin-Opener-Policy:\s*same-origin/.test(h)) problemas.push('dist/_headers sem COOP same-origin')
}
const todos = arquivos(DIST)
const proibidos = todos.filter((f) => /(^|\/)prototipo|lucide\.min\.js/i.test(f))
if (proibidos.length) problemas.push(`arquivos de desenvolvimento no dist: ${proibidos.join(', ')}`)
// O bundle não pode carregar um projeto Supabase: a edição estática não tem login.
const js = todos.filter((f) => f.endsWith('.js'))
const comSupabase = js.filter((f) => /https:\/\/[a-z0-9-]+\.supabase\.co/.test(readFileSync(join(DIST, f), 'utf8')))
if (comSupabase.length) problemas.push(`URL de projeto Supabase no bundle: ${comSupabase.join(', ')}`)

if (problemas.length) {
  console.error('\nedição estática: o dist não está pronto para o Pages:')
  for (const p of problemas) console.error(`  - ${p}`)
  process.exit(1)
}
console.log(
  `\nedição estática pronta em dist/ (${todos.length} arquivos, _headers presente, sem protótipo nem lucide.min.js).`,
)
console.log('Publicar: npx wrangler pages deploy dist --project-name babel-play')
