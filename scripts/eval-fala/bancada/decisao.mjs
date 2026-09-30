/**
 * A REGRA DE DECISÃO DA BANCADA (B5, 29/09/2026) — pura, a partir do resumo pareado de `resumo.mjs`.
 *
 * Até o B5 a regra vivia em prosa (`docs/auditoria/eval/bancada-2026-09.md`) e cada troca era
 * decidida lendo a tabela. O B7 troca os padrões da produção com base NESTA saída, então a regra é
 * código, com teste (`tests/eval/bancada-decisao.test.ts`):
 *
 *   POR CORPUS, com o Δ pareado ORIENTADO (positivo = melhor; WER e alucinação são "menor é melhor"
 *   e têm o sinal invertido aqui) e o IC 95% do bootstrap pareado:
 *     superior       IC inteiro acima de 0
 *     não-inferior   IC inteiro acima de −margem — a margem é DECLARADA por métrica e sai impressa
 *     inferior       IC inteiro abaixo de 0 e passando da margem
 *     inconclusivo   o resto: o IC é largo demais para afirmar qualquer coisa
 *   O VEREDITO geral é o PIOR dos corpora: um candidato não compensa num corpus o que perde noutro.
 *
 *   REPROVA, qualquer que seja o veredito:
 *     - o GOLD DE CONVERSA piorou (IC exclui 0 para baixo), mesmo dentro da margem — o produto é
 *       conversa, e é esse corpus que decidiu as trocas de 24/09 (idiomático, registro, pronome);
 *     - o CUSTO POR HORA passou do teto. Custo desconhecido também não aprova.
 *   MT sem o gold de conversa é inconclusivo.
 *
 * `aprovado` = sem reprovação, custo conhecido e veredito superior ou não-inferior. Quem troca é o
 * dono; esta saída é o que a regra permite.
 *
 * Uso:
 *   node node_modules/tsx/dist/cli.mjs scripts/eval-fala/bancada/decisao.mjs \
 *     --resumo <dir>/resumo-bancada.json --saida <dir> [--margem-comet 0.01] [--margem-chrf 1] \
 *     [--margem-wer 0.005] [--margem-alucinacao 0.02] [--teto-mt 0.05] [--teto-stt 0.05]
 * Grava `<dir>/decisao-bancada.json` e `.md` e imprime o Markdown.
 */
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import path from 'node:path'
import { pathToFileURL } from 'node:url'

/**
 * AS MARGENS E OS TETOS PADRÃO — declarados aqui e impressos em toda saída; mudar é decisão do dono,
 * no comando.
 *   COMET 0,01    um terço da meia-largura do IC do gold de 60 casos (±0,03): abaixo disso a bancada
 *                 não distingue; a menor diferença que já motivou decisão foi 0,016.
 *   chrF++ 1 pt   o equivalente grosseiro, só quando o COMET não rodou.
 *   WER 0,5 pt    o mesmo terço do IC do FLEURS pt de 300 falas (±1,0 pt na nuvem).
 *   alucinação 2 pts  1 trecho em 50 sem fala que passa a sair com texto.
 *   Teto MT US$ 0,05/h de fala e STT US$ 0,05/h de áudio: a pilha de hoje (gpt-oss-120b low a
 *   US$ 0,036/h; turbo da Groq a 1,08 × US$ 0,04/h) com folga — uma troca não pode encarecer além.
 */
export const MARGENS_PADRAO = Object.freeze({ comet: 0.01, chrf: 1, wer: 0.005, alucinacao: 0.02 })
export const TETO_MT_PADRAO = 0.05
export const TETO_STT_PADRAO = 0.05

/** Métricas em que MENOR é melhor: o Δ tem o sinal invertido antes de classificar. */
const MENOR_EH_MELHOR = new Set(['wer', 'cer', 'alucinacao'])

const ORDEM = { inferior: 0, inconclusivo: 1, 'nao-inferior': 2, superior: 3 }

/** Classe de UM corpus, com o IC já orientado (positivo = melhor). */
export function classificar([lo, hi], margem) {
  if (lo > 0) return 'superior'
  if (lo > -margem) return 'nao-inferior'
  if (hi < 0) return 'inferior'
  return 'inconclusivo'
}

const ehGold = (c) => c.gold ?? String(c.corpus ?? '').startsWith('gold:')

/**
 * @param {object} p
 * @param {Array<{corpus: string, metrica: string, gold?: boolean, diferenca: {valor: number, ic95: [number, number]}}>} p.comparacoes
 *   Δ = candidato − base, como `resumo.mjs` grava.
 * @param {Record<string, number>} p.margens  margem de não-inferioridade por métrica, na unidade dela
 * @param {number|null} p.custoUsdPorHora  o custo do candidato (o mais alto entre os corpora)
 * @param {number} p.tetoUsdPorHora
 * @param {boolean} [p.exigirGold]  MT: sem o gold de conversa, inconclusivo
 */
