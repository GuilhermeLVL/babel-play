/**
 * BANCADA DE LATÊNCIA DE UMA ROTA DO OPENROUTER — o "antes e depois" de mexer no `roteamento` do provedor
 * (`ops/ia-provedores.openrouter.json`). Feita para a decisão do dono de 25/10/2026: tirar a Makora (o endpoint da cauda
 * de 5–14 s do "Como respondo?", `docs/auditoria/eval-assistente-v1.md`). Como o `ignore` vale para tudo que passa pelo
 * OpenRouter, mede também a LEGENDA ao vivo.
 *
 * Só latência e taxa de resposta utilizável (sem juiz): o MESMO pedido de produção (`openrouter.mjs#montarCorpo` com o
 * `roteamento` declarado), na perna primária (Gemma 4 26B), com e sem `makora` no `ignore`, INTERCALADOS caso a caso
 * (os dois lados sob o mesmo momento da rede), sem cache. Teto no MESMO livro-caixa da bancada do assistente.
 *
 * Uso: npx tsx --env-file=.env scripts/eval-ia/latencia-rota.mjs [--repeticoes-respondo 3] [--repeticoes-legenda 2]
 *        [--teto 1] [--caixa docs/auditoria/eval/assistente-v1/gasto.json] [--saida docs/auditoria/eval/assistente-v1/rota]
 */
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import path from 'node:path'

import { SAIDA_DO_COMO_RESPONDO } from '../../src/lib/esquemasDeSaida.ts'
import {
  lerSugestoes,
  PARAMETROS_DO_ASSISTENTE,
  systemDoAssistente,
  userDoAssistente,
} from '../../src/lib/estudo/promptDoAssistente.ts'
import { LivroCaixa, TetoDeGasto } from '../eval-fala/bancada/livroCaixa.mjs'
import { lerComoAProducao, pedidoDaProducao } from './funcoes.mjs'
import { carregarGold, lerJsonl } from './golds.mjs'
import { chamar, interpretarSistema, LimiteDaChave, montarCorpo, tetoDePrecoZdr } from './openrouter.mjs'

const args = process.argv.slice(2)
const opt = (nome, padrao) => {
  const i = args.indexOf(`--${nome}`)
  return i >= 0 && args[i + 1] && !args[i + 1].startsWith('--') ? args[i + 1] : padrao
}
const TETO_USD = Number(opt('teto', '1'))
const CAIXA = path.resolve(opt('caixa', 'docs/auditoria/eval/assistente-v1/gasto.json'))
const SAIDA = path.resolve(opt('saida', 'docs/auditoria/eval/assistente-v1/rota'))
const REP_RESPONDO = Number(opt('repeticoes-respondo', '3'))
const REP_LEGENDA = Number(opt('repeticoes-legenda', '2'))
const MODELO = 'google/gemma-4-26b-a4b-it'
const EXCLUIDO = 'makora'

const lerJson = (arq, padrao) => {
  try {
    return JSON.parse(readFileSync(arq, 'utf8'))
  } catch {
    return padrao
  }
}
const armazem = {
  ler: () => lerJson(CAIXA, { totalUsd: 0, porSistema: {} }),
  somar: (sistema, usd) => {
    const c = lerJson(CAIXA, { totalUsd: 0, porSistema: {} })
    c.totalUsd += usd
    c.porSistema[sistema] = (c.porSistema[sistema] ?? 0) + usd
    mkdirSync(path.dirname(CAIXA), { recursive: true })
    writeFileSync(CAIXA, `${JSON.stringify(c, null, 2)}\n`)
  },
}

export function percentil(valores, p) {
  const v = valores.filter((x) => Number.isFinite(x)).sort((a, b) => a - b)
  if (!v.length) return null
  return v[Math.min(v.length - 1, Math.max(0, Math.ceil((p / 100) * v.length) - 1))]
}

