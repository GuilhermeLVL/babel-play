/**
 * ROTEAR PELO ADAPTADOR REAL, NÃO POR `!!navigator.gpu` (auditoria de latência 2026-09-26, P0).
 *
 * O caso medido: headless desta máquina tinha `navigator.gpu`, mas `requestAdapter()` devolvia
 * `null`. O roteador escolhia o small no WebGPU e a captura nunca mostrava legenda.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { esquecerAdaptadorWebGpu, temAdaptadorWebGpu, webGpuProvavel } from '../src/gateway/adaptadorWebGpu'

const comGpu = (requestAdapter: () => Promise<unknown>) =>
  vi.stubGlobal('navigator', { ...globalThis.navigator, gpu: { requestAdapter } })

beforeEach(() => esquecerAdaptadorWebGpu())
afterEach(() => {
  vi.unstubAllGlobals()
  vi.useRealTimers()
})

describe('temAdaptadorWebGpu', () => {
  it('navigator.gpu presente mas SEM adaptador (headless): false', async () => {
    comGpu(async () => null)
    expect(await temAdaptadorWebGpu()).toBe(false)
  })

  it('com adaptador: true', async () => {
    comGpu(async () => ({ info: { vendor: 'amd' } }))
    expect(await temAdaptadorWebGpu()).toBe(true)
  })

  it('sem a API: false, sem perguntar nada', async () => {
    vi.stubGlobal('navigator', { ...globalThis.navigator, gpu: undefined })
    expect(await temAdaptadorWebGpu()).toBe(false)
  })

  it('requestAdapter que lança: false (nunca propaga)', async () => {
    comGpu(async () => {
      throw new Error('GPU process crashed')
    })
    expect(await temAdaptadorWebGpu()).toBe(false)
  })

  it('requestAdapter que não responde: false no prazo', async () => {
    vi.useFakeTimers()
    comGpu(() => new Promise(() => {}))
    const r = temAdaptadorWebGpu(300)
    await vi.advanceTimersByTimeAsync(301)
    expect(await r).toBe(false)
  })

  it('pergunta UMA vez e guarda a resposta', async () => {
    const pedir = vi.fn(async () => ({}))
    comGpu(pedir)
    await temAdaptadorWebGpu()
    await temAdaptadorWebGpu()
    expect(pedir).toHaveBeenCalledTimes(1)
  })
})

describe('webGpuProvavel (rótulos síncronos)', () => {
  it('antes da resposta: a presença da API; depois: a medida', async () => {
    comGpu(async () => null)
    expect(webGpuProvavel()).toBe(true) // ainda não sabe: otimista, e dispara a pergunta
    await temAdaptadorWebGpu()
    expect(webGpuProvavel()).toBe(false)
  })
})
