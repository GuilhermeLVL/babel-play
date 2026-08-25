/**
 * Fatia 5 / passo 6 — a migração sem conta → conta é IDEMPOTENTE por `origemLocalId`.
 *
 * Falha-antes: `createSessionSchema` fazia `.strip()` sem o campo, o id era gerado no servidor e
 * não havia unique em `sessions` — reenviar o mesmo POST criava uma segunda sessão.
 */
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { setupEphemeralDb, type EphemeralDb } from '../harness/ephemeralDb'
import { asUserId } from '../../server/lib/authContext'

const A = asUserId('origem-local-a')
const B = asUserId('origem-local-b')
const ORIGEM = '11111111-2222-4333-8444-555555555555'

let h: EphemeralDb
let sessionsRepo: typeof import('../../server/db/repositories/sessions').sessionsRepo
let db: typeof import('../../server/db/db').db
let schema: typeof import('../../server/db/schema')
let eq: typeof import('drizzle-orm').eq

beforeAll(async () => {
  h = await setupEphemeralDb()
  ;({ sessionsRepo } = await h.load('../../server/db/repositories/sessions'))
  ;({ db } = await h.load('../../server/db/db'))
  schema = await h.load('../../server/db/schema')
  ;({ eq } = await h.load('drizzle-orm'))
})
afterAll(async () => { await h.cleanup() })

const falas = [{ idx: 0, sourceText: 'hello there' }, { idx: 1, sourceText: 'bye' }]

describe('criarOuReusar por origemLocalId', () => {
  it('mesmo usuário, mesma origem → UMA sessão, a segunda chamada diz jaExistia', async () => {
    const a = await sessionsRepo.criarOuReusar(A, { title: 'Aula', origemLocalId: ORIGEM }, falas)
    const b = await sessionsRepo.criarOuReusar(A, { title: 'Aula (de novo)', origemLocalId: ORIGEM }, falas)
    expect(a.jaExistia).toBe(false)
    expect(b.jaExistia).toBe(true)
    expect(b.session.id).toBe(a.session.id)
    expect(b.session.title).toBe('Aula')
    expect((await sessionsRepo.list(A)).filter((s) => s.origemLocalId === ORIGEM)).toHaveLength(1)
  })

  it('usuários diferentes com a mesma origem são sessões diferentes (a chave é por usuário)', async () => {
    const b = await sessionsRepo.criarOuReusar(B, { title: 'Outra', origemLocalId: ORIGEM }, falas)
    expect(b.jaExistia).toBe(false)
    expect((await sessionsRepo.list(B)).map((s) => s.id)).toContain(b.session.id)
  })

  it('apagada (soft-delete), a mesma origem pode entrar de novo — o índice é parcial', async () => {
    const viva = await sessionsRepo.findByOrigemLocal(A, ORIGEM)
    expect(viva).toBeTruthy()
    await db.update(schema.sessions).set({ deletedAt: Date.now() }).where(eq(schema.sessions.id, viva!.id))
    const nova = await sessionsRepo.criarOuReusar(A, { title: 'Volta', origemLocalId: ORIGEM }, falas)
    expect(nova.jaExistia).toBe(false)
    expect(nova.session.id).not.toBe(viva!.id)
  })

  it('sem origemLocalId é a criação normal: duas chamadas, duas sessões', async () => {
    const x = await sessionsRepo.criarOuReusar(A, { title: 'Solta' }, falas)
    const y = await sessionsRepo.criarOuReusar(A, { title: 'Solta' }, falas)
    expect(x.session.id).not.toBe(y.session.id)
    expect(x.session.origemLocalId).toBeNull()
  })

  it('o UNIQUE arbitra a corrida: inserir por fora com a mesma origem devolve a vencedora, não erro', async () => {
    const ORIGEM2 = '22222222-2222-4333-8444-555555555555'
    const primeira = await sessionsRepo.createWithUtterances(A, { title: 'Aba 1', origemLocalId: ORIGEM2 }, falas)
    // Uma segunda aba que não viu a primeira chega ao insert — o catch re-lê a vencedora.
    await expect(sessionsRepo.createWithUtterances(A, { title: 'Aba 2', origemLocalId: ORIGEM2 }, falas)).rejects.toThrow(/UNIQUE/i)
    const r = await sessionsRepo.criarOuReusar(A, { title: 'Aba 2', origemLocalId: ORIGEM2 }, falas)
    expect(r.jaExistia).toBe(true)
    expect(r.session.id).toBe(primeira.id)
  })
})
