/**
 * P0-7 (auditoria de prontidão para produção) — a API responde 404 JSON e diz a versão.
 *
 * O QUE ESTAVA ERRADO. Em produção, `montarSpa` (`server/http/estaticos.ts`) termina num
 * `app.get('*')` que devolve o `index.html` com 200 para QUALQUER caminho — inclusive
 * `/api/<inexistente>`. Um cliente de versão antiga chamando uma rota que o deploy novo removeu
 * recebia HTML com status 200, e o `res.json()` estourava longe da causa. E nada dizia qual versão
 * estava no ar: nem a API nem a tela.
 *
 * O harness sobe o `criarApp()` de verdade; a montagem do `montarSpa` é repetida aqui por cima,
 * na mesma ordem do `server.ts`, para provar que o 404 da API vem ANTES do fallback da SPA.
 */
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'

import express from 'express'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'

import { type AppDeTeste, subirApp } from './_app'

let s: AppDeTeste
beforeAll(async () => {
  s = await subirApp({ modo: 'self-host' })
})
afterAll(async () => {
  await s.encerrar()
})

describe('404 JSON em /api/*', () => {
  for (const metodo of ['GET', 'POST', 'PUT', 'PATCH', 'DELETE']) {
    it(`${metodo} numa rota /api inexistente responde 404 no envelope de erro`, async () => {
      const r = await s.chamar(metodo, '/api/rota-que-nao-existe/abc', metodo === 'GET' ? {} : { body: {} })
      expect(r.status).toBe(404)
      expect(r.headers.get('content-type')).toMatch(/application\/json/)
      const corpo = (await r.json()) as { error: unknown; code: unknown }
      expect(typeof corpo.error).toBe('string')
      expect(corpo.code).toBe('rota_inexistente')
    })
  }

  it('a raiz /api também é 404 JSON', async () => {
    const r = await s.get('/api')
    expect(r.status).toBe(404)
    expect(((await r.json()) as { code: string }).code).toBe('rota_inexistente')
  })

  it('rota que existe continua respondendo (o 404 é o último da API, não o primeiro)', async () => {
    expect((await s.get('/api/health')).status).toBe(200)
    expect((await s.get('/api/me')).status).toBe(200)
  })
})

describe('versão do app', () => {
  it('toda resposta /api leva o cabeçalho x-babel-versao', async () => {
    const saude = await s.get('/api/health')
    const versao = saude.headers.get('x-babel-versao')
    expect(versao).toMatch(/^\d+\.\d+\.\d+/)
    expect((await s.get('/api/me')).headers.get('x-babel-versao')).toBe(versao)
    expect((await s.get('/api/nao-existe')).headers.get('x-babel-versao')).toBe(versao)
  })

  it('/api/health devolve a mesma versão no corpo', async () => {
    const r = await s.get('/api/health')
    const corpo = (await r.json()) as { versao?: string }
    expect(corpo.versao).toBe(r.headers.get('x-babel-versao'))
  })
})

describe('ordem com o fallback da SPA (como no server.ts em produção)', () => {
  let dist: string
  let base: string
  let fechar: () => Promise<void>

  beforeAll(async () => {
    dist = mkdtempSync(path.join(tmpdir(), 'dist-404-'))
    writeFileSync(path.join(dist, 'index.html'), '<!doctype html><div id="root"></div>')
    const { criarApp } = await s.load('../../server/http/app')
    const { montarSpa } = await s.load('../../server/http/estaticos')
    const app: express.Express = criarApp()
    montarSpa(app, dist)
    const servidor = await new Promise<import('node:http').Server>((r) => {
      const x = app.listen(0, '127.0.0.1', () => r(x))
    })
    const addr = servidor.address()
    base = `http://127.0.0.1:${typeof addr === 'object' && addr ? addr.port : 0}`
    fechar = () => new Promise<void>((r) => servidor.close(() => r()))
  })
  afterAll(async () => {
    await fechar()
    rmSync(dist, { recursive: true, force: true })
  })

  it('/api/<inexistente> é 404 JSON, e não o index.html com 200', async () => {
    const r = await fetch(`${base}/api/sumiu`)
    expect(r.status).toBe(404)
    expect(((await r.json()) as { code: string }).code).toBe('rota_inexistente')
  })

  it('rota da SPA continua caindo no index.html', async () => {
    const r = await fetch(`${base}/jogar`)
    expect(r.status).toBe(200)
    expect(await r.text()).toContain('id="root"')
  })
})
