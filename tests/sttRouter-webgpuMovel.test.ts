/**
 * WEBGPU NO QUEST E NO CELULAR — só quando é DE VERDADE (Quest real lento, 2026-09-28).
 *
 * Antes, todo aparelho fora do desktop ia de base q8 no WASM, mesmo com GPU: os campos da sonda
 * (adaptador real, shader-f16, microbenchmark) viajavam com a rota e ninguém os lia. Agora o Whisper
 * vai à GPU quando (1) o `requestAdapter()` entregou um adaptador que NÃO é o de reserva (software),
 * (2) a GPU não caiu antes neste aparelho, e (3) o microbenchmark guardado mediu a GPU pelo menos
 * 1,5× mais rápida que a CPU. O dtype é o que roda bem na GPU: `hybrid-fp16` com shader-f16,
 * `hybrid` sem. Faltou qualquer um dos três: fica o base q8 no WASM de antes.
 */
import { describe, expect, it } from 'vitest'

import {
  type DispositivoDaRota,
  MARGEM_DA_GPU,
  outroBackend,
  routeStt,
  tamanhoDoDownloadMb,
  usarGpuNoAparelho,
  WHISPER_MODELS,
} from '../src/gateway/sttRouter'

const base = {
  contentLang: 'pt',
  autoDetect: false,
  quality: 'auto' as const,
  hasWebGpu: true,
  cloudAvailable: false,
  profileId: 'free-web',
}

const questComGpu: DispositivoDaRota = {
  tipo: 'quest',
  permiteSmall: false,
  economiaDeDados: false,
  adaptadorReal: true,
  shaderF16: true,
  pontuacaoWasm: 2,
  pontuacaoWebgpu: 20,
}

describe('usarGpuNoAparelho (pura)', () => {
  it('adaptador real + benchmark ≥ 1,5× → GPU', () => {
    expect(MARGEM_DA_GPU).toBe(1.5)
    expect(usarGpuNoAparelho(questComGpu, true)).toBe(true)
    expect(usarGpuNoAparelho({ ...questComGpu, pontuacaoWasm: 10, pontuacaoWebgpu: 15 }, true)).toBe(true)
  })

  it.each([
    ['sem adaptador na medida', { ...questComGpu }, false],
    ['adaptador de reserva (software)', { ...questComGpu, adaptadorReal: false }, true],
    ['sonda sem info do adaptador', { ...questComGpu, adaptadorReal: undefined }, true],
    ['GPU já caiu neste aparelho', { ...questComGpu, gpuCaiu: true }, true],
    ['sem benchmark', { ...questComGpu, pontuacaoWasm: null, pontuacaoWebgpu: null }, true],
    ['GPU abaixo da margem', { ...questComGpu, pontuacaoWasm: 10, pontuacaoWebgpu: 14.9 }, true],
    ['GPU mais lenta', { ...questComGpu, pontuacaoWasm: 10, pontuacaoWebgpu: 3 }, true],
    ['economia de dados', { ...questComGpu, economiaDeDados: true }, true],
  ])('%s → WASM', (_n, d, temGpu) => {
    expect(usarGpuNoAparelho(d as DispositivoDaRota, temGpu as boolean)).toBe(false)
  })
})

describe('routeStt no Quest/celular com GPU de verdade', () => {
  it('português: base no WebGPU em hybrid-fp16 (shader-f16), não o q8', () => {
    const r = routeStt({ ...base, dispositivo: questComGpu })
    expect(r).toMatchObject({ localModel: WHISPER_MODELS.base, dtype: 'hybrid-fp16', device: 'webgpu' })
    expect(r.label).toMatch(/GPU/)
    expect(tamanhoDoDownloadMb(r.localModel, r.dtype)).toBe(168)
  })

  it('sem shader-f16: hybrid (encoder fp32)', () => {
    const r = routeStt({ ...base, dispositivo: { ...questComGpu, shaderF16: false, tipo: 'celular-bom' } })
    expect(r).toMatchObject({ localModel: WHISPER_MODELS.base, dtype: 'hybrid', device: 'webgpu' })
  })

  it('o small continua fora do móvel mesmo com GPU', () => {
    const r = routeStt({ ...base, quality: 'accurate', dispositivo: questComGpu })
    expect(r.localModel).toBe(WHISPER_MODELS.base)
  })

  it('benchmark sem vantagem: o base q8 no WASM de antes', () => {
    const r = routeStt({ ...base, dispositivo: { ...questComGpu, pontuacaoWebgpu: 2.5 } })
    expect(r).toMatchObject({ localModel: WHISPER_MODELS.base, dtype: 'q8', device: 'wasm' })
  })

  it('a reserva local da nuvem também vai à GPU', () => {
    const r = routeStt({ ...base, cloudAvailable: true, dispositivo: questComGpu })
    expect(r).toMatchObject({ preferCloud: true, dtype: 'hybrid-fp16', device: 'webgpu' })
  })

  it('desktop fica como estava (auto, sem device forçado)', () => {
    const r = routeStt({
      ...base,
      dispositivo: { ...questComGpu, tipo: 'desktop-com-gpu', permiteSmall: true },
    })
    expect(r).toMatchObject({ localModel: WHISPER_MODELS.small, dtype: 'hybrid' })
    expect(r.device).toBeUndefined()
  })
})

describe('outroBackend (a troca que o regulador pode fazer)', () => {
  it('no WASM, a GPU medida mais rápida é o outro backend', () => {
    const d = { ...questComGpu, pontuacaoWebgpu: 2.5 } // abaixo da margem: a rota ficou no WASM
    const r = routeStt({ ...base, dispositivo: d })
    expect(outroBackend(r, d, true)).toEqual({ device: 'webgpu', dtype: 'hybrid-fp16' })
  })

  it('na GPU, o WASM medido mais rápido é o outro (q8 no móvel)', () => {
    const d = { ...questComGpu, pontuacaoWasm: 30, pontuacaoWebgpu: 20 }
    const r = {
      localModel: WHISPER_MODELS.base,
      preferCloud: false,
      label: '',
      dtype: 'hybrid' as const,
      device: 'webgpu' as const,
    }
    expect(outroBackend(r, d, true)).toEqual({ device: 'wasm', dtype: 'q8' })
  })

  it('sem benchmark, sem adaptador real, GPU que caiu ou Moonshine: nenhum', () => {
    const r = routeStt({ ...base, dispositivo: { ...questComGpu, pontuacaoWebgpu: 2.5 } })
    expect(outroBackend(r, { ...questComGpu, pontuacaoWasm: null, pontuacaoWebgpu: null }, true)).toBeNull()
    expect(outroBackend(r, { ...questComGpu, pontuacaoWebgpu: 2.5, adaptadorReal: false }, true)).toBeNull()
    expect(outroBackend(r, { ...questComGpu, pontuacaoWebgpu: 2.5, gpuCaiu: true }, true)).toBeNull()
    expect(outroBackend(r, { ...questComGpu, pontuacaoWebgpu: 2.5 }, false)).toBeNull()
    const moon = routeStt({ ...base, contentLang: 'en', dispositivo: questComGpu })
    expect(outroBackend(moon, questComGpu, true)).toBeNull()
  })
})
