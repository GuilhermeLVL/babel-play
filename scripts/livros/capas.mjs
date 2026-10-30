/**
 * ACRESCENTA `capa` AOS LIVROS DA STANDARD EBOOKS em `public/catalogo/livros.json`, sem tocar em mais nada
 * (livros, classificação, filtro legal e exclusões ficam idênticos). Idempotente: rodar de novo não muda o arquivo.
 *
 *   npx tsx scripts/livros/capas.mjs              # grava
 *   npx tsx scripts/livros/capas.mjs --conferir   # antes, confirma com HEAD que cada miniatura responde 200 image/*
 *                                                 # (espera 1 s entre as chamadas; sai ≠ 0 se alguma falhar)
 *
 * Regra (spec `docs/specs/2026-10-28-livros-capas.md`): só livro com licença verificada ganha `capa`. Hoje, só a
 * Standard Ebooks (CC0). Gutenberg, Wikisource, Open Library e Internet Archive ficam de fora.
 *
 * DEPOIS (não executado nesta rodada): para hospedar as miniaturas no nosso R2 `frasy-livros`, baixe cada
 * `capa.url` uma vez (1 s de intervalo), envie como `capas/<id>.jpg` e troque `capa.url` pela base pública do
 * deploy (`VITE_LIVROS_URL`). `validarCapa` (core/livros/capas.ts) precisará aceitar o novo host.
 */
import { readFileSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

import { capaDoStandardEbooks } from '../../src/core/livros/capas.ts'

const RAIZ = join(dirname(fileURLToPath(import.meta.url)), '..', '..')
const SAIDA = join(RAIZ, 'public', 'catalogo', 'livros.json')
const CONFERIR = process.argv.includes('--conferir')
const dormir = (ms) => new Promise((r) => setTimeout(r, ms))

const catalogo = JSON.parse(readFileSync(SAIDA, 'utf8'))
let com = 0
let falhas = 0
for (const l of catalogo.livros) {
  if (l.fonte !== 'standard-ebooks') continue
  const capa = capaDoStandardEbooks(l.fonteId)
  if (!capa) {
    console.error(`[capas] ${l.id}: caminho inválido "${l.fonteId}", fica sem capa`)
    delete l.capa
    continue
  }
  if (CONFERIR) {
    const r = await fetch(capa.url, { method: 'HEAD' }).catch(() => null)
    const tipo = r?.headers.get('content-type') ?? ''
    if (!r?.ok || !tipo.startsWith('image/')) {
      console.error(`[capas] ${l.id}: ${capa.url} -> ${r?.status ?? 'sem resposta'} ${tipo}`)
      falhas++
      continue
    }
    await dormir(1000)
  }
  l.capa = capa
  com++
}
if (falhas) {
  console.error(`[capas] NÃO GRAVADO: ${falhas} miniatura(s) não responderam`)
  process.exit(1)
}
writeFileSync(SAIDA, JSON.stringify(catalogo) + '\n')
console.log(`[capas] ${com} livros com capa em ${SAIDA}`)
