/**
 * AS CONTAS PURAS DA AUDITORIA DE TELAS (26/09/2026) — separadas dos scripts que sobem servidor e
 * navegador para o teste (`tests/perf-telas.test.ts`) exercitá-las sem nada disso.
 */
import path from 'node:path'
import { fileURLToPath } from 'node:url'

/** Mediana de números finitos (ignora nulos); `null` se não houver nenhum. */
export function mediana(xs) {
  const o = xs.filter((x) => typeof x === 'number' && Number.isFinite(x)).sort((a, b) => a - b)
  if (!o.length) return null
  const meio = Math.floor(o.length / 2)
  return o.length % 2 ? o[meio] : (o[meio - 1] + o[meio]) / 2
}

export const r1 = (x) => (x === null || x === undefined ? null : Math.round(x * 10) / 10)

/**
 * Quadros amostrados por `requestAnimationFrame` (carimbos em ms) → FPS, quantos intervalos
 * passaram de 33,4 ms (um quadro perdido a 30 fps: "jank") e o p95 do intervalo.
 */
export function resumirQuadros(ts) {
  if (!ts || ts.length < 2) return { fps: null, jank: null, p95Ms: null }
  const d = ts.slice(1).map((t, i) => t - ts[i])
  const o = [...d].sort((a, b) => a - b)
  const dur = (ts.at(-1) - ts[0]) / 1000
  return { fps: r1(d.length / dur), jank: d.filter((x) => x > 33.4).length, p95Ms: r1(o[Math.floor(o.length * 0.95)]) }
}

/**
 * INP de uma lista de entradas `event` (Event Timing): a duração de cada INTERAÇÃO é a maior
 * entrada com o mesmo `interactionId`; o INP é a pior interação (com menos de 50 interações o p98
 * do INP é o máximo). Entradas sem `interactionId` (hover, rolagem) não são interação.
 */
export function inpDe(entradas) {
  const porId = new Map()
  for (const e of entradas) {
    if (!e.interactionId) continue
    porId.set(e.interactionId, Math.max(porId.get(e.interactionId) ?? 0, e.duration))
  }
  const d = [...porId.values()]
  return { interacoes: d.length, inp: d.length ? Math.max(...d) : null, mediana: mediana(d) }
}

/** "Tempo bloqueado" de tarefas longas: Σ(duração − 50 ms). */
export const tbtDe = (longas) => longas.reduce((a, x) => a + Math.max(0, x.d - 50), 0)

/** "antes → depois (Δ%)" para a tabela do relatório. */
export function celula(x, y) {
  if (x === null || x === undefined || y === null || y === undefined) return `${x ?? '—'} → ${y ?? '—'}`
  if (x === 0) return `${x} → ${y}`
  const d = Math.round(((y - x) / Math.abs(x)) * 100)
  return `${x} → ${y} (${d > 0 ? '+' : ''}${d}%)`
}

/** Nome estável de um módulo do bundle: `node_modules/pacote` ou o caminho relativo à raiz. */
export function nomeDoModulo(id, raiz) {
  const limpo = id.replace(/\0/g, '').replace(/\?.*$/, '').replace(/\\/g, '/')
  const nm = /node_modules\/((?:@[^/]+\/)?[^/]+)/.exec(limpo)
  if (nm) return `node_modules/${nm[1]}`
  const r = raiz.replace(/\\/g, '/')
  return limpo.startsWith(r) ? limpo.slice(r.length + 1) : limpo
}

/**
 * Resumo de um trace do Chrome: na thread principal do renderizador (`CrRendererMain`), o tempo
 * dos filhos DIRETOS de cada tarefa, somado por nome e dado em ms por segundo de relógio, e as
 * tarefas longas (> 50 ms).
 */
export function resumirTrace(eventos) {
  const principal = eventos.find((e) => e.ph === 'M' && e.name === 'thread_name' && e.args?.name === 'CrRendererMain')
  if (!principal) return null
  const daThread = eventos
    .filter((e) => e.pid === principal.pid && e.tid === principal.tid && e.ph === 'X' && typeof e.dur === 'number')
    .sort((a, b) => a.ts - b.ts)
  if (!daThread.length) return null
  const ehTarefa = (e) => e.name === 'RunTask' || e.name === 'ThreadControllerImpl::RunTask'
  const tarefas = daThread.filter(ehTarefa)
  const inicio = daThread[0].ts
  const fim = Math.max(...daThread.map((e) => e.ts + e.dur))
  const porNome = {}
  let longas = 0
  let longasMs = 0
  let j = 0
  for (const t of tarefas) {
    if (t.dur > 50_000) {
      longas++
      longasMs += t.dur / 1000
    }
    const fimT = t.ts + t.dur
    while (j < daThread.length && daThread[j].ts < t.ts) j++
    let cursor = t.ts
    for (let k = j; k < daThread.length && daThread[k].ts < fimT; k++) {
      const e = daThread[k]
      if (e === t || ehTarefa(e) || e.ts < cursor || e.ts + e.dur > fimT) continue
      porNome[e.name] = (porNome[e.name] ?? 0) + e.dur / 1000
      cursor = e.ts + e.dur
    }
  }
  const segs = (fim - inicio) / 1e6
  const ocupado = tarefas.reduce((a, t) => a + t.dur / 1000, 0)
  return {
    segundos: r1(segs),
    ocupadoMsPorS: Math.round(ocupado / segs),
    longas,
    longasMs: Math.round(longasMs),
    top: Object.entries(porNome)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 14)
      .map(([nome, ms]) => ({ nome, msPorS: r1(ms / segs) })),
  }
}

/** `true` quando o módulo foi executado direto (`node arquivo.mjs`), e não importado. */
export const executadoDireto = (url) =>
  !!process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(url)
