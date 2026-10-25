/**
 * O RELATÓRIO SAI DO BRUTO (correção 1 da Fase A) — `docs/auditoria/eval-ia-paga-v1.md` inteiro é gerado aqui, a partir
 * das decisões (`estatistica.mjs#decidirFuncao`), da concordância e da conta de custo. Nenhum número é digitado à
 * mão: o texto fixo é qualitativo, e todo número vem de uma variável. Puro (recebe os dados, devolve o Markdown).
 */
import { leituraDoKappa } from './concordancia.mjs'
import { familia } from './juiz.mjs'
import { criteriosCriticos, CRITERIOS } from './funcoes.mjs'
import {
  ECONOMIA_MINIMA,
  MARGEM_DE_NAO_INFERIORIDADE,
  MAXIMO_SEM_RESPOSTA,
  PIORA_DE_LATENCIA_TOLERADA,
  TETO_USD_POR_MILHAO_DE_TOKENS,
} from './estatistica.mjs'

// ------------------------------------------------------------------ formatos (pt-BR)

const num = (x, d = 2) => (Number.isFinite(x) ? x.toFixed(d).replace('.', ',') : '—')
const sinal = (x, d = 3) => (Number.isFinite(x) ? `${x >= 0 ? '+' : '−'}${num(Math.abs(x), d)}` : '—')
const pct = (x) => (Number.isFinite(x) ? `${Math.round(x * 100)}%` : '—')
const seg = (msv) => (Number.isFinite(msv) ? `${num(msv / 1000, 1)} s` : '—')
const ic = (d, f = (x) => sinal(x)) => (d && d.n > 0 ? `${f(d.valor)} [${f(d.ic95[0])}, ${f(d.ic95[1])}]` : '—')
const brl = (x) => (Number.isFinite(x) ? `R$ ${num(x)}` : '—')
const usd = (x, d = 3) => (Number.isFinite(x) ? `US$ ${num(x, d)}` : '—')
const cod = (s) => `\`${s}\``

const NOMES = {
  explicacao: 'Explicação da frase',
  resumo: 'Resumo da sessão',
  alternativas: 'Outras formas',
  legenda: 'Legenda ao vivo',
}
const SITUACAO = {
  'pode-trocar': 'pode trocar (mais barato, não piora)',
  'opcao-mais-cara': 'opção MAIS CARA (melhora critério crítico; depende do dono)',
  'mais-caro-sem-ganho-critico': 'mais caro sem ganho crítico: não',
  piora: 'piora a experiência: não',
}

// ------------------------------------------------------------------ custo (puro)

/**
 * O efeito de um custo por 1M tokens ACIMA do modelo (R$ 1,40/M) na margem: a IA de texto de cada plano v4 sobe
 * `tokensMes/1M × (R$ medido − R$ 1,40)` por mês, no pior caso (toda a cota a esse preço).
 */
export function efeitoNaMargem({ usdPorMilhao, cambio, brlPorMilhaoDoModelo, planos, misturasSoPlus }) {
  const delta = Math.max(0, usdPorMilhao * cambio - brlPorMilhaoDoModelo)
  const porPlano = planos.map((p) => {
    const extraMensal = (p.tokensMes / 1e6) * delta
    return { ...p, extraMensal, margemAnualAjustada: p.margemAnualBrl - extraMensal * 12 }
  })
  const plus = porPlano.find((p) => p.plano === 'plus')
  const misturas = misturasSoPlus.map((m) => ({
    ...m,
    margemAjustadaUsd: m.margemPiorCasoUsd - (m.pagantes * (plus?.extraMensal ?? 0)) / cambio,
  }))
  return { deltaBrlPorMilhao: delta, porPlano, misturas }
}

// ------------------------------------------------------------------ partes do relatório

