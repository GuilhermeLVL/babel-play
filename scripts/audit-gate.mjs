#!/usr/bin/env node
/**
 * Gate de auditoria de dependências (A-03 / S-08). Falha o build em vulnerabilidade HIGH/CRITICAL,
 * EXCETO a allowlist NOMEADA das que não têm fix upstream. Substitui o `npm audit --audit-level=
 * critical` + o comentário desatualizado que afirmava "2 ALTAS" quando havia 7 (Fase 1 A-03).
 *
 * Sem dependência: lê `npm audit --json`. As HIGH permitidas são só o cluster @huggingface/
 * transformers (inferência roda no NAVEGADOR, fora do caminho do servidor).
 *
 * D4 (audit-architecture-hardening): allowlist por ID de advisory (GHSA) + data de reavaliação.
 * Nem toda entrada tem GHSA próprio — `onnxruntime-node` e `@huggingface/transformers` são flagados
 * por TRANSITIVIDADE (sem advisory próprio), então casam por NOME (o que o `npm audit` chaveia).
 * Passada a data de reavaliação, o gate AVISA (não bloqueia) para forçar a revisão a cada bump.
 */
import { execSync } from 'node:child_process'

/**
 * HIGH sem fix upstream, aceitas com justificativa. A chave é o nome do pacote (como o `npm audit`
 * chaveia `vulnerabilities`). `ghsa`: advisory próprio quando existe; `null` = flagado por transitividade.
 */
/* Ficou VAZIA de 30/09 a 24/10/2026: o `adm-zip` (via onnxruntime-node) e o `sharp` (via transformers), que eram
   as HIGH aceitas, ganharam correção e vão forçados pelo `overrides` do package.json — e o
   `onnxruntime-node` e o `@huggingface/transformers` só entravam aqui por transitividade deles. Com
   a lista vazia, uma HIGH nova nesses pacotes reprova o build em vez de passar calada pela exceção.
   Uma entrada nova segue a forma: `'pacote': { ghsa: 'GHSA-…' | null, reevaluateBy: 'AAAA-MM-DD', reason }`. */
const ALLOWLIST = {
  /* 24/10/2026: o `miniflare` (dentro do `wrangler`, só dev/CLI) fixa `undici` 7.29.1 exato. O override
     aninhado `miniflare.undici` resolve no npm 11 mas o npm 10 da CI o ignora contra versão exata, e o
     `npm ci` quebra. O `undici` do servidor (raiz) já está em 7.30.1; este é só o do `wrangler dev`, fora
     do bundle do Worker. Sair daqui quando um `wrangler`/`miniflare` novo trouxer undici >= 7.30.1. */
  undici: {
    ghsa: 'GHSA-4qv8-2p9j-2685',
    reevaluateBy: '2026-11-07',
    reason: 'só node_modules/miniflare/node_modules/undici (dev); também GHSA-f72v-6w45-q472 e GHSA-xjj6-f33q-929c',
  },
}

let report
try {
  report = JSON.parse(execSync('npm audit --json', { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] }))
} catch (e) {
  // npm audit sai com código != 0 quando há vulnerabilidades — o JSON ainda vem no stdout.
  try {
    report = JSON.parse(e.stdout)
  } catch {
    console.error('audit-gate: não consegui ler `npm audit --json`')
    process.exit(2)
  }
}

const vulns = report.vulnerabilities ?? {}
const bloqueantes = []
const permitidas = []
for (const [name, v] of Object.entries(vulns)) {
  if (v.severity !== 'high' && v.severity !== 'critical') continue
  if (name in ALLOWLIST) {
    permitidas.push(name)
    continue
  }
  bloqueantes.push(`${v.severity.toUpperCase()} ${name} ${v.range ?? ''} (fix: ${JSON.stringify(v.fixAvailable)})`)
}

if (bloqueantes.length) {
  console.error(
    '❌ audit-gate: HIGH/CRITICAL fora da allowlist — corrija ou justifique:\n  ' + bloqueantes.join('\n  '),
  )
  process.exit(1)
}

// Reavaliação: avisa (não bloqueia) quando a data venceu — força revisar a allowlist a cada bump.
const hoje = new Date()
const vencidas = permitidas.filter((n) => new Date(ALLOWLIST[n].reevaluateBy) < hoje)
if (vencidas.length) {
  console.warn(
    `⚠  audit-gate: reavaliar a allowlist (data vencida): ${vencidas.map((n) => `${n} [${ALLOWLIST[n].reevaluateBy}]`).join(', ')}`,
  )
}

const resumo = permitidas
  .map((n) => `${n}${ALLOWLIST[n].ghsa ? ` (${ALLOWLIST[n].ghsa})` : ' (transitivo)'}`)
  .join(', ')
console.log(`✅ audit-gate: ok. HIGH permitidas só na allowlist (sem fix upstream): ${resumo || '(nenhuma)'}`)
