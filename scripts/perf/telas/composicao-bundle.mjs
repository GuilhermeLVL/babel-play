#!/usr/bin/env node
/**
 * COMPOSIÇÃO DO BUNDLE — de que módulos é feito cada chunk (auditoria de performance do frontend,
 * 26/09/2026).
 *
 *   node scripts/perf/telas/composicao-bundle.mjs [--chunk=index] [--top=40] [--saida=<arquivo.json>]
 *
 * Roda um `vite build` com a MESMA configuração do projeto num diretório temporário (o `dist` do
 * projeto não é tocado) e, no `generateBundle`, soma o `renderedLength` de cada módulo por chunk —
 * o tamanho que o módulo ocupa no chunk depois do tree-shaking e antes da minificação. Serve para
 * responder "o que está no chunk de entrada e não precisava estar": o orçamento
 * (`orcamento-bundle.mjs`) diz QUANTO pesa; este diz O QUÊ.
 *
 * Agrupa `node_modules/<pacote>` num item só. Imprime os `--top` maiores do chunk pedido e grava o
 * mapa completo em `--saida` (todos os chunks), para comparar antes/depois.
 */
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

import { build } from 'vite'

import { nomeDoModulo as nomeRelativo } from './_medidas.mjs'

const RAIZ = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..', '..')
const arg = (n, d) => process.argv.find((x) => x.startsWith(`--${n}=`))?.slice(n.length + 3) ?? d
const alvo = arg('chunk', 'index')
const top = Number(arg('top', 40))
const saida = arg('saida', null)

const composicao = {}
const temp = mkdtempSync(path.join(os.tmpdir(), 'composicao-'))
try {
  await build({
    root: RAIZ,
    configFile: path.join(RAIZ, 'vite.config.ts'),
    logLevel: 'warn',
    build: { outDir: temp, emptyOutDir: true, reportCompressedSize: false },
    plugins: [
      {
        name: 'composicao-do-bundle',
        generateBundle(_, bundle) {
          for (const [arquivo, chunk] of Object.entries(bundle)) {
            if (chunk.type !== 'chunk') continue
            const mapa = {}
            for (const [id, m] of Object.entries(chunk.modules)) {
              const nome = nomeRelativo(id, RAIZ)
              mapa[nome] = (mapa[nome] ?? 0) + m.renderedLength
            }
            composicao[arquivo] = { entrada: chunk.isEntry, total: chunk.code.length, modulos: mapa }
          }
        },
      },
    ],
  })
} finally {
  rmSync(temp, { recursive: true, force: true })
}

const nomes = Object.keys(composicao).filter((f) => path.basename(f).startsWith(`${alvo}-`))
for (const f of nomes) {
  const c = composicao[f]
  const itens = Object.entries(c.modulos).sort((a, b) => b[1] - a[1])
  const soma = itens.reduce((a, [, n]) => a + n, 0)
  console.log(`\n${f}${c.entrada ? ' (ENTRADA)' : ''}: ${(c.total / 1024).toFixed(1)} KB minificado; módulos (pré-minificação) ${(soma / 1024).toFixed(1)} KB em ${itens.length}`)
  for (const [nome, n] of itens.slice(0, top)) console.log(`  ${(n / 1024).toFixed(1).padStart(7)} KB  ${nome}`)
}
if (saida) writeFileSync(path.resolve(saida), JSON.stringify(composicao, null, 1))
