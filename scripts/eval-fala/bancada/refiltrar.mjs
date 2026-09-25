/**
 * REFILTRAR SEM RETRANSCREVER — mede o efeito de uma mudança em `filtrarAlucinacao` sobre as
 * saídas já guardadas no cache da bancada (custo zero, segundos).
 *
 * Um filtro só vale se as DUAS coisas acontecem: a alucinação cai nos trechos sem fala E o WER não
 * sobe nas falas reais (o filtro não pode engolir fala). Este script mostra as duas, lado a lado,
 * com a diferença pareada de WER e os casos de fala que o filtro novo apagou.
 */
import { readdirSync, readFileSync } from 'node:fs'
import path from 'node:path'

import { bootstrapPareado, razaoEm } from '../../../src/core/eval/bootstrap.ts'
import { wer } from '../../../src/core/eval/wer.ts'
import { filtrarAlucinacao } from '../../../src/gateway/alucinacao.ts'
import { BANCADA_DIR, lerJsonl } from './comum.mjs'

const pasta = path.join(BANCADA_DIR, 'cache')
const refs = new Map()
for (const lang of ['pt', 'en']) for (const m of lerJsonl(`stt/fleurs_${lang}.jsonl`)) refs.set(m.id, m)

for (const arq of readdirSync(pasta).filter((f) => f.startsWith('stt_') && (f.endsWith('_sem_fala.json') || /_fleurs_(pt|en)\.json$/.test(f)))) {
  const dados = JSON.parse(readFileSync(path.join(pasta, arq), 'utf8'))
  const semFala = arq.endsWith('_sem_fala.json')
  const idioma = semFala ? 'pt' : arq.match(/_fleurs_(pt|en)\.json$/)[1]
  const casos = Object.entries(dados).map(([id, r]) => ({ id, antes: r.texto, depois: filtrarAlucinacao(r.texto, r.duracaoS ?? 5, idioma) }))
  if (semFala) {
    const a = casos.filter((c) => /\p{L}/u.test(c.antes)).length
    const d = casos.filter((c) => /\p{L}/u.test(c.depois)).length
    console.log(`${arq.padEnd(62)} alucinação ${(100 * a / casos.length).toFixed(1)}% → ${(100 * d / casos.length).toFixed(1)}%`)
  } else {
    const cs = casos.filter((c) => refs.has(c.id))
    const ea = cs.map((c) => wer(refs.get(c.id).referencia, c.antes))
    const ed = cs.map((c) => wer(refs.get(c.id).referencia, c.depois))
    const n = (e) => razaoEm(e.map((x) => x.distancia), e.map((x) => x.unidadesNaReferencia))
    const dif = bootstrapPareado(cs.length, n(ed), n(ea))
    const apagadas = cs.filter((c) => c.antes && !c.depois).map((c) => c.antes)
    console.log(`${arq.padEnd(62)} WER ${(100 * n(ea)(cs.map((_, i) => i))).toFixed(2)}% → ${(100 * n(ed)(cs.map((_, i) => i))).toFixed(2)}%  Δ ${(100 * dif.valor).toFixed(2)} [${(100 * dif.ic95[0]).toFixed(2)}, ${(100 * dif.ic95[1]).toFixed(2)}]${apagadas.length ? `  APAGOU: ${apagadas.slice(0, 3).join(' | ')}` : ''}`)
  }
}
