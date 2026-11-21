/**
 * CORPUS FLEURS `X→en` DA BANCADA DE TRADUÇÃO (openspec traducao-local-por-direcao, tarefa 4.2).
 *
 *   node scripts/eval-fala/bancada/montar-fleurs-x-en.mjs [--idiomas es,pt]
 *
 * O FLEURS repete cada frase do FLORES-200 em todos os idiomas (o mesmo `floresId`): o texto de cada idioma já está
 * nos manifestos de fala que `baixar-bancada.py` grava em `BANCADA_DIR/navegador/stt/fleurs_<idioma>.jsonl` (ou em
 * `stt/`). Este script junta, por `floresId`, o inglês com cada idioma pedido e grava `mt/fleurs_x_en.jsonl`
 * (`{ id, floresId, en, <idioma>… }`), o arquivo que `mt.mjs` lê para `fleurs:<X>-en`. Não baixa nada: idioma sem
 * manifesto local é dito e pulado (para trazer fr, de, ja… rode `baixar-bancada.py` com o idioma e repita). O relatório
 * lista o `n` por par (frases com os dois lados).
 */
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import path from 'node:path'

import { BANCADA_DIR, opt } from './comum.mjs'

const lerManifesto = (idioma) => {
  for (const rel of [`navegador/stt/fleurs_${idioma}.jsonl`, `stt/fleurs_${idioma}.jsonl`]) {
    const p = path.join(BANCADA_DIR, rel)
    if (existsSync(p))
      return new Map(
        readFileSync(p, 'utf8')
          .trim()
          .split('\n')
          .filter(Boolean)
          .map((l) => JSON.parse(l))
          .map((m) => [m.floresId, m.referencia]),
      )
  }
  return null
}

const idiomas = opt('idiomas', 'pt,es')
  .split(',')
  .map((s) => s.trim())
  .filter(Boolean)
const en = lerManifesto('en')
if (!en) throw new Error(`sem o manifesto do FLEURS em inglês em ${BANCADA_DIR} — rode baixar-bancada.py`)

const porIdioma = {}
for (const l of idiomas) {
  const m = lerManifesto(l)
  if (!m) console.warn(`  pulado: ${l} — sem manifesto local (rode baixar-bancada.py com o idioma)`)
  else porIdioma[l] = m
}
const ids = [...en.keys()].sort((a, b) => a - b)
const linhas = ids
  .map((id) => ({
    id: `fleurs_${id}`,
    floresId: id,
    en: en.get(id),
    ...Object.fromEntries(Object.entries(porIdioma).map(([l, m]) => [l, m.get(id)])),
  }))
  // Só a linha com ao menos um idioma além do inglês.
  .filter((r) => Object.keys(porIdioma).some((l) => r[l]))
mkdirSync(path.join(BANCADA_DIR, 'mt'), { recursive: true })
writeFileSync(path.join(BANCADA_DIR, 'mt', 'fleurs_x_en.jsonl'), `${linhas.map((r) => JSON.stringify(r)).join('\n')}\n`)
for (const l of Object.keys(porIdioma)) console.log(`${l}-en: n = ${linhas.filter((r) => r[l]).length}`)
console.log(`gravado em ${path.join(BANCADA_DIR, 'mt', 'fleurs_x_en.jsonl')}`)
