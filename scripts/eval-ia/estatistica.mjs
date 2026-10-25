/**
 * DA RODADA À DECISÃO — resumo por sistema, comparação pareada e a regra do MAIS BARATO NÃO-INFERIOR. PURO.
 *
 * A REGRA (diretriz do dono, 24/10/2026: "modelos baratos sempre que possível e bom harness pensando na experiência
 * dos usuários"):
 *   1. o MELHOR é o de maior nota média da rubrica (fração de critérios atendidos; resposta inválida = 0);
 *   2. um sistema é NÃO-INFERIOR quando o IC 95% do bootstrap PAREADO (`bootstrapPareado`, mesmos casos) da diferença
 *      sistema − melhor fica inteiro acima de −MARGEM (padrão 0,05: até 5 pontos percentuais de critérios atendidos);
 *   3. FALHA CRÍTICA, que nenhum preço compensa: num critério crítico (gramática, gíria inventada, idioma de saída,
 *      segurança — `criteriosCriticos`), o sistema é pior que o melhor com o IC pareado inteiro abaixo de 0, ou fica
 *      mais de 10 pontos abaixo dele na taxa de acerto;
 *   4. CUSTO QUE CABE: o custo medido por 1M de tokens da cota não passa do que o modelo de custo cobra
 *      (`CUSTO_BRL_POR_MILHAO_DE_TOKENS` de `scripts/ia/modeloDeCusto.ts`, R$ 1,40 ÷ câmbio) — acima disso a margem de
 *      `npm run ia:custo` muda e a troca exige refazer a conta;
 *   5. LATÊNCIA DENTRO DO SLO: o p95 da espera total não passa do SLO da função (`SLO_P95_MS`, Fase C do plano);
 *   6. RECOMENDADO = o MAIS BARATO (US$ por 1.000 usos) entre os que passam em 2 a 5. Ninguém passa → relaxa, NESTA
 *      ordem e dizendo qual: primeiro o SLO, depois o custo; e só então o melhor.
 * A regra da bancada de fala (B5, `bancada/decisao.mjs` → `decidir`) também é aplicada contra a PRODUÇÃO, para o
 * relatório dizer "troca por qualidade" (IC exclui 0 para cima) ou não.
 *
 * QUEM JULGA: o MESMO INSTRUMENTO para todos — a nota de um caso é a média dos juízes (dois, de famílias diferentes).
 * Excluir o juiz da família do candidato daria a cada sistema um juiz diferente (o Mistral mais severo para uns, o
 * DeepSeek mais leniente para outros), e as notas deixariam de ser comparáveis. A autopreferência é MEDIDA
 * (`autopreferencia`): quanto cada juiz dá a mais para a própria família, descontada a severidade que ele mostra com
 * os outros sistemas. O pareado de preferência (duas ordens) continua com juiz de família diferente dos dois.
 */
import { CAMBIO_BRL_POR_USD, CUSTO_BRL_POR_MILHAO_DE_TOKENS } from '../ia/modeloDeCusto.ts'
import { bootstrap, bootstrapPareado, mediaEm } from '../../src/core/eval/bootstrap.ts'
import { decidir } from '../eval-fala/bancada/decisao.mjs'
import { criteriosCriticos, CRITERIOS } from './funcoes.mjs'
import { familia, notaDaRubrica } from './juiz.mjs'

export const MARGEM_DE_NAO_INFERIORIDADE = 0.05
/** Queda de taxa num critério crítico que reprova mesmo sem significância (pontos de fração). */
export const QUEDA_CRITICA_MAXIMA = 0.1
/** O teto de custo por 1M de tokens da cota, em US$: o mesmo número que `ia:custo` usa (R$ 1,40 ÷ R$ 5,60). */
export const TETO_USD_POR_MILHAO_DE_TOKENS = CUSTO_BRL_POR_MILHAO_DE_TOKENS / CAMBIO_BRL_POR_USD
/** O teto da legenda, por hora de fala (= `TETO_MT_PADRAO` de `bancada/decisao.mjs`). */
export const TETO_LEGENDA_USD_POR_HORA = 0.05
/** O uso de um pagante que esgota a cota de estudo do mês (`src/core/planos.ts`: explicacoesMes 300, resumosMes 60). */
export const USOS_POR_PAGANTE_NO_MES = Object.freeze({ explicacao: 300, resumo: 60 })
/** O SLO por função (Fase C do plano): p95 da latência total, em ms. */
export const SLO_P95_MS = Object.freeze({ explicacao: 4000, resumo: 8000, alternativas: 4000, legenda: 1500 })

