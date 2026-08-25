/**
 * Marco 1 — Commit 5: isolamento de exercise_results.
 *
 * Cobre os dois arrays SQL[] (histórico e recordes) além de list/listBySession/listByOrigem.
 * B tem placar MAIOR que A de propósito: se o recorde vazasse, A veria o 100 de B.
 */
import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import { setupEphemeralDb, type EphemeralDb } from '../harness/ephemeralDb'
import { asUserId } from '../../server/lib/authContext'
import { MINIGAME_IDS } from '../../src/core/minigames/revelavel'

const A = asUserId('user-A')
const B = asUserId('user-B')
const JOGO = (MINIGAME_IDS as unknown as string[])[0]

let h: EphemeralDb
let repo: any
let db: any
let schema: any

let sessA: string
let sessB: string

beforeAll(async () => {
  h = await setupEphemeralDb()
  ;({ exerciseResultsRepo: repo } = await h.load('../../server/db/repositories/exerciseResults'))
  ;({ db } = await h.load('../../server/db/db'))
  schema = await h.load('../../server/db/schema')

  // Sessões REAIS de cada dono. Antes o teste usava ids fabricados (sessA/sessB), que
  // passavam porque `add` gravava qualquer sessionId sem conferir. Depois do P2-8 o repo
  // confere o dono e uma sessão inexistente vira `null` — então o teste precisa de sessões
  // de verdade, o que também torna a asserção de tenancy honesta.
  const { sessionsRepo } = await h.load('../../server/db/repositories/sessions') as any
  sessA = (await sessionsRepo.create(A, { title: 'de A', kind: 'audio' })).id
  sessB = (await sessionsRepo.create(B, { title: 'de B', kind: 'audio' })).id

  await repo.add(A, { itemRef: 'house', origem: 'baralho', roundId: 'rA', exerciseKind: JOGO, score: 60, correct: 1, sessionId: sessA })
  await repo.add(B, { itemRef: 'house', origem: 'baralho', roundId: 'rB', exerciseKind: JOGO, score: 100, correct: 0, sessionId: sessB })
})
afterAll(async () => { await h.cleanup() })

describe('Marco 1 — isolamento exerciseResults', () => {
  it('list/listBySession/listByOrigem isolados', async () => {
    const la = await repo.list(A)
    expect(la).toHaveLength(1)
    expect(la[0].userId).toBe('user-A')
    expect(await repo.listBySession(A, sessB)).toHaveLength(0)
    const origA = await repo.listByOrigem(A, 'baralho')
    expect(origA).toHaveLength(1)
    expect(origA[0].userId).toBe('user-A')
  })

  it('histórico por item só conta o do próprio usuário', async () => {
    const hist = await repo.listarHistoricoPorItem(A, { origem: 'baralho' })
    const house = hist.find((x: any) => x.itemRef === 'house')
    expect(house.vezes).toBe(1)          // só a linha de A (não 2)
    expect(house.ultimoAcerto).toBe(true) // A acertou; o erro de B não conta
  })

  it('recordes não vazam entre usuários', async () => {
    const r = (await repo.listarRecordes(A, { origem: 'baralho' })).find((x: any) => x.exerciseKind === JOGO)
    expect(r.melhorPontos).toBe(60) // A; NÃO vê o 100 de B
    expect(r.rodadas).toBe(1)
    const rb = (await repo.listarRecordes(B, { origem: 'baralho' })).find((x: any) => x.exerciseKind === JOGO)
    expect(rb.melhorPontos).toBe(100)
  })

  it('add carimba o dono', async () => {
    const rows = await db.select().from(schema.exerciseResults)
    expect(rows.find((x: any) => x.sessionId === sessA).userId).toBe('user-A')
    expect(rows.find((x: any) => x.sessionId === sessB).userId).toBe('user-B')
  })
})
