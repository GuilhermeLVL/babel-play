// WER e frases constrangedoras da LISTA de uma rodada do jantar com o conjunto `tests/fixtures/interprete/` (5.3, 5.4):
// o que o reconhecimento do navegador transcreveu de cada fala, contra a frase dita.
// Uso: npx tsx scripts/eval-fala/jantar/wer-da-lista.mjs <rodada>/resultado.json
import { readFileSync } from 'node:fs'

import { wer } from '../../../src/core/eval/wer.ts'

const W = new URL('../../..', import.meta.url).pathname
const frases = JSON.parse(readFileSync(`${W}/tests/fixtures/interprete/frases.json`, 'utf8')).frases
const vergonha = JSON.parse(readFileSync(`${W}/tests/fixtures/interprete/constrangedoras.json`, 'utf8'))
const r = JSON.parse(readFileSync(process.argv[2], 'utf8'))
const semAcento = (s) => s.normalize('NFD').replace(/\p{M}/gu, '').toLowerCase()
const limpa = (s) => ` ${semAcento(s).replace(/[^\p{L}\p{N}]+/gu, ' ')} `
const lista = r.lista
const turnos = r.opcoes.turnos
const agg = {}
lista.forEach((b, i) => {
  const id = turnos[i]
  const f = frases.find((x) => x.id === id)
  const e = wer(f.texto, b.fala)
  const a = (agg[f.idioma] ??= { d: 0, n: 0, constrangedoras: 0 })
  a.d += e.distancia
  a.n += e.unidadesNaReferencia
  const termos = [...vergonha.termos, ...(vergonha.porFrase[id] ?? [])].map((x) => limpa(x).trim())
  const ruim = termos.find((x) => limpa(`${b.fala} ${b.trad}`).includes(` ${x} `))
  if (ruim) a.constrangedoras++
  console.log(id, e.taxa.toFixed(2), b.fala, ruim ? `CONSTRANGEDORA(${ruim})` : '')
})
for (const [i, a] of Object.entries(agg))
  console.log(
    'WER',
    i,
    (a.d / a.n).toFixed(3),
    'constrangedoras',
    a.constrangedoras,
    `(${lista.length} falas na lista)`,
  )