export function percentis(valores, ps = [0.5, 0.95]) {
  const o = [...valores].filter(Number.isFinite).sort((a, b) => a - b)
  return ps.map((p) => (o.length ? o[Math.min(o.length - 1, Math.floor(p * o.length))] : Number.NaN))
}

const media = (xs) => {
  const f = xs.filter(Number.isFinite)
  return f.length ? f.reduce((a, b) => a + b, 0) / f.length : Number.NaN
}

/**
 * Os juízes da nota de `modelos`: TODOS (o mesmo instrumento). `compensado` diz se algum deles é da família de algum
 * dos modelos — a autopreferência, medida à parte, diz quanto isso pesa.
 */
export function juizesElegiveis(modelos, juizes) {
  const fams = new Set(modelos.map(familia))
  return { juizes, compensado: juizes.some((j) => fams.has(familia(j))) }
}

/**
 * AUTOPREFERÊNCIA de cada juiz: (nota dele − nota do outro juiz) na própria família, menos a mesma diferença nos
 * sistemas das outras famílias (a severidade geral dele). Positivo = favorece a própria família. `null` sem sistema
 * da família ou sem segundo juiz.
 */
export function autopreferencia(bruto) {
  const [j1, j2] = bruto.juizes
  if (!j2) return {}
  const sistemas = bruto.sistemas.map((s) => s.id).filter((s) => bruto.geracoes[s])
  const saida = {}
  for (const [j, outro] of [
    [j1, j2],
    [j2, j1],
  ]) {
    const dif = (s) => media(bruto.casos.map((c) => notaPor(bruto, s, c, [j]) - notaPor(bruto, s, c, [outro])))
    const propria = sistemas.filter((s) => familia(modeloDe(bruto, s)) === familia(j))
    const outras = sistemas.filter((s) => familia(modeloDe(bruto, s)) !== familia(j))
    saida[j] = propria.length && outras.length ? media(propria.map(dif)) - media(outras.map(dif)) : null
  }
  return saida
}

/** Nota de um sistema num caso pelos juízes dados (média dos que julgaram), ou NaN. */
function notaPor(bruto, sis, caso, juizes) {
  return media(juizes.map((j) => notaDaRubrica(bruto.rubrica?.[j]?.[sis]?.[caso])))
}

/** Acerto (1/0) de um critério pelos juízes dados (média: com dois juízes pode dar 0,5), ou NaN. */
function acertoPor(bruto, sis, caso, criterio, juizes) {
  return media(
    juizes.map((j) => {
      const v = bruto.rubrica?.[j]?.[sis]?.[caso]?.[criterio]?.veredito
      return v === true ? 1 : v === false ? 0 : Number.NaN
    }),
  )
}

const modeloDe = (bruto, sis) => bruto.sistemas.find((s) => s.id === sis)?.modelo ?? sis

/** Diferença pareada A − B de uma métrica por caso, só nos casos com as duas medidas. */
function pareado(casos, fA, fB) {
  const a = []
  const b = []
  for (const c of casos) {
    const x = fA(c)
    const y = fB(c)
    if (Number.isFinite(x) && Number.isFinite(y)) {
      a.push(x)
      b.push(y)
    }
  }
  return { n: a.length, ...bootstrapPareado(a.length, mediaEm(a), mediaEm(b)) }
}

