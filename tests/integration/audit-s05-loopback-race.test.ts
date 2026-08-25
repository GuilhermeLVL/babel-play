/**
 * CARACTERIZAÇÃO + REGRESSÃO — S-05 (Alto): race na exclusão do loopback WASAPI.
 *
 * Achado da auditoria 2026-08 (audit-security.md S-05), confirmado por PoC real (6 capturas
 * iniciadas, 4 encerradas → 2 órfãs). O `server/audio/loopback.ts` depende do módulo nativo WASAPI
 * (Windows) e de timing, então a exclusão foi EXTRAÍDA para `server/audio/loopbackExclusion.ts`
 * (contador de geração) — código de produção puro, testável de forma determinística com o
 * interleaving da race FORÇADO.
 *
 * Teste 1: o modelo da abordagem ANTIGA (por referência) reproduz o vazamento — documenta o defeito.
 * Teste 2: a `LoopbackExclusion` REAL (geração), sob o MESMO interleaving, não deixa órfã.
 *   → Antes da correção este arquivo tinha um `it.fails` sobre o modelo; agora o DESEJADO roda contra
 *     o código de produção real e passa por mérito (a asserção "sem órfã" é a mesma).
 */
import { describe, it, expect } from 'vitest'
import { LoopbackExclusion } from '../../server/audio/loopbackExclusion'

const deferred = () => {
  let resolve!: () => void
  const promise = new Promise<void>((r) => { resolve = r })
  return { promise, resolve }
}

/** Modelo da abordagem ANTIGA de loopback.ts (exclusão por referência + await no meio). */
class LoopbackAtual {
  activeStop: (() => void) | null = null
  started = 0
  stopped = 0
  async abrir(gate: Promise<void>): Promise<() => void> {
    if (this.activeStop) { try { this.activeStop() } catch { /* já morta */ } this.activeStop = null; await gate }
    this.started++
    const stop = () => { if (this.activeStop !== stop) return; this.activeStop = null; this.stopped++ }
    this.activeStop = stop
    return stop
  }
}

/** Modela o fluxo de loopback.ts usando a EXCLUSÃO REAL (geração) + capturas falsas. */
async function abrirReal(
  ex: LoopbackExclusion,
  gate: Promise<void>,
  captures: Array<{ stopped: boolean }>,
) {
  const { gen, superseded } = ex.supersede()
  if (superseded) {
    await gate
    if (!ex.stillOwner(gen)) return { started: false as const, gen } // superado durante o respiro → aborta
  }
  const cap = { stopped: false }
  captures.push(cap)
  const stopThis = () => { cap.stopped = true }
  ex.activate(gen, stopThis)
  const cleanup = () => { if (!ex.stillOwner(gen)) return; ex.deactivate(gen); stopThis() }
  return { started: true as const, gen, cap, cleanup }
}

describe('S-05 — race na exclusão do loopback', () => {
  it('a abordagem ANTIGA (por referência) deixava captura órfã sob a race (started > stopped)', async () => {
    const m = new LoopbackAtual()
    const stop1 = await m.abrir(Promise.resolve())
    const g2 = deferred()
    const h2 = m.abrir(g2.promise)
    await Promise.resolve()
    const stop3 = await m.abrir(Promise.resolve())
    g2.resolve()
    const stop2 = await h2
    stop3(); stop2(); void stop1
    // 3 iniciadas, mas uma fica órfã → stopped < started. É o defeito que a extração corrige.
    expect(m.started).toBe(3)
    expect(m.stopped).toBeLessThan(m.started)
  })

  it('CORRIGIDO (S-05): a LoopbackExclusion real (geração) não deixa NENHUMA captura órfã', async () => {
    const ex = new LoopbackExclusion()
    const caps: Array<{ stopped: boolean }> = []

    // Mesmo interleaving da race: R1 ativa; R2 faz takeover e PENDURA no respiro; R3 entra na janela;
    // R2 acorda e descobre que foi superado.
    await abrirReal(ex, Promise.resolve(), caps)      // R1
    const g2 = deferred()
    const r2 = abrirReal(ex, g2.promise, caps)        // R2 — vai pendurar no respiro
    await Promise.resolve()                            // deixa R2 chegar ao await com o slot livre
    const r3 = await abrirReal(ex, Promise.resolve(), caps) // R3 — entra na janela e assume
    g2.resolve()
    const r2done = await r2

    // R2 foi superado por R3 → NÃO iniciou captura (era o que orfanava a de R3 na versão antiga).
    expect(r2done.started).toBe(false)
    // Só R1 e R3 iniciaram capturas.
    expect(caps.length).toBe(2)

    // R3 encerra normalmente.
    if (r3.started) r3.cleanup()

    // INVARIANTE: toda captura iniciada foi parada — nenhuma órfã.
    expect(caps.every((c) => c.stopped)).toBe(true)
  })

  it('takeover normal (sequencial) para a captura anterior e mantém só a mais nova ativa', async () => {
    const ex = new LoopbackExclusion()
    const caps: Array<{ stopped: boolean }> = []
    const a = await abrirReal(ex, Promise.resolve(), caps)
    const b = await abrirReal(ex, Promise.resolve(), caps) // takeover de A (para A na hora)
    expect(caps[0].stopped).toBe(true)   // A parada pelo takeover
    expect(caps[1].stopped).toBe(false)  // B ativa
    expect(ex.currentGen).toBe(b.started ? b.gen : null)
    if (b.started) b.cleanup()
    expect(caps.every((c) => c.stopped)).toBe(true)
    void a
  })
})