export function decidir({ comparacoes, margens, custoUsdPorHora, tetoUsdPorHora, exigirGold = false }) {
  const porCorpus = (comparacoes ?? []).map((c) => {
    const margem = margens?.[c.metrica]
    if (!Number.isFinite(margem) || margem < 0)
      throw new Error(`margem de não-inferioridade não declarada (ou negativa) para ${c.metrica}`)
    const inverter = MENOR_EH_MELHOR.has(c.metrica)
    const [lo, hi] = c.diferenca.ic95
    const ic95 = inverter ? [-hi, -lo] : [lo, hi]
    return {
      corpus: c.corpus,
      metrica: c.metrica,
      gold: ehGold(c),
      delta: inverter ? -c.diferenca.valor : c.diferenca.valor,
      ic95,
      margem,
      classe: classificar(ic95, margem),
    }
  })

  const motivos = []
  const reprovacoes = []
  let veredito = porCorpus.length
    ? porCorpus.reduce((pior, c) => (ORDEM[c.classe] < ORDEM[pior] ? c.classe : pior), 'superior')
    : 'inconclusivo'
  if (!porCorpus.length) motivos.push('sem comparação pareada com a linha de base')
  if (exigirGold && !porCorpus.some((c) => c.gold)) {
    veredito = 'inconclusivo'
    motivos.push('sem o gold de conversa: tradução não se decide sem ele')
  }
  for (const c of porCorpus.filter((x) => x.gold && x.ic95[1] < 0)) {
    reprovacoes.push('gold-piorou')
    motivos.push(`gold de conversa piorou em ${c.corpus} (IC exclui 0 para baixo)`)
  }
  const custoConhecido = Number.isFinite(custoUsdPorHora)
  if (!custoConhecido) motivos.push('custo por hora desconhecido: sem ele a regra não aprova')
  else if (custoUsdPorHora > tetoUsdPorHora) {
    reprovacoes.push('custo-acima-do-teto')
    motivos.push(`custo de US$ ${custoUsdPorHora.toFixed(4)}/h acima do teto de US$ ${tetoUsdPorHora}/h`)
  }
  const aprovado =
    reprovacoes.length === 0 && custoConhecido && (veredito === 'superior' || veredito === 'nao-inferior')
  return { veredito, aprovado, reprovacoes: [...new Set(reprovacoes)], motivos, porCorpus }
}

const maxFinito = (valores) => {
  const f = valores.filter(Number.isFinite)
  return f.length ? Math.max(...f) : null
}

/**
 * Do resumo pareado (`resumo-bancada.json`) às decisões: uma por (função, candidato, base), juntando
 * os corpora/conjuntos. O custo é o MAIS ALTO do candidato entre eles (o lado seguro).
 */
export function decisoesDoResumo(resumo, opcoes = {}) {
  const margens = opcoes.margens ?? MARGENS_PADRAO
  const tetoMt = opcoes.tetoMtUsdPorHora ?? TETO_MT_PADRAO
  const tetoStt = opcoes.tetoSttUsdPorHora ?? TETO_STT_PADRAO
  const grupos = new Map()
  const juntar = (funcao, linha, corpus, custo, metricaDaLinha) => {
    if (!linha.candidato) return
    for (const c of linha.comparacoes ?? []) {
      const chave = `${funcao}\u0000${linha.sistema}\u0000${c.contra}`
      const g = grupos.get(chave) ?? {
        funcao,
        candidato: linha.sistema,
        contra: c.contra,
        comparacoes: [],
        custos: [],
        avisos: new Set(),
      }
      g.comparacoes.push({ corpus, metrica: c.metrica ?? metricaDaLinha, diferenca: c.diferenca })
      g.custos.push(custo)
      if (linha.parametros?.foraDaProducao)
        g.avisos.add(
          'ajuste de candidato fora da produção (@esforço): o B7 precisa levar o parâmetro para parametrosDoProvedor antes da troca',
        )
      if (linha.acimaDoTimeoutDeProducao > 0)
        g.avisos.add(
          `${linha.acimaDoTimeoutDeProducao} caso(s) acima dos 12 s de timeout da produção em ${corpus} (lá viram tradução local)`,
        )
      grupos.set(chave, g)
    }
  }
  for (const l of resumo.mt ?? []) juntar('mt', l, l.corpus, l.usdPorHoraDeFala, 'comet')
  for (const l of resumo.stt ?? []) juntar('stt', l, l.conjunto, l.custoUsdPorHora, l.metrica)

  return [...grupos.values()].map((g) => {
    const custoUsdPorHora = maxFinito(g.custos)
    const tetoUsdPorHora = g.funcao === 'mt' ? tetoMt : tetoStt
    return {
      funcao: g.funcao,
      candidato: g.candidato,
      contra: g.contra,
      custoUsdPorHora,
      tetoUsdPorHora,
      ...decidir({
        comparacoes: g.comparacoes,
        margens,
        custoUsdPorHora,
        tetoUsdPorHora,
        exigirGold: g.funcao === 'mt',
      }),
      avisos: [...g.avisos],
    }
  })
}