/** O resumo de UM sistema numa função: qualidade, experiência, latência e custo. */
export function resumirSistema(bruto, sis) {
  const juizes = bruto.juizes
  const { juizes: proprios, compensado } = juizesElegiveis([modeloDe(bruto, sis)], juizes)
  const ger = bruto.geracoes[sis] ?? {}
  const tentados = bruto.casos.filter((c) => ger[c])
  // Sem resposta (429/5xx depois das tentativas, rede): na produção a cascata cai na próxima perna; fica FORA da
  // qualidade e entra na taxa de falha do provedor.
  const casos = tentados.filter((c) => !ger[c].semResposta)
  const notas = casos.map((c) => notaPor(bruto, sis, c, proprios))
  const validas = notas.filter(Number.isFinite)
  const exps = casos.map((c) => ger[c].experiencia ?? { valida: false })
  const ok = exps.filter((e) => e.valida)
  const usdCasos = casos.map((c) => ger[c].usd).filter(Number.isFinite)
  const tokens = casos.reduce((n, c) => n + (ger[c].tokensEntrada ?? 0) + (ger[c].tokensSaida ?? 0), 0)
  const usd = usdCasos.reduce((a, b) => a + b, 0)
  const usdPorUso = usdCasos.length ? usd / usdCasos.length : Number.NaN
  const [ttft50, ttft95] = percentis(casos.map((c) => ger[c].ttftMs))
  const [total50, total95] = percentis(casos.map((c) => ger[c].totalMs))
  const taxas = Object.fromEntries(
    CRITERIOS[bruto.funcao].map((cr) => [cr.id, media(casos.map((c) => acertoPor(bruto, sis, c, cr.id, proprios)))]),
  )
  const qual = validas.length
    ? bootstrap(validas.length, mediaEm(validas))
    : { valor: Number.NaN, ic95: [Number.NaN, Number.NaN] }
  const idiomaDecidido = ok.filter((e) => e.idiomaOk !== null)
  const resumo = {
    sistema: sis,
    modelo: modeloDe(bruto, sis),
    juizes: proprios,
    juizCompensado: compensado,
    n: casos.length,
    julgados: validas.length,
    nota: qual,
    taxas,
    semResposta: tentados.length ? (tentados.length - casos.length) / tentados.length : 0,
    invalidas: exps.filter((e) => !e.valida).length / Math.max(1, exps.length),
    latenciaMs: { ttftP50: ttft50, ttftP95: ttft95, totalP50: total50, totalP95: total95 },
    sloP95Ms: SLO_P95_MS[bruto.funcao],
    dentroDoSlo: Number.isFinite(total95) ? total95 <= SLO_P95_MS[bruto.funcao] : null,
    experiencia: {
      caracteresP50: percentis(ok.map((e) => e.caracteres))[0],
      cabeSemRolar: ok.some((e) => 'cabeSemRolar' in e) ? media(ok.map((e) => (e.cabeSemRolar ? 1 : 0))) : null,
      palavrasPorFrase: media(ok.map((e) => e.palavrasPorFrase)),
      idiomaOk: idiomaDecidido.length ? media(idiomaDecidido.map((e) => (e.idiomaOk ? 1 : 0))) : null,
      ...(bruto.funcao === 'resumo'
        ? {
            cartoes: media(ok.map((e) => e.cartoes)),
            palavrasAlvoNosCartoes: media(ok.map((e) => e.palavrasAlvoNosCartoes)),
          }
        : {}),
      ...(bruto.funcao === 'alternativas'
        ? { opcoes: media(ok.map((e) => e.opcoes)), notaCurta: media(ok.map((e) => (e.notaCurta ? 1 : 0))) }
        : {}),
      ...(bruto.funcao === 'legenda'
        ? { chrf: media(ok.map((e) => e.chrf)), razaoDeTamanho: media(ok.map((e) => e.razaoDeTamanho)) }
        : {}),
    },
    custo: {
      usdTotal: usd,
      usdPorUso,
      usdPor1000Usos: usdPorUso * 1000,
      usdPorMilhaoDeTokens: tokens ? (usd / tokens) * 1e6 : Number.NaN,
      tokensPorUso: casos.length ? tokens / casos.length : Number.NaN,
      ...(USOS_POR_PAGANTE_NO_MES[bruto.funcao]
        ? {
            brlPorPaganteNoMes: usdPorUso * USOS_POR_PAGANTE_NO_MES[bruto.funcao] * CAMBIO_BRL_POR_USD,
          }
        : {}),
      ...(bruto.funcao === 'legenda' ? { usdPorHoraDeFala: usdPorHoraDeFala(bruto, sis) } : {}),
    },
    tokensDeRaciocinioP50: percentis(casos.map((c) => ger[c].tokensDeRaciocinio))[0],
    foraDaProducao: bruto.sistemas.find((s) => s.id === sis)?.parametros?.foraDaProducao ?? false,
  }
  return resumo
}

/** = `bancada/mt.mjs`: ~9.000 palavras por hora de conversa. */
function usdPorHoraDeFala(bruto, sis) {
  const ger = bruto.geracoes[sis] ?? {}
  let usd = 0
  let palavras = 0
  for (const c of bruto.casos)
    if (ger[c] && Number.isFinite(ger[c].usd)) {
      usd += ger[c].usd
      palavras += String(ger[c].origem ?? '')
        .split(/\s+/)
        .filter(Boolean).length
    }
  return palavras ? (usd / palavras) * 9000 : Number.NaN
}

