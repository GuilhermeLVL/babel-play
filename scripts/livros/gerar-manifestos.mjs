/**
 * GERA OS MANIFESTOS DOS LIVROS PD (`public/catalogo/manifestos/<id>.json`): os hashes curtos de cada parágrafo, para o
 * parceiro de leitura conferir que o trecho mandado é do livro do catálogo (`src/core/livros/manifesto.ts`).
 *
 *   npx tsx scripts/livros/gerar-manifestos.mjs [--curados=<dir>] [--cache=<dir>] [--ids=a,b]
 *
 * O TEXTO É O MESMO QUE O APP ABRE: o EPUB do Standard Ebooks (o mesmo arquivo que o navegador baixa; do cache de
 * `montar-catalogo`, `data/livros-cache`) e a cópia curada do Gutenberg (`data/livros-curados`, a que vai ao R2), lidos
 * por `lerEpubComoTexto`. A Wikisource FICA DE FORA nesta versão: o texto vem da API capítulo a capítulo e o parágrafo
 * depende da página; o livro sem manifesto vale como "texto não conferido" (o teto do livro trazido, sem cache). Livro
 * sem arquivo local também fica de fora, com aviso. Estático, fora do bundle: o servidor lê do disco (Node) ou do
 * `ASSETS` (Worker), sob demanda (`server/ai/leitura/manifestos.ts`).
 */
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'

import { strFromU8, unzipSync } from 'fflate'

import { lerEpubComoTexto } from '../../src/core/livros/epub.ts'
import { montarManifesto } from '../../src/core/livros/manifesto.ts'
import { baixar, usarCache } from './_rede.mjs'

const RAIZ = fileURLToPath(new URL('../..', import.meta.url))
const args = process.argv.slice(2)
const arg = (nome) => args.find((a) => a.startsWith(`--${nome}=`))?.slice(nome.length + 3)
const CURADOS = arg('curados') ?? join(RAIZ, 'data', 'livros-curados')
usarCache(arg('cache') ?? join(RAIZ, 'data', 'livros-cache'))
const PASTA = join(RAIZ, 'public/catalogo/manifestos')
mkdirSync(PASTA, { recursive: true })

const ids = arg('ids')?.split(',')
const livros = JSON.parse(readFileSync(join(RAIZ, 'public/catalogo/livros.json'), 'utf8')).livros.filter(
  (l) => !ids || ids.includes(l.id),
)

function capitulosDoEpub(bin) {
  const z = unzipSync(bin, { filter: (f) => /\.(x?html?|opf|xml)$/i.test(f.name) })
  return lerEpubComoTexto(Object.fromEntries(Object.entries(z).map(([k, v]) => [k, strFromU8(v)]))).capitulos.map(
    (c) => c.texto,
  )
}

const feitos = []
const fora = { wikisource: 0, semArquivo: [] }
let bytes = 0
for (const l of livros) {
  let bin = null
  if (l.fonte === 'gutenberg-curado') {
    const arq = join(CURADOS, `${l.id}.epub`)
    if (existsSync(arq)) bin = new Uint8Array(readFileSync(arq))
  } else if (l.fonte === 'standard-ebooks' && l.formatos?.epub) {
    bin = await baixar(`${l.formatos.epub}?source=download`, 'binario', { tentativas: 0 }).catch(() => null)
  } else if (l.fonte === 'wikisource') {
    fora.wikisource++
    continue
  }
  if (!bin) {
    fora.semArquivo.push(l.id)
    continue
  }
  const m = await montarManifesto(l.id, capitulosDoEpub(bin))
  const json = `${JSON.stringify(m)}\n`
  writeFileSync(join(PASTA, `${l.id}.json`), json)
  bytes += json.length
  feitos.push(l.id)
}
writeFileSync(join(PASTA, 'indice.json'), `${JSON.stringify({ versao: 1, manifestos: feitos.sort() })}\n`)
console.log(
  `manifestos: ${feitos.length} (${Math.round(bytes / 1024)} KB); Wikisource fora: ${fora.wikisource}; sem arquivo local: ${fora.semArquivo.length}${fora.semArquivo.length ? ` (${fora.semArquivo.slice(0, 10).join(', ')}…)` : ''}`,
)
