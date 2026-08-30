/**
 * JUIZ de traduções — a segunda métrica, sobre saídas JÁ gravadas pela bancada.
 *
 * POR QUE UMA SEGUNDA MÉTRICA. O chrF++ compara superfície contra UMA referência, e foi flagrado
 * errando neste próprio projeto: marcou como fracas *"Tá chovendo pra caramba"* (para "It's raining
 * cats and dogs") e *"casinha"* (para "a small house") — as duas mais naturais que a referência.
 * Rankear modelos só por chrF++ premia quem copia a referência, não quem traduz bem.
 *
 * JUIZ NEUTRO, RODANDO LOCAL. `qwen2.5:14b-instruct` no Ollama: não é nenhum dos candidatos
 * avaliados (a spec proíbe autoavaliação) e não custa nada — o que importa, porque a conta de nuvem
 * está sem saldo. Rodar local também remove a variável "cota do provedor" da medição.
 *
 * CEGO. O juiz nunca vê qual modelo produziu a tradução: recebe origem, referência e hipótese, e
 * nada mais. Sem isso ele julgaria a reputação do nome, não o texto.
 *
 * O VIÉS QUE A RUBRICA COMBATE. Juiz LLM tende a preferir texto mais longo e mais formal — o
 * oposto do que este produto quer, que é fala natural. A rubrica penaliza formalização
 * explicitamente, e o relatório mostra a concordância com o chrF++ para que a discordância possa
 * ser inspecionada em vez de escondida.
 *
 * Uso:
 *   node node_modules/tsx/dist/cli.mjs scripts/eval-fala/julgar-traducao.mjs
 *   node ... --entrada docs/auditoria/eval/resultados-traducao-llm-fala.json
 *   node ... --juiz llama3.1:latest
 */
import { readFileSync, writeFileSync } from 'node:fs'
import { chrf } from '../../src/core/eval/chrf.ts'

const args = process.argv.slice(2)
const opt = (n, p) => { const i = args.indexOf(`--${n}`); return i > -1 && args[i + 1] ? args[i + 1] : p }

const ENTRADA = opt('entrada', 'docs/auditoria/eval/resultados-traducao-llm.json')
const SAIDA = opt('saida', 'docs/auditoria/eval/resultados-juiz.json')
const JUIZ = opt('juiz', 'qwen2.5:14b-instruct')
const BASE = process.env.OLLAMA_HOST || 'http://localhost:11434'

const RUBRICA = `Você avalia traduções do inglês para o português do Brasil, de FALA ESPONTÂNEA em conversa informal.

Dê três notas de 0 a 5:
- adequacao: o sentido da origem foi preservado, sem acrescentar nem omitir informação?
- naturalidade: um brasileiro DIRIA isso numa conversa? Tradução ao pé da letra que ninguém fala perde nota.
- registro: o nível de formalidade bate com o da origem?

REGRAS IMPORTANTES:
- A referência é UMA tradução possível, não a única. Uma tradução diferente da referência pode ser
  igualmente boa ou MELHOR — julgue o texto, não a distância até a referência.
- NÃO premie texto mais longo, mais formal ou mais "caprichado". Fala informal traduzida em registro
  formal é ERRO de registro, mesmo que soe mais culto.
- Expressão idiomática adaptada para o equivalente brasileiro é ACERTO, não desvio.

Responda SOMENTE com JSON: {"adequacao":N,"naturalidade":N,"registro":N,"porque":"até 15 palavras"}`

/** Uma chamada ao juiz. Devolve as três notas, ou null se a resposta não for utilizável. */
async function julgar(caso) {
  const r = await fetch(`${BASE}/api/chat`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      model: JUIZ,
      stream: false,
      format: 'json',
      options: { temperature: 0 }, // julgamento tem de ser reproduzível
      messages: [
        { role: 'system', content: RUBRICA },
        {
          role: 'user',
          // CEGO: sem o nome do modelo. O juiz avalia o texto, não a marca.
          content: `Origem (inglês): ${caso.origem}\nReferência (uma tradução possível): ${caso.referencia}\nTradução a avaliar: ${caso.hipotese}`,
        },
      ],
    }),
    signal: AbortSignal.timeout(180_000),
  })
  if (!r.ok) throw new Error(`HTTP ${r.status}: ${(await r.text()).slice(0, 120)}`)
  const bruto = (await r.json()).message?.content ?? ''
  try {
    const j = JSON.parse(bruto)
    const n = (v) => (Number.isFinite(Number(v)) ? Math.max(0, Math.min(5, Number(v))) : null)
    const a = n(j.adequacao), nat = n(j.naturalidade), reg = n(j.registro)
    if (a === null || nat === null || reg === null) return null
    return { adequacao: a, naturalidade: nat, registro: reg, porque: String(j.porque ?? '').slice(0, 90) }
  } catch {
    return null // resposta ilegível conta como ausência de julgamento, nunca como nota zero
  }
}

const media = (xs) => (xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : null)

