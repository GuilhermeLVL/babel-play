/**
 * MEDE O CATALOGO MESTRE DA BRANCH `gamificacao-v2-wip` CONTRA O `CATALOGO_DA_LOJA` DE `main`.
 *
 * Escrito para a auditoria de 2026-09-08 (`openspec/audits/2026-09-08-gamificacao.md`) e mantido
 * no repositorio porque a fusao dos dois catalogos e trabalho de mais de uma onda: o mesmo comando
 * roda antes e depois, e a diferenca e o que se poe no PR. Numero que nao se repete vira folclore.
 *
 * Le a branch por `git show`, sem precisar trocar de branch nem sujar a arvore.
 *
 *   node scripts/gamificacao/medir-catalogo.mjs
 *
 * O parsing e por LINHA, procurando `chave: valor`, e nao por expressao regular com escapes: o
 * catalogo tem 3.741 linhas de objeto literal com aspas e acentos, e um parser ingenuo por linha
 * erra menos que uma expressao regular esperta.
 */
import { readFileSync } from 'node:fs'
import { execFileSync } from 'node:child_process'

const BRANCH = process.env.BRANCH_GAMIFICACAO ?? 'gamificacao-v2-wip'
const daBranch = (caminho) =>
  execFileSync('git', ['show', `${BRANCH}:${caminho}`], { encoding: 'utf8', maxBuffer: 32 * 1024 * 1024 })

function itensDe(texto) {
  const linhas = texto.split('\n')
  const inicios = []
  linhas.forEach((l, i) => { if (l.trim().startsWith("id: '")) inicios.push(i) })
  return inicios.map((ini, n) => {
    const fim = n + 1 < inicios.length ? inicios[n + 1] : linhas.length
    const bloco = linhas.slice(ini, fim)
    const ler = (k) => {
      const l = bloco.find((x) => x.trim().startsWith(k + ':'))
      if (!l) return null
      const v = l.slice(l.indexOf(':') + 1).trim().replace(/,$/, '')
      return v.startsWith("'") ? v.slice(1, v.lastIndexOf("'")) : v
    }
    return {
      id: ler('id'), nome: ler('nome'), categoria: ler('categoria'), raridade: ler('raridade'),
      canal: ler('canal'), conquistaId: ler('conquistaId'),
      nivelRequerido: ler('nivelRequerido') ? Number(ler('nivelRequerido')) : null,
      alvo: ler('alvo'), precoSeeds: ler('precoSeeds'), precoCreditos: ler('precoCreditos'),
    }
  })
}

const mestre = itensDe(daBranch('src/core/catalogoMestre.ts'))
/* `loja.ts` e `conquistas.ts` declaram cada item numa LINHA so; a varredura acima
   (que procura uma linha comecando por `id:`) nao os acha. Uma extracao direta basta. */
function idsDe(texto, chave) {
  const fora = []
  let i = 0
  const marca = chave + ": '"
  while ((i = texto.indexOf(marca, i)) !== -1) {
    const ini = i + marca.length
    const fim = texto.indexOf("'", ini)
    fora.push(texto.slice(ini, fim))
    i = fim
  }
  return fora
}
const textoLoja = readFileSync('src/core/loja.ts', 'utf8')
const idsLoja = new Set(idsDe(textoLoja, 'id'))
const alvosLoja = new Set(idsDe(textoLoja, 'alvo'))
console.log('mestre:', mestre.length, 'itens | loja:', idsLoja.size, 'ids,', alvosLoja.size, 'alvos')
const porId = mestre.filter((i) => idsLoja.has(i.id))
console.log('\nCOLIDEM POR ID:', porId.length)
console.log('  ', porId.map((i) => i.id).join(', '))

const conta = (arr, k) => arr.reduce((m, i) => (m[i[k]] = (m[i[k]] ?? 0) + 1, m), {})
console.log('\npor canal:   ', JSON.stringify(conta(mestre, 'canal')))
console.log('por raridade:', JSON.stringify(conta(mestre, 'raridade')))
console.log('por categoria:', JSON.stringify(conta(mestre, 'categoria')))

const conquistas = new Set(idsDe(readFileSync('src/core/learning/conquistas.ts', 'utf8'), 'id'))
const motivos = {}
for (const i of mestre) {
  let m = null
  if (i.canal === 'conquista') { if (!i.conquistaId || !conquistas.has(i.conquistaId)) m = `conquista inexistente: ${i.conquistaId}` }
  else if (i.canal === 'nivel') { if (i.nivelRequerido == null) m = 'canal nivel sem nivelRequerido' }
  else if (i.canal === 'drop_partida') { if (i.raridade === 'mitico' || i.raridade === 'transcendente') m = `drop com raridade de peso zero: ${i.raridade}` }
  else m = `canal '${i.canal}' que nenhum codigo concede`
  if (m) (motivos[m] ??= []).push(i.id)
}
const total = Object.values(motivos).reduce((n, v) => n + v.length, 0)
console.log('\nINALCANCAVEIS:', total, 'de', mestre.length)
for (const [m, ids] of Object.entries(motivos).sort((a, b) => b[1].length - a[1].length)) {
  console.log(`  ${String(ids.length).padStart(3)}  ${m}`)
  if (ids.length <= 6) console.log('        ', ids.join(', '))
}

const norm = (s) => s.split('_').join('-').toLowerCase()
const grupos = {}
for (const i of mestre) (grupos[norm(i.id)] ??= []).push(i.id)
const dups = Object.entries(grupos).filter(([, v]) => v.length > 1)
console.log('\nDUPLICATAS por - vs _:', dups.length)
for (const [, v] of dups) console.log('  ', v.join('  =  '))

const nomes = {}
for (const i of mestre) (nomes[i.nome] ??= []).push(i.id)
for (const [n, v] of Object.entries(nomes).filter(([, v]) => v.length > 1)) {
  console.log(`   nome repetido "${n}" → ${v.join(', ')}`)
}