const ROTULO = {
  superior: 'superior',
  'nao-inferior': 'não-inferior',
  inferior: 'inferior',
  inconclusivo: 'inconclusivo',
}
const NOME_DA_METRICA = { comet: 'COMET', chrf: 'chrF++', wer: 'WER', alucinacao: 'alucinação', cer: 'CER' }
/** COMET em 3 casas; chrF++ em 1; WER/alucinação em pontos percentuais. */
const fmt = (metrica, x) =>
  MENOR_EH_MELHOR.has(metrica) ? `${(x * 100).toFixed(2)} pt` : metrica === 'chrf' ? x.toFixed(1) : x.toFixed(3)

export function markdownDasDecisoes(decisoes, opcoes = {}) {
  const margens = opcoes.margens ?? MARGENS_PADRAO
  const tetoMt = opcoes.tetoMtUsdPorHora ?? TETO_MT_PADRAO
  const tetoStt = opcoes.tetoSttUsdPorHora ?? TETO_STT_PADRAO
  const l = ['# Decisão da bancada — candidatos × linha de base', '']
  l.push(
    '> **Regra (`decisao.mjs`):** por corpus, o IC 95% pareado do Δ orientado (positivo = melhor) classifica em superior (> 0), não-inferior (> −margem), inferior ou inconclusivo; o veredito é o PIOR corpus. **Reprova** se o gold de conversa piorar (IC exclui 0 para baixo) ou se o custo por hora passar do teto. Quem troca é o dono.',
    '',
  )
  l.push(
    `Margens de não-inferioridade: ${Object.entries(margens)
      .map(([m, v]) => `${NOME_DA_METRICA[m] ?? m} ${MENOR_EH_MELHOR.has(m) ? `${v * 100} pt` : v}`)
      .join(' · ')} — teto MT US$ ${tetoMt}/h de fala · teto STT US$ ${tetoStt}/h de áudio.`,
    '',
  )
  if (!decisoes.length) {
    l.push('Nenhum candidato com comparação pareada nesta execução (sem chave, todos pulados?).', '')
    return `${l.join('\n')}\n`
  }
  l.push('| Função | Candidato | Base | Veredito | Resultado | US$/h | Motivos |')
  l.push('| --- | --- | --- | --- | --- | --: | --- |')
  for (const d of decisoes) {
    const resultado = d.aprovado ? '**APROVADO**' : d.reprovacoes.length ? '**REPROVADO**' : 'não aprovado'
    l.push(
      `| ${d.funcao.toUpperCase()} | \`${d.candidato}\` | \`${d.contra}\` | ${ROTULO[d.veredito]} | ${resultado} | ${Number.isFinite(d.custoUsdPorHora) ? d.custoUsdPorHora.toFixed(4) : '—'} | ${[...d.motivos, ...d.avisos].join('; ') || '—'} |`,
    )
  }
  l.push('', '## Por corpus (Δ orientado: positivo = melhor)', '')
  for (const d of decisoes) {
    l.push(`**${d.funcao.toUpperCase()} \`${d.candidato}\` × \`${d.contra}\`**`, '')
    for (const c of d.porCorpus)
      l.push(
        `- ${c.corpus}${c.gold ? ' (gold)' : ''} · ${NOME_DA_METRICA[c.metrica] ?? c.metrica}: ${fmt(c.metrica, c.delta)} [${fmt(c.metrica, c.ic95[0])}, ${fmt(c.metrica, c.ic95[1])}] → ${ROTULO[c.classe]} (margem ${fmt(c.metrica, c.margem)})`,
      )
    l.push('')
  }
  return `${l.join('\n')}\n`
}

function main() {
  const args = process.argv.slice(2)
  const valor = (nome, padrao) => {
    const i = args.indexOf(`--${nome}`)
    if (i < 0) return padrao
    const n = Number(args[i + 1])
    if (!Number.isFinite(n) || n < 0) throw new Error(`--${nome} precisa de um número ≥ 0`)
    return n
  }
  const texto = (nome, padrao) => {
    const i = args.indexOf(`--${nome}`)
    return i > -1 && args[i + 1] ? args[i + 1] : padrao
  }
  const opcoes = {
    margens: {
      comet: valor('margem-comet', MARGENS_PADRAO.comet),
      chrf: valor('margem-chrf', MARGENS_PADRAO.chrf),
      wer: valor('margem-wer', MARGENS_PADRAO.wer),
      alucinacao: valor('margem-alucinacao', MARGENS_PADRAO.alucinacao),
    },
    tetoMtUsdPorHora: valor('teto-mt', TETO_MT_PADRAO),
    tetoSttUsdPorHora: valor('teto-stt', TETO_STT_PADRAO),
  }
  const resumo = JSON.parse(readFileSync(texto('resumo', 'resumo-bancada.json'), 'utf8'))
  const saida = texto('saida', '.')
  const decisoes = decisoesDoResumo(resumo, opcoes)
  const md = markdownDasDecisoes(decisoes, opcoes)
  mkdirSync(saida, { recursive: true })
  writeFileSync(
    path.join(saida, 'decisao-bancada.json'),
    `${JSON.stringify({ geradoEm: new Date().toISOString(), commit: resumo.commit ?? null, ...opcoes, decisoes }, null, 2)}\n`,
  )
  writeFileSync(path.join(saida, 'decisao-bancada.md'), md)
  console.log(md)
}

if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) main()
