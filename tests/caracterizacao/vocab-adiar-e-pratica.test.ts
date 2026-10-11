/**
 * CARACTERIZAÇÃO — o que a revisão enxuta (10/10/2026) pede ao servidor além do que já existia:
 *
 * 1. `PATCH /api/vocab/:id` com `adiarAte` ("Deixar para amanhã", "Descansar 30 dias"): muda SÓ a data em
 *    que o cartão volta a vencer. Não é revisão: a memória do cartão e o histórico ficam como estão.
 *    O teto é um ano a partir de agora; a data de antes volta pelo mesmo caminho (o "Desfazer").
 * 2. `POST /api/vocab/:id/review` aceita a origem das práticas (`pratica:<tipo>`) e a grava em
 *    `review_logs.origem`; origem fora do formato continua sendo 400.
 * 3. As duas são SÓ DO DONO: cartão de outra conta é 404 e não muda.
 */
import { afterAll, beforeAll, describe, expect, it } from 'vitest'

import { type AppDeTeste, semear, subirApp } from './_app'

describe('adiar um cartao e a nota das praticas (modo publico)', () => {
  let s: AppDeTeste
  let dono: string
  let outro: string
  let cartao: { id: string; dueAt: number }

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

  const ler = async () =>
    ((await (await s.get('/api/vocab', dono)).json()) as Array<Record<string, unknown>>).find((c) => c.id === cartao.id)
  const memoria = async () => (await s.get(`/api/vocab/${cartao.id}/memoria`, dono)).json()

  it('adiar muda so a data de vencer: sem revisao no historico e com a memoria do cartao intacta', async () => {
    expect((await s.post(`/api/vocab/${cartao.id}/review`, { grade: 3 }, dono)).status).toBe(200)
    const antes = (await ler()) as Record<string, unknown>
    const ate = Date.now() + 30 * 86_400_000
    const r = await s.patch(`/api/vocab/${cartao.id}`, { adiarAte: ate }, dono)
    expect(r.status).toBe(200)
    const depois = (await r.json()) as Record<string, unknown>
    expect(depois.dueAt).toBe(ate)
    for (const campo of ['stability', 'difficulty', 'reps', 'lapses', 'lastReview', 'box', 'inDeck', 'back'])
      expect(depois[campo], campo).toEqual(antes[campo])
    expect(await memoria()).toEqual({ revisoes: 1, acertos: 1 })

    // O "Desfazer" é outro adiar, com a data de antes.
    const volta = await s.patch(`/api/vocab/${cartao.id}`, { adiarAte: antes.dueAt }, dono)
    expect(((await volta.json()) as Record<string, unknown>).dueAt).toBe(antes.dueAt)
    expect(await memoria()).toEqual({ revisoes: 1, acertos: 1 })
  })

  it('o teto e um ano a partir de agora; valor fora do formato e 400', async () => {
    const r = await s.patch(`/api/vocab/${cartao.id}`, { adiarAte: Date.now() + 5 * 366 * 86_400_000 }, dono)
    expect(r.status).toBe(200)
    const dueAt = ((await r.json()) as { dueAt: number }).dueAt
    expect(dueAt).toBeLessThanOrEqual(Date.now() + 366 * 86_400_000)
    expect(dueAt).toBeGreaterThan(Date.now() + 365 * 86_400_000)
    for (const corpo of [{ adiarAte: -1 }, { adiarAte: 'amanha' }, { adiarAte: 1.5 }])
      expect((await s.patch(`/api/vocab/${cartao.id}`, corpo, dono)).status, JSON.stringify(corpo)).toBe(400)
  })

  it('adiar o cartao alheio: 404, e o cartao do dono nao muda', async () => {
    const antes = (await ler()) as Record<string, unknown>
    expect((await s.patch(`/api/vocab/${cartao.id}`, { adiarAte: Date.now() + 86_400_000 }, outro)).status).toBe(404)
    expect(((await ler()) as Record<string, unknown>).dueAt).toBe(antes.dueAt)
    expect((await s.patch(`/api/vocab/${cartao.id}`, { adiarAte: Date.now() })).status).toBe(401)
  })

  it('a nota de uma pratica entra pelo caminho da revisao, com a origem gravada', async () => {
    const r = await s.post(
      `/api/vocab/${cartao.id}/review`,
      { grade: 3, retencao: 0.9, origem: 'pratica:completar', formato: 'completar' },
      dono,
    )
    expect(r.status).toBe(200)
    expect(await memoria()).toEqual({ revisoes: 2, acertos: 2 })
    const { client } = await s.load('../../server/db/db')
    const linhas = await client.execute({
      sql: 'select origem, formato from review_logs where card_id = ? order by reviewed_at desc limit 1',
      args: [cartao.id],
    })
    expect([linhas.rows[0].origem, linhas.rows[0].formato]).toEqual(['pratica:completar', 'completar'])
  })

  it('origem fora do formato continua sendo 400', async () => {
    for (const origem of ['pratica', 'pratica:', 'pratica:Falar', 'outra:coisa'])
      expect((await s.post(`/api/vocab/${cartao.id}/review`, { grade: 3, origem }, dono)).status, origem).toBe(400)
  })
})