/** A comparação pareada de `sis` contra `ref`: nota geral e cada critério crítico, pelos juízes do par. */
export function compararPar(bruto, sis, ref) {
  const { juizes, compensado } = juizesElegiveis([modeloDe(bruto, sis), modeloDe(bruto, ref)], bruto.juizes)
  const nota = pareado(
    bruto.casos,
    (c) => notaPor(bruto, sis, c, juizes),
    (c) => notaPor(bruto, ref, c, juizes),
  )
  const criticos = Object.fromEntries(
    criteriosCriticos(bruto.funcao).map((cr) => {
      const d = pareado(
        bruto.casos,
        (c) => acertoPor(bruto, sis, c, cr, juizes),
        (c) => acertoPor(bruto, ref, c, cr, juizes),
      )
      return [cr, d]
    }),
  )
  return { contra: ref, juizes, juizCompensado: compensado, nota, criticos }
}

/** O pareado de preferência (duas ordens) contra a base: média de +1/0/−1 com IC, e a taxa de instáveis. */
export function resumirPreferencia(bruto, sis) {
  const pares = Object.values(bruto.pareado?.[sis] ?? {}).filter((p) => p && Number.isFinite(p.resultado))
  if (!pares.length) return null
  const r = pares.map((p) => p.resultado)
  return {
    n: pares.length,
    vitorias: r.filter((x) => x > 0).length,
    derrotas: r.filter((x) => x < 0).length,
    empates: r.filter((x) => x === 0).length,
    instaveis: pares.filter((p) => !p.estavel).length / pares.length,
    media: bootstrap(r.length, mediaEm(r)),
  }
}

/**
 * A DECISÃO de uma função: o melhor, os não-inferiores, as falhas críticas, o custo e o RECOMENDADO (o mais barato
 * que passa). `margem` é a de não-inferioridade, declarada e impressa.
 */
