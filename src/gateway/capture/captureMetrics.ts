/**
 * Observabilidade da captura de áudio. Registra o ciclo de vida de cada enunciado
 * (início da fala → 1º parcial → fim da fala → decode final) num ring buffer exposto
 * em `window.__capMetrics()` / `window.__capSummary()`.
 *
 * Serve para MEDIR onde o tempo é gasto (o que o usuário sente como "lento / fora de
 * ordem") e para inspecionar via chrome-devtools MCP durante uma sessão real, já que
 * getDisplayMedia + áudio real não roda em navegador headless.
 */

export type CapSource = 'mic' | 'system'

export interface UtteranceMetric {
  seq: number
  source: CapSource
  /** performance.now() de cada estágio (ms desde a origem do timing). */
  tSpeechStart: number
  tFirstPartial?: number
  tSpeechEnd?: number
  tFinalDone?: number
  /** Duração do decode FINAL do Whisper (ms). */
  decodeMs?: number
  /** Duração do áudio do enunciado (ms) — para calcular o RTF (decodeMs/audioMs). */
  audioMs?: number
  /** Quantos partials chegaram a exibir para este enunciado. */
  partialCount: number
  /** Enunciados pendentes no worker no momento do final (profundidade de fila). */
  queueDepth?: number
  /** Algum parcial foi PULADO por worker ocupado (sinal de saturação). */
  saturated?: boolean
  text?: string
}

const RING_MAX = 200

// Enunciados em andamento (ainda sem final), por seq.
const inflight = new Map<number, UtteranceMetric>()
// Enunciados concluídos (ring buffer).
const ring: UtteranceMetric[] = []
// Amostras de latência de TRADUÇÃO (ms) por engine — mede o custo da MT isoladamente.
const mtSamples: { ms: number; engine: string }[] = []

const nowMs = (): number =>
  typeof performance !== 'undefined' ? performance.now() : 0

function pushRing(m: UtteranceMetric): void {
  ring.push(m)
  if (ring.length > RING_MAX) ring.shift()
}

export const capMetrics = {
  /** Início de fala detectado (VAD onSpeechStart). */
  start(seq: number, source: CapSource): void {
    inflight.set(seq, { seq, source, tSpeechStart: nowMs(), partialCount: 0 })
  },

  /** Um parcial foi exibido (transcrição incremental). */
  partial(seq: number): void {
    const m = inflight.get(seq)
    if (!m) return
    if (m.tFirstPartial === undefined) m.tFirstPartial = nowMs()
    m.partialCount++
  },

  /** Um parcial foi PULADO porque o worker estava ocupado (saturação). */
  saturated(seq: number): void {
    const m = inflight.get(seq)
    if (m) m.saturated = true
  },

  /** Fim de fala detectado (VAD onSpeechEnd) — antes do decode final. */
  speechEnd(seq: number): void {
    const m = inflight.get(seq)
    if (m) m.tSpeechEnd = nowMs()
  },

  /** Decode final concluído — encerra o enunciado e o move para o ring. */
  final(seq: number, info: { decodeMs?: number; queueDepth?: number; text?: string; audioMs?: number }): void {
    const m = inflight.get(seq)
    if (!m) return
    m.tFinalDone = nowMs()
    m.decodeMs = info.decodeMs
    m.queueDepth = info.queueDepth
    m.text = info.text
    m.audioMs = info.audioMs
    inflight.delete(seq)
    pushRing(m)
  },

  /** Registra a latência de uma tradução (ms) + engine que a atendeu. */
  mt(ms: number, engine: string): void {
    mtSamples.push({ ms, engine })
    if (mtSamples.length > RING_MAX) mtSamples.shift()
  },

  /** Enunciado descartado (vazio/misfire) — remove sem registrar. */
  drop(seq: number): void {
    inflight.delete(seq)
  },

  /** Zera tudo (chamado no START de uma nova gravação). */
  reset(): void {
    inflight.clear()
    ring.length = 0
    mtSamples.length = 0
  },

  /** Snapshot: concluídos + em andamento, em ordem de seq. */
  all(): UtteranceMetric[] {
    return [...ring, ...inflight.values()].sort((a, b) => a.seq - b.seq)
  },

  /** Agregados p/ benchmark: latências (p50/p95), RTF, TTFT, MT, saturação, ordem. */
  summary() {
    const done = ring.filter((m) => m.tFinalDone !== undefined)
    const avg = (xs: number[]): number =>
      xs.length ? Math.round(xs.reduce((s, x) => s + x, 0) / xs.length) : 0
    const pct = (xs: number[], p: number): number => {
      if (!xs.length) return 0
      const s = [...xs].sort((a, b) => a - b)
      return Math.round(s[Math.min(s.length - 1, Math.floor((p / 100) * s.length))])
    }
    const stat = (xs: number[]) => ({ p50: pct(xs, 50), p95: pct(xs, 95), avg: avg(xs) })

    // TTFT = tempo até o 1º texto na tela (parcial); latência final = fim-da-fala → texto final.
    const firstPartial = done.filter((m) => m.tFirstPartial !== undefined).map((m) => m.tFirstPartial! - m.tSpeechStart)
    const finalLatency = done.filter((m) => m.tSpeechEnd !== undefined && m.tFinalDone !== undefined).map((m) => m.tFinalDone! - m.tSpeechEnd!)
    const decode = done.map((m) => m.decodeMs ?? 0).filter(Boolean)
    // RTF = compute / duração do áudio. < 1 = acompanha o tempo real.
    const rtf = done.filter((m) => m.decodeMs && m.audioMs).map((m) => m.decodeMs! / m.audioMs!)
    const rtfStat = { p50: pct(rtf.map((x) => x * 1000), 50) / 1000, p95: pct(rtf.map((x) => x * 1000), 95) / 1000 }
    const mt = mtSamples.map((s) => s.ms)

    const seqs = done.map((m) => m.seq)
    const inOrder = seqs.every((s, i) => i === 0 || s > seqs[i - 1])
    return {
      count: done.length,
      ttftMs: stat(firstPartial),        // time-to-first-token (parcial visível)
      finalLatencyMs: stat(finalLatency), // fim da fala → texto final
      decodeMs: stat(decode),
      rtf: rtfStat,                       // < 1 = acompanha tempo real
      mtLatencyMs: mt.length ? { ...stat(mt), engines: [...new Set(mtSamples.map((s) => s.engine))] } : null,
      maxQueueDepth: done.reduce((mx, m) => Math.max(mx, m.queueDepth ?? 0), 0),
      saturatedCount: done.filter((m) => m.saturated).length,
      partialsShown: done.filter((m) => m.partialCount > 0).length,
      renderedInSeqOrder: inOrder,
    }
  },
}

// Ganchos de console para inspeção manual e via chrome-devtools MCP (evaluate_script).
if (typeof window !== 'undefined') {
  ;(window as any).__capMetrics = () => capMetrics.all()
  ;(window as any).__capSummary = () => capMetrics.summary()
  ;(window as any).__capReset = () => capMetrics.reset()
}
