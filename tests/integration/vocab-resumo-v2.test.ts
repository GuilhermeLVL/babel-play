/**
 * `GET /api/vocab/resumo?v2=1` (flag `estudo_revisao_v2`; openspec `cartoes` 3.7 e 8.1): o tempo médio por cartão (só o que
 * `review_logs.resposta_ms` já guarda) e a sequência com os dias congelados.
 *
 * Sem o `v2` a resposta é a de sempre (nenhum campo novo, nenhuma consulta nova). Tudo é da conta de quem pede: o tempo e os
 * dias de outra pessoa nunca entram.
 */
process.env.TZ = 'America/Sao_Paulo'

import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest'

import type { ResumoDosCartoes } from '../../src/core/learning/resumoDosCartoes'
import { type AppDeTeste, subirApp } from '../caracterizacao/_app'

const DIA = 86_400_000
const HORA = 3_600_000
/** 05/10/2026 15:00 UTC; meia-noite de quem pediu = 03:00 UTC (São Paulo). */
const AGORA = Date.UTC(2026, 9, 5, 15, 0, 0)
const HOJE = AGORA - 12 * HORA
const A = 'resumo-v2-a'
const B = 'resumo-v2-b'
const C = 'resumo-v2-c'
const rota = (v2: boolean) => `/api/vocab/resumo?inicioDoDia=${HOJE}${v2 ? '&v2=1' : ''}`

