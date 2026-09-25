/**
 * Intervalo de confiança por BOOTSTRAP — o que separa "o modelo B é melhor" de "o B deu sorte".
 *
 * Todo número da bancada de fala e tradução vem com isto. A lição já está escrita em
 * `scripts/eval-fala/medir-traducao-llm.mjs`: o mesmo modelo variou 8,6 pontos de chrF entre
 * execuções num gold set de 60 casos, e uma "vitória" de 2,2 pontos era ruído. A prática da área
 * (Koehn 2004 para tradução; Bisani & Ney 2004 para WER) é reamostrar os CASOS com reposição e
 * recalcular a métrica do corpus inteiro, mil vezes: o intervalo entre os percentis 2,5 e 97,5 é o
 * IC de 95%.
 *
 * PAREADO para comparar dois sistemas: reamostra os MESMOS índices nos dois e mede a DIFERENÇA.
 * Duas médias com intervalos que se sobrepõem ainda podem ter diferença significativa quando os
 * erros andam juntos caso a caso — e é o caso aqui, porque a frase difícil é difícil para todos.
 *
 * Determinístico (semente fixa): rodar de novo dá o mesmo intervalo, e o relatório é reproduzível.
 * Puro e isomórfico, como o resto de `src/core/eval`.
 */

export interface Intervalo {
  valor: number
  ic95: [number, number]
}

/** Gerador pseudoaleatório pequeno e reproduzível (mulberry32). */
export function rngComSemente(semente: number): () => number {
  let a = semente >>> 0
  return () => {
    a = (a + 0x6d2b79f5) >>> 0
    let t = a
    t = Math.imul(t ^ (t >>> 15), t | 1)
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

function percentil(ordenados: number[], p: number): number {
  if (ordenados.length === 0) return NaN
  const pos = (ordenados.length - 1) * p
  const i = Math.floor(pos)
  const f = pos - i
  return i + 1 < ordenados.length ? ordenados[i] * (1 - f) + ordenados[i + 1] * f : ordenados[i]
}

/**
 * Bootstrap de uma estatística de corpus. `estatistica` recebe os ÍNDICES reamostrados — assim a
 * mesma função serve para WER (soma de erros / soma de palavras), média de COMET ou qualquer
 * agregação que não seja uma média simples.
 */
export function bootstrap(
  n: number,
  estatistica: (indices: number[]) => number,
  opcoes: { reamostras?: number; semente?: number } = {},
): Intervalo {
  const todos = Array.from({ length: n }, (_, i) => i)
  const valor = estatistica(todos)
  if (n === 0) return { valor, ic95: [NaN, NaN] }
  const rng = rngComSemente(opcoes.semente ?? 20260924)
  const b = opcoes.reamostras ?? 1000
  const amostras: number[] = []
  const idx = new Array<number>(n)
  for (let k = 0; k < b; k++) {
    for (let i = 0; i < n; i++) idx[i] = Math.floor(rng() * n)
    amostras.push(estatistica(idx))
  }
  amostras.sort((x, y) => x - y)
  return { valor, ic95: [percentil(amostras, 0.025), percentil(amostras, 0.975)] }
}

/** Diferença pareada A − B, com os mesmos índices reamostrados nos dois lados. */
export function bootstrapPareado(
  n: number,
  estatisticaA: (indices: number[]) => number,
  estatisticaB: (indices: number[]) => number,
  opcoes: { reamostras?: number; semente?: number } = {},
): Intervalo & { significativo: boolean } {
  const r = bootstrap(n, (idx) => estatisticaA(idx) - estatisticaB(idx), opcoes)
  /* Significativo quando o intervalo da diferença NÃO contém zero — a regra de decisão do plano:
     só se troca de modelo com melhora que o acaso não explica. */
  return { ...r, significativo: r.ic95[0] > 0 || r.ic95[1] < 0 }
}

/** Média dos valores nos índices — o caso comum (COMET, chrF por frase, latência). */
export const mediaEm = (valores: number[]) => (idx: number[]) =>
  idx.length === 0 ? NaN : idx.reduce((s, i) => s + valores[i], 0) / idx.length

/** Razão de somas nos índices — WER/CER de corpus (erros totais / palavras totais). */
export const razaoEm = (numeradores: number[], denominadores: number[]) => (idx: number[]) => {
  let a = 0
  let b = 0
  for (const i of idx) {
    a += numeradores[i]
    b += denominadores[i]
  }
  return b === 0 ? NaN : a / b
}
