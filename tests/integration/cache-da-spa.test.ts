/**
 * Fase 5 — cabeçalhos de cache da SPA servida em produção (`server/http/estaticos.ts`).
 *
 * Chunk com hash no nome pode ficar um ano no navegador; o `index.html`, nunca sem revalidar —
 * é ele que diz quais chunks valem, e um velho aponta para arquivos que o deploy seguinte apagou.
 */
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import type { Server } from 'node:http'
import { get } from 'node:http'
import { tmpdir } from 'node:os'
import path from 'node:path'

import express from 'express'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'

import { cacheDoArquivo, codificacoesAceitas, montarSpa } from '../../server/http/estaticos'

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
  // Fase 4: irmãos pré-comprimidos do build (conteúdo marcado para saber qual foi servido).
  writeFileSync(path.join(dist, 'assets', 'app-Zz99.js'), 'console.log("original")')
  writeFileSync(path.join(dist, 'assets', 'app-Zz99.js.br'), 'BR')
  writeFileSync(path.join(dist, 'assets', 'app-Zz99.js.gz'), 'GZ')
  writeFileSync(path.join(dist, 'assets', 'so-gz-1.css'), 'a{}')
  writeFileSync(path.join(dist, 'assets', 'so-gz-1.css.gz'), 'GZCSS')
  writeFileSync(path.join(dist, 'fora.txt.br'), 'NAO')
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

  /* A9b: o caminho do Bergamot tem a versão do motor ou o id da execução de treino — o conteúdo de
     um caminho nunca muda, e 25 MB revalidados a cada captura seriam uma ida e volta à toa. */
  it('Bergamot (motor versionado e modelo por execução): 1 ano, immutable; o LEIA-ME não', () => {
    const IMUTAVEL = 'public, max-age=31536000, immutable'
    expect(cacheDoArquivo('modelos/bergamot/motor-0.4.9/bergamot-translator-worker.wasm')).toBe(IMUTAVEL)
    expect(cacheDoArquivo('modelos/bergamot/motor-0.4.9/bergamot-translator-worker.mjs')).toBe(IMUTAVEL)
    expect(cacheDoArquivo('modelos/bergamot/pt-en/retrain_hr_x/model.pten.intgemm.alphas.bin.gz')).toBe(IMUTAVEL)
    expect(cacheDoArquivo('modelos\\bergamot\\pt-en\\run\\vocab.pten.spm.gz')).toBe(IMUTAVEL)
    expect(cacheDoArquivo('modelos/bergamot/LEIA-ME.txt')).toBeNull()
  })
})

describe('irmão pré-comprimido (Fase 4)', () => {
  /* `fetch` do Node descomprime sozinho; `http.get` cru mostra os bytes e os cabeçalhos como vieram. */
  const cru = (caminho: string, ae?: string) =>
    new Promise<{ status: number; h: Record<string, string | string[] | undefined>; corpo: string }>((ok, erro) => {
      const u = new URL(base + caminho)
      get({ host: u.hostname, port: u.port, path: u.pathname, headers: ae ? { 'accept-encoding': ae } : {} }, (r) => {
        const partes: Buffer[] = []
        r.on('data', (c: Buffer) => partes.push(c))
        r.on('end', () => ok({ status: r.statusCode ?? 0, h: r.headers, corpo: Buffer.concat(partes).toString() }))
      }).on('error', erro)
    })

  it('br quando o navegador aceita: Content-Encoding, Vary, tipo e cache do ORIGINAL', async () => {
    const r = await cru('/assets/app-Zz99.js', 'gzip, deflate, br')
    expect(r.corpo).toBe('BR')
    expect(r.h['content-encoding']).toBe('br')
    expect(String(r.h.vary)).toMatch(/Accept-Encoding/i)
    expect(r.h['content-type']).toMatch(/javascript/)
    expect(r.h['cache-control']).toBe('public, max-age=31536000, immutable')
  })

  it('gzip quando só gzip é aceito; sem Accept-Encoding, o original', async () => {
    expect((await cru('/assets/app-Zz99.js', 'gzip')).corpo).toBe('GZ')
    const semNada = await cru('/assets/app-Zz99.js', 'identity')
    expect(semNada.corpo).toBe('console.log("original")')
    expect(semNada.h['content-encoding']).toBeUndefined()
  })

  it('sem o irmão pedido, cai no que existe (ou no original)', async () => {
    const r = await cru('/assets/so-gz-1.css', 'br, gzip')
    expect(r.corpo).toBe('GZCSS')
    expect(r.h['content-type']).toMatch(/css/)
  })

  it('não serve irmão sem original nem escapa de dist', async () => {
    expect((await cru('/fora.txt', 'br')).corpo).not.toBe('NAO')
    expect((await cru('/assets/..%2F..%2Fetc%2Fpasswd', 'br')).h['content-encoding']).toBeUndefined()
  })

  it('Accept-Encoding: q=0 recusa, * aceita, sem cabeçalho nada', () => {
    expect([...codificacoesAceitas('gzip, br;q=0')]).toEqual(['gzip'])
    expect([...codificacoesAceitas('*')].sort()).toEqual(['br', 'gzip'])
    expect(codificacoesAceitas(undefined).size).toBe(0)
  })
})
