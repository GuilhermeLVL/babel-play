/**
 * Marco 1 — Commit 3: isolamento de sessions + utterances.
 *
 * Prova as DUAS metades: (1) leitura — A nunca vê os dados de B; (2) escrita — update/remove/
 * replace de A sobre linha de B são no-op (pega o WHERE id=? que esqueceu AND user_id=?).
 */
import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import { setupEphemeralDb, type EphemeralDb } from '../harness/ephemeralDb'
import { asUserId } from '../../server/lib/authContext'

const A = asUserId('user-A')
const B = asUserId('user-B')

let h: EphemeralDb
let sessionsRepo: any
let utterancesRepo: any
let db: any
let schema: any
let aSession: any
let bSession: any

beforeAll(async () => {
  h = await setupEphemeralDb()
  ;({ sessionsRepo } = await h.load('../../server/db/repositories/sessions'))
  ;({ utterancesRepo } = await h.load('../../server/db/repositories/utterances'))
  ;({ db } = await h.load('../../server/db/db'))
  schema = await h.load('../../server/db/schema')

  aSession = await sessionsRepo.createWithUtterances(A, { title: 'A-sess' }, [
    { idx: 0, sourceText: 'hello from A', sourceLang: 'en', targetLang: 'pt' },
  ])
  bSession = await sessionsRepo.createWithUtterances(B, { title: 'B-sess' }, [
    { idx: 0, sourceText: 'oi do B', sourceLang: 'pt', targetLang: 'en' },
  ])
})
afterAll(async () => { await h.cleanup() })

describe('Marco 1 — isolamento sessions/utterances', () => {
  it('list só devolve as sessões do próprio usuário', async () => {
    expect((await sessionsRepo.list(A)).map((s: any) => s.id)).toEqual([aSession.id])
    expect((await sessionsRepo.list(B)).map((s: any) => s.id)).toEqual([bSession.id])
  })

  it('get/getWithUtterances de outro usuário → undefined', async () => {
    expect(await sessionsRepo.get(A, bSession.id)).toBeUndefined()
    expect(await sessionsRepo.getWithUtterances(A, bSession.id)).toBeUndefined()
  })

  it('as falas de B não vazam para A', async () => {
    expect(await utterancesRepo.listBySession(A, bSession.id)).toHaveLength(0)
    const allA = await utterancesRepo.listAll(A)
    expect(allA).toHaveLength(1)
    expect(allA[0].sessionId).toBe(aSession.id)
  })

  it('insert carimba o dono certo (user_id na linha)', async () => {
    const rows = await db.select().from(schema.sessions)
    expect(rows.find((r: any) => r.id === aSession.id).userId).toBe('user-A')
    expect(rows.find((r: any) => r.id === bSession.id).userId).toBe('user-B')
  })

  it('update/patchMeta/remove de A sobre a sessão de B são no-op', async () => {
    expect(await sessionsRepo.update(A, bSession.id, { title: 'HACKEADO' })).toBeUndefined()
    expect(await sessionsRepo.patchMeta(A, bSession.id, { pinned: true })).toBeUndefined()
    await sessionsRepo.remove(A, bSession.id) // não deve apagar a sessão de B
    const still = await sessionsRepo.get(B, bSession.id)
    expect(still).toBeDefined()
    expect(still.title).toBe('B-sess')
    expect(still.deletedAt ?? null).toBeNull()
  })

  it('replaceUtterances de A não apaga as falas de B', async () => {
    expect(await sessionsRepo.replaceUtterances(A, bSession.id, [])).toBeUndefined()
    expect(await utterancesRepo.listBySession(B, bSession.id)).toHaveLength(1)
  })

  it('utterancesRepo.update e relabel de A sobre fala de B são no-op', async () => {
    const target = (await utterancesRepo.listBySession(B, bSession.id))[0]
    expect(await utterancesRepo.update(A, target.id, { sourceText: 'HACK' })).toBeUndefined()
    expect(await utterancesRepo.relabel(A, [{ id: target.id, sourceLang: 'xx', targetLang: 'yy' }])).toBe(0)
    const after = (await utterancesRepo.listBySession(B, bSession.id))[0]
    expect(after.sourceText).toBe('oi do B')
    expect(after.sourceLang).toBe('pt')
  })
})
