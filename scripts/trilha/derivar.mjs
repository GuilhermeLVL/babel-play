#!/usr/bin/env node
// Deriva de `src/data/trilha/<lang>.json` os artefatos leves: `niveis/<lang>.json` (palavra→nível,
// níveis unidos por `|`) e `indice.json` (contagens). Saída versionada.
import { readFileSync, writeFileSync, mkdirSync, readdirSync } from 'node:fs'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'

const RAIZ = join(dirname(fileURLToPath(import.meta.url)), '..', '..')
const DIR = join(RAIZ, 'src', 'data', 'trilha')
const NIVEIS = ['A1', 'A2', 'B1', 'B2', 'C1', 'C2']

function chave(palavra) {
  return palavra.normalize('NFD').replace(/[̀-ͯ]/g, '').trim().toLowerCase()
}

const idiomas = readdirSync(DIR)
  .filter((f) => f.endsWith('.json') && f !== 'indice.json')
  .map((f) => f.slice(0, -5))
  .sort()

mkdirSync(join(DIR, 'niveis'), { recursive: true })
const indice = {}

for (const lang of idiomas) {
  const dado = JSON.parse(readFileSync(join(DIR, `${lang}.json`), 'utf8'))
  const vistas = new Set()
  const porNivel = {}
  const niveis = {}
  let total = 0
  let comFrase = 0
  let colisoes = 0

  for (const nivel of NIVEIS) {
    const itens = dado.niveis?.[nivel] ?? []
    porNivel[nivel] = itens.length
    total += itens.length
    const palavras = []
    for (const item of itens) {
      if (item[2]) comFrase++
      const k = chave(item[0])
      if (!k) continue
      if (vistas.has(k)) { colisoes++; continue } // primeira ocorrência vence
      vistas.add(k)
      palavras.push(k)
    }
    if (palavras.length) niveis[nivel] = palavras.join('|')
  }

  writeFileSync(join(DIR, 'niveis', `${lang}.json`), JSON.stringify(niveis) + '\n')
  indice[lang] = {
    escala: dado.escala ?? 'cefr',
    versao: 1,
    total,
    comFrase,
    porNivel,
    glosas: ['pt'],
  }

  console.log(`${lang}: total ${total} · comFrase ${comFrase} · únicas ${vistas.size} · colisões ${colisoes}`)
  console.log('  ' + NIVEIS.map((n) => `${n} ${porNivel[n] ?? 0}`).join(' · '))
}

writeFileSync(join(DIR, 'indice.json'), JSON.stringify(indice, null, 2) + '\n')
console.log(`indice.json: ${idiomas.join(', ')}`)
