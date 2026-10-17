/**
 * GERA AS ENTRADAS DOS PARES DO BERGAMOT para `src/gateway/adapters/modelosDoBergamot.json`, a partir do registro da Mozilla.
 *
 *   node scripts/modelos/gerar-pares-do-bergamot.mjs --pares=es-en,fr-en,ja-en            # imprime o JSON dos pares
 *   node scripts/modelos/gerar-pares-do-bergamot.mjs --pares=es-en,fr-en --gravar          # grava em `paresDoCdn`
 *   node scripts/modelos/gerar-pares-do-bergamot.mjs --pares=... --arquitetura=base        # força uma (padrão: base-memory, tiny, base)
 *
 * Para cada par: escolhe a execução publicada (`Release*`) da menor arquitetura que serve no registro
 * (`<origem>db/models.json`), BAIXA os três arquivos (modelo, lexical shortlist, vocabulário), calcula
 * tamanho e sha256 do `.gz` (o que o servidor entrega e o Cache Storage guarda) e do conteúdo
 * descomprimido (o que o motor recebe), confere o do modelo contra o `uncompressedHash` que a própria
 * Mozilla publica — diferença aborta — e monta a entrada no formato do `pt-en` (alinhamento 256 no modelo,
 * 64 no resto). Nada é gravado sem o hash conferir.
 *
 * Os pares gravados com `--gravar` vão para `paresDoCdn`: só valem com `VITE_BERGAMOT_MODELOS_URL`
 * (o bucket que `scripts/modelos/publicar-bergamot-no-r2.ts` enche). O build NÃO os baixa para o `public/`.
 */
import { createHash } from 'node:crypto'
import { readFileSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { gunzipSync } from 'node:zlib'

/* global AbortSignal */

const RAIZ = join(dirname(fileURLToPath(import.meta.url)), '..', '..')
const JSON_DOS_MODELOS = join(RAIZ, 'src', 'gateway', 'adapters', 'modelosDoBergamot.json')

const sha256 = (buf) => createHash('sha256').update(buf).digest('hex')
const arg = (nome, padrao) => {
  const a = process.argv.find((x) => x.startsWith(`--${nome}=`))
  return a ? a.slice(nome.length + 3) : padrao
}
const flag = (nome) => process.argv.includes(`--${nome}`)

/** O registro público da Mozilla (um JSON só, com todos os pares). */
async function lerRegistro(origem) {
  const r = await fetch(`${origem}db/models.json`)
  if (!r.ok) throw new Error(`registro da Mozilla: HTTP ${r.status}`)
  return r.json()
}

/** As arquiteturas, da preferida à última: a menor que serve (`base-memory` tem ~32 MB; ja/ko/zh, ~44 MB), depois a `tiny`, depois a `base`. */
export const ARQUITETURAS_PREFERIDAS = ['base-memory', 'tiny', 'base']

/**
 * A entrada de um par: a primeira arquitetura preferida que tem versão de lançamento (`Release`, `Release Android`,
 * `Release Desktop`: o que importa é que a Mozilla a publicou). Com `arquitetura`, só ela.
 */
export function escolherModelo(registro, par, arquitetura = null) {
  const lista = registro.models?.[par] ?? []
  const lancada = (m) => typeof m.releaseStatus === 'string' && m.releaseStatus.startsWith('Release')
  for (const a of arquitetura ? [arquitetura] : ARQUITETURAS_PREFERIDAS) {
    const m = lista.find((x) => x.architecture === a && lancada(x))
    if (m) return m
  }
  return null
}

async function baixar(url) {
  const r = await fetch(url, { signal: AbortSignal.timeout(300_000) })
  if (!r.ok) throw new Error(`HTTP ${r.status} em ${url}`)
  return Buffer.from(await r.arrayBuffer())
}

/** Baixa, confere e descreve UM par no formato do `modelosDoBergamot.json`. */
export async function descreverPar(registro, par, arquitetura = null, buscar = baixar) {
  const m = escolherModelo(registro, par, arquitetura)
  if (!m)
    throw new Error(`${par}: sem modelo ${arquitetura ?? ARQUITETURAS_PREFERIDAS.join('/')} publicado no registro`)
  const base = registro.baseUrl.replace(/\/?$/, '/') // o registro traz o `baseUrl` sem a barra final
  const f = m.files
  const execucao = f.model.path.split('/')[2]
  const caminhoNaOrigem = f.model.path.replace(/[^/]+$/, '')
  const lista = [
    ['modelo', f.model.path, 256],
    ['lex', f.lexicalShortlist.path, 64],
    ['vocab', f.vocab.path, 64],
  ]
  const arquivos = {}
  for (const [chave, caminho, alinhamento] of lista) {
    const gz = await buscar(`${base}${caminho}`)
    const cru = gunzipSync(gz)
    if (chave === 'modelo' && f.model.uncompressedHash && sha256(cru) !== f.model.uncompressedHash)
      throw new Error(`${par}: o sha256 do modelo descomprimido não confere com o do registro`)
    arquivos[chave] = {
      nome: caminho.split('/').pop(),
      bytes: gz.length,
      sha256: sha256(gz),
      sha256Descomprimido: sha256(cru),
      alinhamento,
    }
  }
  return { execucao, caminhoNaOrigem, arquivos }
}

async function principal() {
  const pares = arg('pares', '')
    .split(',')
    .map((p) => p.trim())
    .filter(Boolean)
  if (!pares.length) {
    console.error(
      'Uso: node scripts/modelos/gerar-pares-do-bergamot.mjs --pares=es-en,fr-en [--gravar] [--arquitetura=tiny]',
    )
    process.exit(2)
  }
  const config = JSON.parse(readFileSync(JSON_DOS_MODELOS, 'utf8'))
  const registro = await lerRegistro(config.origem)
  const arquitetura = arg('arquitetura', null)
  const gerados = {}
  for (const par of pares) {
    process.stderr.write(`${par}… `)
    gerados[par] = await descreverPar(registro, par, arquitetura)
    const mb = Object.values(gerados[par].arquivos).reduce((s, a) => s + a.bytes, 0) / 1e6
    process.stderr.write(`ok (${mb.toFixed(1)} MB, execução ${gerados[par].execucao})\n`)
  }
  if (flag('gravar')) {
    config.paresDoCdn = { ...(config.paresDoCdn ?? {}), ...gerados }
    writeFileSync(JSON_DOS_MODELOS, `${JSON.stringify(config, null, 2)}\n`)
    process.stderr.write(`gravado em paresDoCdn (${Object.keys(config.paresDoCdn).length} pares)\n`)
  } else {
    console.log(JSON.stringify(gerados, null, 2))
  }
}

if (import.meta.url === `file://${process.argv[1]}`) {
  principal().catch((e) => {
    console.error(String(e?.message ?? e))
    process.exit(1)
  })
}