function linhaDeRecomendacao(d) {
  const rb = d.resumos[d.base]
  if (d.recomendado !== d.base) {
    const r = d.resumos[d.recomendado]
    const a = d.avaliacoes.find((x) => x.sistema === d.recomendado)
    return `**${NOMES[d.funcao]}: trocar ${cod(d.base)} por ${cod(d.recomendado)}** — mais barato (${usd(r.custo.usdPor1000Usos, 4)} contra ${usd(rb.custo.usdPor1000Usos, 4)} por 1.000 usos, ${pct(1 - r.custo.usdPor1000Usos / rb.custo.usdPor1000Usos)} a menos) e não piora a experiência (Δ nota ${ic(a.comparacao.nota)}).`
  }
  const caras = d.opcoesMaisCaras.map((s) => {
    const r = d.resumos[s]
    const a = d.avaliacoes.find((x) => x.sistema === s)
    const ganho = a.melhoras.map((cr) => `${cr} ${pct(rb.taxas[cr])} → ${pct(r.taxas[cr])}`).join(', ')
    const custo =
      d.funcao === 'legenda'
        ? `${usd(r.custo.usdPorHoraDeFala)}/h de fala (teto US$ 0,05)`
        : `${usd(r.custo.usdPorMilhaoDeTokens)}/1M tokens (teto do modelo de custo ${usd(TETO_USD_POR_MILHAO_DE_TOKENS, 2)})`
    const pagante = Number.isFinite(r.custo.brlPorPaganteNoMes)
      ? `; ${brl(r.custo.brlPorPaganteNoMes)} por pagante/mês na cota cheia, contra ${brl(rb.custo.brlPorPaganteNoMes)}`
      : `; ${usd(r.custo.usdPor1000Usos)} contra ${usd(rb.custo.usdPor1000Usos)} por 1.000 usos`
    return `${cod(s)} melhora ${ganho} (IC pareado exclui 0) e custa ${custo}${pagante} — **${a.custoCabe ? 'cabe no modelo de custo' : 'ACIMA do modelo de custo: depende do dono aceitar o custo e do portão `ia:custo`'}**`
  })
  return `**${NOMES[d.funcao]}: manter ${cod(d.base)}** (nenhum candidato mais barato sem piorar).${caras.length ? ` Opção mais cara, só com o aceite do dono: ${caras.join('; ')}.` : ''}`
}

function tabelaQualidade(d) {
  const l = []
  const crits = criteriosCriticos(d.funcao)
  l.push(
    `| Sistema | n | Nota [IC 95%] | Δ vs produção [IC 95%] | ${crits.map((c) => `${c} (crítico)`).join(' | ')} | Situação |`,
  )
  l.push(`| --- | --: | --- | --- | ${crits.map(() => '--:').join(' | ')} | --- |`)
  const sistemas = [d.base, ...d.avaliacoes.map((a) => a.sistema)]
  for (const s of sistemas) {
    const r = d.resumos[s]
    const a = d.avaliacoes.find((x) => x.sistema === s)
    const nota = `${num(r.nota.valor)} [${num(r.nota.ic95[0])}, ${num(r.nota.ic95[1])}]`
    const sit = a ? `${SITUACAO[a.situacao]}${a.pioras.length ? ` (${a.pioras.join('; ')})` : ''}` : 'produção'
    l.push(
      `| ${cod(s)}${s === d.recomendado && s !== d.base ? ' ★' : ''}${r.foraDaProducao ? ' (ajuste)' : ''} | ${r.n} | ${nota} | ${a ? ic(a.comparacao.nota) : '—'} | ${crits.map((c) => pct(r.taxas[c])).join(' | ')} | ${sit} |`,
    )
  }
  return l.join('\n')
}

function tabelaCriterios(d) {
  const crits = CRITERIOS[d.funcao].map((c) => c.id)
  const l = [`| Sistema | ${crits.join(' | ')} |`, `| --- | ${crits.map(() => '--:').join(' | ')} |`]
  for (const s of [d.base, ...d.avaliacoes.map((a) => a.sistema)])
    l.push(`| ${cod(s)} | ${crits.map((c) => pct(d.resumos[s].taxas[c])).join(' | ')} |`)
  return l.join('\n')
}

