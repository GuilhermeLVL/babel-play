/**
 * BANCADA DA IA PAGA (Fase A do plano de qualidade, 24/10/2026) — gera com os candidatos, julga com LLM-as-judge e
 * decide pelo MAIS BARATO NÃO-INFERIOR, com as métricas de experiência de quem usa.
 *
 * Uso (a chave vem SÓ do ambiente, `OPENROUTER_API_KEY`; nunca é impressa nem gravada):
 *   node node_modules/tsx/dist/cli.mjs scripts/eval-ia/rodar.mjs --funcao explicacao --teto-usd 5
 *   …  --funcao todas [--limite 20] [--candidatos a,b,c] [--juizes j1,j2] [--sem-pareado] [--sem-segundo-juiz]
 *   …  --ensaio                       só confere ZDR e preço-teto e estima o pior caso, sem chamar nenhum modelo
 *   …  --relatorio                    refaz resumos, concordância e planilha a partir dos brutos (sem rede)
 *   …  --calibrar <planilha.csv>      κ juiz × humano da planilha preenchida pelo dono (sem rede)
 *
 * O que sai em `--saida` (padrão `docs/auditoria/eval/ia-paga-v1`): `bruto-<função>.json` (cada geração com texto,
 * custo, tokens, TTFT e total; cada veredito com o raciocínio do juiz; cada par nas duas ordens), `bruto-legenda-mt.json`
 * (a legenda no formato de `bancada/mt.mjs`, que `bancada/resumo.mjs` lê), `decisao-<função>.{json,md}`,
 * `concordancia.json`, `planilha-calibracao.csv` + `calibracao-juiz.json` (30 casos, cegos).
 *
 * TETO DE GASTO: um livro-caixa em disco (`--caixa`, padrão `$BANCADA_DIR/ia-paga-gasto.json`) soma TODAS as execuções;
 * cada chamada reserva o pior caso ANTES de sair, e a que passaria de `--teto-usd` não sai — a bancada PARA e grava o
 * parcial (`livroCaixa.mjs`). Respostas ficam em cache (`--trabalho`): refazer o relatório não paga de novo.
 */
import { createHash } from 'node:crypto'
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import path from 'node:path'

import { LivroCaixa, TetoDeGasto } from '../eval-fala/bancada/livroCaixa.mjs'
import {
  COLUNAS_DA_PLANILHA,
  escolherParaCalibrar,
  kappaDaPlanilha,
  kappaDeCohen,
  lerCsv,
  leituraDoKappa,
  montarPlanilha,
  paraCsv,
} from './concordancia.mjs'
import { decidirFuncao, markdownDaFuncao } from './estatistica.mjs'
import {
  blocoDoCaso,
  CRITERIOS,
  experienciaDoCaso,
  lerComoAProducao,
  pedidoDaProducao,
  saidaParaJuiz,
} from './funcoes.mjs'
import { amostrar, carregarGold, FUNCOES } from './golds.mjs'
import {
  combinarOrdens,
  juizPara,
  lerPareado,
  lerRubrica,
  pareadoSemJuiz,
  systemDaRubrica,
  systemDoPareado,
  userDaRubrica,
  userDoPareado,
  vereditoDaInvalida,
} from './juiz.mjs'
import {
  chamar,
  interpretarSistema,
  montarCorpo,
  piorCasoUsd,
  RecusaDoProvedor,
  tetoDePrecoZdr,
} from './openrouter.mjs'

const args = process.argv.slice(2)
const opt = (n, p) => {
  const i = args.indexOf(`--${n}`)
  return i > -1 && args[i + 1] && !args[i + 1].startsWith('--') ? args[i + 1] : p
}
const flag = (n) => args.includes(`--${n}`)

const BANCADA_DIR =
  process.env.BANCADA_DIR || path.join(process.env.LOCALAPPDATA || process.env.HOME || '.', 'babel-bancada')
