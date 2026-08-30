/**
 * BANCADA de tradução por LLM — compara N modelos, de qualquer provedor OpenAI-compatible, no mesmo
 * gold set e sob o mesmo prompt de produção.
 *
 * POR QUE ESTE SCRIPT EXISTE. O motor de nuvem nunca foi comparado com ninguém: entrou como
 * substituto de um modelo que a Groq moveu para enterprise, medido só contra o tradutor local. E há
 * dinheiro na mesa — o MESMO `gpt-oss-120b` custa US$ 0,037/0,170 por milhão no OpenRouter contra
 * US$ 0,15/0,60 na Groq, e existem modelos gratuitos e modelos DEDICADOS a tradução (Tencent
 * Hy-MT2) a partir de 1,8B de parâmetros.
 *
 * O QUE ELE NÃO FAZ. Não escolhe o vencedor. Ele produz qualidade × custo medido, caso a caso, e a
 * decisão é de quem lê. Especificação em `openspec/changes/bancada-multi-modelo/`.
 *
 * FIDELIDADE À PRODUÇÃO. Usa `systemComunicativo`/`userComunicativo` de
 * `src/lib/traducao/promptComunicativo.ts` — os MESMOS de `server/ai/mtProxy.ts:82-84` — com a
 * `temperature: 0.2` da fala e o contexto das falas anteriores. Modelos dedicados a tradução usam o
 * template dos seus autores (ver `PROMPTS`), porque forçá-los ao nosso prompt mediria a nossa
 * capacidade de contrariá-los, não a deles de traduzir.
 *
 * CUSTO MEDIDO, NÃO TABELADO. Os tokens vêm do `usage` de cada resposta e o preço vem do catálogo
 * ao vivo do provedor, com a data gravada. Em modelo de raciocínio a saída inclui os tokens de
 * pensamento — medido: 133 contra 31 no mesmo caso — e é assim que o provedor cobra.
 *
 * Uso:
 *   node node_modules/tsx/dist/cli.mjs scripts/eval-fala/medir-traducao-llm.mjs
 *   node ... --modelos openai/gpt-oss-120b,z-ai/glm-5.3-flash,tencent/hy-mt2-7b
 *   node ... --provedor groq --modelos openai/gpt-oss-120b
 *   node ... --sem-contexto        (isola quanto o contexto contribui)
 *   node ... --repeticoes 2        (mede a variação entre execuções — sem isso não há ranking)
 */
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs'
import path from 'node:path'
import { agregarChrf, agregarPorCategoria, chrf } from '../../src/core/eval/chrf.ts'
import { systemComunicativo, userComunicativo } from '../../src/lib/traducao/promptComunicativo.ts'

/**
 * Corpora disponíveis (`--corpus fala|flores`, ou um caminho direto).
 *
 * `fala` é o gold set próprio: 16 casos de fenômenos de conversa (pronome, gênero, idiomático,
 * registro). Mede o PRODUTO — e é pequeno demais para rankear. Medido: o mesmo modelo, na mesma
 * configuração, variou 11,3 pontos entre execuções.
 *
 * `flores` é o benchmark público (FLORES-200, frases jornalísticas com tradução profissional). Tem
 * N para separar modelos e é comparável com o resto do mundo — mas NÃO mede fala: sem gíria, sem
 * registro informal, sem pronome resolvido pela frase anterior.
 *
 * Os dois juntos, sempre. Quem ganha no FLORES e perde na fala não serve para este produto.
 */
const CORPORA = {
  /** 60 casos, 10 por categoria. É o corpus de decisão para ESTE produto. */
  fala: 'tests/eval/fixtures/gold-traducao-v1.jsonl',
  /** Os 16 originais, mantidos para comparar com as medições de agosto/2026. */
  'fala-v0': 'tests/eval/fixtures/gold-traducao-v0.jsonl',
  flores: 'tests/fixtures/flores/flores-en-pt.jsonl',
}
const SAIDA_BASE = 'docs/auditoria/eval/resultados-traducao-llm'

/** Fração de casos com falha acima da qual o modelo NÃO entra no ranking (spec: 10%). */
const FALHA_MAXIMA = 0.1

const args = process.argv.slice(2)
const opt = (nome, padrao) => {
  const i = args.indexOf(`--${nome}`)
  return i > -1 && args[i + 1] ? args[i + 1] : padrao
}

