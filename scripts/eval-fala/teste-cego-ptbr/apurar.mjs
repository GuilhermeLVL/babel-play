/**
 * APURA O TESTE CEGO pt-BR (openspec `traducao-local-por-direcao`, D4): lê o gabarito e as planilhas preenchidas e devolve,
 * por sistema candidato, a proporção de pt-PT (por avaliador e na união, com IC de Wilson), o kappa, a naturalidade pareada
 * contra o controle (bootstrap 95%), a qualidade (chrF++ dos brutos; COMET de arquivo) e o VEREDITO
 * (`aprovado`, `reprovado`, `inconclusivo`, `invalida`). Só `aprovado` muda a rota de en→pt (dado em
 * `src/core/traducao/vereditoPorDirecao.json`, ato do dono).
 *
 *   node node_modules/tsx/dist/cli.mjs scripts/eval-fala/teste-cego-ptbr/apurar.mjs \
 *     --gabarito <pasta>/gabarito.json --respostas A1=<pasta>/respostas-A1.csv,A2=<pasta>/respostas-A2.csv \
 *     [--brutos a.json,b.json] [--comet comet.json] [--saida relatorio.json]
 *
 * `--brutos`: os mesmos brutos da bancada (`mt_*.json`), para o chrF++ pareado por corpus (`fleurs:en-pt`, `gold:en-pt`) contra
 * o controle, com TODOS os casos de cada corpus. `--comet`: `{ "<corpus>": { "<sistema>": { "ic95": [a, b] } } }` (a diferença
 * pareada COMET candidato − controle, do `pontuar.py`); sem ele o COMET fica "não informado" e o veredito não passa de
 * `inconclusivo`. Planilha de outro lote, protocolo alterado depois de gerar ou resposta faltando = para com erro.
 */
import { readFileSync, writeFileSync } from 'node:fs'
import path from 'node:path'
import { pathToFileURL } from 'node:url'

import { bootstrapPareado, mediaEm } from '../../../src/core/eval/bootstrap.ts'
import { chrf } from '../../../src/core/eval/chrf.ts'
import { conferirLote, kappaDaRodada, lerRespostas, naturalidade, proporcaoPtPt, veredito, wilson } from './nucleo.mjs'

const arg = (n, d) => {
  const i = process.argv.indexOf(`--${n}`)
  return i > 0 ? process.argv[i + 1] : d
}
const lista = (v) =>
  String(v ?? '')
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean)

const CORPORA_DA_QUALIDADE = ['fleurs:en-pt', 'gold:en-pt']

/** chrF++ pareado (candidato − controle) por corpus, com todos os casos que os dois traduziram sem erro. */
export function qualidadeChrf(brutos, sistema, controle, corpora = CORPORA_DA_QUALIDADE) {
  const resultados = brutos.flatMap((b) => b.resultados ?? [])
  const out = {}
  for (const corpus of corpora) {
    const doControle = resultados.find((r) => r.sistema === controle && r.corpus === corpus)
    const doSistema = resultados.find((r) => r.sistema === sistema && r.corpus === corpus)
    if (!doControle || !doSistema) continue
    const porId = new Map(doControle.casos.filter((c) => !c.erro).map((c) => [c.id, c]))
    const pares = doSistema.casos.filter((c) => !c.erro && porId.has(c.id)).map((c) => [c, porId.get(c.id)])
    if (pares.length < 2) continue
    const a = pares.map(([c]) => chrf(c.referencia, c.hipotese).chrf * 100)
    const b = pares.map(([, c]) => chrf(c.referencia, c.hipotese).chrf * 100)
    const d = bootstrapPareado(pares.length, mediaEm(a), mediaEm(b))
    out[corpus] = { n: pares.length, diferenca: d.valor, ic95: d.ic95 }
  }
  return out
}

