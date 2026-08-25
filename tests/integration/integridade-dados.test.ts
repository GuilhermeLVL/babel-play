/**
 * Integridade de dados (P1-7, P1-8, P1-9 da auditoria).
 *
 *  P1-7 — `createWithUtterances` inseria sessão e falas em duas operações soltas: falha na
 *         segunda deixava sessão órfã sem falas, e nada limpava.
 *  P1-8 — `catch { meta = {} }` seguido de `JSON.stringify(meta)` no UPDATE: um `meta`
 *         ilegível não era reportado, era SOBRESCRITO por vazio e persistido, destruindo
 *         `audioFile`/`pinned`/`imageUrl` de forma permanente.
 *  P1-9 — o DELETE respondia `{ok:true}` mesmo quando a remoção do arquivo falhava, com
 *         duplo swallow. Pedido de exclusão confirmado sem exclusão efetiva (LGPD/GDPR).
 */
import { describe, it, expect, beforeAll, afterAll, vi } from 'vitest'
import { setupEphemeralDb, type EphemeralDb } from '../harness/ephemeralDb'
import { asUserId } from '../../server/lib/authContext'

let h: EphemeralDb
let sessions: any
let utterances: any
let client: any

beforeAll(async () => {
  h = await setupEphemeralDb()
  ;({ sessionsRepo: sessions } = await h.load('../../server/db/repositories/sessions'))
  ;({ utterancesRepo: utterances } = await h.load('../../server/db/repositories/utterances'))
  ;({ client } = await h.load('../../server/db/db'))
})
afterAll(async () => { await h.cleanup() })

const contar = async (sql: string, args: any[]) =>
  Number(Object.values((await client.execute({ sql, args })).rows[0])[0])

describe('createWithUtterances — P1-7 (atomicidade)', () => {
  it('grava sessão e falas juntas no caminho feliz', async () => {
    const u = asUserId('int-ok')
    const s = await sessions.createWithUtterances(u, { title: 'ok', kind: 'audio' }, [
      { idx: 0, sourceText: 'hello world' },
      { idx: 1, sourceText: 'segunda fala' },
    ])
    expect(await contar('SELECT COUNT(*) FROM utterances WHERE session_id = ?', [s.id])).toBe(2)
    expect(s.wordCount).toBe(4)
  })

  it('falha ao inserir as falas NÃO deixa sessão órfã', async () => {
    const u = asUserId('int-orfa')
    const antes = await contar('SELECT COUNT(*) FROM sessions WHERE user_id = ?', [u])

    // O caminho deixou de ser compensação manual (que chamava `insertMany`) e virou
    // `db.batch` com a instrução montada por `stmtInsertMany` — P1-N3 da re-auditoria.
    // Espionar `insertMany` não intercepta mais nada; a falha tem de vir da instrução.
    const { db } = await h.load('../../server/db/db') as any
    const { utterances: tabela } = await h.load('../../server/db/schema') as any
    const boom = vi.spyOn(utterances, 'stmtInsertMany').mockImplementation(
      () => db.insert(tabela).values({ id: 'quebrado', userId: 'x', sessionId: 'y' } as any),
    )
    try {
      await expect(
        sessions.createWithUtterances(u, { title: 'vai falhar', kind: 'audio' }, [{ idx: 0, sourceText: 'x' }]),
      ).rejects.toThrow()
    } finally {
      boom.mockRestore()
    }

    expect(await contar('SELECT COUNT(*) FROM sessions WHERE user_id = ?', [u])).toBe(antes)
  })
})

describe('patchMeta — P1-8 (não destruir meta ilegível)', () => {
  it('mescla normalmente quando o meta é válido', async () => {
    const u = asUserId('int-meta')
    const s = await sessions.create(u, { title: 'm', kind: 'audio' })
    await sessions.patchMeta(u, s.id, { pinned: true })
    const r = await sessions.patchMeta(u, s.id, { imageUrl: 'https://x.test/a.png' })
    const meta = JSON.parse(r.meta)
    expect(meta.pinned).toBe(true)
    expect(meta.imageUrl).toBe('https://x.test/a.png')
  })

  it('meta CORROMPIDO falha alto em vez de ser sobrescrito por vazio', async () => {
    const u = asUserId('int-meta-corrompido')
    const s = await sessions.create(u, { title: 'm', kind: 'audio' })
    await client.execute({ sql: 'UPDATE sessions SET meta = ? WHERE id = ?', args: ['{isto não é json', s.id] })

    await expect(sessions.patchMeta(u, s.id, { pinned: true })).rejects.toThrow()

    // O conteúdo original continua lá para diagnóstico — não foi trocado por '{}'.
    const r = await client.execute({ sql: 'SELECT meta FROM sessions WHERE id = ?', args: [s.id] })
    expect(r.rows[0].meta).toBe('{isto não é json')
  })

  it('setAudio também não destrói meta corrompido', async () => {
    const u = asUserId('int-audio-corrompido')
    const s = await sessions.create(u, { title: 'm', kind: 'audio' })
    await client.execute({ sql: 'UPDATE sessions SET meta = ? WHERE id = ?', args: ['{quebrado', s.id] })

    await expect(sessions.setAudio(u, s.id, 'a.webm', 'audio/webm')).rejects.toThrow()

    const r = await client.execute({ sql: 'SELECT meta FROM sessions WHERE id = ?', args: [s.id] })
    expect(r.rows[0].meta).toBe('{quebrado')
  })
})
