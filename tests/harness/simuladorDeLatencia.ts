/**
 * SIMULADOR DE LOTES `v: 2` SINTÉTICOS (openspec `latencia-publicada-por-aparelho`, tarefa 1.1): gera, para cada classe de
 * aparelho, falas com latência de distribuição CONHECIDA (log-normal, semente fixa), no formato exato que o cliente manda
 * (`fimDaFalaAteLegenda` com 9 baldes, `n`, `falhas`, `semTraducao`; até 200 falas por lote). Devolve também as observações
 * cruas, para o teste comparar o p50/p75 reconstruído pelos baldes com o quantil exato. Não precisa de dado real nem de flag.
 */
import { LIMITES_DOS_BALDES_MS, N_BALDES_DA_LATENCIA } from '../../src/core/latencia/agregarLatencia'

/** Gerador pseudoaleatório determinístico (mulberry32). */
export function aleatorio(semente: number): () => number {
  let a = semente >>> 0
  return () => {
    a = (a + 0x6d2b79f5) >>> 0
    let t = a
    t = Math.imul(t ^ (t >>> 15), t | 1)
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

function normal(r: () => number): number {
  const u = Math.max(r(), 1e-12)
  return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * r())
}

/** Mediana (ms) e dispersão (sigma do log) por classe: celular fraco é lento e disperso. */
export const PERFIS_SINTETICOS: Record<string, { medianaMs: number; sigma: number; taxaDeFalha: number }> = {
  quest: { medianaMs: 2200, sigma: 0.5, taxaDeFalha: 0.08 },
  'celular-fraco': { medianaMs: 3500, sigma: 0.6, taxaDeFalha: 0.12 },
  'celular-bom': { medianaMs: 1300, sigma: 0.45, taxaDeFalha: 0.03 },
  'desktop-sem-gpu': { medianaMs: 1800, sigma: 0.5, taxaDeFalha: 0.05 },
  'desktop-com-gpu': { medianaMs: 700, sigma: 0.4, taxaDeFalha: 0.01 },
}

/** O índice do balde da observação `ms` (o primeiro cujo limite a cobre; o último é "acima de 10 s"). */
export function baldeDe(ms: number): number {
  const i = LIMITES_DOS_BALDES_MS.findIndex((l) => ms <= l)
  return i === -1 ? N_BALDES_DA_LATENCIA - 1 : i
}

export interface LoteSintetico {
  v: 2
  classe: string
  fimDaFalaAteLegenda: { idioma: string; baldes: number[]; n: number; falhas: number; semTraducao: number }
}

export interface Simulacao {
  lotes: LoteSintetico[]
  /** As observações cruas (só as com legenda), por `classe|idioma`: a verdade para o teste. */
  cruas: Map<string, number[]>
}

/** `falas` falas de `classe` x `idioma`, repartidas em lotes de até 200 (o teto do recebimento). */
export function simularCelula(
  classe: string,
  idioma: string,
  falas: number,
  semente: number,
  perfil = PERFIS_SINTETICOS[classe]!,
): Simulacao {
  const r = aleatorio(semente)
  const lotes: LoteSintetico[] = []
  const cruas: number[] = []
  let restante = falas
  while (restante > 0) {
    const n = Math.min(200, restante)
    restante -= n
    const baldes = Array.from({ length: N_BALDES_DA_LATENCIA }, () => 0)
    let falhas = 0
    for (let k = 0; k < n; k++) {
      if (r() < perfil.taxaDeFalha) {
        falhas++
        continue
      }
      const ms = perfil.medianaMs * Math.exp(perfil.sigma * normal(r))
      cruas.push(ms)
      baldes[baldeDe(ms)]!++
    }
    lotes.push({ v: 2, classe, fimDaFalaAteLegenda: { idioma, baldes, n, falhas, semTraducao: 0 } })
  }
  return { lotes, cruas: new Map([[`${classe}|${idioma}`, cruas]]) }
}

/** Quantil exato (posto mais próximo, por cima) das observações cruas. */
export function quantilExato(valores: readonly number[], q: number): number {
  const o = [...valores].sort((a, b) => a - b)
  return o[Math.min(o.length - 1, Math.max(0, Math.ceil(q * o.length) - 1))]!
}
