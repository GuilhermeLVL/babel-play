/**
 * CARACTERIZAÇÃO — `GET /api/vocab/memoria-por-baralho` (openspec `cartoes` 4.2; flag `estudo_palavras_v2`):
 *
 * 1. flag desligada: 404; sem token: 401;
 * 2. dois baralhos do Anki com retenções diferentes: as contagens vêm cruas por baralho e a regra dos 20 do núcleo
 *    (`retencaoDoBaralho`) dá 80% para um e "sem número" para o outro (5 revisões);
 * 3. a próxima revisão é a menor data dos cartões NO baralho (suspenso e apagado não contam);
 * 4. só a conta de quem pede: o histórico de outra conta não entra, e revisão apagada ou fora da janela também não.
 */
import { sql } from 'drizzle-orm'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'

import { type MemoriaPorBaralho, retencaoDoBaralho } from '../../src/core/palavras/memoriaDoBaralho'
import { type AppDeTeste, subirApp } from './_app'

const DIA = 86_400_000

describe('GET /api/vocab/memoria-por-baralho', () => {
  let s: AppDeTeste
  let ana: string
  let bia: string

  const ler = async (token?: string) => s.get('/api/vocab/memoria-por-baralho', token)

  beforeAll(async () => {
    s = await subirApp({ modo: 'publico', adultoPorPadrao: true })
    ana = await s.token('mem-ana')
    bia = await s.token('mem-bia')
    const { db } = await s.load<typeof import('../../server/db/db')>('../../server/db/db')
    const t = await s.load<typeof import('../../server/db/schema')>('../../server/db/schema')
    const agora = Date.now()
    for (const token of [ana, bia]) expect((await s.get('/api/me/entitlements', token)).status).toBe(200)
    const ids = { ana: 'mem-ana', bia: 'mem-bia' }

    const cartoes: Array<{ id: string; dono: string; due: number | null; inDeck?: number; apagado?: boolean }> = [
      { id: 'a1', dono: ids.ana, due: agora + 3 * DIA },
      { id: 'a2', dono: ids.ana, due: agora + 1 * DIA },
      { id: 'a3', dono: ids.ana, due: agora - 10 * DIA, inDeck: 0 }, // suspenso: não conta na próxima
      { id: 'a4', dono: ids.ana, due: agora - 20 * DIA, apagado: true }, // apagado: idem
      { id: 'b1', dono: ids.ana, due: agora + 9 * DIA },
      { id: 'x1', dono: ids.bia, due: agora + 1 * DIA },
    ]
    for (const c of cartoes) {
      await db.insert(t.vocabCards).values({
        id: c.id,
        createdAt: agora - 40 * DIA,
        updatedAt: agora - 40 * DIA,
        userId: c.dono,
        deletedAt: c.apagado ? agora - DIA : null,
        word: `p-${c.id}`,
        back: 'x',
        srcLang: 'en',
        tgtLang: 'pt',
        inDeck: c.inDeck ?? 1,
        box: 1,
        dueAt: c.due,
        reps: 3,
        lapses: 0,
        addedAt: agora - 40 * DIA,
        normKey: `k|${c.id}`,
        occurrences: 1,
      })
    }
    const ocorrencias: Array<[string, string, string]> = [
      ['a1', 'dA', ids.ana],
      ['a2', 'dA', ids.ana],
      ['a3', 'dA', ids.ana],
      ['a4', 'dA', ids.ana],
      ['b1', 'dB', ids.ana],
      ['x1', 'dA', ids.bia],
    ]
    for (const [k, [cardId, ref, userId]] of ocorrencias.entries()) {
      await db.insert(t.vocabOccurrences).values({
        id: `occ-${k}`,
        createdAt: agora - DIA,
        updatedAt: agora - DIA,
        userId,
        cardId,
        occurredAt: agora - DIA,
        originKind: 'anki',
        originRef: ref,
      })
    }
    let n = 0
    const nota = async (cardId: string, userId: string, grade: number, quando: number, apagada = false) => {
      await db.insert(t.reviewLogs).values({
        id: `rev-${n++}`,
        createdAt: quando,
        updatedAt: quando,
        userId,
        deletedAt: apagada ? agora : null,
        cardId,
        reviewedAt: quando,
        grade,
      })
    }
    // dA: 30 notas na janela, 24 lembradas (80%)
    for (let i = 0; i < 30; i++) await nota('a1', ids.ana, i < 24 ? 3 : 1, agora - (1 + (i % 20)) * DIA)
    await nota('a1', ids.ana, 1, agora - 100 * DIA) // fora da janela de 90 dias
    await nota('a1', ids.ana, 1, agora - DIA, true) // apagada
    // dB: só 5 notas, todas lembradas
    for (let i = 0; i < 5; i++) await nota('b1', ids.ana, 4, agora - (i + 1) * DIA)
    // outra conta, mesmo baralho dA
    for (let i = 0; i < 25; i++) await nota('x1', ids.bia, 1, agora - DIA)
  }, 60_000)

  afterAll(async () => {
    await s.encerrar()
  })

  const ligar = async (ligada: boolean) => {
    const { db } = await s.load<typeof import('../../server/db/db')>('../../server/db/db')
    const { invalidarCacheDeFlags } = await s.load<typeof import('../../server/lib/flags')>('../../server/lib/flags')
    await db.execute(sql`update flags set habilitada = ${ligada} where chave = 'estudo_palavras_v2'`)
    invalidarCacheDeFlags()
  }

  it('desligada: 404; sem token: 401', async () => {
    expect((await ler(ana)).status).toBe(404)
    expect((await ler()).status).toBe(401)
  })

  it('ligada: contagens por baralho, regra dos 20 e próxima revisão', async () => {
    await ligar(true)
    const r = await ler(ana)
    expect(r.status).toBe(200)
    const corpo = (await r.json()) as MemoriaPorBaralho
    const anki = corpo.baralhos.filter((b) => b.tipo === 'anki')
    const dA = anki.find((b) => b.id === 'dA')!
    const dB = anki.find((b) => b.id === 'dB')!
    expect([dA.revisoes, dA.lembradas]).toEqual([30, 24])
    expect(retencaoDoBaralho(dA)).toBe(80)
    expect([dB.revisoes, dB.lembradas]).toEqual([5, 5])
    expect(retencaoDoBaralho(dB)).toBeNull()
    // próxima: a2 (amanhã) no dA, ignorando o suspenso e o apagado; b1 no dB
    expect(dA.proximaRevisao! - corpo.agora).toBeGreaterThan(0.9 * DIA)
    expect(dA.proximaRevisao! - corpo.agora).toBeLessThan(1.1 * DIA)
    expect(Math.round((dB.proximaRevisao! - corpo.agora) / DIA)).toBe(9)
    // o idioma tem os dois baralhos juntos: 35 notas, 29 lembradas
    const en = corpo.baralhos.find((b) => b.tipo === 'idioma' && b.id === 'en')!
    expect([en.revisoes, en.lembradas]).toEqual([35, 29])
    expect(JSON.stringify(corpo)).not.toContain('x1')
  })

  it('a outra conta enxerga só o dela', async () => {
    const corpo = (await (await ler(bia)).json()) as MemoriaPorBaralho
    const dA = corpo.baralhos.find((b) => b.tipo === 'anki' && b.id === 'dA')!
    expect([dA.revisoes, dA.lembradas]).toEqual([25, 0])
    expect(corpo.baralhos.some((b) => b.id === 'dB')).toBe(false)
  })
})
