/**
 * Pontua o bruto do `rodar.mjs` com as MESMAS peças da bancada de setembro (`bancada/stt.mjs`):
 * `filtrarAlucinacao` de produção sobre o texto cru, WER/CER de `src/core/eval/wer.ts` (com a
 * normalização dele), IC de 95% por bootstrap de 1000 reamostras e diferença PAREADA caso a caso.
 *
 * Falha de decode numa fala conta como transcrição vazia (é o que o usuário veria) e é contada à parte.
 *
 * Uso (precisa do tsx, porque importa .ts de src/):
 *   node node_modules/tsx/dist/cli.mjs scripts/eval-fala/bancada/navegador/pontuar.mjs
 *        [--pares "a>b,c>d"]   diferença pareada de WER: a − b (mesmas falas)
 */
import { mkdirSync, readdirSync, readFileSync, writeFileSync } from 'node:fs'
import path from 'node:path'

import { bootstrap, bootstrapPareado, razaoEm } from '../../../../src/core/eval/bootstrap.ts'
import { cer, wer } from '../../../../src/core/eval/wer.ts'
import { filtrarAlucinacao } from '../../../../src/gateway/alucinacao.ts'
import { BANCADA_DIR } from './servidor.mjs'

const args = process.argv.slice(2)
const opt = (n, p) => {
  const i = args.indexOf(`--${n}`)
  return i > -1 && args[i + 1] ? args[i + 1] : p
}
const RAIZ = path.join(BANCADA_DIR, 'navegador')
const SAIDA = 'docs/auditoria/eval/bancada-2026-10-navegador'
const lerJsonl = (p) =>
  readFileSync(p, 'utf8')
    .trim()
    .split('\n')
    .filter(Boolean)
    .map((l) => JSON.parse(l))
const pct = (x) => (x * 100).toFixed(1)

const manifestos = new Map()
const manifesto = (conj) => {
  if (!manifestos.has(conj)) manifestos.set(conj, lerJsonl(path.join(RAIZ, 'stt', `${conj}.jsonl`)))
  return manifestos.get(conj)
}

const resultados = []
for (const arq of readdirSync(path.join(RAIZ, 'resultados')).filter((f) => f.endsWith('.json'))) {
  const bruto = JSON.parse(readFileSync(path.join(RAIZ, 'resultados', arq), 'utf8'))
  const base = {
    sistema: bruto.sistema,
    conjunto: bruto.conjunto,
    geradoEm: bruto.geradoEm,
    chrome: bruto.versaoDoChrome,
    adaptador: bruto.ambiente?.adaptador ?? null,
    threads: bruto.carga?.threads ?? null,
    cargaMs: bruto.carga?.cargaMs ?? null,
    arquivos: bruto.carga?.arquivos ?? bruto.bytesDoModelo ?? null,
    memoriaDoChromeMb: bruto.memoriaBytes ? Math.round(bruto.memoriaBytes / 2 ** 20) : null,
  }
  if (bruto.falhaDeCarga) {
    resultados.push({ ...base, n: 0, falhaDeCarga: bruto.falhaDeCarga.erro, etapa: bruto.falhaDeCarga.etapa })
    continue
  }
  const itens = manifesto(bruto.conjunto).filter((it) => bruto.casos[it.id])
  if (!itens.length) continue
  const idioma = itens[0].idioma
  const casos = itens.map((it) => {
    const r = bruto.casos[it.id]
    const cru = r.ok ? r.texto : ''
    const hipotese = filtrarAlucinacao(cru, it.duracaoS, idioma)
    const e = wer(it.referencia, hipotese)
    const c = cer(it.referencia, hipotese)
    return {
      id: it.id,
      referencia: it.referencia,
      cru,
      hipotese,
      falhou: !r.ok,
      erros: e.distancia,
      palavras: e.unidadesNaReferencia,
      errosC: c.distancia,
      caracteres: c.unidadesNaReferencia,
      ms: r.ok ? r.ms : 0,
      encoderMs: r.encoderMs,
      decoderMs: r.decoderMs,
      duracaoS: it.duracaoS,
    }
  })
  const bons = casos.filter((x) => !x.falhou)
  const audioS = bons.reduce((s, x) => s + x.duracaoS, 0)
  const ms = bons.map((x) => x.ms).sort((a, b) => a - b)
  resultados.push({
    ...base,
    idioma,
    n: casos.length,
    falhas: casos.length - bons.length,
    vazias: casos.filter((x) => !x.hipotese).length,
    wer: bootstrap(
      casos.length,
      razaoEm(
        casos.map((x) => x.erros),
        casos.map((x) => x.palavras),
      ),
    ),
    cer: bootstrap(
      casos.length,
      razaoEm(
        casos.map((x) => x.errosC),
        casos.map((x) => x.caracteres),
      ),
    ),
    fatorDeTempoReal: audioS ? bons.reduce((s, x) => s + x.ms, 0) / 1000 / audioS : null,
    // Por fala: a fração que demorou mais que a própria duração (não acompanha).
    msP50: ms[Math.floor(ms.length * 0.5)] ?? null,
    msP95: ms[Math.min(ms.length - 1, Math.floor(ms.length * 0.95))] ?? null,
    encoderMsMedio: bons[0]?.encoderMs != null ? bons.reduce((s, x) => s + x.encoderMs, 0) / bons.length : null,
    decoderMsMedio: bons[0]?.decoderMs != null ? bons.reduce((s, x) => s + x.decoderMs, 0) / bons.length : null,
    casos,
  })
}