async function main() {
  const dados = JSON.parse(readFileSync(ENTRADA, 'utf8'))
  const execucoes = (dados.execucoes ?? []).filter((e) => e.casos?.length)
  if (!execucoes.length) throw new Error(`sem execuções com casos em ${ENTRADA}`)

  /* Uma execução por modelo (a primeira). Julgar as repetições multiplicaria o tempo sem responder
     nada novo: a variação entre execuções já foi medida pelo chrF++, que é grátis. */
  const porModelo = new Map()
  for (const e of execucoes) if (!porModelo.has(e.modelo)) porModelo.set(e.modelo, e)

  console.log(`juiz: ${JUIZ} (local, neutro) · ${porModelo.size} modelo(s) · ${[...porModelo.values()][0].casos.length} casos\n`)

  const resultados = []
  for (const [modelo, e] of porModelo) {
    process.stdout.write(`${modelo.padEnd(30)} `)
    const julgados = []
    let semJulgamento = 0
    for (const c of e.casos) {
      try {
        const j = await julgar(c)
        if (!j) { semJulgamento++; process.stdout.write('?'); continue }
        julgados.push({ id: c.id, categoria: c.categoria, origem: c.origem, referencia: c.referencia,
          hipotese: c.hipotese, juiz: j, chrf: chrf(c.referencia, c.hipotese).chrf })
        process.stdout.write('.')
      } catch (err) {
        semJulgamento++
        process.stdout.write('x')
        if (julgados.length === 0 && semJulgamento > 2) throw new Error(`juiz indisponível: ${err.message}`)
      }
    }
    const notas = julgados.map((j) => (j.juiz.adequacao + j.juiz.naturalidade + j.juiz.registro) / 3)
    const resumo = {
      modelo,
      julgados: julgados.length,
      semJulgamento,
      juizGeral: media(notas),
      adequacao: media(julgados.map((j) => j.juiz.adequacao)),
      naturalidade: media(julgados.map((j) => j.juiz.naturalidade)),
      registro: media(julgados.map((j) => j.juiz.registro)),
      chrfMedio: media(julgados.map((j) => j.chrf * 100)),
      casos: julgados,
    }
    resultados.push(resumo)
    console.log(`  juiz ${resumo.juizGeral?.toFixed(2)}/5  (adeq ${resumo.adequacao?.toFixed(2)} · nat ${resumo.naturalidade?.toFixed(2)} · reg ${resumo.registro?.toFixed(2)})`)
  }

  console.log(`\n${'modelo'.padEnd(30)} ${'juiz/5'.padStart(7)} ${'chrF++'.padStart(8)}`)
  for (const r of [...resultados].sort((a, b) => (b.juizGeral ?? 0) - (a.juizGeral ?? 0))) {
    console.log(`${r.modelo.padEnd(30)} ${r.juizGeral?.toFixed(2).padStart(7)} ${r.chrfMedio?.toFixed(1).padStart(7)}%`)
  }

  /* AS DISCORDÂNCIAS SÃO O PRODUTO. Onde o juiz aprova e o chrF++ reprova, ou está o gold set
     limitado (referência é uma tradução entre várias) ou o juiz está sendo complacente. As duas
     hipóteses só se distinguem OLHANDO os casos — por isso eles são impressos, não resumidos. */
  console.log(`\ndiscordâncias (juiz ≥ 4 e chrF++ < 60% — candidatas a "boa tradução que a métrica reprova"):`)
  let n = 0
  for (const r of resultados) {
    for (const c of r.casos) {
      const nota = (c.juiz.adequacao + c.juiz.naturalidade + c.juiz.registro) / 3
      if (nota >= 4 && c.chrf < 0.6) {
        console.log(`  [${c.categoria}] ${c.origem}`)
        console.log(`     saiu: ${c.hipotese}`)
        console.log(`     ref : ${c.referencia}`)
        console.log(`     juiz ${nota.toFixed(1)}/5 · chrF++ ${(c.chrf * 100).toFixed(0)}% · ${c.juiz.porque}`)
        n++
      }
    }
  }
  if (!n) console.log('  (nenhuma)')

  console.log(`\ninverso (juiz ≤ 2 e chrF++ ≥ 70% — texto parecido com a referência mas ruim):`)
  let m = 0
  for (const r of resultados) {
    for (const c of r.casos) {
      const nota = (c.juiz.adequacao + c.juiz.naturalidade + c.juiz.registro) / 3
      if (nota <= 2 && c.chrf >= 0.7) {
        console.log(`  [${c.categoria}] ${c.origem} → ${c.hipotese}  (juiz ${nota.toFixed(1)} · chrF++ ${(c.chrf * 100).toFixed(0)}%)`)
        m++
      }
    }
  }
  if (!m) console.log('  (nenhuma)')

  writeFileSync(SAIDA, JSON.stringify({
    geradoEm: new Date().toISOString(), juiz: JUIZ, entrada: ENTRADA, resultados,
  }, null, 2))
  console.log(`\nbruto: ${SAIDA}`)
}

main().catch((e) => { console.error('FALHOU:', e.message); process.exit(1) })
