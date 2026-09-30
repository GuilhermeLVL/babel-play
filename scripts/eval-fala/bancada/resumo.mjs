/**
 * RESUMO DA BANCADA — junta os brutos de `stt.mjs` e `mt.mjs` (já pontuados por `pontuar.py`) numa
 * tabela de DECISÃO: cada candidato contra cada linha de base, no mesmo conjunto e nos MESMOS casos,
 * com a diferença pareada e o IC de 95% (`bootstrapPareado`, semente fixa).
 *
 * `stt.mjs`/`pontuar.py` comparam só contra o PRIMEIRO sistema de cada execução; aqui todo par
 * (candidato, base) sai, alinhado por id de caso — um caso que faltou num dos lados sai do par, e o
 * `n` da linha diz quantos ficaram.
 *
 * Candidato = sistema cujo id começa com um dos prefixos de `--candidatos` (padrão `parakeet:,bergamot:`);
 * base = todo o resto no mesmo conjunto.
 *
 * Métricas e sinal (Δ = candidato − base):
 *   STT fala      WER de corpus (erros/palavras)      Δ < 0 é melhor
 *   STT sem_fala  taxa de alucinação (trecho c/ letra) Δ < 0 é melhor
 *   MT            COMET médio (wmt22-comet-da)         Δ > 0 é melhor (chrF++ ao lado)
 *
 * Uso:
 *   node node_modules/tsx/dist/cli.mjs scripts/eval-fala/bancada/resumo.mjs --saida <dir> arq1.json arq2.json …
 * Grava `<dir>/resumo-bancada.json` e `<dir>/resumo-bancada.md` e imprime o Markdown.
 */
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import path from 'node:path'
import { pathToFileURL } from 'node:url'

import { bootstrap, bootstrapPareado, mediaEm, razaoEm } from '../../../src/core/eval/bootstrap.ts'

const pct = (x) => (x * 100).toFixed(1)
const fmtIc = (iv, f) => `${f(iv.valor)} [${f(iv.ic95[0])}–${f(iv.ic95[1])}]`
const fmtDelta = (d, f) =>
  `${d.valor > 0 ? '+' : ''}${f(d.valor)} [${f(d.ic95[0])}, ${f(d.ic95[1])}]${d.significativo ? ' **sig.**' : ''}`

/** Casos presentes nos dois lados, na ordem do candidato. */
export function alinhar(casosA, casosB) {
  const mapa = new Map(casosB.map((c) => [c.id, c]))
  const a = []
  const b = []
  for (const c of casosA)
    if (mapa.has(c.id)) {
      a.push(c)
      b.push(mapa.get(c.id))
    }
  return [a, b]
}

const temLetra = (s) => (/\p{L}/u.test(s ?? '') ? 1 : 0)

/** Estatística de um resultado de STT sobre `casos` (fala: WER; sem_fala: alucinação). */
function estatisticaStt(conjunto, casos) {
  if (conjunto === 'sem_fala') return mediaEm(casos.map((c) => temLetra(c.hipotese)))
  return razaoEm(
    casos.map((c) => c.erros),
    casos.map((c) => c.palavras),
  )
}

/** COMET por caso de um resultado de MT, indexado por id (o `pontuar.py` grava na ordem de `casos`). */
function cometPorId(r) {
  if (!Array.isArray(r.cometPorCaso)) return null
  return r.casos.map((c, i) => ({ id: c.id, comet: r.cometPorCaso[i], chrf: c.chrf }))
}

export function resumir(brutos, prefixos = ['parakeet:', 'bergamot:']) {
  const ehCandidato = (s) => prefixos.some((p) => s.startsWith(p))
  const stt = []
  const mt = []
  for (const d of brutos)
    for (const r of d.resultados ?? []) {
      if (r.conjunto) stt.push(r)
      else if (r.corpus) mt.push(r)
    }

  const linhasStt = []
  for (const conjunto of [...new Set(stt.map((r) => r.conjunto))]) {
    // O mesmo sistema pode aparecer em dois arquivos (duas execuções): fica o último.
    const doConj = [...new Map(stt.filter((r) => r.conjunto === conjunto).map((r) => [r.sistema, r])).values()]
    for (const r of doConj) {
      const est = estatisticaStt(conjunto, r.casos)
      linhasStt.push({
        conjunto,
        sistema: r.sistema,
        candidato: ehCandidato(r.sistema),
        n: r.casos.length,
        metrica: conjunto === 'sem_fala' ? 'alucinacao' : 'wer',
        valor: bootstrap(r.casos.length, est),
        rtf: r.rtf,
        latenciaMs: r.latenciaMs,
        comparacoes: doConj
          .filter((b) => b !== r && ehCandidato(r.sistema) && !ehCandidato(b.sistema))
          .map((b) => {
            const [ca, cb] = alinhar(r.casos, b.casos)
            return {
              contra: b.sistema,
              n: ca.length,
              diferenca: bootstrapPareado(ca.length, estatisticaStt(conjunto, ca), estatisticaStt(conjunto, cb)),
            }
          }),
      })
    }
  }

  const linhasMt = []
  for (const corpus of [...new Set(mt.map((r) => r.corpus))]) {
    const doCorpus = mt.filter((r) => r.corpus === corpus)
    // O mesmo sistema pode aparecer em dois arquivos (duas execuções): fica o último.
    const porSistema = new Map(doCorpus.map((r) => [r.sistema, r]))
    for (const r of porSistema.values()) {
      const casos = cometPorId(r)
      linhasMt.push({
        corpus,
        sistema: r.sistema,
        candidato: ehCandidato(r.sistema),
        n: r.casos.length,
        comet: r.comet ?? null,
        chrf: r.chrf,
        bleu: r.sacrebleu?.bleu ?? null,
        latenciaMs: r.latenciaMs,
        latenciaPorFraseMs: r.latenciaPorFraseMs ?? null,
        falhas: r.falhas ?? 0,
        comparacoes: !ehCandidato(r.sistema)
          ? []
          : [...porSistema.values()]
              .filter((b) => !ehCandidato(b.sistema))
              .map((b) => {
                const cb = cometPorId(b)
                const usarComet = casos && cb
                const [ca, cbb] = alinhar(usarComet ? casos : r.casos, usarComet ? cb : b.casos)
                const campo = usarComet ? 'comet' : 'chrf'
                return {
                  contra: b.sistema,
                  n: ca.length,
                  metrica: campo,
                  diferenca: bootstrapPareado(
                    ca.length,
                    mediaEm(ca.map((c) => c[campo])),
                    mediaEm(cbb.map((c) => c[campo])),
                  ),
                }
              }),
      })
    }
  }
  return { stt: linhasStt, mt: linhasMt }
}

