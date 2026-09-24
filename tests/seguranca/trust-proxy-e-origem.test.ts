/**
 * GAP-004 — `TRUST_PROXY` é decisão declarada em produção, e a origem só aceita quem passou pelo
 * proxy da frente.
 *
 * Os dois erros possíveis com `TRUST_PROXY` desligam o limitador por IP sem barulho nenhum: sem
 * ela atrás de proxy, todo visitante vira o IP do proxy; ligada sem proxy, o cliente escolhe a
 * própria chave. Em produção o boot passa a abortar sem a declaração.
 *
 * E com `ORIGEM_SEGREDO`, quem chega direto em `<app>.fly.dev` (pulando o Cloudflare e forjando o
 * `X-Forwarded-For`) recebe 403 — menos nas sondas, que o Fly faz pela rede interna.
 */
import type { Server } from 'node:http'

import express from 'express'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'

import { CABECALHO_DE_ORIGEM, exigirOrigem } from '../../server/http/origemProtegida'
import { erroDeTrustProxyEmProducao, segredoDeOrigem } from '../../server/lib/config'

const env = (e: Record<string, string>) => e as unknown as NodeJS.ProcessEnv

describe('TRUST_PROXY obrigatória em produção (GAP-004)', () => {
  it('produção sem TRUST_PROXY aborta, com a instrução na mensagem', () => {
    const msg = erroDeTrustProxyEmProducao(env({ NODE_ENV: 'production' }))
    expect(msg).toMatch(/TRUST_PROXY/)
    expect(msg).toMatch(/Cloudflare/)
  })

  it('produção com TRUST_PROXY vazia (só espaço) também aborta', () => {
    expect(erroDeTrustProxyEmProducao(env({ NODE_ENV: 'production', TRUST_PROXY: '  ' }))).not.toBeNull()
  })

  it('produção com a decisão declarada — inclusive "false" — sobe', () => {
    expect(erroDeTrustProxyEmProducao(env({ NODE_ENV: 'production', TRUST_PROXY: '2' }))).toBeNull()
    expect(erroDeTrustProxyEmProducao(env({ NODE_ENV: 'production', TRUST_PROXY: 'false' }))).toBeNull()
  })

  it('fora de produção não exige nada', () => {
    expect(erroDeTrustProxyEmProducao(env({ NODE_ENV: 'development' }))).toBeNull()
    expect(erroDeTrustProxyEmProducao(env({}))).toBeNull()
  })
})

describe('origem protegida (ORIGEM_SEGREDO)', () => {
  let servidor: Server
  let base: string

  beforeAll(async () => {
    const app = express()
    app.use(exigirOrigem('segredo-do-cloudflare'))
    app.get('/api/health', (_req, res) => res.json({ ok: true }))
    app.get('/api/ready', (_req, res) => res.json({ ok: true }))
    app.get('/api/sessions', (_req, res) => res.json({ ok: true }))
    app.get('/', (_req, res) => res.send('spa'))
    servidor = await new Promise((r) => {
      const s = app.listen(0, '127.0.0.1', () => r(s))
    })
    const addr = servidor.address()
    base = `http://127.0.0.1:${typeof addr === 'object' && addr ? addr.port : 0}`
  })
  afterAll(async () => {
    await new Promise<void>((r) => servidor.close(() => r()))
  })

  it('sem o cabeçalho, a SPA e a API respondem 403', async () => {
    expect((await fetch(`${base}/`)).status).toBe(403)
    expect((await fetch(`${base}/api/sessions`)).status).toBe(403)
  })

  it('com o segredo errado (mesmo tamanho ou não), 403', async () => {
    const r1 = await fetch(`${base}/api/sessions`, { headers: { [CABECALHO_DE_ORIGEM]: 'segredo-do-cloudfare' } })
    const r2 = await fetch(`${base}/api/sessions`, { headers: { [CABECALHO_DE_ORIGEM]: 'x' } })
    expect(r1.status).toBe(403)
    expect(r2.status).toBe(403)
  })

  it('com o segredo certo, passa', async () => {
    const r = await fetch(`${base}/api/sessions`, { headers: { [CABECALHO_DE_ORIGEM]: 'segredo-do-cloudflare' } })
    expect(r.status).toBe(200)
  })

  it('as sondas do Fly (health e ready) passam sem o cabeçalho', async () => {
    expect((await fetch(`${base}/api/health`)).status).toBe(200)
    expect((await fetch(`${base}/api/ready`)).status).toBe(200)
  })

  it('segredoDeOrigem: vazio ou só espaço é "sem segredo"', () => {
    expect(segredoDeOrigem(env({}))).toBeUndefined()
    expect(segredoDeOrigem(env({ ORIGEM_SEGREDO: '   ' }))).toBeUndefined()
    expect(segredoDeOrigem(env({ ORIGEM_SEGREDO: ' abc ' }))).toBe('abc')
  })
})
