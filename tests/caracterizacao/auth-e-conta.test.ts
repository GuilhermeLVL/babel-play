/**
 * CARACTERIZAÇÃO — autenticação e conta, por HTTP, nos dois modos do servidor.
 *
 * Grava o comportamento ATUAL (rodada de saneamento, Fase 1). Um `expect` aqui que pareça
 * estranho está marcado com `// caracterizacao:` — o teste existe para detectar MUDANÇA, e a
 * correção, quando couber, pertence a outra fase.
 */
import { afterAll,beforeAll, describe, expect, it } from 'vitest'

import { type AppDeTeste,forma, resposta, subirApp } from './_app'

describe('modo publico (AUTH_REQUIRED=1, JWT ES256)', () => {
  let s: AppDeTeste
  beforeAll(async () => { s = await subirApp({ modo: 'publico' }) })
  afterAll(async () => { await s.encerrar() })

  it('/api/health e publico: 200 sem token, com a forma conhecida', async () => {
    const r = await s.get('/api/health')
    expect(r.status).toBe(200)
    expect(r.headers.get('x-request-id')).toBeTruthy()
    await expect(JSON.stringify(await resposta(r), null, 2)).toMatchFileSnapshot('__snapshots__/health.get.json')
  })

  it('sem token, toda rota privada responde 401 com envelope de erro', async () => {
    for (const caminho of ['/api/me', '/api/sessions', '/api/vocab', '/api/settings', '/api/metrics/profile', '/api/exercises/historico']) {
      const r = await s.get(caminho)
      expect(r.status, caminho).toBe(401)
    }
    await expect(JSON.stringify(await resposta(await s.get('/api/me')), null, 2)).toMatchFileSnapshot('__snapshots__/401.json')
  })

  it('token invalido (assinado por outra chave) tambem e 401', async () => {
    const { SignJWT, generateKeyPair } = await import('jose')
    const outra = await generateKeyPair('ES256')
    const falso = await new SignJWT({}).setProtectedHeader({ alg: 'ES256' }).setSubject('intruso')
      .setAudience('authenticated').setIssuer('https://projeto-caracterizacao.supabase.co/auth/v1').setIssuedAt().setExpirationTime('1h').sign(outra.privateKey)
    expect((await s.get('/api/me', falso)).status).toBe(401)
  })

  it('token valido: /api/me cria o usuario na primeira chamada e devolve o perfil', async () => {
    const t = await s.token('usuario-a')
    const r = await s.get('/api/me', t)
    expect(r.status).toBe(200)
    const corpo = await r.json()
    expect(corpo.id).toBe('usuario-a')
    await expect(JSON.stringify({ status: 200, forma: forma(corpo) }, null, 2)).toMatchFileSnapshot('__snapshots__/me.get.json')
  })

  it('usuario suspenso recebe 403 em toda rota privada, mesmo com token valido', async () => {
    const t = await s.token('usuario-suspenso')
    expect((await s.get('/api/me', t)).status).toBe(200)
    const { usersRepo } = await s.load('../../server/db/repositories/users')
    const { asUserId } = await s.load('../../server/lib/authContext')
    await usersRepo.setStatus(asUserId('usuario-suspenso'), 'suspended')
    const r = await s.get('/api/me', t)
    expect(r.status).toBe(403)
    await expect(JSON.stringify(await resposta(r), null, 2)).toMatchFileSnapshot('__snapshots__/403-suspenso.json')
  })

  it('dois usuarios nao veem os dados um do outro (sessoes)', async () => {
    const ta = await s.token('usuario-a')
    const tb = await s.token('usuario-b')
    const criada = await s.post('/api/sessions', { title: 'de A', kind: 'live', sourceLang: 'en', targetLang: 'pt', status: 'done' }, ta)
    expect(criada.status).toBe(200)
    const { id } = await criada.json()
    expect((await s.get(`/api/sessions/${id}`, ta)).status).toBe(200)
    expect((await s.get(`/api/sessions/${id}`, tb)).status).toBe(404)
    expect(((await (await s.get('/api/sessions', tb)).json()) as unknown[]).length).toBe(0)
  })

  it('PATCH /api/me nao deixa o usuario se promover (role e status sao descartados)', async () => {
    const t = await s.token('usuario-a')
    const r = await s.patch('/api/me', { displayName: 'A', role: 'admin', status: 'active' }, t)
    expect(r.status).toBe(200)
    const { usersRepo } = await s.load('../../server/db/repositories/users')
    const { asUserId } = await s.load('../../server/lib/authContext')
    expect(await usersRepo.getRole(asUserId('usuario-a'))).toBe('user')
  })

  it('rotas de admin exigem papel: usuario comum recebe 403', async () => {
    const t = await s.token('usuario-a')
    const r = await s.get('/api/admin/users', t)
    expect(r.status).toBe(403)
  })

  it('/api/audio e /api/import/youtube nao existem no modo hospedado (403)', async () => {
    const t = await s.token('usuario-a')
    expect((await s.get('/api/audio/loopback/support', t)).status).toBe(403)
    expect((await s.post('/api/import/youtube', { url: 'https://youtu.be/x' }, t)).status).toBe(403)
  })
})
