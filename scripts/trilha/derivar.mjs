#!/usr/bin/env node
// Deriva de `public/trilha/<lang>.json` os artefatos leves: `niveis/<lang>.json` (palavra→nível,
// níveis unidos por `|`) e `indice.json` (contagens). Saída versionada.
import { readFileSync, writeFileSync, mkdirSync, readdirSync } from 'node:fs'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'

const RAIZ = join(dirname(fileURLToPath(import.meta.url)), '..', '..')
/* A trilha e as glosas são SERVIDAS de `public/`; os derivados leves (índice e níveis) seguem
   embutidos em `src/`, porque o índice é lido de forma síncrona e os níveis, pelo servidor. */
const DIR = join(RAIZ, 'public', 'trilha')
const DIR_GLOSAS = join(RAIZ, 'public', 'glosas')
const DIR_DERIVADOS = join(RAIZ, 'src', 'data', 'trilha')
const NIVEIS = ['A1', 'A2', 'B1', 'B2', 'C1', 'C2']

function chave(palavra) {
  return palavra.normalize('NFD').replace(/[̀-ͯ]/g, '').trim().toLowerCase()
}

const idiomas = readdirSync(DIR)
  .filter((f) => f.endsWith('.json') && f !== 'indice.json')
  .map((f) => f.slice(0, -5))
  .sort()

/** Idiomas nativos com arquivo de glosa para `lang` — é o que a tela pode oferecer como pista. */
function paresDe(lang) {
  let arquivos
  try { arquivos = readdirSync(DIR_GLOSAS) } catch { return [] }
  return arquivos
    .filter((f) => f.startsWith(`${lang}-`) && f.endsWith('.json'))
    .map((f) => f.slice(lang.length + 1, -5))
    .sort()
}

mkdirSync(join(DIR_DERIVADOS, 'niveis'), { recursive: true })
const indice = {}

for (const lang of idiomas) {
  const dado = JSON.parse(readFileSync(join(DIR, `${lang}.json`), 'utf8'))
  // v1 guarda a frase em [2] (depois da tradução); v2 é monolíngue e a guarda em [1].
  const colunaDaFrase = Number(dado.versao) === 2 ? 1 : 2
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
      if (item[colunaDaFrase]) comFrase++
      const k = chave(item[0])
      if (!k) continue
      if (vistas.has(k)) { colisoes++; continue } // primeira ocorrência vence
      vistas.add(k)
      palavras.push(k)
    }
    if (palavras.length) niveis[nivel] = palavras.join('|')
  }

  writeFileSync(join(DIR_DERIVADOS, 'niveis', `${lang}.json`), JSON.stringify(niveis) + '\n')
  indice[lang] = {
    escala: dado.escala ?? 'cefr',
    versao: Number(dado.versao) === 2 ? 2 : 1,
    total,
    comFrase,
    porNivel,
    // v1 traz a tradução dentro do par; v2 só joga com pista se houver arquivo do par.
    glosas: Number(dado.versao) === 2 ? paresDe(lang) : ['pt'],
  }

  console.log(`${lang}: total ${total} · comFrase ${comFrase} · únicas ${vistas.size} · colisões ${colisoes}`)
  console.log('  ' + NIVEIS.map((n) => `${n} ${porNivel[n] ?? 0}`).join(' · '))
}

writeFileSync(join(DIR_DERIVADOS, 'indice.json'), JSON.stringify(indice, null, 2) + '\n')
console.log(`indice.json: ${idiomas.join(', ')}`)
