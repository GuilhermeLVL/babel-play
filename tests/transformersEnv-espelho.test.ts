/**
 * O RUNTIME DO ONNX E O CACHE DOS WORKERS DA TRANSFORMERS.JS (change `modelos-confiaveis-e-offline`, 2.2 e 3.1).
 *
 * Sem `wasmPaths`, a transformers.js baixa `ort-wasm-simd-threaded.asyncify.{mjs,wasm}` do jsDelivr (DISP-05):
 * uma queda ou um bloqueio de rede escolar derrubava a legenda. Agora a mesma variante sai da base do Frasy
 * (`baseDoWasm()`: `/` ou `VITE_ORT_WASM_URL`). E o cache passa a ser o que se confere (`cacheDePesos.ts`).
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const JSDELIVR = 'https://cdn.jsdelivr.net/npm/onnxruntime-web@1.26.0/dist/'
const envFalso = vi.hoisted(() => ({}) as Record<string, any>)
vi.mock('@huggingface/transformers', () => ({ env: envFalso }))

import { configureModelDelivery, wasmPathsNaBase } from '../src/gateway/adapters/transformersEnv'

beforeEach(() => {
  for (const k of Object.keys(envFalso)) delete envFalso[k]
  envFalso.backends = {
    onnx: {
      wasm: {
        wasmPaths: {
          mjs: `${JSDELIVR}ort-wasm-simd-threaded.asyncify.mjs`,
          wasm: `${JSDELIVR}ort-wasm-simd-threaded.asyncify.wasm`,
        },
      },
    },
  }
})
afterEach(() => {
  vi.unstubAllEnvs()
  vi.unstubAllGlobals()
})

describe('wasmPathsNaBase', () => {
  it('troca só a origem, mantendo a variante escolhida pela transformers.js', () => {
    expect(wasmPathsNaBase({ mjs: `${JSDELIVR}ort-wasm-simd-threaded.mjs` }, '/')).toEqual({
      mjs: '/ort-wasm-simd-threaded.mjs',
      wasm: undefined,
    })
    expect(wasmPathsNaBase(undefined, 'https://m.example/ort/')).toBe('https://m.example/ort/')
  })
})

describe('configureModelDelivery', () => {
  it('com VITE_ORT_WASM_URL, o runtime sai do espelho, nunca do jsDelivr', () => {
    vi.stubEnv('VITE_ORT_WASM_URL', 'https://modelos.frasy.com.br/ort/1.26.0/')
    configureModelDelivery()
    const p = envFalso.backends.onnx.wasm.wasmPaths
    expect(p.mjs).toBe('https://modelos.frasy.com.br/ort/1.26.0/ort-wasm-simd-threaded.asyncify.mjs')
    expect(p.wasm).toBe('https://modelos.frasy.com.br/ort/1.26.0/ort-wasm-simd-threaded.asyncify.wasm')
  })

  it('sem a variável, do próprio app (`/`)', () => {
    vi.stubEnv('VITE_ORT_WASM_URL', '')
    configureModelDelivery()
    expect(envFalso.backends.onnx.wasm.wasmPaths.wasm).toBe('/ort-wasm-simd-threaded.asyncify.wasm')
  })

  it('instala o cache que se confere quando há Cache Storage', () => {
    vi.stubGlobal('caches', { open: vi.fn() })
    configureModelDelivery()
    expect(envFalso.useCustomCache).toBe(true)
    expect(typeof envFalso.customCache.put).toBe('function')
    expect(typeof envFalso.customCache.match).toBe('function')
  })
})