const SAIDA = opt('saida', 'docs/auditoria/eval/ia-paga-v1')
const TRABALHO = opt('trabalho', path.join(BANCADA_DIR, 'ia-paga'))
const CAIXA = opt('caixa', path.join(BANCADA_DIR, 'ia-paga-gasto.json'))
const TETO_USD = Number(opt('teto-usd', '5'))
const LIMITE = Number(opt('limite', '0')) || 0
const CONCORRENCIA = Number(opt('concorrencia', '4')) || 4

/** Os candidatos da rodada 1 (plano, Fase A item 5). O PRIMEIRO é a produção de hoje (a base). */
export const CANDIDATOS_PADRAO = Object.freeze({
  estudo: [
    'openai/gpt-oss-120b',
    'deepseek/deepseek-v4.1-flash',
    // Ajuste de candidato (fora da produção): o DeepSeek pensa por padrão e gastou até 1.111 tokens raciocinando no piloto.
    'deepseek/deepseek-v4.1-flash@none',
    'mistralai/mistral-small-2603',
    'z-ai/glm-5.3-flash',
    'qwen/qwen3-next-80b-a3b-instruct',
  ],
  legenda: ['google/gemma-4-26b-a4b-it', 'openai/gpt-oss-120b~groq+cerebras', 'mistralai/mistral-small-2603'],
})
export const JUIZES_PADRAO = Object.freeze(['mistralai/mistral-medium-3.1', 'deepseek/deepseek-v4.1-flash'])
const MAX_TOKENS_DO_JUIZ = { rubrica: 1600, pareado: 600 }

const hash = (x) => createHash('sha256').update(JSON.stringify(x)).digest('hex').slice(0, 16)

// ------------------------------------------------------------------ cache e livro em disco

function lerJson(arq, padrao) {
  try {
    return JSON.parse(readFileSync(arq, 'utf8'))
  } catch {
    return padrao
  }
}
function gravarJson(arq, dados) {
  mkdirSync(path.dirname(arq), { recursive: true })
  writeFileSync(arq, `${JSON.stringify(dados, null, 2)}\n`)
}

const ARQ_CACHE = path.join(TRABALHO, 'cache.json')
const cache = lerJson(ARQ_CACHE, {})
let cacheSujo = 0
function guardar(chave, valor) {
  cache[chave] = valor
  if (++cacheSujo % 10 === 0) gravarJson(ARQ_CACHE, cache)
}

const armazem = {
  ler: () => lerJson(CAIXA, { totalUsd: 0, porSistema: {} }),
  somar: (sistema, usd) => {
    const c = lerJson(CAIXA, { totalUsd: 0, porSistema: {} })
    c.totalUsd += usd
    c.porSistema[sistema] = (c.porSistema[sistema] ?? 0) + usd
    gravarJson(CAIXA, c)
  },
}

// ------------------------------------------------------------------ pool

async function emParalelo(itens, n, fn) {
  let i = 0
  let parado = null
  await Promise.all(
    Array.from({ length: Math.min(n, itens.length) }, async () => {
      while (i < itens.length && !parado) {
        const it = itens[i++]
        try {
          await fn(it)
        } catch (e) {
          if (e instanceof TetoDeGasto) parado = e
          else throw e
        }
      }
    }),
  )
  if (parado) throw parado
}

// ------------------------------------------------------------------ chamadas

function contexto() {
  const chave = String(process.env.OPENROUTER_API_KEY ?? '').trim()
  return { chave, livro: new LivroCaixa({ tetoUsd: TETO_USD, armazem }) }
}

async function chamarComCache(ctx, sis, preco, corpo, rotulo) {
  const k = `${rotulo.split(':')[0]}:${hash(corpo)}`
  if (cache[k]) return { ...cache[k], doCache: true }
  if (!ctx.chave) throw new Error('OPENROUTER_API_KEY ausente no ambiente (a chave nunca é lida de arquivo aqui)')
  const r = await chamar({ corpo, preco, livro: ctx.livro, rotulo, chave: ctx.chave })
  guardar(k, r)
  return r
}

