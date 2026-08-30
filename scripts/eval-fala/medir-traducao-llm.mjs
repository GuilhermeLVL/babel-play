/**
 * Mede a tradução por LLM DE NUVEM (o caminho `server-llm-mt`) no mesmo gold set do opus-mt.
 *
 * POR QUE ESTE SCRIPT NASCEU. Duas perguntas ficaram sem resposta e as duas custam dinheiro:
 *
 *  1. O modelo padrão MORREU. `llama-3.3-70b-versatile` responde `model_not_found` para a chave
 *     real (verificado contra a API, não só na documentação) — a Groq moveu-o para enterprise.
 *     Trocar por outro sem medir seria repetir o erro que este repositório passou o mês inteiro
 *     evitando, então o substituto entra medido.
 *  2. O caminho de nuvem NUNCA foi medido. O `medir-traducao.mjs` mede só o opus-mt local. Como o
 *     LLM é o motor que se pretende VENDER, a pergunta "ele é melhor o bastante para justificar a
 *     assinatura?" precisa de número, e o buraco conhecido é o idiomático (27,4% no local).
 *
 * FIDELIDADE À PRODUÇÃO. Usa `systemComunicativo`/`userComunicativo` de
 * `src/lib/traducao/promptComunicativo.ts` — o MESMO prompt de `server/ai/mtProxy.ts:82-84` — e a
 * mesma `temperature: 0.2` da fala. O gold set traz `contexto`, que é exatamente o que o caminho
 * local não sabe receber; medir sem ele apagaria a única vantagem estrutural do LLM.
 *
 * CUSTO. Reporta tokens de entrada e saída por caso, porque nos modelos de raciocínio (`gpt-oss`) a
 * saída inclui os tokens de pensamento — e eles são cobrados como saída. Medido: 133 tokens no
 * padrão contra 31 com `reasoning_effort: 'low'`. Sem esta coluna, a conta do plano Pro erra por 4×.
 *
 * Uso:
 *   node node_modules/tsx/dist/cli.mjs scripts/eval-fala/medir-traducao-llm.mjs
 *   node ... medir-traducao-llm.mjs --modelo openai/gpt-oss-20b --esforco low
 *   node ... medir-traducao-llm.mjs --sem-contexto     (isola o quanto o contexto contribui)
 */
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs'
import path from 'node:path'
import { agregarChrf, agregarPorCategoria, chrf } from '../../src/core/eval/chrf.ts'
import { systemComunicativo, userComunicativo } from '../../src/lib/traducao/promptComunicativo.ts'

const GOLD = 'tests/eval/fixtures/gold-traducao-v0.jsonl'
const SAIDA = 'docs/auditoria/eval/resultados-traducao-llm.json'

const args = process.argv.slice(2)
const opt = (nome, padrao) => {
  const i = args.indexOf(`--${nome}`)
  return i > -1 && args[i + 1] ? args[i + 1] : padrao
}
const MODELO = opt('modelo', 'openai/gpt-oss-120b')
const ESFORCO = opt('esforco', '')
const SEM_CONTEXTO = args.includes('--sem-contexto')

/**
 * A chave sai do `.env` do repositório, e NUNCA é impressa. Se faltar, o script para dizendo o
 * porquê — medir com metade da configuração daria um número que descreve outro produto.
 */
function chaveDaGroq() {
  if (process.env.GROQ_API_KEY) return process.env.GROQ_API_KEY
  for (const arquivo of ['.env', '../TradutorWeb/.env']) {
    try {
      const m = readFileSync(new URL(`../../${arquivo}`, import.meta.url), 'utf8')
        .match(/^GROQ_API_KEY=(.+)$/m)
      if (m) return m[1].trim()
    } catch { /* arquivo ausente é normal */ }
  }
  throw new Error('GROQ_API_KEY não encontrada (nem no ambiente, nem no .env)')
}

const BASE = process.env.GROQ_BASE_URL || 'https://api.groq.com/openai/v1'

