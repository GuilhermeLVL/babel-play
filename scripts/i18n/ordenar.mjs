#!/usr/bin/env node
/**
 * CATÁLOGOS EM ORDEM ESTÁVEL — para dois PRs que traduzem frases diferentes não conflitarem.
 *
 * Os catálogos mantidos à mão (`public/i18n/{en,es,ar}.json`) cresciam em ordem de inserção, e todo
 * PR inseria no FIM: dois PRs quaisquer mexiam nas mesmas últimas linhas e o merge conflitava sempre.
 * Em ordem alfabética, cada chave nova cai no seu lugar, e dois PRs só se encontram se as frases
 * deles forem vizinhas no alfabeto.
 *
 * A ordem é a MESMA do `xx.json` (`scripts/i18n/pseudo.mjs`): `localeCompare` com locale fixo `pt`,
 * desempatada por ponto de código (duas chaves distintas que o colador julgasse iguais não ficam
 * dependendo da ordem de entrada). Só a ordem das chaves de primeiro nível muda; as formas de plural
 * (`one`/`other`...) ficam como estão.
 *
 *   node scripts/i18n/ordenar.mjs          # reordena os catálogos à mão
 *   node scripts/i18n/ordenar.mjs --check  # falha se algum estiver fora de ordem (para o CI)
 *
 * Para adicionar uma tradução: insira a chave em qualquer lugar e rode `npm run i18n`.
 */
import { readdirSync, readFileSync, writeFileSync } from 'node:fs'
import { join, dirname } from 'node:path'
import { isDeepStrictEqual } from 'node:util'
import { fileURLToPath } from 'node:url'

const RAIZ = join(dirname(fileURLToPath(import.meta.url)), '..', '..')
const DIR = join(RAIZ, 'public', 'i18n')

/** Gerado (pelo pseudo.mjs), não mantido à mão: não é deste script. */
const GERADOS = new Set(['xx.json'])

function compararChaves(a, b) {
  return a.localeCompare(b, 'pt') || (a < b ? -1 : a > b ? 1 : 0)
}

function ordenar(catalogo) {
  const ordenado = {}
  for (const chave of Object.keys(catalogo).sort(compararChaves)) ordenado[chave] = catalogo[chave]
  return ordenado
}

const checar = process.argv.includes('--check')
const fora = []
for (const arquivo of readdirSync(DIR).sort()) {
  if (!arquivo.endsWith('.json') || GERADOS.has(arquivo)) continue
  const caminho = join(DIR, arquivo)
  const atual = readFileSync(caminho, 'utf8')
  const catalogo = JSON.parse(atual)
  const ordenado = ordenar(catalogo)
  // Trava de segurança: reordenar nunca pode mudar um par chave→valor.
  if (!isDeepStrictEqual(catalogo, ordenado) || Object.keys(catalogo).length !== Object.keys(ordenado).length) {
    console.error(`❌ i18n/ordenar: ${arquivo} mudaria de conteúdo ao reordenar; nada foi escrito.`)
    process.exit(1)
  }
  const conteudo = JSON.stringify(ordenado, null, 2) + '\n'
  if (conteudo === atual) continue
  fora.push(arquivo)
  if (!checar) writeFileSync(caminho, conteudo)
}

if (checar && fora.length) {
  console.error(
    `❌ i18n/ordenar: fora de ordem: ${fora.join(', ')}.\n` +
      '   Rode `npm run i18n` e faça commit — os catálogos ficam em ordem alfabética para que PRs\n' +
      '   que traduzem frases diferentes não conflitem.',
  )
  process.exit(1)
}
console.log(
  checar
    ? '✅ i18n/ordenar: catálogos em ordem.'
    : fora.length
      ? `reordenados: ${fora.join(', ')}`
      : 'catálogos já estavam em ordem.',
)
