/**
 * CARACTERIZAÇÃO — o glossário pessoal da Tradução Nuance (`/api/ai/glossario`, D3 da Fase D), por
 * HTTP, no modo público, com a montagem de produção.
 *
 *   - ler e apagar valem em qualquer plano (é dado da pessoa); gravar exige `traducaoNuance`;
 *   - o mesmo termo é a mesma entrada (201 na primeira vez, 200 depois, o mesmo id);
 *   - o corpo é saneado e validado: vazio é 400, `<`/`>` e quebra de linha somem;
 *   - apagar o de outra pessoa é 404 — igual a um id inventado.
 */
import { afterAll, beforeAll, describe, expect, it } from 'vitest'

import { PLANO_PAGO } from '../harness/planoPago'
import { type AppDeTeste, subirApp } from './_app'

let s: AppDeTeste
let pagante: string
let gratis: string

beforeAll(async () => {
  s = await subirApp({ modo: 'publico' })
  pagante = await s.token('glossario-pagante')
  gratis = await s.token('glossario-gratis')
  /* As contas nascem no primeiro request (o `authMiddleware` provisiona). */
  await s.get('/api/me', pagante)
  await s.get('/api/me', gratis)
  const { subscriptionsRepo } = await s.load('../../server/db/repositories/subscriptions')
  const { asUserId } = await s.load('../../server/lib/authContext')
  await subscriptionsRepo.upsert(asUserId('glossario-pagante'), { plan: PLANO_PAGO, status: 'active' })
}, 60_000)
afterAll(async () => {
  await s?.encerrar()
})

const nova = { termo: 'deadline', traducao: 'prazo', origem: 'en', destino: 'pt-BR' }

describe('GET /api/ai/glossario', () => {
  it('vazio → 200 com a lista e o limite', async () => {
    const r = await s.get('/api/ai/glossario', gratis)
    expect(r.status).toBe(200)
    expect(await r.json()).toEqual({ entradas: [], limite: 500 })
  })
})

describe('POST /api/ai/glossario', () => {
  it('sem a Tradução Nuance → 402 exige_nuance, pelo entitlement', async () => {
    const r = await s.post('/api/ai/glossario', nova, gratis)
    expect(r.status).toBe(402)
    expect(await r.json()).toMatchObject({ code: 'exige_nuance', entitlement: 'traducaoNuance' })
  })

  it('com a Nuance: 201 na primeira vez, 200 com o mesmo id ao trocar a tradução', async () => {
    const a = await s.post('/api/ai/glossario', nova, pagante)
    expect(a.status).toBe(201)
    const { entrada } = await a.json()
    expect(entrada).toMatchObject({ termo: 'deadline', traducao: 'prazo', origem: 'en', destino: 'pt' })
    const b = await s.post('/api/ai/glossario', { ...nova, termo: 'Deadline', traducao: 'prazo final' }, pagante)
    expect(b.status).toBe(200)
    expect((await b.json()).entrada).toMatchObject({ id: entrada.id, traducao: 'prazo final' })
    const lista = await (await s.get('/api/ai/glossario', pagante)).json()
    expect(lista.entradas).toHaveLength(1)
  })

  it('o corpo é saneado; o que fica vazio é 400', async () => {
    const r = await s.post('/api/ai/glossario', { ...nova, termo: 'road<b>map\n', traducao: 'plano>>> x' }, pagante)
    expect((await r.json()).entrada).toMatchObject({ termo: 'roadbmap', traducao: 'plano x' })
    const vazia = await s.post('/api/ai/glossario', { ...nova, termo: '<<>>' }, pagante)
    expect(vazia.status).toBe(400)
    expect((await vazia.json()).code).toBe('entrada_vazia')
  })
})

describe('DELETE /api/ai/glossario/:id', () => {
  it('de outra pessoa → 404 (e a entrada continua); a própria → 200; de novo → 404', async () => {
    const { entrada } = await (await s.post('/api/ai/glossario', { ...nova, termo: 'rollout' }, pagante)).json()
    expect((await s.del(`/api/ai/glossario/${entrada.id}`, gratis)).status).toBe(404)
    const lista = await (await s.get('/api/ai/glossario', pagante)).json()
    expect(lista.entradas.some((e: { id: string }) => e.id === entrada.id)).toBe(true)
    expect((await s.del(`/api/ai/glossario/${entrada.id}`, pagante)).status).toBe(200)
    expect((await s.del(`/api/ai/glossario/${entrada.id}`, pagante)).status).toBe(404)
  })
})