describe('GET /api/vocab/resumo?v2=1', () => {
  let s: AppDeTeste
  let a: string
  let b: string
  let c: string

  const ler = async (token: string, v2: boolean): Promise<ResumoDosCartoes> => {
    const r = await s.get(rota(v2), token)
    expect(r.status).toBe(200)
    return (await r.json()) as ResumoDosCartoes
  }

  beforeAll(async () => {
    vi.useFakeTimers({ toFake: ['Date'] })
    vi.setSystemTime(AGORA)
    s = await subirApp({ modo: 'publico' })
    a = await s.token(A)
    b = await s.token(B)
    c = await s.token(C)
    for (const token of [a, b, c]) {
      expect((await s.get('/api/me/entitlements', token)).status).toBe(200)
      expect((await s.put('/api/me/idade', { nascimento: '1990-05-17' }, token)).status).toBeLessThan(300)
    }
    const { db } = await s.load('../../server/db/db')
    const t = await s.load('../../server/db/schema')
    for (const [id, userId] of [
      ['c1', A],
      ['b1', B],
      ['d1', C],
    ] as const) {
      await db.insert(t.vocabCards).values({
        id,
        createdAt: AGORA - 20 * DIA,
        updatedAt: AGORA - 20 * DIA,
        userId,
        word: `palavra-${id}`,
        back: 'tradução',
        srcLang: 'en',
        tgtLang: 'pt',
        inDeck: 1,
        box: 1,
        dueAt: AGORA - 1000,
        reps: 0,
        lapses: 0,
        addedAt: AGORA - 20 * DIA,
        normKey: `k|${id}`,
        occurrences: 1,
      })
    }
    /* A: 12 respostas da Revisão de 4 s a 10 s (média 7000), uma de jogo, uma de 20 min (abandono), uma de 40 dias atrás,
       uma sem tempo e uma apagada. B: respostas lentas que não podem entrar na média de A. */
    const logs: Array<{
      em: number
      ms: number | null
      origem?: string
      de?: string
      apagada?: boolean
    }> = [
      ...Array.from({ length: 12 }, (_, k) => ({ em: HOJE + HORA + k * 60_000, ms: k % 2 ? 4000 : 10_000 })),
      { em: HOJE + 2 * HORA, ms: 90_000, origem: 'jogo:blitz' },
      { em: HOJE + 3 * HORA, ms: 1_200_000 },
      { em: HOJE - 40 * DIA, ms: 50_000 },
      { em: HOJE + 4 * HORA, ms: null },
      { em: HOJE + 5 * HORA, ms: 60_000, apagada: true },
      { em: HOJE + HORA, ms: 30_000, de: B },
    ]
    for (const [k, l] of logs.entries()) {
      await db.insert(t.reviewLogs).values({
        id: `rev-${k}`,
        createdAt: l.em,
        updatedAt: l.em,
        userId: l.de ?? A,
        deletedAt: l.apagada ? AGORA - 5 : null,
        cardId: l.de ? 'b1' : 'c1',
        reviewedAt: l.em,
        grade: 3,
        origem: l.origem ?? 'revisao',
        respostaMs: l.ms,
      })
    }
    /* C: pratica há 5, 4 e 3 dias, NÃO pratica há 2, e pratica ontem e hoje; a meta do dia de há 4 dias foi creditada, o que
       rende um congelamento, e ele cobre o dia sem prática (há 2 dias). */
    for (const k of [5, 4, 3, 1, 0]) {
      const em = HOJE - k * DIA + HORA
      await db.insert(t.reviewLogs).values({
        id: `rev-c-${k}`,
        createdAt: em,
        updatedAt: em,
        userId: C,
        deletedAt: null,
        cardId: 'd1',
        reviewedAt: em,
        grade: 3,
        origem: 'revisao',
        respostaMs: 5000,
      })
    }
    await db.insert(t.seedCredits).values({
      id: 'cred-meta-c',
      createdAt: HOJE - 4 * DIA + 2 * HORA,
      updatedAt: HOJE - 4 * DIA + 2 * HORA,
      userId: C,
      deletedAt: null,
      creditoId: 'meta:2026-10-01',
      amount: 0,
      xp: 0,
      reason: 'meta',
    })
  }, 60_000)

  afterAll(async () => {
    await s.encerrar()
    vi.useRealTimers()
  })

  it('o tempo médio vem só das notas da Revisão da própria conta, de 30 dias, sem abandono', async () => {
    const r = await ler(a, true)
    expect(r.tempo).toEqual({ n: 12, mediaMs: 7000 })
  })

  it('a outra conta tem o dela e não vê o de A', async () => {
    const r = await ler(b, true)
    expect(r.tempo).toEqual({ n: 1, mediaMs: 30_000 })
  })

  it('a sequência traz os dias de prática contados para trás de hoje (0 = hoje), no fuso gravado', async () => {
    const r = await ler(a, true)
    expect(r.sequencia).toBeTruthy()
    expect(r.sequencia?.praticados).toContain(0)
    expect(r.sequencia?.congelados).toEqual([])
    expect(r.sequencia?.congelamentos).toBe(0)
  })

  it('um dia congelado: a prática pulou há 2 dias e o congelamento guardado cobriu', async () => {
    const r = await ler(c, true)
    expect(r.sequencia).toEqual({
      atual: 5,
      congelamentos: 0,
      praticados: [0, 1, 3, 4, 5],
      congelados: [2],
    })
  })

  it('sem o v2 a resposta é a de sempre: nenhum campo novo', async () => {
    const r = await ler(a, false)
    expect('tempo' in r).toBe(false)
    expect('sequencia' in r).toBe(false)
  })

  it('o ETag do v2 não vale para o pedido sem v2', async () => {
    const com = await s.get(rota(true), a)
    const sem = await s.get(rota(false), a)
    expect(com.headers.get('etag')).not.toBe(sem.headers.get('etag'))
    const igual = await s.chamar('GET', rota(true), {
      token: a,
      headers: { 'if-none-match': com.headers.get('etag') ?? '' },
    })
    expect(igual.status).toBe(304)
  })

  it('valor inválido de v2 dá 400', async () => {
    const r = await s.get(`/api/vocab/resumo?inicioDoDia=${HOJE}&v2=sim`, a)
    expect(r.status).toBe(400)
  })

  it('sem login, 401', async () => {
    const r = await s.get(rota(true))
    expect(r.status).toBe(401)
  })
})
