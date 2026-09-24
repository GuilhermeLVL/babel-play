/**
 * Fase 5 — cabeçalhos de cache da SPA servida em produção (`server/http/estaticos.ts`).
 *
 * Chunk com hash no nome pode ficar um ano no navegador; o `index.html`, nunca sem revalidar —
 * é ele que diz quais chunks valem, e um velho aponta para arquivos que o deploy seguinte apagou.
 */
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import type { Server } from 'node:http'
import { tmpdir } from 'node:os'
import path from 'node:path'

import express from 'express'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'

import { cacheDoArquivo, montarSpa } from '../../server/http/estaticos'

let servidor: Server
let base: string
let dist: string

beforeAll(async () => {
  dist = mkdtempSync(path.join(tmpdir(), 'dist-spa-'))
  mkdirSync(path.join(dist, 'assets'))
  mkdirSync(path.join(dist, 'trilha'))
  writeFileSync(path.join(dist, 'index.html'), '<!doctype html><div id="root"></div>')
  writeFileSync(path.join(dist, 'assets', 'index-Ab12Cd34.js'), 'console.log(1)')
  writeFileSync(path.join(dist, 'ort-wasm-simd-threaded.wasm'), 'wasm')
  writeFileSync(path.join(dist, 'trilha', 'en.json'), '{}')
  writeFileSync(path.join(dist, 'termos.html'), '<p>termos</p>')
  const app = express()
  montarSpa(app, dist)
  servidor = await new Promise((r) => {
    const s = app.listen(0, '127.0.0.1', () => r(s))
  })
  const addr = servidor.address()
  base = `http://127.0.0.1:${typeof addr === 'object' && addr ? addr.port : 0}`
})

afterAll(async () => {
  await new Promise<void>((r) => servidor.close(() => r()))
  rmSync(dist, { recursive: true, force: true })
})

const cache = async (caminho: string) => (await fetch(base + caminho)).headers.get('cache-control')

describe('cache da SPA', () => {
  it('chunk com hash: 1 ano, immutable', async () => {
    expect(await cache('/assets/index-Ab12Cd34.js')).toBe('public, max-age=31536000, immutable')
  })

  it('runtime WASM do ONNX: 1 ano, immutable', async () => {
    expect(await cache('/ort-wasm-simd-threaded.wasm')).toBe('public, max-age=31536000, immutable')
  })

  it('index.html (direto, pela raiz e pelo fallback de rota): no-cache', async () => {
    expect(await cache('/index.html')).toBe('no-cache')
    expect(await cache('/')).toBe('no-cache')
    expect(await cache('/jogar')).toBe('no-cache')
  })

  it('trilha (sem hash no nome): 1 dia com revalidação', async () => {
    expect(await cache('/trilha/en.json')).toBe('public, max-age=86400, must-revalidate')
  })

  it('o resto fica no padrão do Express (revalida)', async () => {
    expect(await cache('/termos.html')).toBe('public, max-age=0')
  })

  it('cacheDoArquivo aceita separador do Windows', () => {
    expect(cacheDoArquivo('assets\\x-1.js')).toBe('public, max-age=31536000, immutable')
  })
})