async function main() {
  const chave = String(process.env.OPENROUTER_API_KEY ?? '').trim()
  if (!chave) throw new Error('OPENROUTER_API_KEY ausente no ambiente')
  const livro = new LivroCaixa({ tetoUsd: TETO_USD, armazem })
  const ops = JSON.parse(readFileSync('ops/ia-provedores.openrouter.json', 'utf8')).provedores.find(
    (p) => p.id === 'openrouter',
  )
  const semExcluido = (ops.roteamento.ignore ?? []).filter((x) => x !== EXCLUIDO)
  const rotas = {
    antes: { ...ops.roteamento, ignore: semExcluido },
    depois: { ...ops.roteamento, ignore: [...new Set([...semExcluido, EXCLUIDO])] },
  }

  const r = await fetch('https://openrouter.ai/api/v1/endpoints/zdr')
  if (!r.ok) throw new Error(`endpoints/zdr: HTTP ${r.status}`)
  const sis = interpretarSistema(MODELO)
  const preco = tetoDePrecoZdr((await r.json()).data ?? [], sis)
  if (!preco) throw new Error(`${MODELO}: sem endpoint ZDR`)

  /* As tarefas: cada caso × repetição, com as DUAS rotas lado a lado. */
  const tarefas = []
  const respondo = lerJsonl(readFileSync('tests/eval/fixtures/gold-assistente-como-respondo-v1.jsonl', 'utf8'))
  const { maxTokens, temperatura } = PARAMETROS_DO_ASSISTENTE.comoRespondo
  for (let rep = 0; rep < REP_RESPONDO; rep++)
    for (const c of respondo)
      for (const rota of Object.keys(rotas))
        tarefas.push({
          funcao: 'comoRespondo',
          rota,
          caso: c.id,
          corpo: montarCorpo({
            sis,
            roteamento: rotas[rota],
            mensagens: [
              { role: 'system', content: systemDoAssistente('comoRespondo', c.lang, c.langDaPessoa) },
              {
                role: 'user',
                content: userDoAssistente({
                  recurso: 'comoRespondo',
                  frase: c.frase,
                  ...(c.contexto?.length ? { contexto: c.contexto } : {}),
                }),
              },
            ],
            temperatura,
            maxTokens,
            formato: SAIDA_DO_COMO_RESPONDO,
            legenda: true,
          }).corpo,
          ler: (t) => lerSugestoes(t),
        })
  const legendas = carregarGold('legenda')
  for (let rep = 0; rep < REP_LEGENDA; rep++)
    for (const c of legendas)
      for (const rota of Object.keys(rotas)) {
        const p = pedidoDaProducao('legenda', c)
        tarefas.push({
          funcao: 'legenda',
          rota,
          caso: c.id,
          corpo: montarCorpo({
            sis,
            roteamento: rotas[rota],
            mensagens: p.mensagens,
            temperatura: p.temperatura,
            maxTokens: p.maxTokens,
            legenda: true,
          }).corpo,
          ler: (t) => lerComoAProducao('legenda', c, t),
        })
      }

  console.log(`teto US$ ${TETO_USD} · já gasto US$ ${livro.totalUsd.toFixed(4)} · ${tarefas.length} chamadas`)
  const resultados = []
  let i = 0
  let parada = null
  await Promise.all(
    Array.from({ length: 4 }, async () => {
      while (i < tarefas.length && !parada) {
        const t = tarefas[i++]
        try {
          const g = await chamar({ corpo: t.corpo, preco, livro, rotulo: `rota:${t.funcao}:${t.rota}`, chave })
          resultados.push({
            funcao: t.funcao,
            rota: t.rota,
            caso: t.caso,
            totalMs: g.totalMs,
            provedor: g.provedor,
            usd: g.usd,
            valido: Boolean(g.texto && t.ler(g.texto)),
          })
        } catch (e) {
          if (e instanceof TetoDeGasto || e instanceof LimiteDaChave) parada = e
          else resultados.push({ funcao: t.funcao, rota: t.rota, caso: t.caso, erro: String(e.message).slice(0, 160) })
        }
        process.stdout.write(`\r  ${resultados.length}/${tarefas.length} · US$ ${livro.totalUsd.toFixed(4)}   `)
      }
    }),
  )
  console.log('')

  const resumo = { geradoEm: new Date().toISOString(), modelo: MODELO, excluido: EXCLUIDO, rotas, porFuncao: {} }
  for (const funcao of ['comoRespondo', 'legenda']) {
    resumo.porFuncao[funcao] = {}
    for (const rota of Object.keys(rotas)) {
      const rs = resultados.filter((x) => x.funcao === funcao && x.rota === rota)
      const t = rs.map((x) => x.totalMs / 1000)
      const provedores = {}
      for (const x of rs) provedores[x.provedor ?? 'erro'] = (provedores[x.provedor ?? 'erro'] ?? 0) + 1
      const custos = rs.map((x) => x.usd).filter(Number.isFinite)
      resumo.porFuncao[funcao][rota] = {
        n: rs.length,
        validos: rs.filter((x) => x.valido).length,
        erros: rs.filter((x) => x.erro).length,
        p50: percentil(t, 50),
        p90: percentil(t, 90),
        p95: percentil(t, 95),
        max: percentil(t, 100),
        usdPorMil: custos.length ? (1000 * custos.reduce((a, b) => a + b, 0)) / custos.length : null,
        provedores,
      }
    }
  }
  resumo.gastoUsd = livro.totalUsd
  resumo.parada = parada ? `${parada.name}: ${parada.message}` : null
  mkdirSync(SAIDA, { recursive: true })
  writeFileSync(path.join(SAIDA, 'resumo.json'), `${JSON.stringify(resumo, null, 2)}\n`)
  writeFileSync(path.join(SAIDA, 'bruto.jsonl'), `${resultados.map((x) => JSON.stringify(x)).join('\n')}\n`)
  console.log(JSON.stringify(resumo.porFuncao, null, 1))
  console.log(
    `gasto: US$ ${livro.totalUsd.toFixed(4)} de US$ ${TETO_USD}${parada ? ` · PARADO: ${parada.message}` : ''}`,
  )
  if (parada) process.exitCode = 2
}

main().catch((e) => {
  console.error(e instanceof Error ? e.message : e)
  process.exitCode = 1
})
