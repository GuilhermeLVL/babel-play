/**
 * `baseDoWasm()`: de onde o `onnxruntime-web` busca `ort-wasm-*.{wasm,mjs}` (`ort.env.wasm.wasmPaths`).
 * Sem `VITE_ORT_WASM_URL` é `/` (os assets do próprio app, como sempre); com ela, uma base absoluta.
 */
import { afterEach, describe, expect, it, vi } from 'vitest'

import { baseDoWasm } from '../src/gateway/baseDoWasm'

afterEach(() => {
  vi.unstubAllEnvs()
})

describe('baseDoWasm', () => {
  it('sem a variável (ou vazia) é a raiz do próprio site', () => {
    vi.stubEnv('VITE_ORT_WASM_URL', '')
    expect(baseDoWasm()).toBe('/')
    vi.stubEnv('VITE_ORT_WASM_URL', '   ')
    expect(baseDoWasm()).toBe('/')
  })

  it('URL https com barra final fica como está', () => {
    vi.stubEnv('VITE_ORT_WASM_URL', 'https://modelos.frasy.com.br/ort/')
    expect(baseDoWasm()).toBe('https://modelos.frasy.com.br/ort/')
  })

  it('URL sem barra final ganha a barra (o ORT concatena o nome do arquivo)', () => {
    vi.stubEnv('VITE_ORT_WASM_URL', ' https://modelos.frasy.com.br/ort/1.26.0 ')
    expect(baseDoWasm()).toBe('https://modelos.frasy.com.br/ort/1.26.0/')
  })

  it('http://localhost serve para dev', () => {
    vi.stubEnv('VITE_ORT_WASM_URL', 'http://localhost:3100/ort')
    expect(baseDoWasm()).toBe('http://localhost:3100/ort/')
  })

  it('valor inválido é erro legível, não um caminho relativo silencioso', () => {
    for (const ruim of ['ftp://x/ort/', 'modelos.frasy.com.br/ort/', 'http://modelos.frasy.com.br/ort/']) {
      vi.stubEnv('VITE_ORT_WASM_URL', ruim)
      expect(() => baseDoWasm(), ruim).toThrow(/VITE_ORT_WASM_URL inválida/)
    }
  })
})