function tabelaExperiencia(d) {
  const l = []
  l.push(
    '| Sistema | Erro na tela (inválida) | Sem resposta do provedor | Passa do timeout | Espera p50 · p95 | TTFT p50 · p95 | Caracteres p50 | Cabe sem rolar | Palavras/frase | Idioma certo | US$/1.000 usos | R$ por pagante/mês | Extra |',
  )
  l.push('| --- | --: | --: | --: | --- | --- | --: | --: | --: | --: | --: | --: | --- |')
  for (const s of [d.base, ...d.avaliacoes.map((a) => a.sistema)]) {
    const r = d.resumos[s]
    const e = r.experiencia
    const extra =
      d.funcao === 'resumo'
        ? `${num(e.cartoes, 1)} cartões; ${pct(e.palavrasAlvoNosCartoes)} das palavras-alvo`
        : d.funcao === 'alternativas'
          ? `${num(e.opcoes, 1)} opções; nota ≤ 140: ${pct(e.notaCurta)}`
          : d.funcao === 'legenda'
            ? `chrF++ ${num(e.chrf, 1)}; ${usd(r.custo.usdPorHoraDeFala)}/h`
            : ''
    l.push(
      `| ${cod(s)} | ${pct(r.invalidas)} | ${pct(r.semResposta)} | ${pct(r.acimaDoTimeout)} | ${seg(r.latenciaMs.totalP50)} · ${seg(r.latenciaMs.totalP95)}${r.dentroDoSlo === false ? ' (fora do SLO)' : ''} | ${seg(r.latenciaMs.ttftP50)} · ${seg(r.latenciaMs.ttftP95)} | ${Number.isFinite(e.caracteresP50) ? Math.round(e.caracteresP50) : '—'} | ${pct(e.cabeSemRolar)} | ${num(e.palavrasPorFrase, 1)} | ${pct(e.idiomaOk)} | ${usd(r.custo.usdPor1000Usos)} | ${brl(r.custo.brlPorPaganteNoMes)} | ${extra} |`,
    )
  }
  return l.join('\n')
}

function tabelaPareado(d) {
  const l = [
    '| Candidato | Preferência (V · E · D) [IC 95%] | Instáveis (viés de posição) | Regra B5 da bancada |',
    '| --- | --- | --: | --- |',
  ]
  for (const a of d.avaliacoes) {
    const p = a.preferencia
    const b5 = d.contraProducao.find((c) => c.sistema === a.sistema)
    l.push(
      `| ${cod(a.sistema)} | ${p ? `${p.vitorias} · ${p.empates} · ${p.derrotas} ${ic({ ...p.media, n: p.n }, (x) => sinal(x, 2))}` : '—'} | ${p ? pct(p.instaveis) : '—'} | ${b5 ? `${b5.veredito}${b5.motivos.length ? ` — ${b5.motivos.join('; ')}` : ''}` : '—'} |`,
    )
  }
  return l.join('\n')
}

function listaDePoder(d) {
  const itens = []
  for (const a of d.avaliacoes)
    for (const [alvo, n] of Object.entries(a.poder ?? {}))
      itens.push(
        `- ${cod(a.sistema)}, ${alvo.replace(':', ' em ')}: ${n === null ? 'a diferença observada aponta para o outro lado — nenhuma amostra decide a favor' : `~${n} casos pareados (hoje ${a.comparacao.nota.n})`}`,
      )
  return itens.length ? itens.join('\n') : '- (a amostra decidiu todas as comparações relevantes)'
}

function tabelaRobustez(decisoes, robustez) {
  const l = [
    '| Função | Candidato | Juiz único (família diferente) | Δ nota, média dos 2 juízes | Δ nota, juiz único | Situação (2 juízes) | Situação (juiz único) |',
    '| --- | --- | --- | --- | --- | --- | --- |',
  ]
  for (const f of Object.keys(decisoes)) {
    const d = decisoes[f]
    const porJuiz = robustez[f]
    if (!porJuiz) continue
    for (const a of d.avaliacoes) {
      const modelo = d.resumos[a.sistema]?.modelo ?? a.sistema
      const juiz = Object.keys(porJuiz).find((j) => familia(j) !== familia(modelo))
      const am = juiz ? porJuiz[juiz].avaliacoes.find((x) => x.sistema === a.sistema) : null
      l.push(
        `| ${f} | ${cod(a.sistema)} | ${juiz ? cod(juiz) : '—'} | ${ic(a.comparacao.nota)} | ${am ? ic(am.comparacao.nota) : '—'} | ${a.situacao} | ${am?.situacao ?? '—'} |`,
      )
    }
  }
  return l.join('\n')
}

function tabelaConcordancia(conc) {
  const l = ['| Função | κ geral (acordo bruto) | κ por critério |', '| --- | --- | --- |']
  for (const [f, c] of Object.entries(conc)) {
    const porCrit = Object.entries(c.porCriterio)
      .map(([cr, k]) => `${cr} ${Number.isFinite(k.kappa) ? num(k.kappa) : 'indefinido'} (${pct(k.concordancia)})`)
      .join('; ')
    l.push(
      `| ${f} | ${num(c.geral.kappa)} — ${leituraDoKappa(c.geral.kappa)} (${pct(c.geral.concordancia)}) | ${porCrit} |`,
    )
  }
  return l.join('\n')
}