async function endpointsZdr() {
  const r = await fetch('https://openrouter.ai/api/v1/endpoints/zdr')
  if (!r.ok) throw new Error(`endpoints/zdr: HTTP ${r.status}`)
  return (await r.json()).data ?? []
}

/** Os sistemas chamáveis: id válido, endpoint ZDR e preço-teto. Os outros saem em `pulados`, com o motivo. */
function resolverSistemas(specs, endpoints) {
  const sistemas = []
  const pulados = []
  for (const spec of specs) {
    const sis = interpretarSistema(spec)
    const preco = tetoDePrecoZdr(endpoints, sis)
    if (!preco) pulados.push({ sistema: spec, motivo: 'sem endpoint ZDR (fora do Google) no OpenRouter' })
    else sistemas.push({ ...sis, preco })
  }
  return { sistemas, pulados }
}

// ------------------------------------------------------------------ uma função

async function rodarFuncao(funcao, ctx, endpoints) {
  const specs = (opt('candidatos', null)?.split(',') ?? CANDIDATOS_PADRAO[funcao === 'legenda' ? 'legenda' : 'estudo'])
    .map((s) => s.trim())
    .filter(Boolean)
  const juizesSpec = (opt('juizes', null)?.split(',') ?? [...JUIZES_PADRAO]).slice(0, flag('sem-segundo-juiz') ? 1 : 2)
  const casos = amostrar(carregarGold(funcao), LIMITE)
  const { sistemas, pulados } = resolverSistemas(specs, endpoints)
  const { sistemas: juizes, pulados: juizesPulados } = resolverSistemas(juizesSpec, endpoints)
  for (const p of [...pulados, ...juizesPulados]) console.warn(`  pulado: ${p.sistema} — ${p.motivo}`)
  if (!sistemas.length || !juizes.length) throw new Error(`${funcao}: sem sistema ou juiz chamável`)
  const base = sistemas[0].id
  const criterios = CRITERIOS[funcao]
  const arqBruto = path.join(SAIDA, `bruto-${funcao}.json`)
  const bruto = {
    funcao,
    geradoEm: new Date().toISOString(),
    base,
    juizes: juizes.map((j) => j.modelo),
    sistemas: sistemas.map((s) => ({
      id: s.id,
      modelo: s.modelo,
      precoTetoZdr: s.preco,
      parametros: montarCorpo({ sis: s, mensagens: [], temperatura: 0, maxTokens: 1 }).parametros,
    })),
    pulados: [...pulados, ...juizesPulados],
    casos: casos.map((c) => c.id),
    geracoes: {},
    rubrica: {},
    pareado: {},
  }
  const gravar = () => gravarJson(arqBruto, bruto)

  if (flag('ensaio')) {
    let pior = 0
    for (const s of sistemas)
      for (const c of casos) {
        const p = pedidoDaProducao(funcao, c)
        pior += piorCasoUsd(
          montarCorpo({ sis: s, mensagens: p.mensagens, temperatura: p.temperatura, maxTokens: p.maxTokens }).corpo,
          s.preco,
        )
      }
    console.log(
      `  ${funcao}: ${sistemas.length} sistemas × ${casos.length} casos — pior caso da GERAÇÃO US$ ${pior.toFixed(3)} (juízes à parte)`,
    )
    for (const s of [...sistemas, ...juizes])
      console.log(
        `    ${s.id.padEnd(42)} ZDR em ${s.preco.endpoints} endpoint(s), teto US$ ${s.preco.entrada.toFixed(3)}/${s.preco.saida.toFixed(3)} por 1M`,
      )
    return null
  }

  console.log(
    `\n${funcao}: ${sistemas.length} sistemas × ${casos.length} casos · juízes ${juizes.map((j) => j.id).join(', ')}`,
  )
  try {
    /* 1) GERAR com o pedido da produção. */
    const trabalhos = sistemas.flatMap((s) => casos.map((c) => ({ s, c })))
    let feitos = 0
    await emParalelo(trabalhos, CONCORRENCIA, async ({ s, c }) => {
      const p = pedidoDaProducao(funcao, c)
      const { corpo } = montarCorpo({
        sis: s,
        mensagens: p.mensagens,
        temperatura: p.temperatura,
        maxTokens: p.maxTokens,
      })
      let r
      try {
        r = await chamarComCache(ctx, s, s.preco, corpo, `ger:${s.id}`)
      } catch (e) {
        if (e instanceof TetoDeGasto) throw e
        r = {
          texto: '',
          erro: String(e.message).slice(0, 200),
          semResposta: true,
          ttftMs: null,
          totalMs: null,
          usd: null,
        }
      }
      const lido = r.erro ? null : lerComoAProducao(funcao, c, r.texto)
      bruto.geracoes[s.id] ??= {}
      bruto.geracoes[s.id][c.id] = {
        ...(funcao === 'legenda' ? { origem: c.origem } : {}),
        texto: r.texto,
        erro: r.erro,
        semResposta: Boolean(r.semResposta),
        valida: Boolean(lido),
        lido,
        ttftMs: r.ttftMs,
        totalMs: r.totalMs,
        usd: r.usd,
        tokensEntrada: r.tokensEntrada,
        tokensSaida: r.tokensSaida,
        tokensEmCache: r.tokensEmCache,
        tokensDeRaciocinio: r.tokensDeRaciocinio,
        fim: r.fim,
        provedor: r.provedor,
        experiencia: experienciaDoCaso(funcao, c, lido),
      }
      process.stdout.write(`\r  gerando ${++feitos}/${trabalhos.length}   `)
    })
    gravar()
    console.log(`\r  gerado ${feitos}/${trabalhos.length} · gasto acumulado US$ ${ctx.livro.totalUsd.toFixed(4)}`)

    /* 2) RUBRICA: cada juiz julga cada resposta válida (cego). A inválida leva 0 sem juiz. */
    const sysRubrica = systemDaRubrica()
    const julgar = sistemas.flatMap((s) => juizes.flatMap((j) => casos.map((c) => ({ s, j, c }))))
    feitos = 0
    await emParalelo(julgar, CONCORRENCIA, async ({ s, j, c }) => {
      const g = bruto.geracoes[s.id]?.[c.id]
      bruto.rubrica[j.modelo] ??= {}
      bruto.rubrica[j.modelo][s.id] ??= {}
      if (!g || g.semResposta) return
      if (!g.valida) {
        bruto.rubrica[j.modelo][s.id][c.id] = vereditoDaInvalida(criterios)
        return
      }
      const mensagens = [
        { role: 'system', content: sysRubrica },
        { role: 'user', content: userDaRubrica(blocoDoCaso(funcao, c), saidaParaJuiz(funcao, g.lido), criterios) },
      ]
      const { corpo } = montarCorpo({
        sis: j,
        mensagens,
        temperatura: 0,
        maxTokens: MAX_TOKENS_DO_JUIZ.rubrica,
        respostaJson: true,
      })
      try {
        const r = await chamarComCache(ctx, j, j.preco, corpo, `juiz:${j.id}`)
        bruto.rubrica[j.modelo][s.id][c.id] = lerRubrica(r.texto, criterios)
      } catch (e) {
        if (e instanceof TetoDeGasto) throw e
        bruto.rubrica[j.modelo][s.id][c.id] = null
      }
      process.stdout.write(`\r  julgando ${++feitos}/${julgar.length}   `)
    })
    gravar()
    console.log(`\r  julgado ${feitos}/${julgar.length} · gasto acumulado US$ ${ctx.livro.totalUsd.toFixed(4)}`)

    /* 3) PAREADO contra a base, nas DUAS ordens, pelo juiz de família diferente dos dois. */
    if (!flag('sem-pareado')) {
      const sysPar = systemDoPareado()
      const pares = sistemas.filter((s) => s.id !== base).flatMap((s) => casos.map((c) => ({ s, c })))
      const sisBase = sistemas[0]
      feitos = 0
      await emParalelo(pares, CONCORRENCIA, async ({ s, c }) => {
        const gc = bruto.geracoes[s.id]?.[c.id]
        const gb = bruto.geracoes[base]?.[c.id]
        bruto.pareado[s.id] ??= {}
        if (!gc || !gb || gc.semResposta || gb.semResposta) return
        const semJuiz = pareadoSemJuiz(gc.valida, gb.valida)
        if (semJuiz) {
          bruto.pareado[s.id][c.id] = semJuiz
          return
        }
        const juizModelo = juizPara(
          [s.modelo, sisBase.modelo],
          juizes.map((j) => j.modelo),
        )
        const j = juizes.find((x) => x.modelo === juizModelo)
        if (!j) return
        const bloco = blocoDoCaso(funcao, c)
        const [a, b] = [saidaParaJuiz(funcao, gc.lido), saidaParaJuiz(funcao, gb.lido)]
        const ordem = async (x, y) => {
          const mensagens = [
            { role: 'system', content: sysPar },
            { role: 'user', content: userDoPareado(bloco, x, y, criterios) },
          ]
          const { corpo } = montarCorpo({
            sis: j,
            mensagens,
            temperatura: 0,
            maxTokens: MAX_TOKENS_DO_JUIZ.pareado,
            respostaJson: true,
          })
          try {
            return lerPareado((await chamarComCache(ctx, j, j.preco, corpo, `par:${j.id}`)).texto)
          } catch (e) {
            if (e instanceof TetoDeGasto) throw e
            return null
          }
        }
        const primeira = await ordem(a, b) // candidato em A
        const segunda = await ordem(b, a) // candidato em B
        const comb = combinarOrdens(primeira, segunda)
        if (comb) bruto.pareado[s.id][c.id] = { ...comb, juiz: j.modelo, ordens: [primeira, segunda] }
        process.stdout.write(`\r  pareando ${++feitos}/${pares.length}   `)
      })
      gravar()
      console.log(`\r  pareado ${feitos}/${pares.length} · gasto acumulado US$ ${ctx.livro.totalUsd.toFixed(4)}`)
    }
  } catch (e) {
    if (!(e instanceof TetoDeGasto)) throw e
    bruto.paradoPeloTeto = e.message
    console.error(`\n  ${e.message} — parcial gravado.`)
  } finally {
    gravarJson(ARQ_CACHE, cache)
    gravar()
  }
  if (funcao === 'legenda') gravarLegendaMt(bruto)
  return bruto
}

