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
const ALLOWLIST = {
  'adm-zip': {
    ghsa: 'GHSA-xcpc-8h2w-3j85',
    reevaluateBy: '2026-11-01',
    reason: 'via onnxruntime-node → @huggingface/transformers; inferência roda no navegador, fora do servidor.',
  },
  'sharp': {
    ghsa: 'GHSA-f88m-g3jw-g9cj',
    reevaluateBy: '2026-11-01',
    reason: 'CVEs do libvips; dep de @huggingface/transformers; não está no caminho de execução do servidor.',
  },
  'onnxruntime-node': {
    ghsa: null, // sem advisory próprio — flagado por transitividade (adm-zip)
    reevaluateBy: '2026-11-01',
    reason: 'transitivo via adm-zip; runtime de inferência local, fora do servidor.',
  },
  '@huggingface/transformers': {
    ghsa: null, // flagado por transitividade (onnxruntime-node + sharp)
    reevaluateBy: '2026-11-01',
    reason: 'flagado por transitividade dos itens acima; inferência no navegador.',
  },
}

let report
try {
  report = JSON.parse(execSync('npm audit --json', { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] }))
} catch (e) {
  // npm audit sai com código != 0 quando há vulnerabilidades — o JSON ainda vem no stdout.
  try { report = JSON.parse(e.stdout) } catch { console.error('audit-gate: não consegui ler `npm audit --json`'); process.exit(2) }
}

const vulns = report.vulnerabilities ?? {}
const bloqueantes = []
const permitidas = []
for (const [name, v] of Object.entries(vulns)) {
  if (v.severity !== 'high' && v.severity !== 'critical') continue
  if (name in ALLOWLIST) { permitidas.push(name); continue }
  bloqueantes.push(`${v.severity.toUpperCase()} ${name} ${v.range ?? ''} (fix: ${JSON.stringify(v.fixAvailable)})`)
}

if (bloqueantes.length) {
  console.error('❌ audit-gate: HIGH/CRITICAL fora da allowlist — corrija ou justifique:\n  ' + bloqueantes.join('\n  '))
  process.exit(1)
}

// Reavaliação: avisa (não bloqueia) quando a data venceu — força revisar a allowlist a cada bump.
const hoje = new Date()
const vencidas = permitidas.filter((n) => new Date(ALLOWLIST[n].reevaluateBy) < hoje)
if (vencidas.length) {
  console.warn(`⚠  audit-gate: reavaliar a allowlist (data vencida): ${vencidas.map((n) => `${n} [${ALLOWLIST[n].reevaluateBy}]`).join(', ')}`)
}

const resumo = permitidas.map((n) => `${n}${ALLOWLIST[n].ghsa ? ` (${ALLOWLIST[n].ghsa})` : ' (transitivo)'}`).join(', ')
console.log(`✅ audit-gate: ok. HIGH permitidas só na allowlist (sem fix upstream): ${resumo || '(nenhuma)'}`)
