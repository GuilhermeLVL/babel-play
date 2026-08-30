/**
 * Mede a qualidade da tradução local (opus-mt) no gold set de fenômenos que exigem contexto.
 *
 * O QUE ESTE SCRIPT EXISTE PARA RESPONDER. A queixa é "às vezes traduz ao pé da letra em vez de
 * contextualizar". Isso não é um defeito único: pode ser (a) o modelo genérico que o português
 * recebe, (b) a ausência de janela de contexto, ou (c) só a natureza de um tradutor frase-a-frase.
 * A quebra por categoria separa os três — pronome e gênero só se resolvem com a frase anterior;
 * idiomático e registro dependem do modelo, não do contexto.
 *
 * FIDELIDADE À PRODUÇÃO. Usa os MESMOS modelos e o MESMO truque de token de `mtWorker.ts:60-67`:
 * en→pt é servido por `opus-mt-en-ROMANCE` com o token forçado `>>pt_br<<` (id 51), porque
 * `Xenova/opus-mt-en-pt` NÃO EXISTE — verificado no Hub. Es/fr/it/de têm modelo dedicado; o
 * português, não. Medir com um modelo melhor que o real daria um número que o usuário nunca vê.
 *
 * Uso:
 *   node node_modules/tsx/dist/cli.mjs scripts/eval-fala/medir-traducao.mjs
 *   node node_modules/tsx/dist/cli.mjs scripts/eval-fala/medir-traducao.mjs --comparar-es
 */
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs'
import path from 'node:path'
import { pipeline, env, Tensor } from '@huggingface/transformers'
import { agregarChrf, agregarPorCategoria, chrf } from '../../src/core/eval/chrf.ts'
import { separarEmFrases, juntarFrases } from '../../src/core/texto/frases.ts'

env.allowLocalModels = false

const GOLD = 'tests/eval/fixtures/gold-traducao-v0.jsonl'
const SAIDA = 'docs/auditoria/eval/resultados-traducao.json'

const args = process.argv.slice(2)
const COMPARAR_ES = args.includes('--comparar-es')
/** `--frase-unica` volta ao comportamento antigo (texto inteiro de uma vez), para comparar. */
const FRASE_UNICA = args.includes('--frase-unica')

/** Espelho de `dirConfig` em src/gateway/adapters/mtWorker.ts:56. */
const ROTA_PT = { modelo: 'Xenova/opus-mt-en-ROMANCE', tokenId: 51, rotulo: 'en→pt (ROMANCE + token >>pt_br<<)' }
/** Espanhol tem modelo DEDICADO. Serve de controle: mede o custo de não ter um. */
const ROTA_ES = { modelo: 'Xenova/opus-mt-en-es', tokenId: null, rotulo: 'en→es (dedicado)' }

async function traduzirCom(rota, textos) {
  process.stdout.write(`${rota.rotulo}: carregando ${rota.modelo}...`)
  const mt = await pipeline('translation', rota.modelo, { dtype: 'q8', device: 'cpu' })

  /** Uma chamada ao modelo. Espelha mtWorker.ts:156-172. */
  async function traduzirUm(frase) {
    if (rota.tokenId !== null) {
      // CAMINHO PRIMARIO DA PRODUCAO: o token de idioma entra pelo ID nos input_ids, nao como
      // texto. O prefixo em texto e o fallback, e produz saida em espanhol/frances.
      const enc = mt.tokenizer(frase)
      const ids = [BigInt(rota.tokenId), ...Array.from(enc.input_ids.data)]
      const input_ids = new Tensor('int64', BigInt64Array.from(ids), [1, ids.length])
      const attention_mask = new Tensor('int64', BigInt64Array.from(ids.map(() => 1n)), [1, ids.length])
      const gen = await mt.model.generate({ input_ids, attention_mask, max_new_tokens: 128, num_beams: 1, do_sample: false })
      return mt.tokenizer.batch_decode(gen, { skip_special_tokens: true })[0] ?? ''
    }
    const r = await mt(frase, { max_new_tokens: 128, num_beams: 1, do_sample: false })
    return (Array.isArray(r) ? r[0]?.translation_text : r?.translation_text) ?? ''
  }

  const saidas = []
  for (let i = 0; i < textos.length; i++) {
    try {
      // FRASE A FRASE: o opus-mt so traduz UMA sentenca e descarta a segunda.
      const frases = FRASE_UNICA ? [textos[i]] : separarEmFrases(textos[i])
      const partes = []
      for (const f of frases) partes.push((await traduzirUm(f)).trim())
      saidas.push(juntarFrases(partes))
    } catch (e) {
      console.warn(`
  ! caso ${i}: ${e.message}`)
      saidas.push('')
    }
    process.stdout.write(`
${rota.rotulo}: ${i + 1}/${textos.length}            `)
  }
  console.log('')
  return saidas
}

async function main() {
  const casos = readFileSync(GOLD, 'utf8').trim().split('\n').filter(Boolean).map((l) => JSON.parse(l))
  console.log(`gold set: ${casos.length} casos · categorias: ${[...new Set(casos.map((c) => c.categoria))].join(', ')}\n`)

  const rotas = COMPARAR_ES ? [ROTA_PT, ROTA_ES] : [ROTA_PT]
  const resultados = []

  for (const rota of rotas) {
    // O espanhol é só controle de MODELO: as referências do gold set são em português, então a nota
    // do es não é comparável em valor absoluto. O que se compara é o PERFIL por categoria.
    if (rota === ROTA_ES) {
      console.log('\n(o controle em espanhol usa referências em português — comparar o PERFIL, não o valor)')
    }
    const saidas = await traduzirCom(rota, casos.map((c) => c.origem))
    const comHip = casos.map((c, i) => ({ ...c, hipotese: saidas[i] }))
    const geral = agregarChrf(comHip)
    const porCategoria = agregarPorCategoria(comHip)
    resultados.push({ rota: rota.rotulo, modelo: rota.modelo, geral, porCategoria, casos: comHip })
    console.log(`${rota.rotulo}: chrF++ ${(geral.chrf * 100).toFixed(1)}%`)
  }

  mkdirSync(path.dirname(SAIDA), { recursive: true })
  writeFileSync(SAIDA, JSON.stringify({ geradoEm: new Date().toISOString(), resultados }, null, 2))

  const principal = resultados[0]
  console.log(`\nchrF++ por categoria — ${principal.rota}`)
  for (const [cat, a] of Object.entries(principal.porCategoria)) {
    console.log(`  ${cat.padEnd(18)} ${(a.chrf * 100).toFixed(1).padStart(5)}%  (${a.casos} casos)`)
  }

  // As traduções cruas importam mais que a nota: é nelas que se vê SE o erro é literalidade.
  console.log(`\nexemplos (origem → saída | referência):`)
  for (const c of principal.casos) {
    if (chrf(c.referencia, c.hipotese).chrf < 0.6) {
      console.log(`  [${c.categoria}] ${c.origem}`)
      console.log(`     saiu: ${c.hipotese}`)
      console.log(`     ref : ${c.referencia}`)
    }
  }
  console.log(`\nresultado bruto: ${SAIDA}`)
}

main().catch((e) => { console.error('\nfalhou:', e); process.exit(1) })