export function markdown({ stt, mt }, meta = {}) {
  const l = []
  l.push('# Bancada — candidatos × linhas de base (Etapa 5)')
  l.push('')
  if (meta.commit || meta.geradoEm) l.push(`Commit \`${meta.commit ?? '?'}\` · ${meta.geradoEm ?? ''}`, '')
  l.push(
    '> **Regra de decisão:** troca só se o IC 95% do bootstrap **pareado** da diferença exclui 0, o custo cabe e o gold de conversa não piora. **sig.** = IC exclui 0. STT: Δ < 0 é melhor. MT: Δ > 0 é melhor.',
    '',
  )
  if (stt.length) {
    l.push('## Transcrição', '')
    l.push('| Conjunto | Sistema | n | WER / alucinação % [IC 95%] | RTF | p50 ms | Δ pareado vs base (pts) |')
    l.push('| --- | --- | --: | --- | --: | --: | --- |')
    for (const r of stt) {
      const deltas = r.comparacoes.map((c) => `vs \`${c.contra}\`: ${fmtDelta(c.diferenca, pct)}`).join('<br>')
      l.push(
        `| ${r.conjunto} | \`${r.sistema}\`${r.candidato ? ' ★' : ''} | ${r.n} | ${fmtIc(r.valor, pct)} | ${Number.isFinite(r.rtf) ? r.rtf.toFixed(3) : '—'} | ${Number.isFinite(r.latenciaMs?.p50) ? r.latenciaMs.p50.toFixed(0) : '—'} | ${deltas || '—'} |`,
      )
    }
    l.push('')
  }
  if (mt.length) {
    const f3 = (x) => x.toFixed(3)
    l.push('## Tradução', '')
    l.push('| Corpus | Sistema | n | COMET [IC 95%] | chrF++ | BLEU | ms/frase p50 · p95 | Δ pareado vs base |')
    l.push('| --- | --- | --: | --- | --: | --: | --- | --- |')
    for (const r of mt) {
      const deltas = r.comparacoes
        .map(
          (c) =>
            `vs \`${c.contra}\` (${c.metrica}): ${fmtDelta(c.diferenca, c.metrica === 'comet' ? f3 : (x) => x.toFixed(1))}`,
        )
        .join('<br>')
      const pf = r.latenciaPorFraseMs
      l.push(
        `| ${r.corpus} | \`${r.sistema}\`${r.candidato ? ' ★' : ''} | ${r.n}${r.falhas ? ` (${r.falhas} falhas)` : ''} | ${r.comet ? fmtIc(r.comet, f3) : '— (rode pontuar.py)'} | ${r.chrf?.valor?.toFixed(1) ?? '—'} | ${r.bleu?.toFixed(1) ?? '—'} | ${pf ? `${pf.p50.toFixed(0)} · ${pf.p95.toFixed(0)}` : '—'} | ${deltas || '—'} |`,
      )
    }
    l.push('')
  }
  l.push('★ = candidato. Brutos (hipóteses caso a caso) no artefato, junto deste resumo.')
  return `${l.join('\n')}\n`
}

function main() {
  const args = process.argv.slice(2)
  let saida = '.'
  let prefixos
  const arquivos = []
  for (let i = 0; i < args.length; i++) {
    if (args[i] === '--saida') saida = args[++i]
    else if (args[i] === '--candidatos') prefixos = args[++i].split(',')
    else arquivos.push(args[i])
  }
  if (!arquivos.length) throw new Error('nenhum bruto informado')
  const brutos = arquivos.map((a) => JSON.parse(readFileSync(a, 'utf8')))
  const res = resumir(brutos, prefixos)
  const meta = { geradoEm: new Date().toISOString(), commit: brutos.find((b) => b.commit)?.commit ?? null }
  const md = markdown(res, meta)
  mkdirSync(saida, { recursive: true })
  writeFileSync(path.join(saida, 'resumo-bancada.json'), `${JSON.stringify({ ...meta, arquivos, ...res }, null, 2)}\n`)
  writeFileSync(path.join(saida, 'resumo-bancada.md'), md)
  console.log(md)
}

if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) main()
