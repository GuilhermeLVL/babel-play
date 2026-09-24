/**
 * CARACTERIZAÇÃO — "Na sua memória" (`GET /api/vocab/:id/memoria`) e o desfazer da revisão
 * (`POST /api/vocab/:id/desfazer`, tecla Z), por HTTP, no modo público com duas contas.
 *
 * Contratos gravados:
 * 1. A memória conta as revisões do cartão e os acertos (nota >= 3) em `review_logs`.
 * 2. Desfazer devolve ao cartão o estado de ANTES da nota (que o cliente guardou) e tira a revisão
 *    mais recente do histórico — a contagem da memória volta junto.
 * 3. As duas rotas são SÓ DO DONO: cartão de outra conta é 404 (e não "0 de 0"), e o desfazer
 *    alheio não toca no cartão nem no histórico do dono.
 * 4. Sem token, 401; corpo do desfazer fora do schema, 400.
 */
import { afterAll, beforeAll, describe, expect, it } from 'vitest'

import { type AppDeTeste, resposta, semear, subirApp } from './_app'

describe('memoria e desfazer do vocabulario (modo publico)', () => {
  let s: AppDeTeste
  let dono: string
  let outro: string
  let cartao: { id: string; box: number; dueAt: number }

  beforeAll(async () => {
    s = await subirApp({ modo: 'publico' })
    const semente = await semear(s, 'dono-do-cartao')
    cartao = semente.cartoes.find((c: { word: string }) => c.word === 'garden')
    dono = await s.token('dono-do-cartao')
    outro = await s.token('outra-conta')
  })
  afterAll(async () => {
    await s.encerrar()
  })

  const memoria = async (token: string) => s.get(`/api/vocab/${cartao.id}/memoria`, token)

  it('sem token, as duas rotas respondem 401', async () => {
    expect((await s.get(`/api/vocab/${cartao.id}/memoria`)).status).toBe(401)
    expect((await s.post(`/api/vocab/${cartao.id}/desfazer`, { box: 1, dueAt: 0 })).status).toBe(401)
  })

  it('cartao sem revisao: 0 revisoes e 0 acertos, com a forma conhecida', async () => {
    const r = await memoria(dono)
    expect(r.status).toBe(200)
    expect(await r.clone().json()).toEqual({ revisoes: 0, acertos: 0 })
    await expect(JSON.stringify(await resposta(r), null, 2)).toMatchFileSnapshot('__snapshots__/get.vocab.memoria.json')
  })

  it('conta as revisoes e os acertos (nota >= 3)', async () => {
    expect((await s.post(`/api/vocab/${cartao.id}/review`, { grade: 1 }, dono)).status).toBe(200)
    expect((await s.post(`/api/vocab/${cartao.id}/review`, { grade: 3 }, dono)).status).toBe(200)
    expect(await (await memoria(dono)).json()).toEqual({ revisoes: 2, acertos: 1 })
  })

  it('memoria de cartao alheio ou inexistente: 404', async () => {
    expect((await memoria(outro)).status).toBe(404)
    expect((await s.get('/api/vocab/cartao-que-nao-existe/memoria', dono)).status).toBe(404)
  })

  it('desfazer com corpo fora do schema: 400, e nada muda', async () => {
    for (const corpo of [{}, { box: 9, dueAt: 0 }, { box: 1, dueAt: -5 }]) {
      const r = await s.post(`/api/vocab/${cartao.id}/desfazer`, corpo, dono)
      expect(r.status, JSON.stringify(corpo)).toBe(400)
    }
    expect(await (await memoria(dono)).json()).toEqual({ revisoes: 2, acertos: 1 })
  })

  const antes = () => ({
    box: cartao.box,
    dueAt: cartao.dueAt,
    stability: null,
    difficulty: null,
    reps: 1,
    lapses: 1,
    lastReview: null,
  })

  it('desfazer do cartao alheio: 404, sem tocar no cartao nem no historico do dono', async () => {
    const r = await s.post(`/api/vocab/${cartao.id}/desfazer`, antes(), outro)
    expect(r.status).toBe(404)
    expect(await (await memoria(dono)).json()).toEqual({ revisoes: 2, acertos: 1 })
  })

  it('o dono desfaz: o cartao volta ao estado de antes e a ultima revisao sai da memoria', async () => {
    const r = await s.post(`/api/vocab/${cartao.id}/desfazer`, antes(), dono)
    expect(r.status).toBe(200)
    const corpo = await r.clone().json()
    expect(corpo).toMatchObject({ id: cartao.id, box: cartao.box, dueAt: cartao.dueAt, reps: 1, lapses: 1 })
    await expect(JSON.stringify(await resposta(r), null, 2)).toMatchFileSnapshot(
      '__snapshots__/post.vocab.desfazer.json',
    )
    // Saiu a de nota 3 (a mais recente); fica a de nota 1.
    expect(await (await memoria(dono)).json()).toEqual({ revisoes: 1, acertos: 0 })
  })

  it('desfazer de cartao inexistente: 404', async () => {
    expect((await s.post('/api/vocab/cartao-que-nao-existe/desfazer', antes(), dono)).status).toBe(404)
  })
})
