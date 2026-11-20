/**
 * QUAIS LIVROS TÊM ÁUDIO PUBLICADO (F2). A lista revisada é `scripts/audiolivros/publicados.json`
 * (`{ livros: { <id>: { voz, versao, capitulos, horas } } }`); `scripts/livros/montar-catalogo.mjs` a lê e escreve o
 * campo `audio` em `public/catalogo/livros.json` (`anexarAudio`). O catálogo só é regenerado pelo script:
 *
 *   npx tsx scripts/audiolivros/publicar-catalogo.mjs --pasta <saída>/audiolivros/<livro>/<voz>   # grava a entrada
 *   npx tsx scripts/livros/montar-catalogo.mjs --audio                                          # escreve `audio`
 *
 * A entrada vem do `manifesto.json` e do ponteiro `atual.json` (`{ "versao": n }`) da pasta da voz: capítulos com
 * áudio (`frases > 0`) e as horas somadas. Publicar não liga nada: o cliente ainda exige a flag `audiolivros` e
 * que o livro seja visível para quem lê (`temAudioVisivel`).
 */
import { readFileSync, writeFileSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'

import { audioValido } from '../../src/core/livros/catalogo.ts'

const AQUI = path.dirname(fileURLToPath(import.meta.url))
export const ARQUIVO_DE_PUBLICADOS = path.join(AQUI, 'publicados.json')

/**
 * A entrada de `publicados.json` de um manifesto e da versão do lote.
 * @param {{ voz: string, capitulos: { duracaoS: number, frases: number }[] }} manifesto
 * @param {number} versao
 */
export function entradaDoManifesto(manifesto, versao) {
  const comAudio = manifesto.capitulos.filter((c) => c.frases > 0)
  const segundos = comAudio.reduce((t, c) => t + c.duracaoS, 0)
  return { voz: manifesto.voz, versao, capitulos: comAudio.length, horas: Math.round((segundos / 3600) * 100) / 100 }
}

/**
 * Escreve `audio` nos livros de `publicados` e o TIRA dos demais (despublicar é apagar a linha). Id publicado
 * fora do catálogo, ou entrada malformada, para a montagem.
 * @param {{ id: string, audio?: unknown }[]} livros
 * @param {{ livros: Record<string, unknown> }} publicados
 * @returns {number} quantos livros ficaram com áudio
 */
export function anexarAudio(livros, publicados) {
  const ids = new Set(livros.map((l) => l.id))
  for (const [id, a] of Object.entries(publicados.livros ?? {})) {
    if (!ids.has(id)) throw new Error(`publicados.json: "${id}" não está no catálogo`)
    if (!audioValido(a)) throw new Error(`publicados.json: entrada de "${id}" malformada`)
  }
  let n = 0
  for (const l of livros) {
    delete l.audio
    const a = publicados.livros?.[l.id]
    if (a) {
      l.audio = audioValido(a)
      n++
    }
  }
  return n
}

export const lerPublicados = (arquivo = ARQUIVO_DE_PUBLICADOS) => JSON.parse(readFileSync(arquivo, 'utf8'))

function main() {
  const argv = process.argv.slice(2)
  const i = argv.indexOf('--pasta')
  const pasta = i >= 0 ? argv[i + 1] : undefined
  if (!pasta) throw new Error('uso: publicar-catalogo.mjs --pasta <saída>/audiolivros/<livro>/<voz>')
  const manifesto = JSON.parse(readFileSync(path.join(pasta, 'manifesto.json'), 'utf8'))
  const { versao } = JSON.parse(readFileSync(path.join(pasta, 'atual.json'), 'utf8'))
  const entrada = entradaDoManifesto(manifesto, versao)
  if (!audioValido(entrada)) throw new Error(`entrada inválida para ${manifesto.livroId}: ${JSON.stringify(entrada)}`)
  const publicados = lerPublicados()
  publicados.livros = { ...publicados.livros, [manifesto.livroId]: entrada }
  writeFileSync(ARQUIVO_DE_PUBLICADOS, `${JSON.stringify(publicados, null, 2)}\n`)
  console.log(`publicados.json: ${manifesto.livroId} = ${JSON.stringify(entrada)}`)
}

if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) {
  try {
    main()
  } catch (e) {
    console.error(e instanceof Error ? e.message : e)
    process.exit(1)
  }
}