/** A legenda no formato de `bancada/mt.mjs` (corpus `gold:en-pt`, chrF++ por caso), para `bancada/resumo.mjs`. */
function gravarLegendaMt(bruto) {
  const resultados = bruto.sistemas.map((s) => {
    const ger = bruto.geracoes[s.id] ?? {}
    const casos = bruto.casos
      .filter((c) => ger[c])
      .map((c) => ({
        id: c,
        hipotese: ger[c].lido?.texto ?? '',
        chrf: ger[c].experiencia?.chrf ?? 0,
        ms: Math.round(ger[c].totalMs ?? 0),
      }))
    const tempos = casos.map((c) => c.ms).sort((a, b) => a - b)
    const p = (q) => tempos[Math.min(tempos.length - 1, Math.floor(q * tempos.length))]
    const media = casos.reduce((n, c) => n + c.chrf, 0) / Math.max(1, casos.length)
    return {
      sistema: `openrouter:${s.id}`,
      corpus: 'gold:en-pt',
      n: casos.length,
      chrf: { valor: media, ic95: [Number.NaN, Number.NaN] },
      latenciaMs: { p50: p(0.5), p95: p(0.95) },
      parametros: s.parametros,
      casos,
    }
  })
  gravarJson(path.join(SAIDA, 'bruto-legenda-mt.json'), { geradoEm: bruto.geradoEm, resultados })
}

