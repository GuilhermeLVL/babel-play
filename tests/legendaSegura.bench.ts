/**
 * O CUSTO DA LEGENDA SEGURA POR FALA (spec `legenda-segura`, "Custo desprezível e sem rede"): o p95 de uma fala de 30
 * palavras tem de ficar abaixo de 0,2 ms. Cada iteração lê uma fala DIFERENTE (10 000 montadas com as palavras do corpus
 * de negativos), para a memória por texto não esconder o custo.
 *
 *   npx vitest bench tests/legendaSegura.bench.ts
 *
 * A coluna `p99` abaixo de 0,2 ms basta (o p95 fica abaixo dela).
 */
import { bench, describe } from 'vitest'

import { ocultarTermos, politicaDaLegenda } from '../src/core/moderacao/legendaSegura'
import negativos from './fixtures/legenda-segura/negativos.json'

const PROTEGIDO = politicaDaLegenda({ protegido: true, opcaoDoAdulto: false })
const palavras = negativos.join(' ').split(/\s+/).filter(Boolean)
const FALAS = Array.from({ length: 10_000 }, (_, i) =>
  Array.from({ length: 30 }, (_, k) => palavras[(i * 31 + k * 7) % palavras.length]).join(' '),
)

let i = 0
describe('legenda segura', () => {
  bench('ocultarTermos, fala de 30 palavras', () => {
    ocultarTermos(FALAS[i++ % FALAS.length], PROTEGIDO)
  })
})
