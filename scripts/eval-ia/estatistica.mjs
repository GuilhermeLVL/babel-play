/**
 * DA RODADA À DECISÃO — resumo por sistema, comparação pareada contra a PRODUÇÃO e a regra "o MAIS BARATO que não
 * piora a experiência" (dono, 24/10/2026). PURO. A regra está em `decidirFuncao`, com a análise de poder
 * (`casosNecessarios`) onde a amostra não decide. O custo que "cabe" é o do modelo de custo
 * (`CUSTO_BRL_POR_MILHAO_DE_TOKENS` de `scripts/ia/modeloDeCusto.ts`, R$ 1,40 ÷ câmbio por 1M tokens; US$ 0,05 por
 * hora de fala na legenda): acima dele a troca exige refazer `npm run ia:custo`. A regra da bancada de fala (B5,
 * `bancada/decisao.mjs` → `decidir`) sai ao lado, como referência.
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
/**
 * O TIMEOUT DA PRODUÇÃO por função (`explicarFrase.ts` e `sugerirAlternativas.ts` 15 s, `resumirSessao.ts` 30 s,
 * `mtProxy.ts` 12 s): acima dele a pessoa não recebe a resposta deste modelo — a cascata cai na reserva ou a tela
 * mostra erro. Conta como falha de experiência.
 */
/**
 * Quantas respostas podem passar do timeout da produção: acima de 5% o sistema NÃO passa, em nível nenhum de
 * relaxamento — a resposta que não chega é pior que a lenta.
 */
export const MAXIMO_ACIMA_DO_TIMEOUT = 0.05

export const TIMEOUT_DA_PRODUCAO_MS = Object.freeze({
  explicacao: 15_000,
  resumo: 30_000,
  alternativas: 15_000,
  legenda: 12_000,
})

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
  const d = a.map((x, i) => x - b[i])
  const delta = media(d)
  const dp = d.length > 1 ? Math.sqrt(d.reduce((s, x) => s + (x - delta) ** 2, 0) / (d.length - 1)) : Number.NaN
  return { n: a.length, delta, dp, ...bootstrapPareado(a.length, mediaEm(a), mediaEm(b)) }
}

