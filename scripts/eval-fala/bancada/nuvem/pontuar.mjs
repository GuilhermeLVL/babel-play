/**
 * Pontua o bruto da bancada de nuvem com as MESMAS peças da bancada do aparelho e de setembro:
 *
 *   TRANSCRIÇÃO  `filtrarAlucinacao` de produção sobre o texto cru, WER de `src/core/eval/wer.ts`
 *                (com a normalização dele), IC 95% por bootstrap de 1000 reamostras e diferença
 *                PAREADA fala a fala (`src/core/eval/bootstrap.ts`) — igual a `navegador/pontuar.mjs`.
 *                Os sistemas do aparelho vêm de `bancada-2026-10-navegador/casos.json` (erros e
 *                palavras por fala já pontuados lá, com a mesma função).
 *   TRADUÇÃO     chrF++ de `src/core/eval/chrf.ts` por frase (×100), média com IC por bootstrap e
 *                diferença pareada frase a frase — igual a `bancada/mt.mjs`.
 *
 * Falha numa fala/frase conta como saída vazia (é o que o usuário veria) e é contada à parte.
 *
 * Uso: node node_modules/tsx/dist/cli.mjs scripts/eval-fala/bancada/nuvem/pontuar.mjs
 */
import { existsSync, readdirSync, readFileSync, writeFileSync } from 'node:fs'
import path from 'node:path'

import { bootstrap, bootstrapPareado, mediaEm, razaoEm } from '../../../../src/core/eval/bootstrap.ts'
import { chrf } from '../../../../src/core/eval/chrf.ts'
import { wer } from '../../../../src/core/eval/wer.ts'
import { filtrarAlucinacao } from '../../../../src/gateway/alucinacao.ts'
import { BANCADA_DIR, BRUTO, lerJsonl, percentis, SAIDA } from './comum.mjs'

const RAIZ = path.join(BANCADA_DIR, 'navegador')
const NAVEGADOR = 'docs/auditoria/eval/bancada-2026-10-navegador/casos.json'
const pct = (x) => (x * 100).toFixed(1)
const ic = (q, f = pct) => `${f(q.valor)} [${f(q.ic95[0])}–${f(q.ic95[1])}]`
const soma = (a) => a.reduce((s, x) => s + x, 0)
const arquivos = existsSync(BRUTO) ? readdirSync(BRUTO).filter((f) => f.endsWith('.json')) : []
const ler = (f) => JSON.parse(readFileSync(path.join(BRUTO, f), 'utf8'))

// ------------------------------------------------------------------ transcrição
const APARELHO = [
  'whisper-base:hybrid:webgpu',
  'whisper-base:q8:wasm',
  'whisper-small:hybrid:webgpu',
  'parakeet-v3:int8:wasm',
  'parakeet-v3:fp16:webgpu',
  'moonshine-base:q8:wasm',
]
const doAparelho = JSON.parse(readFileSync(NAVEGADOR, 'utf8'))
/**
 * A MESMA nuvem medida em setembro DIRETO na Groq (sem OpenRouter), nas mesmas 100 falas de pt e de
 * en (`bancada-2026-09/stt_nuvem_limpo.json`, 25/09/2026, com o formulário e a triagem de segmentos
 * da produção). Não é medição desta rodada: entra só como par, para separar modelo de provedor.
 */
const SETEMBRO = 'docs/auditoria/eval/bancada-2026-09/stt_nuvem_limpo.json'
const deSetembro = existsSync(SETEMBRO)
  ? JSON.parse(readFileSync(SETEMBRO, 'utf8')).resultados.filter(
      (r) => r.sistema === 'groq:whisper-large-v3-turbo+t0+seg',
    )
  : []