function secaoCusto(decisoes, custo) {
  const l = []
  l.push(
    '**Por pagante que esgota a cota de estudo** (300 explicações e 60 resumos por mês, `src/core/planos.ts`), pelo custo medido:',
    '',
  )
  for (const f of ['explicacao', 'resumo']) {
    const d = decisoes[f]
    if (!d) continue
    const ss = [d.base, ...d.opcoesMaisCaras, ...(d.recomendado !== d.base ? [d.recomendado] : [])]
    l.push(`- ${NOMES[f]}: ${ss.map((s) => `${cod(s)} ${brl(d.resumos[s].custo.brlPorPaganteNoMes)}`).join(' · ')}`)
  }
  l.push('')
  if (custo?.efeitos?.length) {
    l.push(
      `**Portão \`ia:custo\`.** O modelo de custo cobra a IA de texto a R$ ${num(custo.brlPorMilhaoDoModelo)} por 1M tokens (${usd(TETO_USD_POR_MILHAO_DE_TOKENS, 2)}). Efeito, no pior caso (toda a cota de tokens ao preço medido), de cada opção acima do modelo:`,
      '',
    )
    for (const e of custo.efeitos) {
      l.push(`- ${cod(e.sistema)} em ${e.funcao} (${usd(e.usdPorMilhao)}/1M, +R$ ${num(e.deltaBrlPorMilhao)}/1M):`)
      for (const p of e.porPlano)
        l.push(
          `  - ${p.rotulo}: +${brl(p.extraMensal)}/mês; margem do anual ${brl(p.margemAnualBrl)} → ${brl(p.margemAnualAjustada)}${p.margemAnualAjustada < 0 ? ' **NEGATIVA**' : ''}`,
        )
      for (const m of e.misturas)
        l.push(
          `  - mistura de ${pct(m.fracao)} de pagantes só com Plus: margem no pior caso ${usd(m.margemPiorCasoUsd, 2)} → ${usd(m.margemAjustadaUsd, 2)}`,
        )
    }
    l.push('')
  }
  if (custo?.misturasEssencialPremium?.length)
    l.push(
      `Misturas Essencial/Premium (60/40) de ${custo.misturasEssencialPremium.map((m) => pct(m.fracao)).join(', ')}: margem no pior caso ${custo.misturasEssencialPremium.map((m) => usd(m.margemPiorCasoUsd, 2)).join(' / ')} — o modelo desses planos não inclui IA de texto, então a troca não as altera.`,
      '',
    )
  return l.join('\n')
}

// ------------------------------------------------------------------ o documento

/**
 * @param {{ decisoes: Record<string, any>, robustez: Record<string, any>, concordancia: Record<string, any>,
 *   juizes: Array<{id: string, parametros: any}>, gasto: {totalUsd: number, tetoUsd: number}, custo: any,
 *   calibracao: any, geradoEm: string, commit: string | null }} p
 */