export function decidirFuncao(bruto, { margem = MARGEM_DE_NAO_INFERIORIDADE } = {}) {
  const sistemas = bruto.sistemas.map((s) => s.id).filter((s) => bruto.geracoes[s])
  const resumos = Object.fromEntries(sistemas.map((s) => [s, resumirSistema(bruto, s)]))
  const custoDe = (s) => resumos[s].custo.usdPor1000Usos
  const melhor = [...sistemas].sort(
    (a, b) => (resumos[b].nota.valor || 0) - (resumos[a].nota.valor || 0) || custoDe(a) - custoDe(b),
  )[0]
  const avaliacoes = sistemas.map((s) => {
    const cmp = s === melhor ? null : compararPar(bruto, s, melhor)
    const naoInferior = s === melhor || (cmp.nota.n > 0 && cmp.nota.ic95[0] > -margem)
    const falhasCriticas = []
    if (cmp)
      for (const [cr, d] of Object.entries(cmp.criticos)) {
        const queda = (resumos[melhor].taxas[cr] ?? 0) - (resumos[s].taxas[cr] ?? 0)
        if (d.n > 0 && d.ic95[1] < 0) falhasCriticas.push(`${cr}: pior que o melhor (IC pareado exclui 0)`)
        else if (queda > QUEDA_CRITICA_MAXIMA)
          falhasCriticas.push(`${cr}: ${(queda * 100).toFixed(0)} pts abaixo do melhor na taxa de acerto`)
      }
    const r = resumos[s]
    const custoCabe =
      bruto.funcao === 'legenda'
        ? Number.isFinite(r.custo.usdPorHoraDeFala) && r.custo.usdPorHoraDeFala <= TETO_LEGENDA_USD_POR_HORA
        : Number.isFinite(r.custo.usdPorMilhaoDeTokens) && r.custo.usdPorMilhaoDeTokens <= TETO_USD_POR_MILHAO_DE_TOKENS
    return {
      sistema: s,
      comparacao: cmp,
      naoInferior,
      falhasCriticas,
      custoCabe,
      dentroDoSlo: r.dentroDoSlo !== false,
    }
  })
  /* As exigências, da mais forte à mais fraca: relaxa o SLO, depois o custo — nunca a qualidade nem o crítico. */
  const NIVEIS = [
    {
      nome: 'todas as exigências',
      ok: (a) => a.naoInferior && !a.falhasCriticas.length && a.custoCabe && a.dentroDoSlo,
    },
    { nome: 'relaxado o SLO de latência', ok: (a) => a.naoInferior && !a.falhasCriticas.length && a.custoCabe },
    { nome: 'relaxados o SLO e o custo', ok: (a) => a.naoInferior && !a.falhasCriticas.length },
  ]
  for (const a of avaliacoes) a.passa = NIVEIS[0].ok(a)
  let recomendado = melhor
  let motivo = 'nenhum sistema não-inferior sem falha crítica: fica o melhor'
  let relaxado = null
  for (const [i, nivel] of NIVEIS.entries()) {
    const ok = avaliacoes.filter(nivel.ok).sort((a, b) => custoDe(a.sistema) - custoDe(b.sistema))
    if (!ok.length) continue
    recomendado = ok[0].sistema
    relaxado = i === 0 ? null : nivel.nome
    motivo = `o mais barato entre ${ok.length} sistema(s) não-inferior(es) ao melhor (margem −${margem}) e sem falha crítica — ${nivel.nome}`
    break
  }

  /* A regra B5 contra a PRODUÇÃO (a base): troca "por qualidade" só se o IC pareado excluir 0 para cima. */
  const base = bruto.base
  const contraProducao = sistemas
    .filter((s) => s !== base && bruto.geracoes[base])
    .map((s) => {
      const cmp = compararPar(bruto, s, base)
      const pref = resumirPreferencia(bruto, s)
      const comparacoes = [{ corpus: `gold:${bruto.funcao}`, metrica: 'juiz', gold: true, diferenca: cmp.nota }]
      if (pref) comparacoes.push({ corpus: `pareado:${bruto.funcao}`, metrica: 'preferencia', diferenca: pref.media })
      const r = resumos[s]
      const custo = bruto.funcao === 'legenda' ? r.custo.usdPorHoraDeFala : r.custo.usdPorMilhaoDeTokens
      const teto = bruto.funcao === 'legenda' ? TETO_LEGENDA_USD_POR_HORA : TETO_USD_POR_MILHAO_DE_TOKENS
      const dec = decidir({
        comparacoes,
        margens: { juiz: margem, preferencia: 0.1 },
        custoUsdPorHora: custo,
        tetoUsdPorHora: teto,
      })
      // `decidir` fala em "por hora" (a bancada de fala); no estudo o custo é por 1M de tokens da cota.
      const unidade = bruto.funcao === 'legenda' ? '/h de fala' : '/1M tokens'
      const motivos = dec.motivos.map((m) => m.replace(/\/h\b/g, unidade).replace('custo por hora', 'custo'))
      return { sistema: s, preferencia: pref, ...dec, motivos }
    })
  return {
    funcao: bruto.funcao,
    base,
    margem,
    melhor,
    recomendado,
    motivo,
    relaxado,
    autopreferencia: autopreferencia(bruto),
    resumos,
    avaliacoes,
    contraProducao,
  }
}

// ------------------------------------------------------------------ markdown

const f2 = (x) => (Number.isFinite(x) ? x.toFixed(2) : '—')
const f3 = (x) => (Number.isFinite(x) ? x.toFixed(3) : '—')
const pct = (x) => (Number.isFinite(x) ? `${(x * 100).toFixed(0)}%` : '—')
const ms = (x) => (Number.isFinite(x) ? `${(x / 1000).toFixed(1)} s` : '—')
const ic = (iv) => `${f2(iv.valor)} [${f2(iv.ic95[0])}, ${f2(iv.ic95[1])}]`

