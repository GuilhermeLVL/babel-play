#!/usr/bin/env node
// Confere os derivados contra a trilha de origem: contagens do índice, e toda palavra de
// `niveis/<lang>.json` presente no `<lang>.json` no mesmo nível. Sai 1 em divergência.
import { readFileSync, existsSync } from 'node:fs'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'

const DIR = join(dirname(fileURLToPath(import.meta.url)), '..', '..', 'src', 'data', 'trilha')
const NIVEIS = ['A1', 'A2', 'B1', 'B2', 'C1', 'C2']
const erros = []

function chave(palavra) {
  return palavra.normalize('NFD').replace(/[̀-ͯ]/g, '').trim().toLowerCase()
}

const indice = JSON.parse(readFileSync(join(DIR, 'indice.json'), 'utf8'))

for (const [lang, entrada] of Object.entries(indice)) {
  const origem = join(DIR, `${lang}.json`)
  const derivado = join(DIR, 'niveis', `${lang}.json`)
  if (!existsSync(origem)) { erros.push(`${lang}: falta ${lang}.json`); continue }
  if (!existsSync(derivado)) { erros.push(`${lang}: falta niveis/${lang}.json`); continue }

  const dado = JSON.parse(readFileSync(origem, 'utf8'))
  const niveis = JSON.parse(readFileSync(derivado, 'utf8'))

  let total = 0
  let comFrase = 0
  const porNivelReal = {}
  const nivelDaPalavra = new Map()
  for (const nivel of NIVEIS) {
    const itens = dado.niveis?.[nivel] ?? []
    porNivelReal[nivel] = itens.length
    total += itens.length
    for (const item of itens) {
      if (item[2]) comFrase++
      const k = chave(item[0])
      if (k && !nivelDaPalavra.has(k)) nivelDaPalavra.set(k, nivel)
    }
  }

  if (entrada.total !== total) erros.push(`${lang}: índice total ${entrada.total} ≠ ${total}`)
  if (entrada.comFrase !== comFrase) erros.push(`${lang}: índice comFrase ${entrada.comFrase} ≠ ${comFrase}`)
  for (const nivel of NIVEIS) {
    if ((entrada.porNivel?.[nivel] ?? 0) !== porNivelReal[nivel]) {
      erros.push(`${lang}: índice porNivel.${nivel} ${entrada.porNivel?.[nivel]} ≠ ${porNivelReal[nivel]}`)
    }
  }

  let derivadas = 0
  for (const nivel of NIVEIS) {
    for (const palavra of (niveis[nivel] ?? '').split('|')) {
      if (!palavra) continue
      derivadas++
      const real = nivelDaPalavra.get(palavra)
      if (!real) erros.push(`${lang}: "${palavra}" (${nivel}) não existe em ${lang}.json`)
      else if (real !== nivel) erros.push(`${lang}: "${palavra}" está em ${nivel} mas ${lang}.json diz ${real}`)
    }
  }
  if (derivadas !== nivelDaPalavra.size) {
    erros.push(`${lang}: niveis/${lang}.json tem ${derivadas} palavras, esperava ${nivelDaPalavra.size}`)
  }

  console.log(`${lang}: ${total} palavras · ${comFrase} com frase · ${derivadas} no derivado`)
}

if (erros.length) {
  console.error('❌ trilha/verificar:\n  ' + erros.join('\n  '))
  process.exit(1)
}
console.log('✅ trilha/verificar: índice e derivados batem com a origem.')
