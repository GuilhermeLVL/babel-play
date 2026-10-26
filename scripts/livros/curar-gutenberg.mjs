#!/usr/bin/env node
/**
 * A CÓPIA CURADA DOS LIVROS DO GUTENBERG NO R2 (L1 de `docs/specs/2026-10-26-livros-e-leitura.md`).
 *
 * Para cada livro do catálogo com `fonte: 'gutenberg-curado'`:
 *   1. baixa o texto puro UMA vez, de um espelho oficial (nunca do gutenberg.org; cache em data/livros-cache);
 *   2. tira o cabeçalho, o rodapé, a licença e toda menção ao Project Gutenberg (`core/livros/gutenberg.ts`);
 *   3. monta um EPUB 3 novo, com uma página de crédito, em `data/livros-curados/pg-<id>.epub`;
 *   4. CONFERE cada EPUB (critério 3): nada cita o projeto fora da linha de crédito, e o crédito está lá.
 *      Um só reprovado faz o script sair com código 1, e nada é enviado.
 *   5. só com `--enviar`: manda para o bucket (`livros/pg-<id>.epub`) pelo wrangler. Sem a flag, imprime os
 *      comandos (é o padrão: subir para o bucket de verdade é decisão do dono).
 *
 *   npx tsx scripts/livros/curar-gutenberg.mjs                     # monta e confere tudo, não envia
 *   npx tsx scripts/livros/curar-gutenberg.mjs --ids=1342,11       # só estes
 *   npx tsx scripts/livros/curar-gutenberg.mjs --conferir          # só confere o que já está em data/livros-curados
 *   set -a; source .env; set +a                                    # CLOUDFLARE_API_TOKEN e CLOUDFLARE_ACCOUNT_ID
 *   npx tsx scripts/livros/curar-gutenberg.mjs --enviar --bucket=frasy-livros-staging
 *
 * O bucket (`frasy-livros`, `frasy-livros-staging`) e o CORS de GET dele saem de `scripts/cloudflare/r2.mjs`.
 * O passo a passo está em `docs/livros-catalogo.md`.
 */