/** A geração passou do timeout da produção: demorou mais, ou foi ABORTADA pelo relógio (sem resposta por timeout). */
export function passouDoTimeout(g, timeoutMs) {
  if (g.totalMs > timeoutMs) return true
  return Boolean(g.semResposta) && /timeout|abort|sem resposta em/i.test(String(g.erro ?? ''))
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
    // Sobre TODAS as tentativas: a chamada abortada pelo relógio (sem resposta) também não chegou a tempo.
    acimaDoTimeout: tentados.length
      ? tentados.filter((c) => passouDoTimeout(ger[c], TIMEOUT_DA_PRODUCAO_MS[bruto.funcao])).length / tentados.length
      : 0,
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

/** z de 0,975 (IC 95% bilateral = teste unilateral a 2,5%) e de 0,80 (poder de 80%). */
const Z_ALFA = 1.959964
const Z_PODER = 0.841621

/**
 * ANÁLISE DE PODER — quantos casos PAREADOS seriam precisos para a amostra decidir, pelo desvio-padrão observado da
 * diferença por caso (aproximação normal, α = 2,5% unilateral, poder 80%):
 *   - não-inferioridade (margem m, diferença observada δ > −m):  n = ((z_α + z_β)·σ / (δ + m))²
 *   - superioridade (δ > 0):                                       n = ((z_α + z_β)·σ / δ)²
 * `null` quando a diferença observada aponta para o outro lado (nenhum n decide a favor).
 */
export function casosNecessarios({ dp, delta }, alvo, margem = 0) {
  if (!Number.isFinite(dp) || !Number.isFinite(delta)) return null
  const efeito = alvo === 'nao-inferioridade' ? delta + margem : delta
  if (efeito <= 0) return null
  if (dp === 0) return 2
  return Math.ceil((((Z_ALFA + Z_PODER) * dp) / efeito) ** 2)
}

/** Quanto pior a latência p95 do candidato pode ser que a da produção sem "piorar a experiência" (20%). */
export const PIORA_DE_LATENCIA_TOLERADA = 1.2
/**
 * "Mais barato" só conta com ECONOMIA DE VERDADE: pelo menos 5% a menos por 1.000 usos. Abaixo disso a troca não
 * economiza nada que se veja e só traz o risco de mudar.
 */
export const ECONOMIA_MINIMA = 0.05
/**
 * DISPONIBILIDADE: no máximo 5% das chamadas sem resposta do provedor (429/5xx depois das tentativas). Acima disso a
 * cascata cai na reserva com frequência — a pessoa espera mais, e recebe outro modelo.
 */
export const MAXIMO_SEM_RESPOSTA = 0.05

/**
 * A DECISÃO de uma função contra a PRODUÇÃO (o status quo, `bruto.base`) — "o MAIS BARATO que não piora a
 * experiência" (dono, 24/10/2026):
 *
 *   NÃO PIORA A EXPERIÊNCIA =
 *     nota não-inferior à produção (IC 95% pareado da diferença inteiro acima de −margem, padrão 0,05)
 *     E nenhum critério crítico pior (IC pareado inteiro abaixo de 0, ou queda de mais de 10 pontos na taxa)
 *     E no máximo 5% das respostas acima do timeout da produção
 *     E latência p95 no máximo 20% pior que a da produção
 *     E no máximo 5% das chamadas sem resposta do provedor (disponibilidade).
 *   MAIS BARATO que a produção (pelo menos 5% a menos por 1.000 usos) e não piora → PODE TROCAR; o recomendado é o mais barato deles.
 *   MAIS CARO (ou sem economia de 5%) → só entra como OPÇÃO se, além de não piorar, for SUPERIOR à produção num critério
 *     crítico (IC pareado inteiro acima de 0) — e a troca depende de o DONO aceitar o custo a mais. Nunca é
 *     "recomendado" automaticamente.
 *   Ninguém passa → MANTER a produção.
 *
 * Onde a amostra não decide (IC atravessa a margem ou o 0), sai a análise de poder (`casosNecessarios`).
 * `juizes` troca o instrumento (checagem de robustez: só o juiz de família diferente do candidato).
 */
export function decidirFuncao(bruto, { margem = MARGEM_DE_NAO_INFERIORIDADE, juizes } = {}) {
  const b = juizes ? { ...bruto, juizes } : bruto
  const sistemas = b.sistemas.map((s) => s.id).filter((s) => b.geracoes[s])
  const resumos = Object.fromEntries(sistemas.map((s) => [s, resumirSistema(b, s)]))
  const base = b.base
  const rb = resumos[base]
  const custoDe = (s) => resumos[s].custo.usdPor1000Usos
  const avaliacoes = sistemas
    .filter((s) => s !== base)
    .map((s) => {
      const r = resumos[s]
      const cmp = compararPar(b, s, base)
      const maisBarato = custoDe(s) <= custoDe(base) * (1 - ECONOMIA_MINIMA)
      const naoInferior = cmp.nota.n > 0 && cmp.nota.ic95[0] > -margem
      const superiorNaNota = cmp.nota.n > 0 && cmp.nota.ic95[0] > 0
      const pioras = []
      const melhoras = []
      for (const [cr, d] of Object.entries(cmp.criticos)) {
        const queda = (rb.taxas[cr] ?? 0) - (r.taxas[cr] ?? 0)
        if (d.n > 0 && d.ic95[1] < 0) pioras.push(`${cr}: pior que a produção (IC pareado exclui 0)`)
        else if (queda > QUEDA_CRITICA_MAXIMA) pioras.push(`${cr}: ${(queda * 100).toFixed(0)} pts abaixo da produção`)
        if (d.n > 0 && d.ic95[0] > 0) melhoras.push(cr)
      }
      const chegaNoTempo = (r.acimaDoTimeout ?? 0) <= MAXIMO_ACIMA_DO_TIMEOUT
      const latenciaNaoPiora =
        !Number.isFinite(rb.latenciaMs.totalP95) ||
        r.latenciaMs.totalP95 <= rb.latenciaMs.totalP95 * PIORA_DE_LATENCIA_TOLERADA
      const disponivel = (r.semResposta ?? 0) <= MAXIMO_SEM_RESPOSTA
      const naoPiora = naoInferior && !pioras.length && chegaNoTempo && latenciaNaoPiora && disponivel
      const custoCabe =
        b.funcao === 'legenda'
          ? Number.isFinite(r.custo.usdPorHoraDeFala) && r.custo.usdPorHoraDeFala <= TETO_LEGENDA_USD_POR_HORA
          : Number.isFinite(r.custo.usdPorMilhaoDeTokens) &&
            r.custo.usdPorMilhaoDeTokens <= TETO_USD_POR_MILHAO_DE_TOKENS
      const situacao = !naoPiora
        ? 'piora'
        : maisBarato
          ? 'pode-trocar'
          : melhoras.length
            ? 'opcao-mais-cara'
            : 'mais-caro-sem-ganho-critico'
      /* Poder: onde a amostra não decide. */
      const poder = {}
      if (!naoInferior && cmp.nota.ic95[0] <= -margem && cmp.nota.ic95[1] > -margem)
        poder.naoInferioridade = casosNecessarios(cmp.nota, 'nao-inferioridade', margem)
      for (const [cr, d] of Object.entries(cmp.criticos))
        if (d.n > 0 && d.ic95[0] <= 0 && d.ic95[1] > 0 && d.delta > 0)
          poder[`superioridade:${cr}`] = casosNecessarios(d, 'superioridade')
      return {
        sistema: s,
        comparacao: cmp,
        maisBarato,
        custoRelativo: custoDe(s) / custoDe(base),
        naoInferior,
        superiorNaNota,
        pioras,
        melhoras,
        chegaNoTempo,
        disponivel,
        latenciaNaoPiora,
        custoCabe,
        situacao,
        poder,
        preferencia: resumirPreferencia(b, s),
      }
    })
  const podeTrocar = avaliacoes
    .filter((a) => a.situacao === 'pode-trocar')
    .sort((x, y) => custoDe(x.sistema) - custoDe(y.sistema))
  const opcoesMaisCaras = avaliacoes
    .filter((a) => a.situacao === 'opcao-mais-cara')
    .sort((x, y) => custoDe(x.sistema) - custoDe(y.sistema))
  const recomendado = podeTrocar[0]?.sistema ?? base
  const motivo = podeTrocar.length
    ? `o mais barato que a produção entre ${podeTrocar.length} que não pioram a experiência`
    : 'nenhum candidato mais barato que a produção sem piorar a experiência: manter'

  /* A regra B5 contra a produção (troca "por qualidade" só se o IC pareado excluir 0 para cima), como referência. */
  const contraProducao = avaliacoes.map((a) => {
    const r = resumos[a.sistema]
    const comparacoes = [{ corpus: `gold:${b.funcao}`, metrica: 'juiz', gold: true, diferenca: a.comparacao.nota }]
    if (a.preferencia)
      comparacoes.push({ corpus: `pareado:${b.funcao}`, metrica: 'preferencia', diferenca: a.preferencia.media })
    const custo = b.funcao === 'legenda' ? r.custo.usdPorHoraDeFala : r.custo.usdPorMilhaoDeTokens
    const teto = b.funcao === 'legenda' ? TETO_LEGENDA_USD_POR_HORA : TETO_USD_POR_MILHAO_DE_TOKENS
    const dec = decidir({
      comparacoes,
      margens: { juiz: margem, preferencia: 0.1 },
      custoUsdPorHora: custo,
      tetoUsdPorHora: teto,
    })
    const unidade = b.funcao === 'legenda' ? '/h de fala' : '/1M tokens'
    const motivos = dec.motivos.map((m) => m.replace(/\/h\b/g, unidade).replace('custo por hora', 'custo'))
    return { sistema: a.sistema, ...dec, motivos }
  })
  return {
    funcao: b.funcao,
    base,
    juizes: b.juizes,
    margem,
    recomendado,
    motivo,
    opcoesMaisCaras: opcoesMaisCaras.map((a) => a.sistema),
    autopreferencia: autopreferencia(b),
    resumos,
    avaliacoes,
    contraProducao,
  }
}
