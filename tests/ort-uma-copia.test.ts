/**
 * UMA cópia só do `onnxruntime-web` (Fase A, A3). O `@ricky0123/vad-web` pede `^1.17.0`, e um
 * pré-lançamento (`1.26.0-dev…`, o que o `@huggingface/transformers` fixa) não satisfaz esse
 * intervalo — então o npm aninhava um 1.27 só para o VAD. O JS do VAD (1.27) carregava o
 * `ort-wasm-simd-threaded.mjs` servido de `/` (1.26-dev, ver `scripts/copiar-assets-runtime.mjs`):
 * duas versões da mesma cola num só runtime. O `overrides` do package.json alinha as duas; este
 * teste pega o dia em que alguém atualizar o transformers e esquecer o override.
 */
import { readFileSync } from 'node:fs'
import path from 'node:path'

import { describe, expect, it } from 'vitest'

const RAIZ = path.resolve(__dirname, '..')
const lock = JSON.parse(readFileSync(path.join(RAIZ, 'package-lock.json'), 'utf8')) as {
  packages: Record<string, { version?: string }>
}
const pacote = JSON.parse(readFileSync(path.join(RAIZ, 'package.json'), 'utf8')) as {
  overrides?: Record<string, Record<string, string>>
}

describe('onnxruntime-web: uma cópia só', () => {
  it('nenhum onnxruntime-web aninhado no lockfile', () => {
    const copias = Object.keys(lock.packages).filter((k) => /(^|\/)node_modules\/onnxruntime-web$/.test(k))
    expect(copias).toEqual(['node_modules/onnxruntime-web'])
  })

  it('o override do VAD aponta para a MESMA versão que o transformers traz', () => {
    const doTopo = lock.packages['node_modules/onnxruntime-web']?.version
    expect(pacote.overrides?.['@ricky0123/vad-web']?.['onnxruntime-web']).toBe(doTopo)
  })
})