import { spawnSync } from 'node:child_process'
import { existsSync, mkdirSync, readdirSync, readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'

import { strFromU8, strToU8, unzipSync, zipSync } from 'fflate'

import {
  arquivosDoEpub,
  conferirEpubCurado,
  dividirEmCapitulos,
  limparTextoDoGutenberg,
} from '../../src/core/livros/gutenberg.ts'
import { textoDoEspelho } from './_espelho.mjs'
import { usarCache } from './_rede.mjs'

const RAIZ = fileURLToPath(new URL('../..', import.meta.url))
const WRANGLER = join(RAIZ, 'node_modules', 'wrangler', 'bin', 'wrangler.js')
const SAIDA = join(RAIZ, 'data', 'livros-curados')
const CATALOGO = join(RAIZ, 'public', 'catalogo', 'livros.json')

const args = process.argv.slice(2)
const arg = (nome) => args.find((a) => a.startsWith(`--${nome}=`))?.slice(nome.length + 3)
const ENVIAR = args.includes('--enviar')
const SO_CONFERIR = args.includes('--conferir')
const BUCKET = arg('bucket') ?? 'frasy-livros'
const IDS = arg('ids')
  ?.split(',')
  .map((s) => s.trim())
  .filter(Boolean)

const ROTULO_DA_PARTE = { pt: 'Parte', es: 'Parte', it: 'Parte', fr: 'Partie', de: 'Teil', en: 'Part' }

/** Lê as entradas de texto de um EPUB. */
function textosDoEpub(bytes) {
  const z = unzipSync(bytes, { filter: (f) => /\.(x?html?|opf|xml|ncx)$|mimetype$/i.test(f.name) })
  return Object.fromEntries(Object.entries(z).map(([k, v]) => [k, strFromU8(v)]))
}

/** Monta o zip do EPUB: `mimetype` primeiro e sem compressão, como a especificação exige. */
function zipDoEpub(arquivos) {
  const entradas = {}
  for (const [caminho, conteudo] of arquivos) {
    entradas[caminho] = caminho === 'mimetype' ? [strToU8(conteudo), { level: 0 }] : [strToU8(conteudo), { level: 9 }]
  }
  return zipSync(entradas)
}

async function curar(livro) {
  const bruto = await textoDoEspelho(livro.fonteId)
  if (!bruto) throw new Error('nenhum espelho entregou o texto')
  const { texto, linhasRemovidas } = limparTextoDoGutenberg(bruto)
  const capitulos = dividirEmCapitulos(texto, ROTULO_DA_PARTE[livro.idioma] ?? 'Parte')
  const zip = zipDoEpub(
    arquivosDoEpub({
      id: livro.id,
      titulo: livro.titulo,
      autores: livro.autores.map((a) => a.nome),
      idioma: livro.idioma,
      capitulos,
      licenca: livro.licenca,
      modificadoEm: new Date().toISOString(),
    }),
  )
  const destino = join(SAIDA, `${livro.id}.epub`)
  writeFileSync(destino, zip)
  return { destino, capitulos: capitulos.length, linhasRemovidas, bytes: zip.length }
}

function conferirPasta() {
  const arquivos = existsSync(SAIDA) ? readdirSync(SAIDA).filter((f) => f.endsWith('.epub')) : []
  const reprovados = []
  for (const f of arquivos) {
    const problemas = conferirEpubCurado(textosDoEpub(readFileSync(join(SAIDA, f))))
    if (problemas.length) reprovados.push(`${f}: ${problemas.join('; ')}`)
  }
  return { arquivos, reprovados }
}

function wrangler(argumentos) {
  const r = spawnSync(process.execPath, [WRANGLER, ...argumentos], { cwd: RAIZ, encoding: 'utf8', env: process.env })
  if (r.status !== 0) throw new Error(`wrangler ${argumentos.join(' ')} falhou (${r.status}):\n${r.stdout}${r.stderr}`)
}

async function principal() {
  mkdirSync(SAIDA, { recursive: true })
  if (!SO_CONFERIR) {
    usarCache(join(RAIZ, 'data', 'livros-cache'))
    const catalogo = JSON.parse(readFileSync(CATALOGO, 'utf8'))
    const alvo = catalogo.livros.filter(
      (l) => l.fonte === 'gutenberg-curado' && (!IDS || IDS.includes(l.fonteId) || IDS.includes(l.id)),
    )
    console.log(`[curar] ${alvo.length} livro(s) do Gutenberg no catálogo`)
    for (const livro of alvo) {
      try {
        const r = await curar(livro)
        console.log(
          `[curar] ${livro.id}: ${r.capitulos} capítulo(s), ${r.linhasRemovidas} linha(s) da moldura tiradas, ${Math.round(r.bytes / 1024)} KB`,
        )
      } catch (e) {
        console.error(`[curar] ${livro.id} (${livro.titulo}): ${e.message}`)
      }
    }
  }
  const { arquivos, reprovados } = conferirPasta()
  if (reprovados.length) {
    console.error(`[curar] REPROVADOS (${reprovados.length}); nada é enviado:\n  ${reprovados.join('\n  ')}`)
    process.exit(1)
  }
  console.log(`[curar] ${arquivos.length} EPUB(s) conferido(s): nenhum cita o Project Gutenberg fora do crédito`)

  const comandos = arquivos.map((f) => [
    'r2',
    'object',
    'put',
    `${BUCKET}/livros/${f}`,
    '--file',
    join(SAIDA, f),
    '--content-type',
    'application/epub+zip',
    '--cache-control',
    'public, max-age=604800',
    '--remote',
  ])
  if (!ENVIAR) {
    console.log(`[curar] sem --enviar: nada foi para o R2. Os comandos seriam (bucket ${BUCKET}):`)
    for (const c of comandos.slice(0, 3))
      console.log(
        `  node node_modules/wrangler/bin/wrangler.js ${c.map((x) => (/\s/.test(x) ? `"${x}"` : x)).join(' ')}`,
      )
    if (comandos.length > 3) console.log(`  … e mais ${comandos.length - 3}`)
    return
  }
  if (!process.env.CLOUDFLARE_API_TOKEN) throw new Error('--enviar precisa de CLOUDFLARE_API_TOKEN no ambiente')
  for (const c of comandos) {
    wrangler(c)
    console.log(`[curar] enviado: ${c[3]}`)
  }
}

principal().catch((e) => {
  console.error(`[curar] FALHOU: ${e.message}`)
  process.exit(1)
})