export function markdownDaFuncao(d) {
  const l = [`## ${d.funcao}`, '']
  l.push(`Melhor nota: \`${d.melhor}\` · **recomendado: \`${d.recomendado}\`** — ${d.motivo}.`, '')
  const auto = Object.entries(d.autopreferencia ?? {}).filter(([, v]) => Number.isFinite(v))
  if (auto.length)
    l.push(
      `Autopreferência medida (nota a mais para a própria família, descontada a severidade): ${auto.map(([j, v]) => `\`${j}\` ${v >= 0 ? '+' : ''}${v.toFixed(3)}`).join(' · ')}.`,
      '',
    )
  l.push('### Qualidade, custo e latência', '')
  l.push(
    '| Sistema | n | Nota [IC 95%] | Inválidas | Sem resposta | Total p50 · p95 | TTFT p50 · p95 | US$/1.000 usos | US$/1M tok | Não-inf. | Falha crítica | Custo cabe |',
  )
  l.push('| --- | --: | --- | --: | --: | --- | --- | --: | --: | :-: | --- | :-: |')
  for (const a of d.avaliacoes) {
    const r = d.resumos[a.sistema]
    l.push(
      `| \`${a.sistema}\`${a.sistema === d.recomendado ? ' ★' : ''}${r.foraDaProducao ? ' (ajuste)' : ''} | ${r.n} | ${ic(r.nota)} | ${pct(r.invalidas)} | ${pct(r.semResposta)} | ${ms(r.latenciaMs.totalP50)} · ${ms(r.latenciaMs.totalP95)} | ${ms(r.latenciaMs.ttftP50)} · ${ms(r.latenciaMs.ttftP95)} | ${f3(r.custo.usdPor1000Usos)} | ${f3(r.custo.usdPorMilhaoDeTokens)} | ${a.naoInferior ? 'sim' : 'não'} | ${a.falhasCriticas.join('; ') || '—'} | ${a.custoCabe ? 'sim' : 'não'} |`,
    )
  }
  l.push('')
  l.push('### Taxa de acerto por critério', '')
  const crits = CRITERIOS[d.funcao].map((c) => c.id)
  l.push(
    `| Sistema | ${crits.map((c) => (criteriosCriticos(d.funcao).includes(c) ? `${c} (crítico)` : c)).join(' | ')} |`,
  )
  l.push(`| --- | ${crits.map(() => '--:').join(' | ')} |`)
  for (const a of d.avaliacoes) {
    const r = d.resumos[a.sistema]
    l.push(`| \`${a.sistema}\` | ${crits.map((c) => pct(r.taxas[c])).join(' | ')} |`)
  }
  l.push('')
  l.push('### Como o usuário sente', '')
  l.push(
    '| Sistema | Erro na tela (502) | Espera p95 | Caracteres p50 | Cabe sem rolar | Palavras/frase | Idioma certo | R$ por pagante/mês (cota cheia) | Extra |',
  )
  l.push('| --- | --: | --: | --: | --: | --: | --: | --: | --- |')
  for (const a of d.avaliacoes) {
    const r = d.resumos[a.sistema]
    const e = r.experiencia
    const extra =
      d.funcao === 'resumo'
        ? `${f2(e.cartoes)} cartões; ${pct(e.palavrasAlvoNosCartoes)} das palavras-alvo`
        : d.funcao === 'alternativas'
          ? `${f2(e.opcoes)} opções; nota ≤ 140: ${pct(e.notaCurta)}`
          : d.funcao === 'legenda'
            ? `chrF++ ${f2(e.chrf)}; tamanho/ref ${f2(e.razaoDeTamanho)}`
            : ''
    l.push(
      `| \`${a.sistema}\` | ${pct(r.invalidas)} | ${ms(r.latenciaMs.totalP95)}${r.dentroDoSlo === false ? ' (fora do SLO)' : ''} | ${Number.isFinite(e.caracteresP50) ? e.caracteresP50.toFixed(0) : '—'} | ${pct(e.cabeSemRolar)} | ${f2(e.palavrasPorFrase)} | ${pct(e.idiomaOk)} | ${Number.isFinite(r.custo.brlPorPaganteNoMes) ? `R$ ${r.custo.brlPorPaganteNoMes.toFixed(2)}` : '—'} | ${extra} |`,
    )
  }
  l.push('')
  if (d.contraProducao.length) {
    l.push(`### Contra a produção (\`${d.base}\`) — regra B5`, '')
    l.push('| Candidato | Δ nota [IC 95%] | Preferência pareada (duas ordens) | Instáveis | Veredito B5 |')
    l.push('| --- | --- | --- | --: | --- |')
    for (const c of d.contraProducao) {
      const dn = c.porCorpus.find((p) => p.metrica === 'juiz')
      const p = c.preferencia
      l.push(
        `| \`${c.sistema}\` | ${dn ? `${dn.delta >= 0 ? '+' : ''}${f3(dn.delta)} [${f3(dn.ic95[0])}, ${f3(dn.ic95[1])}]` : '—'} | ${p ? `${p.vitorias}V ${p.empates}E ${p.derrotas}D · ${ic(p.media)}` : '—'} | ${p ? pct(p.instaveis) : '—'} | ${c.veredito}${c.aprovado ? ' (aprovado)' : ''}${c.motivos.length ? ` — ${c.motivos.join('; ')}` : ''} |`,
      )
    }
    l.push('')
  }
  return `${l.join('\n')}\n`
}