// ------------------------------------------------------------------ relatório, concordância, calibração

function lerBrutos() {
  return FUNCOES.map((f) => lerJson(path.join(SAIDA, `bruto-${f}.json`), null)).filter(Boolean)
}

/** κ juiz × juiz por função e por critério, sobre os itens que os dois julgaram (respostas válidas). */
export function concordanciaEntreJuizes(brutos) {
  const saida = {}
  for (const b of brutos) {
    const [j1, j2] = b.juizes
    if (!j2) continue
    const porCriterio = {}
    const todosA = []
    const todosB = []
    for (const cr of CRITERIOS[b.funcao]) {
      const a = []
      const bb = []
      for (const s of Object.keys(b.geracoes))
        for (const c of b.casos) {
          if (!b.geracoes[s]?.[c]?.valida) continue
          a.push(b.rubrica?.[j1]?.[s]?.[c]?.[cr.id]?.veredito ?? null)
          bb.push(b.rubrica?.[j2]?.[s]?.[c]?.[cr.id]?.veredito ?? null)
        }
      porCriterio[cr.id] = kappaDeCohen(a, bb)
      todosA.push(...a)
      todosB.push(...bb)
    }
    saida[b.funcao] = { juizes: [j1, j2], geral: kappaDeCohen(todosA, todosB), porCriterio }
  }
  return saida
}