/** Uma tradução. Espelha o corpo de `server/ai/mtProxy.ts:96-105`. */
async function traduzir(chave, caso) {
  const corpo = {
    model: MODELO,
    temperature: 0.2, // `falada: true` — mtProxy.ts:100
    max_tokens: 1200, // mtProxy.ts:101. Abaixo de ~128 o gpt-oss devolve VAZIO: gasta tudo pensando.
    messages: [
      { role: 'system', content: systemComunicativo('pt', 'en') },
      { role: 'user', content: userComunicativo(caso.origem, SEM_CONTEXTO ? [] : caso.contexto) },
    ],
  }
  if (ESFORCO) corpo.reasoning_effort = ESFORCO

  const r = await fetch(`${BASE}/chat/completions`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${chave}` },
    body: JSON.stringify(corpo),
    signal: AbortSignal.timeout(60_000),
  })
  if (!r.ok) throw new Error(`HTTP ${r.status}: ${(await r.text()).slice(0, 160)}`)
  const d = await r.json()
  return {
    texto: (d.choices?.[0]?.message?.content ?? '').trim(),
    entrada: d.usage?.prompt_tokens ?? 0,
    saida: d.usage?.completion_tokens ?? 0,
  }
}

async function main() {
  const chave = chaveDaGroq()
  const casos = readFileSync(GOLD, 'utf8').split(/\r?\n/).filter(Boolean).map((l) => JSON.parse(l))
  console.log(`modelo ${MODELO}${ESFORCO ? ` (esforço ${ESFORCO})` : ''}${SEM_CONTEXTO ? ' SEM contexto' : ''} · ${casos.length} casos\n`)

  const comHip = []
  let entrada = 0
  let saida = 0
  for (const c of casos) {
    // Sequencial de propósito: são 16 casos, e em paralelo o rate limit vira ruído na medição.
    const r = await traduzir(chave, c)
    entrada += r.entrada
    saida += r.saida
    comHip.push({ ...c, hipotese: r.texto, tokens: { entrada: r.entrada, saida: r.saida } })
    process.stdout.write('.')
  }
  console.log('\n')

  const geral = agregarChrf(comHip)
  const porCategoria = agregarPorCategoria(comHip)

  console.log(`chrF++ geral: ${(geral.chrf * 100).toFixed(1)}%\n`)
  for (const [cat, a] of Object.entries(porCategoria).sort()) {
    console.log(`  ${cat.padEnd(18)} ${(a.chrf * 100).toFixed(1).padStart(5)}%  (${a.casos} casos)`)
  }

  /* Preço público da Groq em 2026-08-30, gpt-oss-120b: $0,15/M entrada, $0,60/M saída. Os tokens
     de raciocínio entram em SAÍDA — por isso a média por caso é o número que a precificação usa. */
  const PRECO = { entrada: 0.15, saida: 0.6 }
  const custo = (entrada * PRECO.entrada + saida * PRECO.saida) / 1e6
  console.log(`\ntokens: ${entrada} entrada + ${saida} saída  ·  média por fala: ${Math.round(entrada / casos.length)} + ${Math.round(saida / casos.length)}`)
  console.log(`custo destes ${casos.length} casos: US$ ${custo.toFixed(5)}  ·  por 1.000 falas: US$ ${(custo / casos.length * 1000).toFixed(3)}`)

  mkdirSync(path.dirname(SAIDA), { recursive: true })
  writeFileSync(SAIDA, JSON.stringify({
    geradoEm: new Date().toISOString(),
    modelo: MODELO, esforco: ESFORCO || 'padrão', semContexto: SEM_CONTEXTO,
    geral, porCategoria, tokens: { entrada, saida }, casos: comHip,
  }, null, 2))

  console.log(`\nas saídas fracas (o que a nota não mostra):`)
  for (const c of comHip) {
    if (chrf(c.referencia, c.hipotese).chrf < 0.6) {
      console.log(`  [${c.categoria}] ${c.origem}`)
      console.log(`     saiu: ${c.hipotese}`)
      console.log(`     ref : ${c.referencia}`)
    }
  }
}

main().catch((e) => { console.error('FALHOU:', e.message); process.exit(1) })
