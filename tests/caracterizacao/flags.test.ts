/**
 * CARACTERIZAÇÃO — `GET /api/flags` (pública) e `GET/PUT /api/admin/flags` por HTTP, no modo
 * público, pela montagem de verdade (`criarApp`).
 *
 * O que se prova:
 *   - a rota responde SEM token (é o cliente anônimo e o convidado da Fase 7 que mais precisam);
 *   - ela NÃO vaza regras: nem lista de ids, nem percentual, nem planos, nem descrição;
 *   - o token, quando vem, muda o plano do contexto; token inválido vira convidado (sem 401);
 *   - o id de instalação decide o balde do percentual, e UUID malformado é ignorado;
 *   - `Cache-Control` curto, `ETag` e 304 na revalidação;
 *   - o admin exige papel (usuário comum 403, support só lê), valida e invalida o cache na hora.
 */
import { get } from 'node:http'

import { afterAll, beforeAll, describe, expect, it } from 'vitest'

import { baldeEstavel } from '../../src/core/flags'
import { type AppDeTeste, subirApp } from './_app'

let s: AppDeTeste
let tokenAdmin: string
let tokenSupport: string
let tokenComum: string
let tokenPro: string

beforeAll(async () => {
  s = await subirApp({ modo: 'publico' })
  const { usersRepo } = await s.load('../../server/db/repositories/users')
  const { subscriptionsRepo } = await s.load('../../server/db/repositories/subscriptions')
  tokenAdmin = await s.token('flag-admin')
  tokenSupport = await s.token('flag-support')
  tokenComum = await s.token('flag-comum')
  tokenPro = await s.token('flag-pro')
  for (const t of [tokenAdmin, tokenSupport, tokenComum, tokenPro]) expect((await s.get('/api/me', t)).status).toBe(200)
  await usersRepo.setRole('flag-admin', 'admin')
  await usersRepo.setRole('flag-support', 'support')
  await subscriptionsRepo.upsert('flag-pro', { plan: 'pro', status: 'active' })
})
afterAll(async () => {
  await s.encerrar()
})

const ler = async (headers: Record<string, string> = {}, token?: string) => {
  const r = await s.chamar('GET', '/api/flags', { headers, token })
  return {
    r,
    corpo:
      r.status === 200 ? ((await r.json()) as { flags: Record<string, { ligada: boolean; payload?: unknown }> }) : null,
  }
}

const admin = (chave: string, body: unknown, token = tokenAdmin) =>
  s.chamar('PUT', `/api/admin/flags/${chave}`, { body, token })