function relatorio() {
  const brutos = lerBrutos()
  if (!brutos.length) throw new Error(`nenhum bruto em ${SAIDA}`)
  const decisoes = []
  for (const b of brutos) {
    const d = decidirFuncao(b)
    decisoes.push(d)
    gravarJson(path.join(SAIDA, `decisao-${b.funcao}.json`), d)
    writeFileSync(path.join(SAIDA, `decisao-${b.funcao}.md`), markdownDaFuncao(d))
    console.log(markdownDaFuncao(d))
  }
  const conc = concordanciaEntreJuizes(brutos)
  gravarJson(path.join(SAIDA, 'concordancia.json'), conc)
  for (const [f, c] of Object.entries(conc))
    console.log(
      `κ juiz×juiz ${f}: ${c.geral.kappa.toFixed(2)} (${leituraDoKappa(c.geral.kappa)}, n=${c.geral.n}, acordo ${(c.geral.concordancia * 100).toFixed(0)}%)`,
    )
  planilha(brutos)
  return decisoes
}

/** A planilha CEGA de 30 casos: 12 de explicação, 6 de cada outra função (o resto completa). */
function planilha(brutos) {
  const itens = []
  for (const b of brutos) {
    const casos = new Map(carregarGold(b.funcao).map((c) => [c.id, c]))
    for (const s of Object.keys(b.geracoes))
      for (const id of b.casos) {
        const g = b.geracoes[s][id]
        if (!g?.valida) continue
        const modelo = b.sistemas.find((x) => x.id === s)?.modelo ?? s
        const juiz = juizPara([modelo], b.juizes)
        const veredito = juiz ? b.rubrica?.[juiz]?.[s]?.[id] : null
        if (!veredito) continue
        itens.push({
          chave: hash([b.funcao, s, id]).slice(0, 10),
          funcao: b.funcao,
          caso: id,
          sistema: s,
          juiz,
          entrada: blocoDoCaso(b.funcao, casos.get(id)),
          resposta: saidaParaJuiz(b.funcao, g.lido),
          criterios: CRITERIOS[b.funcao],
          veredito,
        })
      }
  }
  const escolhidos = escolherParaCalibrar(itens, 30, { explicacao: 12, resumo: 6, alternativas: 6, legenda: 6 })
  const { linhas, doJuiz } = montarPlanilha(escolhidos)
  writeFileSync(path.join(SAIDA, 'planilha-calibracao.csv'), paraCsv(linhas, COLUNAS_DA_PLANILHA))
  gravarJson(path.join(SAIDA, 'calibracao-juiz.json'), {
    instrucoes: 'Preencha a coluna "humano" da planilha com 1 (atende) ou 0 (não atende) e rode --calibrar <csv>.',
    casos: escolhidos.map((e) => ({
      chave: e.chave,
      funcao: e.funcao,
      caso: e.caso,
      sistema: e.sistema,
      juiz: e.juiz,
    })),
    doJuiz,
  })
  console.log(
    `planilha de calibração: ${escolhidos.length} casos, ${linhas.length} linhas → ${path.join(SAIDA, 'planilha-calibracao.csv')}`,
  )
}

