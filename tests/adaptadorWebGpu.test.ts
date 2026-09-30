/**
 * ROTEAR PELO ADAPTADOR REAL, NÃO POR `!!navigator.gpu` (auditoria de latência 2026-09-26, P0).
 *
 * O caso medido: headless desta máquina tinha `navigator.gpu`, mas `requestAdapter()` devolvia
 * `null`. O roteador escolhia o small no WebGPU e a captura nunca mostrava legenda.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import {
  esquecerAdaptadorWebGpu,
  extrairInfoDoAdaptador,
  infoDoAdaptadorWebGpu,
  temAdaptadorWebGpu,
  webGpuProvavel,
} from '../src/gateway/adaptadorWebGpu'

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

  /* ROTA HONESTA DO SMALL (plano "Grátis sem travar", A4): o adaptador de RESERVA (SwiftShader,
     rasterizador em software) existe, mas não é GPU — o Whisper nele é mais lento que no WASM. */
  it('adaptador de reserva (software, `info.isFallbackAdapter`): conta como SEM GPU', async () => {
    comGpu(async () => ({ info: { vendor: 'google', architecture: 'swiftshader', isFallbackAdapter: true } }))
    expect(await temAdaptadorWebGpu()).toBe(false)
    expect(webGpuProvavel()).toBe(false)
  })

  it('o campo antigo (`adapter.isFallbackAdapter`, Chrome < 136) também', async () => {
    comGpu(async () => ({ isFallbackAdapter: true }))
    expect(await temAdaptadorWebGpu()).toBe(false)
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

describe('infoDoAdaptadorWebGpu (sinais da sonda: shader-f16 e limites)', () => {
  it('lê shader-f16, limites e fornecedor do MESMO adaptador (uma pergunta só)', async () => {
    const pedir = vi.fn(async () => ({
      features: new Set(['shader-f16', 'timestamp-query']),
      limits: { maxStorageBufferBindingSize: 2147483644, maxBufferSize: 4294967296 },
      info: { vendor: 'amd', architecture: 'rdna-2' },
    }))
    comGpu(pedir)
    expect(await temAdaptadorWebGpu()).toBe(true)
    expect(await infoDoAdaptadorWebGpu()).toEqual({
      shaderF16: true,
      limites: { maxStorageBufferBindingSize: 2147483644, maxBufferSize: 4294967296 },
      fornecedor: 'amd',
      arquitetura: 'rdna-2',
      reserva: false,
    })
    expect(pedir).toHaveBeenCalledTimes(1)
  })

  it('sem adaptador: null', async () => {
    comGpu(async () => null)
    expect(await infoDoAdaptadorWebGpu()).toBeNull()
  })

  it('adaptador de reserva: a sonda ainda o lê (reserva: true; o fornecedor entra na impressão)', async () => {
    comGpu(async () => ({ info: { vendor: 'google', architecture: 'swiftshader', isFallbackAdapter: true } }))
    expect(await infoDoAdaptadorWebGpu()).toMatchObject({
      reserva: true,
      fornecedor: 'google',
      arquitetura: 'swiftshader',
    })
  })
})

describe('extrairInfoDoAdaptador (pura)', () => {
  it('adaptador sem features/limits/info: tudo desconhecido, nunca lança', () => {
    expect(extrairInfoDoAdaptador({})).toEqual({
      shaderF16: false,
      limites: null,
      fornecedor: '',
      arquitetura: '',
      reserva: false,
    })
  })

  it('limites não numéricos viram null', () => {
    expect(
      extrairInfoDoAdaptador({ limits: { maxStorageBufferBindingSize: 'x', maxBufferSize: 10 } }).limites,
    ).toBeNull()
  })

  it('adaptador de RESERVA (software): `info.isFallbackAdapter` ou o campo antigo no adaptador', () => {
    expect(extrairInfoDoAdaptador({ info: { isFallbackAdapter: true } }).reserva).toBe(true)
    expect(extrairInfoDoAdaptador({ isFallbackAdapter: true }).reserva).toBe(true)
    expect(extrairInfoDoAdaptador({ info: { isFallbackAdapter: false } }).reserva).toBe(false)
  })

  it('getter que lança não derruba a leitura', () => {
    const a = {
      get features(): never {
        throw new Error('perdido')
      },
    }
    expect(extrairInfoDoAdaptador(a).shaderF16).toBe(false)
  })
})