describe('GET /api/flags (pública)', () => {
  it('responde sem token, com as flags semeadas avaliadas para um convidado', async () => {
    const { r, corpo } = await ler()
    expect(r.status).toBe(200)
    expect(r.headers.get('ratelimit-limit'), 'balde próprio por IP no modo público').toBe('60')
    expect(corpo!.flags.modo_convidado).toEqual({ ligada: false })
    expect(corpo!.flags.vender_planos).toEqual({ ligada: true })
    expect(corpo!.flags.oferta_planos).toEqual({ ligada: false }) // desligada: sem payload
  })

  it('nunca expõe regras, listas de ids, percentual nem descrição', async () => {
    expect(
      (
        await admin('segredo_vip', {
          descricao: 'DESCRICAO-INTERNA',
          habilitada: true,
          regras: { ids: ['ID-SECRETO-1'], planos: ['pro'], percentual: 37, idiomas: ['pt'] },
        })
      ).status,
    ).toBe(200)
    const texto = await (await s.chamar('GET', '/api/flags', { token: tokenComum })).text()
    for (const proibido of [
      'ID-SECRETO-1',
      'DESCRICAO-INTERNA',
      'percentual',
      ':37',
      '"planos"',
      'regras',
      '"idiomas"',
      '"ids"',
      'descricao',
    ]) {
      expect(texto, proibido).not.toContain(proibido)
    }
    expect(JSON.parse(texto).flags.segredo_vip).toEqual({ ligada: false })
  })

  it('o token define o plano; token inválido é tratado como convidado, sem 401', async () => {
    await admin('so_pro', { descricao: 'só pro', habilitada: true, regras: { planos: ['pro'] } })
    await admin('so_convidado', { descricao: 'só convidado', habilitada: true, regras: { planos: ['convidado'] } })
    expect((await ler({}, tokenPro)).corpo!.flags.so_pro.ligada).toBe(true)
    expect((await ler({}, tokenComum)).corpo!.flags.so_pro.ligada).toBe(false)
    expect((await ler()).corpo!.flags.so_convidado.ligada).toBe(true)
    const invalido = await ler({}, 'nao.e.um.jwt')
    expect(invalido.r.status).toBe(200)
    expect(invalido.corpo!.flags.so_convidado.ligada).toBe(true)
  })

  it('a instalação decide o balde do percentual; UUID malformado é ignorado', async () => {
    await admin('metade', { descricao: 'metade', habilitada: true, regras: { percentual: 50 } })
    const dentro = Array.from({ length: 40 }, (_, i) => `00000000-0000-4000-8000-${String(i).padStart(12, '0')}`).find(
      (id) => baldeEstavel(id, 'metade') < 50,
    )!
    const fora = Array.from({ length: 40 }, (_, i) => `00000000-0000-4000-8000-${String(i).padStart(12, '0')}`).find(
      (id) => baldeEstavel(id, 'metade') >= 50,
    )!
    expect((await ler({ 'x-babel-instalacao': dentro })).corpo!.flags.metade.ligada).toBe(true)
    expect((await ler({ 'x-babel-instalacao': fora })).corpo!.flags.metade.ligada).toBe(false)
    expect((await ler({ 'x-babel-instalacao': 'nao-e-uuid' })).corpo!.flags.metade.ligada).toBe(false)
  })

  it('idioma e versão chegam pelos cabeçalhos', async () => {
    await admin('so_es_novo', {
      descricao: 'es e versão',
      habilitada: true,
      regras: { idiomas: ['es'], versaoMinima: '9.0.0' },
    })
    expect(
      (await ler({ 'x-babel-idioma': 'es', 'x-babel-versao': '9.1.0+abcdef1' })).corpo!.flags.so_es_novo.ligada,
    ).toBe(true)
    expect((await ler({ 'x-babel-idioma': 'es', 'x-babel-versao': '8.9.9' })).corpo!.flags.so_es_novo.ligada).toBe(
      false,
    )
    expect((await ler({ 'x-babel-idioma': 'pt', 'x-babel-versao': '9.1.0' })).corpo!.flags.so_es_novo.ligada).toBe(
      false,
    )
  })

  it('Cache-Control curto, ETag e 304 na revalidação', async () => {
    const { r } = await ler()
    expect(r.headers.get('cache-control')).toBe('private, max-age=30')
    expect(r.headers.get('vary')).toMatch(/Authorization/i)
    const etag = r.headers.get('etag')
    expect(etag).toMatch(/^W\/"/)
    /* `node:http` e não `fetch`: o `fetch` do Node, ao ver um `If-None-Match` posto à mão, acrescenta
       `Cache-Control: no-cache` (regra do padrão Fetch), e com ele nenhum servidor responde 304. É
       a revalidação que o cache HTTP do navegador faz sozinho, sem esse cabeçalho. */
    const status = await new Promise<number>((ok, falha) => {
      get(`${s.base}/api/flags`, { headers: { 'if-none-match': etag! } }, (res) => {
        res.resume()
        ok(res.statusCode ?? 0)
      }).on('error', falha)
    })
    expect(status).toBe(304)
  })
})

describe('/api/admin/flags', () => {
  it('exige papel: comum 403 em ler e escrever; support lê mas não escreve', async () => {
    expect((await s.get('/api/admin/flags', tokenComum)).status).toBe(403)
    expect((await admin('qualquer', { descricao: 'x' }, tokenComum)).status).toBe(403)
    expect((await s.get('/api/admin/flags', tokenSupport)).status).toBe(200)
    expect((await admin('qualquer', { descricao: 'x' }, tokenSupport)).status).toBe(403)
    expect((await s.get('/api/admin/flags')).status).toBe(401)
  })

  it('o admin vê as regras cruas (só ele)', async () => {
    const r = await s.get('/api/admin/flags', tokenAdmin)
    const lista = (await r.json()) as Array<{ chave: string; regras: unknown; atualizadoPor: string }>
    const vip = lista.find((f) => f.chave === 'segredo_vip')!
    expect(vip.regras).toMatchObject({ ids: ['ID-SECRETO-1'] })
    expect(vip.atualizadoPor).toBe('flag-admin')
  })

  it('valida: corpo desconhecido, regra ruim e payload de ofertas ruim dão 400', async () => {
    expect((await admin('x_y', { descricao: 'x', campoQueNaoExiste: 1 })).status).toBe(400)
    const regra = await admin('x_y', { descricao: 'x', regras: { percentual: 101 } })
    expect(regra.status).toBe(400)
    expect(((await regra.json()) as { detalhes: string[] }).detalhes.join()).toMatch(/percentual/)
    expect((await admin('oferta_planos', { payload: { gatilhos: [{ id: 'z' }] } })).status).toBe(400)
  })

  it('ligar pelo admin aparece na leitura pública na mesma hora (cache invalidado)', async () => {
    expect((await ler()).corpo!.flags.modo_convidado.ligada).toBe(false)
    expect((await admin('modo_convidado', { habilitada: true })).status).toBe(200)
    expect((await ler()).corpo!.flags.modo_convidado.ligada).toBe(true)
    await admin('modo_convidado', { habilitada: false })
  })
})