function calibrar(arq) {
  const gabarito = lerJson(path.join(SAIDA, 'calibracao-juiz.json'), null)
  if (!gabarito) throw new Error(`falta ${path.join(SAIDA, 'calibracao-juiz.json')} (rode --relatorio antes)`)
  const k = kappaDaPlanilha(lerCsv(readFileSync(arq, 'utf8')), gabarito.doJuiz)
  console.log(`anotadas ${k.anotadas}/${k.total}`)
  if (!k.anotadas) {
    console.log(
      'planilha não preenchida: sem κ juiz × humano. O juiz NÃO está calibrado para decidir troca (regra: κ ≥ 0,6).',
    )
    return k
  }
  console.log(
    `κ juiz × humano: ${k.geral.kappa.toFixed(2)} (${leituraDoKappa(k.geral.kappa)}) — ${k.geral.kappa >= 0.6 ? 'calibrado (≥ 0,6)' : 'NÃO calibrado (< 0,6)'}`,
  )
  for (const [c, v] of Object.entries(k.porCriterio))
    console.log(`  ${c.padEnd(20)} κ ${Number.isFinite(v.kappa) ? v.kappa.toFixed(2) : '—'} (n=${v.n})`)
  gravarJson(path.join(SAIDA, 'calibracao-resultado.json'), k)
  return k
}

async function main() {
  if (flag('calibrar')) return calibrar(opt('calibrar'))
  if (flag('relatorio')) return relatorio()
  const pedida = opt('funcao', 'explicacao')
  const funcoes = pedida === 'todas' ? FUNCOES : pedida.split(',')
  for (const f of funcoes) if (!FUNCOES.includes(f)) throw new Error(`--funcao desconhecida: ${f}`)
  if (!Number.isFinite(TETO_USD) || TETO_USD <= 0) throw new Error('--teto-usd precisa ser um número > 0')
  const ctx = contexto()
  if (!flag('ensaio'))
    console.log(
      `chave do OpenRouter: ${ctx.chave ? 'definida' : 'AUSENTE'} · teto US$ ${TETO_USD} · já gasto US$ ${ctx.livro.totalUsd.toFixed(4)} (${CAIXA})`,
    )
  const endpoints = await endpointsZdr()
  for (const f of funcoes) {
    const b = await rodarFuncao(f, ctx, endpoints)
    if (b?.paradoPeloTeto) break
  }
  if (!flag('ensaio')) {
    console.log(`\ngasto acumulado: US$ ${ctx.livro.totalUsd.toFixed(4)} de US$ ${TETO_USD}`)
    relatorio()
  }
}

if (existsSync(process.argv[1] ?? '') && import.meta.url.endsWith(path.basename(process.argv[1]))) {
  main().catch((e) => {
    if (e instanceof RecusaDoProvedor) console.error('RECUSA DO PROVEDOR:', e.message)
    else console.error('FALHOU:', e.message)
    process.exit(1)
  })
}
