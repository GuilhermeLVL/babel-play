#!/usr/bin/env node
/**
 * LIMPA PROCESSOS ÓRFÃOS deixados por testes e scripts deste repositório.
 *
 * Por que existe (19/10/2026): testes que sobem um servidor filho (cluster, desligamento gracioso,
 * teto de erros, preflight) não o matam quando são interrompidos ou falham. O filho fica órfão,
 * adotado pelo processo 1, ocioso e ocupando memória. Em dois dias de suíte, 113 `node server.ts`
 * acumulados levaram o macOS a 11 GB de swap e a máquina travou. O sistema não mata processo que
 * responde; a limpeza tem de ser nossa.
 *
 * O que ele encerra: só processos cujo PAI MORREU (ppid 1) e cuja linha de comando cita este
 * repositório (o nome da pasta raiz, o que inclui os worktrees em `.claude/worktrees/`). Isso
 * evita matar servidores de outros projetos ou um `npm run dev` seu, que tem pai vivo.
 *
 * Uso:
 *   npm run limpar                 encerra órfãos com mais de 10 min
 *   npm run limpar -- --dry-run    só lista
 *   npm run limpar -- --tudo       ignora a idade (também os recém-órfãos)
 *   npm run limpar -- --silencioso não imprime nada quando não há o que fazer (hook de sessão)
 *
 * Sem dependências: usa `ps` (macOS e Linux) e `process.kill`.
 */
import { execFileSync } from 'node:child_process'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const RAIZ = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const NOME_DO_REPO = path.basename(RAIZ)
const IDADE_MINIMA_SEGUNDOS = 10 * 60

/* Processos que a suíte e os scripts spawnam e que não deveriam sobreviver ao pai. */
const ALVOS = [
  /\bnode\b.*\bserver\.ts\b/, // servidor filho dos testes (via tsx)
  /\bvitest\b.*\bworkers?\b|\bsuppress-warnings\.cjs\b/, // worker do vitest
  /\besbuild\b.*--service/, // serviço do esbuild que o tsx deixa para trás
  /\bplaywright\b.*\b(run-server|test-server)\b/, // servidor do Playwright
]

const args = new Set(process.argv.slice(2))
const dryRun = args.has('--dry-run')
const tudo = args.has('--tudo')
const silencioso = args.has('--silencioso')

/** `etime` do ps: `[[dd-]hh:]mm:ss` → segundos. */
function segundosDeEtime(etime) {
  const [dias, resto] = etime.includes('-') ? etime.split('-') : ['0', etime]
  const partes = resto.split(':').map(Number)
  const [h, m, s] = partes.length === 3 ? partes : [0, ...partes]
  return Number(dias) * 86400 + h * 3600 + m * 60 + s
}

function listarOrfaos() {
  const saida = execFileSync('ps', ['-Ao', 'pid=,ppid=,etime=,rss=,args='], { encoding: 'utf8' })
  const orfaos = []
  for (const linha of saida.split('\n')) {
    const m = linha.match(/^\s*(\d+)\s+(\d+)\s+(\S+)\s+(\d+)\s+(.*)$/)
    if (!m) continue
    const [, pid, ppid, etime, rss, cmd] = m
    if (Number(ppid) !== 1 || Number(pid) === process.pid) continue
    if (!cmd.includes(NOME_DO_REPO)) continue
    if (!ALVOS.some((re) => re.test(cmd))) continue
    const idade = segundosDeEtime(etime)
    if (!tudo && idade < IDADE_MINIMA_SEGUNDOS) continue
    orfaos.push({ pid: Number(pid), idade, rssMb: Math.round(Number(rss) / 1024), cmd })
  }
  return orfaos
}

function vivo(pid) {
  try {
    process.kill(pid, 0)
    return true
  } catch {
    return false
  }
}

function matar(pids, sinal) {
  for (const pid of pids) {
    try {
      process.kill(pid, sinal)
    } catch {
      /* já morreu entre o ps e o kill */
    }
  }
}

const orfaos = listarOrfaos()
if (orfaos.length === 0) {
  if (!silencioso) console.log(`limpar: nenhum processo órfão de ${NOME_DO_REPO}.`)
  process.exit(0)
}

const memoria = orfaos.reduce((soma, p) => soma + p.rssMb, 0)
console.log(
  `limpar: ${orfaos.length} processo(s) órfão(s) de ${NOME_DO_REPO} (${memoria} MB residentes)${dryRun ? ' — dry-run, nada encerrado' : ''}`,
)
for (const p of orfaos) {
  const resumo = p.cmd
    .replace(/^\S*\/node\s+/, 'node ')
    .replace(/--require \S+ --import \S+ /, '')
    .replace(/--experimental-import-meta-resolve --require \S+ /, '')
    .slice(0, 90)
  console.log(`  pid ${p.pid}  ${Math.round(p.idade / 60)} min  ${p.rssMb} MB  ${resumo}`)
}
if (dryRun) process.exit(0)

const pids = orfaos.map((p) => p.pid)
matar(pids, 'SIGTERM')
await new Promise((r) => setTimeout(r, 2000))
const teimosos = pids.filter(vivo)
if (teimosos.length > 0) {
  matar(teimosos, 'SIGKILL')
  await new Promise((r) => setTimeout(r, 500))
}
const restantes = pids.filter(vivo)
console.log(
  `limpar: ${pids.length - restantes.length} encerrado(s)` +
    (restantes.length ? `, ${restantes.length} resistiram (pids ${restantes.join(', ')})` : '.'),
)
process.exit(0)
