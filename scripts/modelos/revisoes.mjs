#!/usr/bin/env node
/**
 * Compara as revisões FIXADAS dos modelos (`src/gateway/revisoesDosModelos.ts`) com o `main`
 * atual de cada repositório no Hugging Face. Não muda nada — só mostra o que mudou lá fora, para
 * alguém decidir, com revisão, se e quando atualizar (GAP-014).
 *
 *   node scripts/modelos/revisoes.mjs
 *
 * Sai com 0 quando tudo está igual e com 1 quando algum `main` andou.
 */
import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const RAIZ = join(dirname(fileURLToPath(import.meta.url)), '..', '..')
const fonte = readFileSync(join(RAIZ, 'src', 'gateway', 'revisoesDosModelos.ts'), 'utf8')
const fixadas = [...fonte.matchAll(/'([^']+\/[^']+)':\s*'([0-9a-f]{40})'/g)].map((m) => ({ modelo: m[1], sha: m[2] }))

let mudaram = 0
for (const { modelo, sha } of fixadas) {
  const r = await fetch(`https://huggingface.co/api/models/${modelo}`)
  if (!r.ok) {
    console.log(`?  ${modelo}: HTTP ${r.status}`)
    continue
  }
  const j = await r.json()
  if (j.sha === sha) {
    console.log(`=  ${modelo}`)
  } else {
    mudaram += 1
    console.log(`≠  ${modelo}: fixado ${sha.slice(0, 8)}, main agora ${String(j.sha).slice(0, 8)} (${j.lastModified})`)
  }
}
console.log(mudaram ? `\n${mudaram} modelo(s) com main novo — revise antes de atualizar.` : '\nnada mudou.')
process.exit(mudaram ? 1 : 0)