const referencias = [
  ...APARELHO.flatMap((nome) =>
    doAparelho.filter((x) => x.sistema === nome).map((x) => ({ ...x, origem: 'aparelho, 09/10/2026' })),
  ),
  ...deSetembro.map((x) => ({
    sistema: 'groq-direto:whisper-large-v3-turbo (setembro)',
    conjunto: x.conjunto,
    casos: x.casos,
    origem: 'nuvem direta na Groq, 25/09/2026 — não é desta rodada',
  })),
]
const stt = []
const sttCasos = []
const sttComparacoes = []
for (const arq of arquivos.filter((f) => f.startsWith('stt_'))) {
  const b = ler(arq)
  const itens = lerJsonl(path.join(RAIZ, 'stt', `${b.conjunto}.jsonl`)).filter((it) => b.casos[it.id])
  if (!itens.length) continue
  const idioma = itens[0].idioma
  const casos = itens.map((it) => {
    const r = b.casos[it.id]
    const cru = r.ok ? r.texto : ''
    const hipotese = filtrarAlucinacao(cru, it.duracaoS, idioma)
    const e = wer(it.referencia, hipotese)
    return {
      id: it.id,
      cru,
      hipotese,
      falhou: !r.ok,
      erros: e.distancia,
      palavras: e.unidadesNaReferencia,
      ms: r.ok ? r.ms : null,
      usd: r.usd ?? null,
      tentativas: r.tentativas,
      duracaoS: it.duracaoS,
      segundosFaturados: r.uso?.seconds ?? null,
    }
  })
  const bons = casos.filter((x) => !x.falhou)
  const audioS = soma(bons.map((x) => x.duracaoS))
  const usd = soma(bons.map((x) => x.usd ?? 0))
  const [p50, p90] = percentis(bons.map((x) => x.ms))
  const precos = {}
  for (const x of bons) {
    const k = x.usd != null && x.segundosFaturados ? (x.usd / x.segundosFaturados).toExponential(3) : 'sem custo'
    precos[k] = (precos[k] ?? 0) + 1
  }
  const r = {
    sistema: b.sistema,
    conjunto: b.conjunto,
    idioma,
    n: casos.length,
    falhas: casos.length - bons.length,
    segundaTentativa: casos.filter((x) => x.tentativas > 1).length,
    vazias: casos.filter((x) => !x.hipotese).length,
    filtroMudouOTexto: casos.filter((x) => x.hipotese !== x.cru.trim()).length,
    wer: bootstrap(
      casos.length,
      razaoEm(
        casos.map((x) => x.erros),
        casos.map((x) => x.palavras),
      ),
    ),
    latenciaMs: { p50, p90, media: soma(bons.map((x) => x.ms)) / bons.length },
    fatorDeTempoReal: audioS ? soma(bons.map((x) => x.ms)) / 1000 / audioS : null,
    audioS,
    segundosFaturados: soma(bons.map((x) => x.segundosFaturados ?? 0)),
    usdTotal: usd,
    usdPorHoraDeAudio: audioS ? (usd / audioS) * 3600 : null,
    usdPorSegundoObservado: precos,
  }
  stt.push(r)
  sttCasos.push({ sistema: b.sistema, conjunto: b.conjunto, casos })
  console.log(
    `${b.conjunto} ${b.sistema}: n=${r.n} WER ${ic(r.wer)}  p50 ${Math.round(p50)} ms p90 ${Math.round(p90)} ms  FTR ${r.fatorDeTempoReal.toFixed(3)}  US$ ${usd.toFixed(5)} (${r.usdPorHoraDeAudio.toFixed(4)}/h)  falhas ${r.falhas} vazias ${r.vazias} 2ª tentativa ${r.segundaTentativa}  preços/s ${JSON.stringify(precos)}`,
  )
  for (const ap of referencias.filter((x) => x.conjunto === b.conjunto)) {
    const nome = ap.sistema
    const mapa = new Map(ap.casos.map((x) => [x.id, x]))
    const ca = casos.filter((x) => mapa.has(x.id))
    const cb = ca.map((x) => mapa.get(x.id))
    if (ca.length !== casos.length) console.warn(`  aviso: ${nome} tem ${ca.length} de ${casos.length} falas`)
    const werDoAparelho = bootstrap(
      cb.length,
      razaoEm(
        cb.map((x) => x.erros),
        cb.map((x) => x.palavras),
      ),
    )
    const d = bootstrapPareado(
      ca.length,
      razaoEm(
        ca.map((x) => x.erros),
        ca.map((x) => x.palavras),
      ),
      razaoEm(
        cb.map((x) => x.erros),
        cb.map((x) => x.palavras),
      ),
    )
    const msAp = percentis(cb.map((x) => x.ms))
    sttComparacoes.push({
      conjunto: b.conjunto,
      sistema: b.sistema,
      contra: nome,
      origemDoPar: ap.origem,
      n: ca.length,
      werDoAparelho,
      latenciaDoAparelhoMs: { p50: msAp[0], p90: msAp[1] },
      diferencaWer: d,
      nuvemErraMenosEm: ca.filter((x, i) => x.erros < cb[i].erros).length,
      aparelhoErraMenosEm: ca.filter((x, i) => x.erros > cb[i].erros).length,
    })
    console.log(
      `   Δ WER nuvem − ${nome.padEnd(46)} (${ic(werDoAparelho)}) = ${(d.valor * 100).toFixed(2)} pts [${(d.ic95[0] * 100).toFixed(2)}; ${(d.ic95[1] * 100).toFixed(2)}] ${d.significativo ? '*significativo*' : '(empate)'}  n=${ca.length}`,
    )
  }
}