export function apurar({ gabarito, planilhas, brutos = [], comet = {} }) {
  const { protocolo, itens } = gabarito
  // O protocolo do gabarito tem de bater com o próprio hash (mudou depois de gerar = a rodada não vale); o lote de cada
  // linha das planilhas é conferido em `lerRespostas`.
  conferirLote(gabarito, gabarito.protocoloSha256.slice(0, 12))
  const respostas = []
  const problemas = []
  for (const a of gabarito.avaliadores) {
    const csv = planilhas.find((p) => p.avaliador === a.id)
    if (!csv) {
      problemas.push(`${a.id}: planilha não informada`)
      continue
    }
    const r = lerRespostas(csv.texto, a, gabarito)
    respostas.push(...r.respostas)
    problemas.push(...r.problemas)
  }
  if (problemas.length) return { invalida: true, problemas }
  const candidatos = protocolo.sistemas.filter((s) => s !== protocolo.controle)
  const { kappa, itensEmComum } = kappaDaRodada(respostas)
  const nat = naturalidade(respostas, itens, protocolo.sistemas, protocolo.controle)
  const porSistema = {}
  for (const s of protocolo.sistemas) {
    const ptPt = proporcaoPtPt(respostas, itens, s)
    porSistema[s] = { ptPt: { ...ptPt, uniaoWilson: wilson(ptPt.uniao.k, ptPt.uniao.n) }, naturalidade: nat[s] }
  }
  for (const s of candidatos) {
    const chrfPorCorpus = qualidadeChrf(brutos, s, protocolo.controle)
    const cometPorCorpus = Object.fromEntries(
      Object.entries(comet).flatMap(([corpus, porSis]) => (porSis?.[s] ? [[corpus, porSis[s]]] : [])),
    )
    porSistema[s].qualidade = { chrf: chrfPorCorpus, comet: cometPorCorpus }
    porSistema[s].veredito = veredito(
      { ptPt: porSistema[s].ptPt, kappa, naturalidade: nat[s], qualidade: porSistema[s].qualidade },
      protocolo.limiares,
    )
  }
  return { invalida: false, kappa, itensEmComum, porSistema, controle: protocolo.controle, candidatos }
}

export function relatorioEmTexto(r) {
  if (r.invalida) return `RODADA INVÁLIDA:\n${r.problemas.map((p) => `  - ${p}`).join('\n')}\n`
  const pct = (x) => `${(x * 100).toFixed(1)}%`
  const linhas = [
    `kappa ${Number.isFinite(r.kappa) ? r.kappa.toFixed(2) : 'indefinido'} em ${r.itensEmComum} itens em comum (mínimo 0,40)`,
  ]
  for (const [s, v] of Object.entries(r.porSistema)) {
    const w = v.ptPt.uniaoWilson
    linhas.push(
      `${s}${s === r.controle ? ' (controle)' : ''}: pt-PT ${v.ptPt.uniao.k}/${v.ptPt.uniao.n} = ${pct(w.p)} [${pct(w.ic95[0])}–${pct(w.ic95[1])}]; ` +
        `por avaliador ${Object.entries(v.ptPt.porAvaliador)
          .map(([a, x]) => `${a} ${pct(x.k / x.n)}`)
          .join(', ')}; ` +
        `naturalidade ${v.naturalidade.media.toFixed(2)} [${v.naturalidade.ic95.map((x) => x.toFixed(2)).join(', ')}]`,
    )
    if (v.veredito) {
      const q = v.qualidade
      for (const [m, c] of [
        ['chrF++', q.chrf],
        ['COMET', q.comet],
      ])
        for (const [corpus, x] of Object.entries(c))
          linhas.push(
            `    ${m} ${corpus}: Δ ${x.diferenca?.toFixed?.(2) ?? '?'} [${x.ic95.map((y) => y.toFixed(2)).join(', ')}]`,
          )
      const nc = v.naturalidade.contraOControle
      if (nc)
        linhas.push(
          `    naturalidade − controle: ${nc.diferenca.toFixed(2)} [${nc.ic95.map((y) => y.toFixed(2)).join(', ')}] (n=${nc.n})`,
        )
      linhas.push(`    VEREDITO ${v.veredito.veredito.toUpperCase()}: ${v.veredito.motivos.join('; ')}`)
    }
  }
  return `${linhas.join('\n')}\n`
}

function principal() {
  const gabarito = JSON.parse(readFileSync(arg('gabarito'), 'utf8'))
  const planilhas = lista(arg('respostas')).map((par) => {
    const [avaliador, arquivo] = par.split('=')
    const texto = readFileSync(arquivo, 'utf8')
    return { avaliador, texto }
  })
  const brutos = lista(arg('brutos')).map((f) => JSON.parse(readFileSync(f, 'utf8')))
  const comet = arg('comet') ? JSON.parse(readFileSync(arg('comet'), 'utf8')) : {}
  const r = apurar({ gabarito, planilhas, brutos, comet })
  process.stdout.write(relatorioEmTexto(r))
  const saida = arg('saida')
  if (saida) writeFileSync(saida, `${JSON.stringify(r, null, 2)}\n`)
  if (r.invalida) process.exit(1)
}

if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) principal()