resultados.sort((a, b) => (a.conjunto + a.sistema).localeCompare(b.conjunto + b.sistema))
console.log(
  `${'conjunto'.padEnd(11)}${'sistema'.padEnd(42)}${'n'.padStart(4)}  WER % [IC 95%]         CER %   FTR    p50 ms  p95 ms  vazias falhas`,
)
for (const r of resultados) {
  if (!r.n) {
    console.log(
      `${r.conjunto.padEnd(11)}${r.sistema.padEnd(42)}   0  NÃO CARREGOU: ${String(r.falhaDeCarga).slice(0, 110)}`,
    )
    continue
  }
  console.log(
    `${r.conjunto.padEnd(11)}${r.sistema.padEnd(42)}${String(r.n).padStart(4)}  ${pct(r.wer.valor).padStart(5)} [${pct(r.wer.ic95[0])}–${pct(r.wer.ic95[1])}]`.padEnd(
      82,
    ) +
      `${pct(r.cer.valor).padStart(5)}  ${r.fatorDeTempoReal.toFixed(3)}  ${String(Math.round(r.msP50)).padStart(6)}  ${String(Math.round(r.msP95)).padStart(6)}  ${String(r.vazias).padStart(5)}  ${String(r.falhas).padStart(5)}`,
  )
}

// Diferenças pareadas: "a>b" = WER(a) − WER(b), nas falas que os dois têm.
const comparacoes = []
for (const par of opt('pares', '')
  .split(',')
  .map((s) => s.trim())
  .filter(Boolean)) {
  const [a, b] = par.split('>')
  for (const conj of new Set(resultados.map((r) => r.conjunto))) {
    const ra = resultados.find((r) => r.sistema === a && r.conjunto === conj && r.n)
    const rb = resultados.find((r) => r.sistema === b && r.conjunto === conj && r.n)
    if (!ra || !rb) continue
    const mb = new Map(rb.casos.map((x) => [x.id, x]))
    const ca = ra.casos.filter((x) => mb.has(x.id))
    const cb = ca.map((x) => mb.get(x.id))
    if (!ca.length) continue
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
    const iguais = ca.filter((x, i) => x.hipotese === cb[i].hipotese).length
    comparacoes.push({
      conjunto: conj,
      sistema: a,
      contra: b,
      n: ca.length,
      diferencaWer: d,
      transcricoesIdenticas: iguais,
    })
    console.log(
      `  Δ WER ${conj}: ${a} − ${b} = ${(d.valor * 100).toFixed(2)} pts [${(d.ic95[0] * 100).toFixed(2)}; ${(d.ic95[1] * 100).toFixed(2)}] ${d.significativo ? '*significativo*' : '(empate)'}  n=${ca.length}, textos idênticos ${iguais}`,
    )
  }
}

mkdirSync(SAIDA, { recursive: true })
const semCasos = resultados.map(({ casos: _c, ...r }) => r)
writeFileSync(
  path.join(SAIDA, 'resumo.json'),
  JSON.stringify({ geradoEm: new Date().toISOString(), resultados: semCasos, comparacoes }, null, 1),
)
writeFileSync(
  path.join(SAIDA, 'casos.json'),
  JSON.stringify(
    resultados
      .filter((r) => r.n)
      .map((r) => ({
        sistema: r.sistema,
        conjunto: r.conjunto,
        casos: r.casos.map(({ id, cru, hipotese, erros, palavras, ms, falhou }) => ({
          id,
          cru,
          hipotese,
          erros,
          palavras,
          ms: Math.round(ms),
          falhou,
        })),
      })),
  ),
)
console.log(`\nbruto pontuado: ${SAIDA}/resumo.json e casos.json`)