// ------------------------------------------------------------------ tradução
const mt = []
const mtCasos = []
const mtComparacoes = []
const brutosMt = arquivos.filter((f) => f.startsWith('mt_')).map(ler)
for (const b of brutosMt) {
  const casos = Object.entries(b.casos).map(([id, x]) => {
    const hipotese = x.ok ? x.texto : ''
    return { id, ...x, hipotese, chrf: chrf(x.referencia, hipotese).chrf * 100 }
  })
  if (!casos.length) continue
  const bons = casos.filter((x) => x.ok)
  const [p50, p90] = percentis(bons.map((x) => x.ms))
  // O custo conta TODAS as chamadas, inclusive a que voltou vazia (ela foi cobrada).
  const usd = soma(casos.map((x) => x.usd ?? 0))
  const palavras = soma(casos.map((x) => x.origem.split(/\s+/).length))
  const provedores = {}
  for (const x of bons) if (x.provedorReal) provedores[x.provedorReal] = (provedores[x.provedorReal] ?? 0) + 1
  const r = {
    sistema: b.sistema,
    direcao: b.direcao,
    origemDosDados: b.origemDosDados ?? 'medido nesta rodada',
    n: casos.length,
    falhas: casos.length - bons.length,
    vazias: casos.filter((x) => !x.hipotese).length,
    segundaTentativa: casos.filter((x) => x.tentativas > 1).length,
    chrf: bootstrap(casos.length, mediaEm(casos.map((x) => x.chrf))),
    latenciaMs: { p50, p90, media: soma(bons.map((x) => x.ms)) / bons.length },
    acimaDe12s: bons.filter((x) => x.ms > 12_000).length,
    usdTotal: usd,
    usdPorFrase: usd / casos.length,
    usdPorMilFrases: (usd / casos.length) * 1000,
    // ~9.000 palavras por hora de conversa (150 palavras/min), a conta de `bancada/mt.mjs`.
    usdPorHoraDeFala: palavras ? (usd / palavras) * 9000 : null,
    tokens: {
      entrada: soma(bons.map((x) => x.tokensEntrada ?? 0)),
      saida: soma(bons.map((x) => x.tokensSaida ?? 0)),
      raciocinio: soma(bons.map((x) => x.tokensDeRaciocinio ?? 0)),
    },
    provedoresQueAtenderam: provedores,
  }
  mt.push(r)
  mtCasos.push({ sistema: b.sistema, direcao: b.direcao, casos })
  console.log(
    `${b.direcao} ${b.sistema}: n=${r.n} chrF++ ${ic(r.chrf, (v) => v.toFixed(1))}  p50 ${Math.round(p50)} ms p90 ${Math.round(p90)} ms  US$ ${usd.toFixed(5)} (${(r.usdPorMilFrases ?? 0).toFixed(4)}/1.000 frases)  falhas ${r.falhas} vazias ${r.vazias}  ${JSON.stringify(provedores)}`,
  )
}
for (const direcao of new Set(mtCasos.map((x) => x.direcao))) {
  const doPar = mtCasos.filter((x) => x.direcao === direcao)
  for (const a of doPar)
    for (const b of doPar) {
      if (a === b || !/^openrouter:/.test(a.sistema)) continue
      if (/^openrouter:/.test(b.sistema) && a.sistema < b.sistema) continue
      const mapa = new Map(b.casos.map((x) => [x.id, x]))
      const ca = a.casos.filter((x) => mapa.has(x.id))
      const cb = ca.map((x) => mapa.get(x.id))
      const d = bootstrapPareado(ca.length, mediaEm(ca.map((x) => x.chrf)), mediaEm(cb.map((x) => x.chrf)))
      mtComparacoes.push({ direcao, sistema: a.sistema, contra: b.sistema, n: ca.length, diferencaChrf: d })
      console.log(
        `   Δ chrF++ ${direcao}: ${a.sistema} − ${b.sistema} = ${d.valor.toFixed(2)} [${d.ic95[0].toFixed(2)}; ${d.ic95[1].toFixed(2)}] ${d.significativo ? '*significativo*' : '(empate)'}  n=${ca.length}`,
      )
    }
}

const ler2 = (f) => (existsSync(path.join(SAIDA, f)) ? JSON.parse(readFileSync(path.join(SAIDA, f), 'utf8')) : null)
writeFileSync(
  path.join(SAIDA, 'resumo.json'),
  JSON.stringify(
    {
      geradoEm: new Date().toISOString(),
      retratosDaChave: ler2('retratos.json'),
      livroCaixa: ler2('gasto.json'),
      transcricao: { resultados: stt, comparacoes: sttComparacoes },
      traducao: { resultados: mt, comparacoes: mtComparacoes },
    },
    null,
    1,
  ),
)
writeFileSync(
  path.join(SAIDA, 'casos.json'),
  JSON.stringify({
    transcricao: sttCasos.map((s) => ({
      ...s,
      casos: s.casos.map(({ id, cru, hipotese, erros, palavras, ms, usd, falhou }) => ({
        id,
        cru,
        hipotese,
        erros,
        palavras,
        ms,
        usd,
        falhou,
      })),
    })),
    traducao: mtCasos.map((s) => ({
      ...s,
      casos: s.casos.map(({ id, origem, referencia, hipotese, chrf: c, ms, usd, ok }) => ({
        id,
        origem,
        referencia,
        hipotese,
        chrf: c,
        ms,
        usd,
        falhou: !ok,
      })),
    })),
  }),
)
console.log(`\npontuado: ${SAIDA}/resumo.json e casos.json`)
