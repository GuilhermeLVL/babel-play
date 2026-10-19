/**
 * As escritas em duas etapas são atômicas (P1-N3).
 *
 * Veio de `pragmas-transacao.test.ts`, apagado na migração para o Postgres: a outra metade daquele
 * arquivo (P1-N4, o `busy_timeout` do SQLite zerado depois de `transaction()`) deixou de existir junto
 * com os PRAGMAs. Esta metade continua valendo: criar sessão com falas e trocar as falas de uma
 * sessão são duas instruções, e a falha da segunda não pode deixar a primeira gravada.
 */
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest'

import { asUserId } from '../../server/lib/authContext'
import { clienteSql } from '../harness/clienteSql'
import { type EphemeralDb, setupEphemeralDb } from '../harness/ephemeralDb'

let h: EphemeralDb
let client: ReturnType<typeof clienteSql>
let sessions: any
let utterances: any

beforeAll(async () => {
  h = await setupEphemeralDb()
  client = clienteSql(await h.load('../../server/db/db'))
  ;({ sessionsRepo: sessions } = await h.load('../../server/db/repositories/sessions'))
  ;({ utterancesRepo: utterances } = await h.load('../../server/db/repositories/utterances'))
})
afterAll(async () => {
  await h.cleanup()
})

describe('P1-N3 — escrita em duas etapas é atômica', () => {
  /**
   * Faz o insert das falas falhar de verdade DENTRO do lote: viola o NOT NULL de `created_at`.
   * Espionar `insertMany` não serve — o caminho atômico monta a instrução com `stmtInsertMany` e a
   * executa dentro do `emLote`, com o `tx` que ele recebe.
   */
  async function comInsertDeFalasQuebrado<T>(fn: () => Promise<T>) {
    const { utterances: tabela } = (await h.load('../../server/db/schema')) as any
    const spy = vi
      .spyOn(utterances, 'stmtInsertMany')
      .mockImplementation(() => [
        (tx: any) => tx.insert(tabela).values({ id: 'quebrado', userId: 'x', sessionId: 'y' } as any),
      ])
    try {
      return await fn()
    } finally {
      spy.mockRestore()
    }
  }

  const contarSessoes = async (u: string) =>
    Number((await client.execute({ sql: 'SELECT COUNT(*) AS n FROM sessions WHERE user_id = ?', args: [u] })).rows[0].n)

  it('createWithUtterances: falha nas falas não deixa sessão órfã', async () => {
    const u = asUserId('tx-orfa')
    const antes = await contarSessoes(u)

    await comInsertDeFalasQuebrado(async () => {
      await expect(
        sessions.createWithUtterances(u, { title: 'vai falhar', kind: 'audio' }, [{ idx: 0, sourceText: 'x' }]),
      ).rejects.toThrow()
    })

    expect(await contarSessoes(u)).toBe(antes) // a sessão foi desfeita junto com as falas
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
