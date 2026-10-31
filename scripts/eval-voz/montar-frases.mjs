/**
 * Monta o corpus de frases da bancada de voz a partir de `fontes/*.txt`.
 *
 * Cada fonte é UMA frase (ou trecho) de domínio público:
 *   linha 1:   `# id | idioma | categoria | licenca`   (licenca TEM de ser `dominio-publico`)
 *   linhas #:  origem e licença (`# origem: ...`), nunca viram texto
 *   demais:    o texto a sintetizar (cada linha vira uma linha do texto, unidas por \n)
 * O gabarito dos itens difíceis (nomes, números, siglas, anos) é escrito à mão em `fontes/gabarito.json`
 * e fica pendente de revisão do dono até `revisao_do_dono` mudar.
 *
 * Falha alto (exit 1) se uma fonte não tiver cabeçalho, se a licença não for `dominio-publico`, se
 * faltar `# origem:`, se houver id repetido ou se o gabarito citar um id/trecho que não existe.
 *
 * Uso:
 *   node scripts/eval-voz/montar-frases.mjs
 *   node scripts/eval-voz/montar-frases.mjs --fontes <dir> --saida <arquivo.jsonl>
 */
import { readdirSync, readFileSync, writeFileSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

import { IDIOMAS, validarItem } from './comum.mjs'

const AQUI = path.dirname(fileURLToPath(import.meta.url))
const args = process.argv.slice(2)
const opt = (n, p) => {
  const i = args.indexOf(`--${n}`)
  return i >= 0 && args[i + 1] ? args[i + 1] : p
}
const DIR_FONTES = opt('fontes', path.join(AQUI, 'fontes'))
const SAIDA = opt('saida', path.join(AQUI, 'corpus-voz.jsonl'))

function falhar(msg) {
  console.error(`montar-frases: ${msg}`)
  process.exit(1)
}

/** Lê uma fonte e devolve o item (sem o gabarito). */
function lerFonte(arquivo) {
  const linhas = readFileSync(path.join(DIR_FONTES, arquivo), 'utf8').replace(/\r/g, '').split('\n')
  const cab = linhas[0]
    .match(/^#\s*(.+)$/)?.[1]
    .split('|')
    .map((s) => s.trim())
  if (!cab || cab.length !== 4 || cab.some((c) => !c)) {
    falhar(`${arquivo}: a primeira linha deve ser "# id | idioma | categoria | licenca"`)
  }
  const [id, idioma, categoria, licenca] = cab
  if (licenca !== 'dominio-publico') falhar(`${arquivo}: licenca "${licenca}" não é dominio-publico`)
  if (!IDIOMAS.includes(idioma)) falhar(`${arquivo}: idioma "${idioma}" inválido`)
  const resto = linhas.slice(1)
  if (!resto.some((l) => l.startsWith('# origem:'))) falhar(`${arquivo}: falta a linha "# origem: ..."`)
  const texto = resto
    .filter((l) => !l.startsWith('#'))
    .map((l) => l.trim())
    .filter(Boolean)
    .join('\n')
  if (!texto) falhar(`${arquivo}: sem texto`)
  return { id, idioma, texto, categoria, itens: [] }
}

const arquivos = readdirSync(DIR_FONTES)
  .filter((f) => f.endsWith('.txt'))
  .sort()
if (arquivos.length === 0) falhar(`nenhuma fonte em ${DIR_FONTES}`)
const corpus = arquivos.map(lerFonte)

const ids = new Set()
for (const it of corpus) {
  if (ids.has(it.id)) falhar(`id repetido: ${it.id}`)
  ids.add(it.id)
}

const gabarito = JSON.parse(readFileSync(path.join(DIR_FONTES, 'gabarito.json'), 'utf8'))
for (const [id, itens] of Object.entries(gabarito.itens ?? {})) {
  const alvo = corpus.find((c) => c.id === id)
  if (!alvo) falhar(`gabarito cita o id "${id}", que não existe nas fontes`)
  alvo.itens = itens
}

for (const it of corpus) {
  const erro = validarItem(it)
  if (erro) falhar(`${it.id}: ${erro}`)
  for (const d of it.itens) {
    if (!it.texto.includes(d.texto)) falhar(`${it.id}: o item "${d.texto}" não aparece no texto`)
  }
}

writeFileSync(SAIDA, corpus.map((c) => JSON.stringify(c)).join('\n') + '\n')
const porIdioma = IDIOMAS.map((i) => `${i}=${corpus.filter((c) => c.idioma === i).length}`).join(' ')
console.log(`corpus de voz: ${corpus.length} frases (${porIdioma}) -> ${path.relative(process.cwd(), SAIDA)}`)
