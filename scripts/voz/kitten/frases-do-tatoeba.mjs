#!/usr/bin/env node
/**
 * Separa frases pt, es e en da semente de tradução (Tatoeba, CC BY 2.0 FR) em arquivos de uma frase por linha, para o
 * oráculo de avaliação do fonetizador (`oraculo_espeak.py`). Uso: node scripts/voz/kitten/frases-do-tatoeba.mjs <pasta>
 */
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'

const pasta = process.argv[2] ?? '/tmp/kitten-oraculo'
mkdirSync(pasta, { recursive: true })
const ler = (f) =>
  readFileSync(new URL(`../../../public/semente-traducao/${f}`, import.meta.url), 'utf8')
    .split('\n')
    .filter((l) => l && !l.startsWith('#'))
    .map((l) => l.split('\t'))
const es = ler('es-pt.tsv')
const en = ler('en-pt.tsv')
const unicas = (xs) => [...new Set(xs.map((x) => x.trim()).filter(Boolean))]
writeFileSync(join(pasta, 'es.txt'), unicas(es.map((p) => p[0])).join('\n'))
writeFileSync(join(pasta, 'pt.txt'), unicas([...es.map((p) => p[1]), ...en.map((p) => p[1])]).join('\n'))
writeFileSync(join(pasta, 'en.txt'), unicas(en.map((p) => p[0])).join('\n'))
console.log('ok', pasta)