/**
 * Provedores OpenAI-compatible. A troca é URL + nome da variável de chave: o corpo da requisição é
 * idêntico, que é justamente por que `server/ai/mtProxy.ts` também troca de provedor sem código.
 */
const PROVEDORES = {
  openrouter: {
    base: 'https://openrouter.ai/api/v1',
    envs: ['OPENROUTER_API_KEY'],
    catalogo: 'https://openrouter.ai/api/v1/models',
  },
  groq: {
    base: process.env.GROQ_BASE_URL || 'https://api.groq.com/openai/v1',
    envs: ['GROQ_API_KEY'],
    catalogo: null, // sem endpoint de preços; cai em "desconhecido", nunca em zero
  },
}

const PROVEDOR = opt('provedor', 'openrouter')
const MODELOS = opt('modelos', 'openai/gpt-oss-120b').split(',').map((m) => m.trim()).filter(Boolean)
const ESFORCO = opt('esforco', '')
const SEM_CONTEXTO = args.includes('--sem-contexto')
const REPETICOES = Number(opt('repeticoes', '1')) || 1
/**
 * Controle de raciocínio (`--raciocinio off|low|medium|high`).
 *
 * MEDIDO: o `qwen3.7-flash` gasta 593 tokens PENSANDO para responder "Boa sorte!" — a tradução
 * certa. Com o `max_tokens: 1200` que a produção usa (mtProxy.ts:101), os casos mais longos estouram
 * o orçamento e a resposta volta VAZIA. Ou seja, um modelo de raciocínio pode ser bom e inutilizável
 * ao mesmo tempo, dependendo desta configuração — e os tokens de pensamento são cobrados como saída.
 */
const RACIOCINIO = opt('raciocinio', '')
const CORPUS = opt('corpus', 'fala')
const GOLD = CORPORA[CORPUS] ?? CORPUS
const LIMITE = Number(opt('limite', '0')) || 0

/**
 * A chave sai do ambiente ou do `.env`, e NUNCA é impressa. Faltando, o script para dizendo o
 * porquê — medir com metade da configuração daria um número que descreve outro produto.
 */
function chaveDe(provedor) {
  const { envs } = PROVEDORES[provedor]
  for (const nome of envs) if (process.env[nome]) return process.env[nome]
  for (const arquivo of ['.env', '../TradutorWeb/.env']) {
    try {
      const texto = readFileSync(new URL(`../../${arquivo}`, import.meta.url), 'utf8')
      for (const nome of envs) {
        const m = texto.match(new RegExp(`^${nome}=(.+)$`, 'm'))
        if (m) return m[1].trim()
      }
    } catch { /* arquivo ausente é normal */ }
  }
  throw new Error(`chave não encontrada para ${provedor} (procurei ${envs.join(', ')} no ambiente e no .env)`)
}

/**
 * Preço por milhão de tokens, do catálogo AO VIVO.
 *
 * Não é constante em código de propósito: este projeto já perdeu um modelo inteiro do plano
 * self-serve em poucos dias, e um preço fixo aqui viraria dívida silenciosa. Sem catálogo, o custo
 * fica `null` — reportado como desconhecido, JAMAIS como zero, que pareceria modelo grátis.
 */
async function tabelaDePrecos(provedor, chave) {
  const url = PROVEDORES[provedor].catalogo
  if (!url) return { precos: {}, consultadoEm: null }
  try {
    const r = await fetch(url, { headers: { Authorization: `Bearer ${chave}` }, signal: AbortSignal.timeout(30_000) })
    if (!r.ok) throw new Error(`HTTP ${r.status}`)
    const d = await r.json()
    const precos = {}
    for (const m of d.data ?? []) {
      const p = m.pricing ?? {}
      const ent = Number(p.prompt)
      const sai = Number(p.completion)
      if (Number.isFinite(ent) && Number.isFinite(sai)) {
        precos[m.id] = { entrada: ent * 1e6, saida: sai * 1e6 }
      }
    }
    return { precos, consultadoEm: new Date().toISOString() }
  } catch (e) {
    console.warn(`[preço] catálogo indisponível (${e.message}); custo virá como desconhecido`)
    return { precos: {}, consultadoEm: null }
  }
}