export function gerarRelatorio(p) {
  const { decisoes, robustez, concordancia, juizes, gasto, custo, calibracao, medicoes = {} } = p
  const funcoes = ['explicacao', 'resumo', 'alternativas', 'legenda'].filter((f) => decisoes[f])
  const l = []
  l.push('# eval-ia-paga-v1 — qualidade × custo × latência da IA paga (LLM-as-judge)', '')
  l.push(
    `> Gerado por \`scripts/eval-ia/rodar.mjs --relatorio\` a partir dos brutos em \`docs/auditoria/eval/ia-paga-v1/\` (${p.geradoEm}${p.commit ? `, commit ${p.commit}` : ''}). Não edite à mão: os números saem do bruto.`,
    '',
  )
  l.push(
    `Fase A do plano de qualidade da IA paga: explicação da frase, resumo da sessão, outras formas e legenda ao vivo, medidas com o PEDIDO DA PRODUÇÃO ATUAL (prompts, leitores, saída estruturada \`json_schema strict\` + \`require_parameters\` e o roteamento da legenda da Fase B), um juiz LLM com rubrica binária e as métricas do que aparece na tela.`,
    '',
  )
  l.push(
    `**Gasto acumulado da bancada: ${usd(gasto.totalUsd, 2)}** de ${usd(gasto.tetoUsd, 2)} (livro-caixa com reserva do pior caso antes de cada chamada).`,
    '',
  )

  l.push('## 1. Recomendação', '')
  /* O pedido que cada bruto mediu: a rodada pode ser anterior à Fase B (sem saída estruturada ou roteamento da legenda). */
  const antigos = Object.entries(medicoes).filter(([f, m]) =>
    f === 'legenda' ? !m.roteamentoDaLegenda : !m.saidaEstruturada,
  )
  if (antigos.length) {
    const quais = antigos.map(([f, m]) => `${NOMES[f]} (${String(m.geradoEm).slice(0, 10)})`).join(', ')
    l.push(
      `**Atenção — medido com o pedido ANTERIOR à Fase B:** ${quais}. Sem \`json_schema strict\` + \`require_parameters\` (estudo) ou sem o roteamento da legenda. A repetição com o pedido atual parou no limite de gasto da chave do OpenRouter (§9); a taxa de resposta inválida, em especial, pode cair com a saída estruturada.`,
      '',
    )
  }
  const atuais = Object.entries(medicoes).filter(([f]) => !antigos.some(([g]) => g === f))
  if (atuais.length)
    l.push(
      `Medido com o pedido ATUAL da produção (Fase B): ${atuais.map(([f, m]) => `${NOMES[f]} (${String(m.geradoEm).slice(0, 10)})`).join(', ')}.`,
      '',
    )
  const cal = calibracao?.anotadas ? calibracao : null
  l.push(
    cal
      ? `Calibração humana: κ juiz × humano ${num(cal.geral.kappa)} (${leituraDoKappa(cal.geral.kappa)}), ${cal.anotadas} anotações — ${cal.geral.kappa >= 0.6 ? 'juiz calibrado (≥ 0,6).' : '**juiz NÃO calibrado (< 0,6): a recomendação segue provisória.**'}`
      : '**Provisória:** a planilha de calibração humana ainda não foi anotada, e o plano exige κ ≥ 0,6 entre juiz e humano antes de o juiz decidir troca.',
    '',
  )
  for (const f of funcoes) l.push(`${funcoes.indexOf(f) + 1}. ${linhaDeRecomendacao(decisoes[f])}`)
  l.push('')

  l.push('## 2. A regra de decisão', '')
  l.push(
    `"O MAIS BARATO QUE NÃO PIORA A EXPERIÊNCIA" (dono, 24/10/2026). A referência é a PRODUÇÃO (o que o usuário tem hoje), não o melhor pontual entre os candidatos. Código: \`scripts/eval-ia/estatistica.mjs#decidirFuncao\`, com teste.`,
    '',
    `- **Não piora** = nota não-inferior à produção (IC 95% do bootstrap pareado da diferença inteiro acima de −${num(MARGEM_DE_NAO_INFERIORIDADE)}), nenhum critério crítico pior (IC pareado abaixo de 0, ou mais de 10 pontos de queda), no máximo 5% das respostas acima do timeout da produção (inclui as abortadas pelo relógio), latência p95 no máximo ${Math.round((PIORA_DE_LATENCIA_TOLERADA - 1) * 100)}% pior e no máximo ${Math.round(MAXIMO_SEM_RESPOSTA * 100)}% de chamadas sem resposta do provedor (senão a cascata cai na reserva com frequência).`,
    `- **Mais barato** que a produção (pelo menos ${Math.round(ECONOMIA_MINIMA * 100)}% a menos por 1.000 usos: abaixo disso não há economia que pague o risco de trocar) e não piora → **pode trocar**; o recomendado é o mais barato deles.`,
    `- **Mais caro (ou sem essa economia)** → só aparece como **opção**, se além de não piorar for **superior à produção num critério crítico** (${funcoes.map((f) => `${f}: ${criteriosCriticos(f).join(', ')}`).join('; ')}) com IC excluindo 0 — e a troca depende de o dono aceitar o custo.`,
    '- Ninguém passa → **manter** a produção. Onde a amostra não decide, a §4 dá o n necessário.',
    '- A regra B5 da bancada de fala (troca por qualidade só com IC excluindo 0 para cima) sai ao lado, como referência.',
    '',
  )

  l.push('## 3. Resultados por função', '')
  l.push(
    'Nota = fração de critérios atendidos, média dos dois juízes; resposta que a leitura da produção recusa conta 0. "Sem resposta do provedor" (429/5xx depois das tentativas) fica fora da nota. Latência = espera total (a produção não usa streaming); TTFT = primeiro pedaço, se houvesse streaming. "(ajuste)" = parâmetro que a produção ainda não manda.',
    '',
  )
  for (const f of funcoes) {
    const d = decisoes[f]
    l.push(`### ${NOMES[f]}`, '')
    l.push(tabelaQualidade(d), '')
    l.push('Taxa de acerto por critério:', '', tabelaCriterios(d), '')
    l.push(
      'Pareado nas duas ordens contra a produção (juiz de família diferente dos dois lados):',
      '',
      tabelaPareado(d),
      '',
    )
  }

  l.push('## 4. Onde a amostra não decide (análise de poder)', '')
  l.push(
    'Casos PAREADOS necessários para decidir com α = 2,5% unilateral e poder de 80%, pelo desvio-padrão observado da diferença por caso:',
    '',
  )
  for (const f of funcoes) l.push(`**${NOMES[f]}**`, '', listaDePoder(decisoes[f]), '')

  l.push('## 5. Como o usuário sente', '')
  l.push(
    'Cada métrica e o que aparece na tela: **inválida** = "não deu para explicar agora" (502 `resposta_invalida`, uso consumido); **passa do timeout** = a folha gira e cai na reserva ou em erro; **espera** = quanto a folha fica carregando; **TTFT** = quando o texto começaria a aparecer com streaming; **caracteres / cabe sem rolar** = se cabe na folha do celular (limites declarados em `funcoes.mjs`); **palavras por frase** = leitura de aprendiz; **idioma certo** = explicação em português (heurística; o juiz também julga); **R$ por pagante/mês** = custo da cota cheia de estudo.',
    '',
  )
  for (const f of funcoes) l.push(`### ${NOMES[f]}`, '', tabelaExperiencia(decisoes[f]), '')

  l.push('## 6. Robustez: só o juiz de família diferente do candidato', '')
  l.push(
    'A nota principal é a média dos dois juízes, e cada um deles é da família de algum candidato (DeepSeek, Mistral). Aqui a decisão é refeita, para cada candidato, só com o juiz de família DIFERENTE da dele (o Mistral para o DeepSeek e os demais; o DeepSeek para o Mistral Small):',
    '',
    tabelaRobustez(decisoes, robustez),
    '',
  )

  l.push('## 7. O juiz', '')
  for (const j of juizes ?? [])
    l.push(
      `- ${cod(j.id)}: temperatura 0, \`max_tokens\` ${j.parametros?.maxTokens?.rubrica ?? '—'} (rubrica) / ${j.parametros?.maxTokens?.pareado ?? '—'} (pareado), \`response_format: json_object\`, roteamento ${cod(JSON.stringify(j.parametros?.roteamento ?? {}))}${j.parametros?.ajuste?.reasoning ? `, raciocínio ${cod(JSON.stringify(j.parametros.ajuste.reasoning))}` : ''}.`,
    )
  l.push('')
  const auto = funcoes
    .map(
      (f) =>
        `${f}: ${
          Object.entries(decisoes[f].autopreferencia ?? {})
            .map(([j, v]) => `${cod(j)} ${sinal(v)}`)
            .join(', ') || '—'
        }`,
    )
    .join('; ')
  l.push(`**Autopreferência medida** (nota a mais para a própria família, descontada a severidade): ${auto}.`, '')
  const inst = funcoes.flatMap((f) =>
    decisoes[f].avaliacoes.map((a) => a.preferencia?.instaveis).filter(Number.isFinite),
  )
  if (inst.length)
    l.push(
      `**Viés de posição:** no pareado nas duas ordens, de ${pct(Math.min(...inst))} a ${pct(Math.max(...inst))} dos pares mudaram de lado com a troca de posição e contaram como empate.`,
      '',
    )
  l.push(
    '**κ juiz × juiz** (sobre as respostas válidas; "indefinido" = os dois deram sempre o mesmo veredito, sem variação para medir):',
    '',
    tabelaConcordancia(concordancia),
    '',
  )
  l.push(
    cal
      ? `**κ juiz × humano** (contra a média dos juízes; ${cal.divididos.n} itens em que os juízes se dividiram ficam à parte, e neles o humano disse "atende" ${cal.divididos.humanoDisseAtende} vezes): ${num(cal.geral.kappa)} geral.`
      : '**κ juiz × humano: pendente.** Planilha: `docs/auditoria/eval/ia-paga-v1/planilha-calibracao.csv`; passo a passo: `docs/auditoria/eval/ia-paga-v1/LEIA-ME-calibracao.md`.',
    '',
  )

  l.push('## 8. Custo por usuário pagante e `npm run ia:custo`', '', secaoCusto(decisoes, custo))

  l.push('## 9. Método e limitações', '')
  l.push(
    '- **Cliente próprio, não `bancada/nuvem.mjs`.** O harness tem um cliente do OpenRouter (`scripts/eval-ia/openrouter.mjs`) porque precisa de streaming (TTFT) e de outras funções além da tradução; o corpo é montado com o MESMO `parametrosDoProvedor` do servidor, e um teste (`tests/eval/ia-paga-cliente.test.ts`) compara byte a byte com o corpo que `chamarChat` manda. Sem ajuste declarado, divergência LANÇA. Preço-teto e prova de retenção zero saem de `GET /api/v1/endpoints/zdr`; o livro-caixa (`bancada/livroCaixa.mjs`) reserva o pior caso antes de cada chamada.',
    '- **Golds escritos pela equipe** (o agente), revisados por consistência; a referência pode ter falhas.',
    '- **Amostras pequenas** no resumo e nas alternativas (ver §4); **uma execução por modelo**, na temperatura de produção.',
    '- **Latência num só horário**, pelo OpenRouter; o provedor sorteado muda o número. Indicativo, não SLO medido em produção.',
    '- **Ajustes fora da produção** (`@none`, `~groq+cerebras`): parâmetros que a produção ainda não manda; o `@none` também tira do roteamento o provedor que ignora o raciocínio desligado.',
    '- **Limite da chave do OpenRouter:** além do teto do livro-caixa, a chave tem um limite de gasto próprio, definido no painel do OpenRouter. A repetição com o pedido da Fase B parou nele (HTTP 403 "Key limit exceeded"); o harness agora para a rodada inteira nesse caso e grava o parcial à parte, sem apagar o bruto anterior. Para repetir: subir o limite da chave e rodar `--funcao explicacao,alternativas,resumo` (as respostas já pagas estão em cache).',
    '- **Registro do juiz nos brutos antigos:** nos brutos medidos antes da Fase B, o segundo juiz aparece como `deepseek/deepseek-v4.1-flash`, sem o `@none` (raciocínio desligado) que de fato foi usado; o id real e os parâmetros passaram a ser gravados na correção 1.',
    '- Funções não medidas: polimento e tutor.',
    '',
  )

  l.push('## 10. Achados à parte', '')
  const misturas = custo?.misturasSoPlus ?? []
  const negativa = misturas.filter((m) => m.margemPiorCasoUsd < 0)
  if (negativa.length)
    l.push(
      `- **Mistura só com Plus já negativa hoje:** com ${negativa.map((m) => `${pct(m.fracao)} de pagantes (margem no pior caso ${usd(m.margemPiorCasoUsd, 2)})`).join(', ')}, o \`ia:custo\` fecha negativo SEM nenhuma troca de modelo — vem do custo do Grátis. Precisa de decisão à parte.`,
    )
  for (const f of funcoes) {
    const rb = decisoes[f].resumos[decisoes[f].base]
    if (rb.dentroDoSlo === false)
      l.push(
        `- ${NOMES[f]}: a produção já tem p95 de ${seg(rb.latenciaMs.totalP95)}, acima do SLO proposto de ${seg(rb.sloP95Ms)}.`,
      )
  }
  l.push('')
  l.push('## Arquivos', '')
  l.push(
    '`scripts/eval-ia/` (harness), `tests/eval/ia-paga-*.test.ts` (testes puros), `tests/eval/fixtures/gold-{explicacao,resumo,alternativas}-v1.jsonl` (golds), `docs/auditoria/eval/ia-paga-v1/` (brutos compactos, decisões, concordância, planilha e LEIA-ME da calibração, resumo da bancada de fala para a legenda).',
    '',
  )
  return `${l.join('\n')}`
}
