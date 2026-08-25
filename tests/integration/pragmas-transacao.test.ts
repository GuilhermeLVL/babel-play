/**
 * PRAGMAs sobrevivem a transações (P1-N4) e as escritas em duas etapas são atômicas (P1-N3).
 *
 * Medido em `scripts/audit/v2-diag-pragma-tx.mjs`:
 *
 *   depois de aplicar      busy_timeout = 5000
 *   DENTRO da transação    busy_timeout = 5000
 *   DEPOIS da transação    busy_timeout = 0     ← a conexão é resetada
 *
 * `transaction()` do libsql descarta a conexão ao terminar, e a próxima nasce com os defaults.
 * Ou seja: introduzir transações (P1-N3) sem tratar isso reintroduziria o P0-2 — todas as
 * queries seguintes voltariam a levar SQLITE_BUSY imediato entre processos.
 */
import { describe, it, expect, beforeAll, afterAll, vi } from 'vitest'
import { setupEphemeralDb, type EphemeralDb } from '../harness/ephemeralDb'
import { asUserId } from '../../server/lib/authContext'

let h: EphemeralDb
let client: any
let db: any
let sessions: any
let utterances: any
let pragmas: any

beforeAll(async () => {
  h = await setupEphemeralDb()
  ;({ client, db, aplicarPragmas: pragmas } = await h.load('../../server/db/db') as any)
  ;({ sessionsRepo: sessions } = await h.load('../../server/db/repositories/sessions'))
  ;({ utterancesRepo: utterances } = await h.load('../../server/db/repositories/utterances'))
})
afterAll(async () => { await h.cleanup() })

const pragma = async (nome: string) =>
  Object.values((await client.execute(`PRAGMA ${nome}`)).rows[0] ?? {})[0]

describe('P1-N4 — PRAGMAs sobrevivem a transações', () => {
  it('expõe uma função para reaplicar os PRAGMAs', () => {
    expect(typeof pragmas).toBe('function')
  })

  it('`db.transaction` CRU zera o busy_timeout — é por isso que o wrapper existe', async () => {
    await pragmas()
    expect(Number(await pragma('busy_timeout'))).toBeGreaterThanOrEqual(5000)

    const { sql } = await import('drizzle-orm')
    await db.transaction(async (tx: any) => { await tx.run(sql`SELECT 1`) })

    // Documenta o comportamento do libsql que motiva `emTransacao`. Se um dia isto passar a
    // preservar o pragma, o wrapper vira redundante — e este teste avisa.
    expect(Number(await pragma('busy_timeout'))).toBe(0)
  })

  it('`emTransacao` preserva o busy_timeout depois da transação', async () => {
    const { emTransacao } = await h.load('../../server/db/db') as any
    const { sql } = await import('drizzle-orm')
    await pragmas()

    await emTransacao(async (tx: any) => { await tx.run(sql`SELECT 1`) })
    expect(Number(await pragma('busy_timeout'))).toBeGreaterThanOrEqual(5000)

    // E também quando a transação FALHA — o `finally` tem de reaplicar.
    await expect(emTransacao(async () => { throw new Error('boom') })).rejects.toThrow('boom')
    expect(Number(await pragma('busy_timeout'))).toBeGreaterThanOrEqual(5000)
  })
})

describe('P1-N3 — escrita em duas etapas é atômica', () => {
  /**
   * Faz o insert das falas falhar de verdade DENTRO do batch: viola o NOT NULL de
   * `created_at`. Espionar `insertMany` não serve mais — o caminho atômico monta a
   * instrução com `stmtInsertMany` e a executa dentro do `db.batch`.
   */
  async function comInsertDeFalasQuebrado<T>(fn: () => Promise<T>) {
    const { utterances: tabela } = await h.load('../../server/db/schema') as any
    const spy = vi.spyOn(utterances, 'stmtInsertMany').mockImplementation(
      () => db.insert(tabela).values({ id: 'quebrado', userId: 'x', sessionId: 'y' } as any),
    )
    try { return await fn() } finally { spy.mockRestore() }
  }

  it('createWithUtterances: falha nas falas não deixa sessão órfã', async () => {
    const u = asUserId('tx-orfa')
    const antes = (await client.execute({ sql: 'SELECT COUNT(*) n FROM sessions WHERE user_id = ?', args: [u] })).rows[0].n

    await comInsertDeFalasQuebrado(async () => {
      await expect(sessions.createWithUtterances(u, { title: 'vai falhar', kind: 'audio' }, [{ idx: 0, sourceText: 'x' }])).rejects.toThrow()
    })

    const depois = (await client.execute({ sql: 'SELECT COUNT(*) n FROM sessions WHERE user_id = ?', args: [u] })).rows[0].n
    expect(depois).toBe(antes) // a sessão foi desfeita junto com as falas
  })

  it('replaceUtterances: falha no insert NÃO perde as falas antigas', async () => {
    const u = asUserId('tx-replace')
    const s = await sessions.createWithUtterances(u, { title: 'transcrição', kind: 'audio' }, [
      { idx: 0, sourceText: 'fala original um' },
      { idx: 1, sourceText: 'fala original dois' },
    ])
    expect((await utterances.listBySession(u, s.id)).length).toBe(2)

    await comInsertDeFalasQuebrado(async () => {
      await expect(sessions.replaceUtterances(u, s.id, [{ idx: 0, sourceText: 'nova' }])).rejects.toThrow()
    })

    // Sem atomicidade, o DELETE já teria acontecido e a transcrição estaria perdida.
    const sobrou = await utterances.listBySession(u, s.id)
    expect(sobrou.length).toBe(2)
    expect(sobrou.map((x: any) => x.sourceText).sort()).toEqual(['fala original dois', 'fala original um'])
  })

  it('replaceUtterances funciona normalmente no caminho feliz', async () => {
    const u = asUserId('tx-ok')
    const s = await sessions.createWithUtterances(u, { title: 't', kind: 'audio' }, [{ idx: 0, sourceText: 'antiga' }])
    const r = await sessions.replaceUtterances(u, s.id, [
      { idx: 0, sourceText: 'nova um' },
      { idx: 1, sourceText: 'nova dois aqui' },
    ])
    const falas = await utterances.listBySession(u, s.id)
    expect(falas.length).toBe(2)
    expect(r.wordCount).toBe(5)
  })
})