/**
 * Formato de prompt por família de modelo.
 *
 * Os modelos dedicados a tradução não têm system prompt e usam o template dos seus autores. Medir
 * o Hunyuan-MT com o nosso prompt comunicativo mediria o quanto ele resiste a uma instrução que não
 * foi treinado para receber — não a qualidade da tradução dele. Cada um joga com as suas regras, e
 * o resultado registra qual formato foi usado.
 */
const PROMPTS = {
  comunicativo: (caso) => [
    { role: 'system', content: systemComunicativo('pt', 'en') },
    { role: 'user', content: userComunicativo(caso.origem, SEM_CONTEXTO ? [] : caso.contexto) },
  ],
  /** Template documentado em huggingface.co/tencent/Hunyuan-MT-7B (XX→XX, sem system prompt). */
  hunyuanMt: (caso) => [
    { role: 'user', content: `Translate the following segment into Portuguese, without additional explanation.\n\n${caso.origem}` },
  ],
}

const formatoDe = (modelo) => (/hy-mt|hunyuan-mt/i.test(modelo) ? 'hunyuanMt' : 'comunicativo')

/** Uma tradução. Espelha o corpo de `server/ai/mtProxy.ts:96-105`. */
async function traduzir(base, chave, modelo, caso) {
  const corpo = {
    model: modelo,
    temperature: 0.2, // `falada: true` — mtProxy.ts:100
    max_tokens: 1200, // mtProxy.ts:101. Abaixo de ~128 o gpt-oss devolve VAZIO: gasta tudo pensando.
    messages: PROMPTS[formatoDe(modelo)](caso),
  }
  if (ESFORCO) corpo.reasoning_effort = ESFORCO
  // Formato do OpenRouter, uniforme entre provedores (o `reasoning_effort` é o da OpenAI/Groq).
  if (RACIOCINIO === 'off') corpo.reasoning = { enabled: false }
  else if (RACIOCINIO) corpo.reasoning = { effort: RACIOCINIO }

  const r = await fetch(`${base}/chat/completions`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${chave}` },
    body: JSON.stringify(corpo),
    signal: AbortSignal.timeout(90_000),
  })
  if (!r.ok) throw new Error(`HTTP ${r.status}: ${(await r.text()).slice(0, 140)}`)
  const d = await r.json()
  if (d.error) throw new Error(String(d.error.message ?? d.error).slice(0, 140))
  const msg = d.choices?.[0]?.message ?? {}
  const texto = (msg.content ?? '').trim()
  /* VAZIO É FALHA, NÃO NOTA ZERO. Contar como zero misturaria "traduziu errado" com "não
     respondeu", e foi o que afundou o qwen3.7-flash para 25,5% numa medição em que ele acertava.
     São defeitos diferentes, com correções diferentes: um é o modelo, o outro é o orçamento. */
  if (!texto) {
    const raciocinio = d.usage?.completion_tokens_details?.reasoning_tokens ?? 0
    throw new Error(
      raciocinio > 0
        ? `resposta vazia — gastou ${raciocinio} tokens raciocinando dentro do teto de ${corpo.max_tokens}`
        : `resposta vazia (finish_reason: ${d.choices?.[0]?.finish_reason ?? '?'})`
    )
  }
  return {
    texto,
    entrada: d.usage?.prompt_tokens ?? 0,
    saida: d.usage?.completion_tokens ?? 0,
    raciocinio: d.usage?.completion_tokens_details?.reasoning_tokens ?? 0,
  }
}

/** Falta de saldo interrompe a bateria inteira: insistir só produz ruído caro de interpretar. */
class SemSaldo extends Error {}

/** Avalia UM modelo no gold set inteiro. Só lança quando o problema é do PROVEDOR, não do modelo. */
async function avaliarModelo(base, chave, modelo, casos) {
  const comHip = []
  const falhas = []
  let entrada = 0
  let saida = 0
  let raciocinio = 0
  for (const c of casos) {
    // Sequencial de propósito: em paralelo o limite de requisição da camada gratuita vira ruído.
    try {
      const r = await traduzir(base, chave, modelo, c)
      entrada += r.entrada
      saida += r.saida
      raciocinio += r.raciocinio
      comHip.push({ ...c, hipotese: r.texto, tokens: { entrada: r.entrada, saida: r.saida, raciocinio: r.raciocinio } })
      process.stdout.write('.')
    } catch (e) {
      falhas.push({ id: c.id, erro: e.message })
      process.stdout.write('x')
      /* SEM SALDO NÃO SE INSISTE. Numa bateria de 800 chamadas o crédito acabou na 84ª e as 716
         seguintes falharam com 402 — ruído que quase virou conclusão errada: a primeira falha do
         modelo tinha outra causa, e ler só ela sugeria que o modelo colapsava em frase longa. Não
         colapsava; o dinheiro tinha acabado. Parar na hora mantém o diagnóstico legível. */
      if (/\b402\b|requires more credits|insufficient/i.test(e.message)) {
        throw new SemSaldo(`crédito esgotado no provedor durante a avaliação de ${modelo}`)
      }
    }
  }
  const taxaDeFalha = falhas.length / casos.length
  return {
    modelo,
    formatoDePrompt: formatoDe(modelo),
    casos: comHip,
    falhas,
    taxaDeFalha,
    /* Acima do limite, a média descreveria só os casos que deram certo — um subconjunto favorável,
       que é pior que não ter número nenhum. */
    valido: taxaDeFalha <= FALHA_MAXIMA && comHip.length > 0,
    geral: comHip.length ? agregarChrf(comHip) : null,
    porCategoria: comHip.length ? agregarPorCategoria(comHip) : {},
    tokens: { entrada, saida, raciocinio },
  }
}

/** Custo por mil falas, em US$. `null` quando não sabemos o preço — nunca zero. */
function custoPorMilFalas(res, precos) {
  const p = precos[res.modelo]
  if (!p || !res.casos.length) return null
  const total = (res.tokens.entrada * p.entrada + res.tokens.saida * p.saida) / 1e6
  return (total / res.casos.length) * 1000
}

async function main() {
  const { base } = PROVEDORES[PROVEDOR] ?? {}
  if (!base) throw new Error(`provedor desconhecido: ${PROVEDOR} (conheço ${Object.keys(PROVEDORES).join(', ')})`)
  const chave = chaveDe(PROVEDOR)
  let casos = readFileSync(GOLD, 'utf8').split(/\r?\n/).filter(Boolean).map((l) => JSON.parse(l))
  if (LIMITE > 0) casos = casos.slice(0, LIMITE)
  const { precos, consultadoEm } = await tabelaDePrecos(PROVEDOR, chave)

  console.log(`provedor ${PROVEDOR} · corpus ${CORPUS} · ${MODELOS.length} modelo(s) · ${casos.length} casos · ${REPETICOES}x`)
  console.log(`(. ok  x falha — resposta vazia CONTA como falha)\n`)

  const execucoes = []
  let interrompida = null
  for (let volta = 1; volta <= REPETICOES && !interrompida; volta++) {
    for (const modelo of MODELOS) {
      process.stdout.write(`${modelo.padEnd(40)} `)
      let r
      try {
        r = await avaliarModelo(base, chave, modelo, casos)
      } catch (e) {
        if (e instanceof SemSaldo) {
          console.log(`

BATERIA INTERROMPIDA: ${e.message}.`)
          console.log(`Os resultados JÁ obtidos abaixo são válidos; os modelos não avaliados ficaram de fora.`)
          interrompida = e.message
          break
        }
        throw e
      }
      const nota = r.geral ? `${(r.geral.chrf * 100).toFixed(1)}%` : '—'
      const custo = custoPorMilFalas(r, precos)
      console.log(`  chrF++ ${nota.padStart(6)}  ${custo === null ? 'custo ?' : `US$ ${custo.toFixed(3)}/mil`}${r.valido ? '' : `  INVÁLIDO (${r.falhas.length} falhas)`}`)
      execucoes.push({ ...r, volta, custoPorMilFalas: custo })
    }
  }

  // ------------------------------------------------------------------ ranking
  /* AGREGA POR MODELO, não pela primeira volta. Uma versão anterior rankeava pelo resultado da
     volta 1 e comparava a distância contra a amplitude — o que deixou passar uma conclusão falsa:
     o gpt-oss-120b deu 85,4 / 76,8 / 83,1 no MESMO gold set, e a "vitória" do concorrente por 2,2
     pontos estava inteira dentro de uma amplitude de 8,6. Média e amplitude juntas, sempre. */
  const porModelo = new Map()
  for (const e of execucoes.filter((x) => x.valido)) {
    const lista = porModelo.get(e.modelo) ?? []
    lista.push(e)
    porModelo.set(e.modelo, lista)
  }
  const resumo = [...porModelo.entries()].map(([modelo, lista]) => {
    const notas = lista.map((e) => e.geral.chrf * 100)
    const custos = lista.map((e) => e.custoPorMilFalas).filter((c) => c !== null)
    return {
      modelo,
      formatoDePrompt: lista[0].formatoDePrompt,
      media: notas.reduce((a, b) => a + b, 0) / notas.length,
      amplitude: notas.length > 1 ? Math.max(...notas) - Math.min(...notas) : null,
      execucoes: notas.length,
      custo: custos.length ? custos.reduce((a, b) => a + b, 0) / custos.length : null,
    }
  })
  resumo.sort((a, b) => b.media - a.media)

  console.log(`
${'modelo'.padEnd(40)} ${'chrF++'.padStart(7)} ${'ampl.'.padStart(6)} ${'US$/mil'.padStart(9)}  prompt`)
  for (const r of resumo) {
    const amp = r.amplitude === null ? '  —  ' : `±${r.amplitude.toFixed(1)}`
    const custo = r.custo === null ? '?' : r.custo.toFixed(3)
    console.log(`${r.modelo.padEnd(40)} ${r.media.toFixed(1).padStart(6)}% ${amp.padStart(6)} ${custo.padStart(9)}  ${r.formatoDePrompt}`)
  }

  /* REPRODUTIBILIDADE ANTES DE PÓDIO. Se o mesmo modelo varia entre execuções tanto quanto varia de
     um modelo para o outro, não existe ranking — existe ruído com aparência de ordem. */
  if (REPETICOES > 1 && resumo.length >= 2) {
    const maiorAmplitude = Math.max(...resumo.map((r) => r.amplitude ?? 0))
    const diferenca = resumo[0].media - resumo[1].media
    console.log(
      diferenca <= maiorAmplitude
        ? `
  EMPATE TÉCNICO: 1º e 2º diferem ${diferenca.toFixed(1)} ponto(s), e o MESMO modelo varia até ${maiorAmplitude.toFixed(1)}.
  Este gold set (${casos.length} casos) não separa estes modelos. Amplie o corpus antes de decidir.`
        : `
  A diferença entre 1º e 2º (${diferenca.toFixed(1)}) supera a variação interna (${maiorAmplitude.toFixed(1)}): o ranking se sustenta.`
    )
  } else if (REPETICOES === 1) {
    console.log(`
(uma execução só: rode com --repeticoes 2 antes de tratar esta ordem como ranking)`)
  }

  const invalidos = execucoes.filter((e) => !e.valido)
  if (invalidos.length) {
    console.log(`\nfora do ranking:`)
    for (const e of invalidos) {
      console.log(`  ${e.modelo.padEnd(40)} ${e.falhas.length}/${casos.length} falhas — ${e.falhas[0]?.erro ?? 'sem saída'}`)
    }
  }

  // Um arquivo por corpus: sobrescrever o do FLORES com o da fala apagaria metade da evidência.
  const SAIDA = `${SAIDA_BASE}-${CORPUS}.json`
  /* E uma execução SEM RESULTADO não sobrescreve uma que teve. Aconteceu comigo: a bateria abortou
     por falta de saldo na primeira chamada e apagou o arquivo com 84 traduções boas da execução
     anterior. Medição perdida é medição que alguém vai pagar de novo para refazer. */
  if (!execucoes.some((e) => e.casos.length > 0)) {
    console.log(`\nnenhum resultado obtido — o arquivo anterior foi PRESERVADO (${SAIDA})`)
    return
  }
  mkdirSync(path.dirname(SAIDA), { recursive: true })
  writeFileSync(SAIDA, JSON.stringify({
    geradoEm: new Date().toISOString(),
    provedor: PROVEDOR, corpus: CORPUS, totalDeCasos: casos.length, interrompida,
    raciocinio: RACIOCINIO || 'padrão do modelo',
    esforco: ESFORCO || 'padrão', semContexto: SEM_CONTEXTO, repeticoes: REPETICOES,
    precos: { consultadoEm, usados: Object.fromEntries(MODELOS.map((m) => [m, precos[m] ?? null])) },
    execucoes, resumo,
  }, null, 2))
  console.log(`\nbruto: ${SAIDA}`)
}

main().catch((e) => { console.error('FALHOU:', e.message); process.exit(1) })
