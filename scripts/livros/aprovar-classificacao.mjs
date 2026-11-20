/**
 * APROVA PROPOSTAS DE CLASSIFICAÇÃO ETÁRIA (`classificacao.json`) e reflete no catálogo publicado, sem
 * remontar o catálogo (a montagem inteira refaz os downloads que não estão no cache).
 *
 *   npx tsx scripts/livros/aprovar-classificacao.mjs --revisor=Guilherme --todos
 *   npx tsx scripts/livros/aprovar-classificacao.mjs --revisor=Guilherme --classificacao=livre,12 --confianca=alta
 *   npx tsx scripts/livros/aprovar-classificacao.mjs --revisor=Guilherme --ids=pg-16,ws-pt-iracema
 *   ... --simular                      # só mostra o que mudaria, não grava nada
 *   ... --data=2026-10-27              # padrão: hoje em America/Sao_Paulo
 *
 * Só mexe em item com `"revisor": "proposta-claude"` (ou sem revisor): troca o revisor pelo nome dado e a data.
 * Os filtros se somam (E): `--classificacao` e `--confianca` restringem; `--ids` escolhe item a item. É preciso
 * pelo menos um de `--todos`, `--classificacao` ou `--ids` (nada aprova "sem querer"). Depois grava
 * `public/catalogo/livros.json` com a classificação de TODO item aprovado (os outros ficam `null`) e confere.
 * Rode `npx tsx scripts/livros/montar-catalogo.mjs --verificar` em seguida.
 */
import { readFileSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

import { ehClassificacao } from '../../src/core/livros/catalogo.ts'

const AQUI = dirname(fileURLToPath(import.meta.url))
const LISTA = join(AQUI, 'classificacao.json')
const CATALOGO = join(AQUI, '../../public/catalogo/livros.json')
const PROPOSTA = 'proposta-claude'

const args = process.argv.slice(2)
const arg = (nome) => args.find((a) => a.startsWith(`--${nome}=`))?.slice(nome.length + 3)
const lista = (nome) =>
  arg(nome)
    ?.split(',')
    .map((s) => s.trim())
    .filter(Boolean)
const semAcento = (s) => s.normalize('NFD').replace(/[̀-ͯ]/g, '')

const CONHECIDOS = ['revisor', 'todos', 'classificacao', 'confianca', 'ids', 'data', 'simular']
for (const a of args) {
  const nome = a.replace(/^--/, '').split('=')[0]
  if (!a.startsWith('--') || !CONHECIDOS.includes(nome)) throw new Error(`argumento desconhecido: ${a}`)
}

const revisor = arg('revisor')?.trim()
if (!revisor || revisor === PROPOSTA)
  throw new Error('--revisor=<seu nome> é obrigatório (e não pode ser "proposta-claude")')
const todos = args.includes('--todos')
const classes = lista('classificacao')
const confiancas = lista('confianca')?.map(semAcento)
const ids = lista('ids')
if (!todos && !classes && !ids) throw new Error('diga o que aprovar: --todos, --classificacao=... ou --ids=...')
for (const c of classes ?? []) if (!ehClassificacao(c)) throw new Error(`--classificacao inválida: ${c}`)
for (const c of confiancas ?? [])
  if (!['alta', 'media', 'baixa'].includes(c)) throw new Error(`--confianca inválida: ${c} (alta, media, baixa)`)
const data = arg('data') ?? new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Sao_Paulo' }).format(new Date())
if (!/^\d{4}-\d{2}-\d{2}$/.test(data)) throw new Error(`--data inválida: ${data}`)
const SIMULAR = args.includes('--simular')

const arquivo = JSON.parse(readFileSync(LISTA, 'utf8'))
const ehProposta = (r) => !r.revisor || r.revisor === PROPOSTA
const idsDaLista = new Set(arquivo.revisados.map((r) => r.id))
for (const id of ids ?? []) if (!idsDaLista.has(id)) throw new Error(`--ids: ${id} não está em classificacao.json`)

const escolhidos = arquivo.revisados.filter(
  (r) =>
    ehProposta(r) &&
    (!classes || classes.includes(r.classificacao)) &&
    (!confiancas || confiancas.includes(semAcento(r.confianca ?? ''))) &&
    (!ids || ids.includes(r.id)),
)
for (const r of escolhidos) {
  if (!ehClassificacao(r.classificacao)) throw new Error(`classificacao.json: "${r.classificacao}" inválida em ${r.id}`)
  console.log(`  ${r.classificacao.padEnd(5)} ${(r.confianca ?? '?').padEnd(5)} ${r.id}`)
  r.revisor = revisor
  r.data = data
}
console.log(`[aprovar] ${escolhidos.length} proposta(s) ${SIMULAR ? 'seriam aprovadas' : 'aprovadas'} por ${revisor}`)

/* O catálogo publicado: cada livro leva a classificação do item APROVADO da lista, ou null. A troca é feita no
   texto (só o valor de "classificacao" de cada livro), para não reformatar o arquivo, e conferida no fim. */
const aprovados = new Map(arquivo.revisados.filter((r) => !ehProposta(r)).map((r) => [r.id, r.classificacao]))
let texto = readFileSync(CATALOGO, 'utf8')
const catalogo = JSON.parse(texto)
let trocas = 0
for (const l of catalogo.livros) {
  const esperado = aprovados.get(l.id) ?? null
  if (l.classificacao === esperado) continue
  const inicio = texto.indexOf(`"id": ${JSON.stringify(l.id)},`)
  if (inicio < 0) throw new Error(`livros.json: não achei o livro ${l.id} no texto`)
  const re = /"classificacao": (null|"[^"]*")/g
  re.lastIndex = inicio
  const m = re.exec(texto)
  if (!m) throw new Error(`livros.json: sem "classificacao" depois de ${l.id}`)
  texto = texto.slice(0, m.index) + `"classificacao": ${JSON.stringify(esperado)}` + texto.slice(m.index + m[0].length)
  trocas++
}
const conferido = JSON.parse(texto)
for (const l of conferido.livros)
  if (l.classificacao !== (aprovados.get(l.id) ?? null))
    throw new Error(`livros.json: ${l.id} ficou errado; nada gravado`)
console.log(`[aprovar] livros.json: ${trocas} livro(s) ${SIMULAR ? 'mudariam' : 'atualizados'}`)

if (!SIMULAR) {
  writeFileSync(LISTA, JSON.stringify(arquivo, null, 2) + '\n')
  writeFileSync(CATALOGO, texto)
  console.log('[aprovar] confira com: npx tsx scripts/livros/montar-catalogo.mjs --verificar')
}
