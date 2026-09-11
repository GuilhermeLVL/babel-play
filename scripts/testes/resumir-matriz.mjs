#!/usr/bin/env node
/**
 * RESUMO DA MATRIZ E2E — lê os JSON por lote que `matriz-e2e.sh` grava e imprime o que importa:
 * totais por status, e cada falha com a primeira linha da mensagem de erro.
 *
 *     node scripts/testes/resumir-matriz.mjs            # usa $TMP/matriz-e2e
 *     node scripts/testes/resumir-matriz.mjs /caminho
 *
 * Existe porque o repórter de lista não sobrevive à morte do processo do Playwright nesta máquina:
 * quando o processo cai, a saída termina sem o resumo e sem as mensagens, e o único registro que
 * sobra é o JSON de cada lote.
 */
import { readdirSync, readFileSync } from 'node:fs'
import { join } from 'node:path'

const dir = process.argv[2] ?? join(process.env.TMP ?? process.env.TMPDIR ?? '/tmp', 'matriz-e2e')
const arquivos = readdirSync(dir)
  .filter((f) => f.startsWith('lote-') && f.endsWith('.json'))
  .sort()
const totais = { passed: 0, failed: 0, skipped: 0, timedOut: 0, interrupted: 0 }
const falhas = []

function percorrer(suite, projeto, caminhoPai = '') {
  for (const s of suite.suites ?? []) percorrer(s, projeto, s.title ? `${caminhoPai}${s.title} › ` : caminhoPai)
  for (const spec of suite.specs ?? []) {
    for (const t of spec.tests ?? []) {
      const r = t.results?.[t.results.length - 1]
      const status = r?.status ?? 'skipped'
      totais[status] = (totais[status] ?? 0) + 1
      if (status === 'failed' || status === 'timedOut') {
        const bruto = r?.error?.message ?? r?.errors?.[0]?.message ?? ''
        // O repórter JSON traz as cores ANSI da mensagem; cada sequência começa com ESC (27) + '['.
        const msg = bruto
          .split(String.fromCharCode(27))
          .map((parte, n) => (n === 0 ? parte : parte.replace(/^\[[0-9;]*m/, '')))
          .join('')
        falhas.push({
          projeto: t.projectName ?? projeto,
          arquivo: spec.file,
          titulo: `${caminhoPai}${spec.title}`,
          msg: msg.split('\n').slice(0, 4).join(' | ').slice(0, 300),
        })
      }
    }
  }
}

for (const f of arquivos) {
  const j = JSON.parse(readFileSync(join(dir, f), 'utf8'))
  const projeto = f.replace(/^lote-(.*)-\d+\.json$/, '$1')
  for (const s of j.suites ?? []) percorrer(s, projeto, s.title ? `${s.title} › ` : '')
}

console.log(`lotes: ${arquivos.length}`)
console.log(`totais: ${JSON.stringify(totais)}`)
for (const f of falhas) {
  console.log(`\nx [${f.projeto}] ${f.arquivo} › ${f.titulo}\n    ${f.msg}`)
}
process.exit(falhas.length ? 1 : 0)
