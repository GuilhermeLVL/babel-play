/**
 * MICROBENCHMARK DO APARELHO — WebGPU × CPU (WASM/JS) numa multiplicação de matrizes fixa, ≤ 3 s,
 * num worker, cancelável. A pontuação é RELATIVA (GFLOP/s de um núcleo de matmul, não RTF de modelo):
 * serve para comparar os dois motores NESTE aparelho, e o desenho deixa trocar o núcleo por uma
 * rodada curta do encoder de verdade depois (harness adaptativo §2).
 */
import { describe, expect, it, vi } from 'vitest'

import {
  medirBenchmark,
  type MensagemDoBenchmark,
  pontuarBenchmark,
  type WorkerDoBenchmark,
} from '../src/lib/dispositivo/benchmark'
import { executarBenchmark, matmulCpu, medirCpu } from '../src/lib/dispositivo/benchmark.worker'

describe('pontuarBenchmark (pura)', () => {
  it('mediana em GFLOP/s por motor e o melhor dos dois', () => {
    const p = pontuarBenchmark(
      [
        { backend: 'wasm', flops: 1e9, ms: 1000 }, // 1
        { backend: 'wasm', flops: 3e9, ms: 1000 }, // 3
        { backend: 'wasm', flops: 2e9, ms: 1000 }, // 2
        { backend: 'webgpu', flops: 50e9, ms: 1000 },
      ],
      123,
      800,
    )
    expect(p).toEqual({ pontuacaoWasm: 2, pontuacaoWebgpu: 50, melhor: 'webgpu', medidoEm: 123, duracaoMs: 800 })
  })

  it('WebGPU mais lento que a CPU (acontece com Whisper, pela literatura): melhor = wasm', () => {
    const p = pontuarBenchmark(
      [
        { backend: 'wasm', flops: 4e9, ms: 1000 },
        { backend: 'webgpu', flops: 1e9, ms: 1000 },
      ],
      0,
      0,
    )
    expect(p.melhor).toBe('wasm')
  })

  it('amostras inválidas (ms 0, NaN, negativas) são descartadas; sem nenhuma: null', () => {
    const p = pontuarBenchmark(
      [
        { backend: 'wasm', flops: 1e9, ms: 0 },
        { backend: 'webgpu', flops: Number.NaN, ms: 10 },
        { backend: 'webgpu', flops: -1, ms: 10 },
      ],
      0,
      0,
    )
    expect(p).toMatchObject({ pontuacaoWasm: null, pontuacaoWebgpu: null, melhor: null })
  })
})

describe('núcleo da CPU (worker)', () => {
  it('matmulCpu multiplica certo (2×2)', () => {
    const c = new Float32Array(4)
    matmulCpu(2, new Float32Array([1, 2, 3, 4]), new Float32Array([5, 6, 7, 8]), c)
    expect(Array.from(c)).toEqual([19, 22, 43, 50])
  })

  it('medirCpu respeita o orçamento e conta 2·n³ flops por multiplicação', () => {
    let t = 0
    const agora = () => (t += 10) // cada leitura do relógio avança 10 ms
    const amostras = medirCpu(50, agora, 4)
    expect(amostras.length).toBeGreaterThan(0)
    for (const a of amostras) {
      expect(a.backend).toBe('wasm')
      expect(a.flops % (2 * 4 ** 3)).toBe(0)
      expect(a.ms).toBeGreaterThan(0)
    }
  })

  it('sem WebGPU no worker: só amostras de CPU, e o fim é sempre avisado', async () => {
    const enviadas: MensagemDoBenchmark[] = []
    let t = 0
    await executarBenchmark(
      60,
      (m) => enviadas.push(m),
      { navigator: {} },
      () => (t += 5),
    )
    expect(enviadas.at(-1)).toEqual({ tipo: 'fim' })
    const amostras = enviadas.filter((m) => m.tipo === 'amostra')
    expect(amostras.length).toBeGreaterThan(0)
    expect(amostras.every((m) => m.tipo === 'amostra' && m.amostra.backend === 'wasm')).toBe(true)
  })

  it('requestAdapter que lança não derruba o benchmark', async () => {
    const enviadas: MensagemDoBenchmark[] = []
    let t = 0
    const escopo = {
      navigator: {
        gpu: {
          requestAdapter: async () => {
            throw new Error('x')
          },
        },
      },
    }
    await executarBenchmark(
      40,
      (m) => enviadas.push(m),
      escopo,
      () => (t += 5),
    )
    expect(enviadas.at(-1)).toEqual({ tipo: 'fim' })
  })
})

/** Worker falso: responde o que o teste mandar e registra se foi encerrado. */
function workerFalso(roteiro: (w: WorkerDoBenchmark) => void) {
  const w: WorkerDoBenchmark & { encerrado: boolean } = {
    encerrado: false,
    onmessage: null,
    onerror: null,
    postMessage: () => queueMicrotask(() => roteiro(w)),
    terminate: () => {
      w.encerrado = true
    },
  }
  return w
}

const fala = (w: WorkerDoBenchmark, m: MensagemDoBenchmark) => w.onmessage?.({ data: m } as MessageEvent)

describe('medirBenchmark (orquestração no thread principal)', () => {
  it('junta as amostras até o fim e encerra o worker', async () => {
    const w = workerFalso((w) => {
      fala(w, { tipo: 'amostra', amostra: { backend: 'wasm', flops: 2e9, ms: 1000 } })
      fala(w, { tipo: 'amostra', amostra: { backend: 'webgpu', flops: 8e9, ms: 1000 } })
      fala(w, { tipo: 'fim' })
    })
    const p = await medirBenchmark({ criarWorker: () => w, agora: () => 0 })
    expect(p).toMatchObject({ pontuacaoWasm: 2, pontuacaoWebgpu: 8, melhor: 'webgpu' })
    expect(w.encerrado).toBe(true)
  })

  it('estourou o prazo: encerra o worker e pontua o que chegou', async () => {
    vi.useFakeTimers()
    const w = workerFalso((w) => fala(w, { tipo: 'amostra', amostra: { backend: 'wasm', flops: 1e9, ms: 1000 } }))
    const r = medirBenchmark({ criarWorker: () => w, prazoMs: 100, agora: () => 0 })
    await vi.advanceTimersByTimeAsync(101)
    expect(await r).toMatchObject({ pontuacaoWasm: 1, pontuacaoWebgpu: null, melhor: 'wasm' })
    expect(w.encerrado).toBe(true)
    vi.useRealTimers()
  })

  it('abortado (a captura começou a carregar modelo): null e worker encerrado', async () => {
    const ctl = new AbortController()
    const w = workerFalso(() => ctl.abort())
    expect(await medirBenchmark({ criarWorker: () => w, sinal: ctl.signal, agora: () => 0 })).toBeNull()
    expect(w.encerrado).toBe(true)
  })

  it('já abortado antes de começar: nem cria o worker', async () => {
    const ctl = new AbortController()
    ctl.abort()
    const criar = vi.fn()
    expect(await medirBenchmark({ criarWorker: criar, sinal: ctl.signal })).toBeNull()
    expect(criar).not.toHaveBeenCalled()
  })

  it('sem Worker (ou construtor que lança): null', async () => {
    expect(
      await medirBenchmark({
        criarWorker: () => {
          throw new Error('CSP')
        },
      }),
    ).toBeNull()
  })
})
