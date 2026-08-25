/**
 * Provisionamento e idempotência sob concorrência (P1-1, P1-4, P1-5 da auditoria).
 *
 * Os três eram get-then-insert: passavam num processo só porque o libsql serializa numa
 * conexão, e quebravam com 2 réplicas — `users.ensure` derrubou 10/20 cadastros com HTTP 500
 * e `settings` duplicou linha (docs/audit/04-scalability.md §6).
 *
 * `Promise.all` numa conexão não reproduz a corrida entre processos, mas amarra o contrato
 * que a corrige: inserir com ON CONFLICT e deixar o BANCO arbitrar.
 */
import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import { setupEphemeralDb, type EphemeralDb } from '../harness/ephemeralDb'
import { asUserId } from '../../server/lib/authContext'

let h: EphemeralDb
let users: any
let settings: any
let seeds: any
let client: any

beforeAll(async () => {
  h = await setupEphemeralDb()
  ;({ usersRepo: users } = await h.load('../../server/db/repositories/users'))
  ;({ settingsRepo: settings } = await h.load('../../server/db/repositories/settings'))
  ;({ seedSpendsRepo: seeds } = await h.load('../../server/db/repositories/seedSpends'))
  ;({ client } = await h.load('../../server/db/db'))
})
afterAll(async () => { await h.cleanup() })

const contar = async (sql: string, args: any[]) =>
  Number(Object.values((await client.execute({ sql, args })).rows[0])[0])

describe('usersRepo.ensure — P1-1', () => {
  it('20 provisionamentos simultâneos da MESMA conta: nenhum erro, 1 linha', async () => {
    const u = asUserId('pc-user')
    const r = await Promise.all(Array.from({ length: 20 }, () => users.ensure(u)))
    expect(r.every((x) => x?.id === u)).toBe(true)
    expect(await contar('SELECT COUNT(*) FROM users WHERE id = ?', [u])).toBe(1)
  })

  it('não sobrescreve role/status de uma conta já existente', async () => {
    const u = asUserId('pc-admin')
    await users.ensure(u)
    await users.setRole(u, 'admin')
    await users.setStatus(u, 'suspended')

    await users.ensure(u) // 2º acesso não pode rebaixar a conta

    const again = await users.get(u)
    expect(again.role).toBe('admin')
    expect(again.status).toBe('suspended')
  })

  it('ainda grava o e-mail quando ele muda', async () => {
    const u = asUserId('pc-email')
    await users.ensure(u, 'a@x.com')
    const r = await users.ensure(u, 'b@x.com')
    expect(r.email).toBe('b@x.com')
  })
})

describe('settingsRepo.ensure — P1-4', () => {
  it('20 ensure simultâneos criam UMA linha só', async () => {
    const u = asUserId('pc-settings')
    await Promise.all(Array.from({ length: 20 }, () => settings.ensure(u)))
    expect(await contar('SELECT COUNT(*) FROM settings WHERE user_id = ?', [u])).toBe(1)
  })

  it('20 update simultâneos criam UMA linha só e preservam o valor', async () => {
    const u = asUserId('pc-settings-upd')
    await Promise.all(Array.from({ length: 20 }, () => settings.update(u, { targetLanguage: 'pt' })))
    expect(await contar('SELECT COUNT(*) FROM settings WHERE user_id = ?', [u])).toBe(1)
    expect((await settings.get(u)).targetLanguage).toBe('pt')
  })

  it('o banco RECUSA uma segunda linha para o mesmo dono (backstop, não só o código)', async () => {
    const u = asUserId('pc-settings-uq')
    await settings.ensure(u)
    const now = Date.now()
    await expect(client.execute({
      sql: 'INSERT INTO settings (id, created_at, updated_at, user_id) VALUES (?, ?, ?, ?)',
      args: ['duplicata-manual', now, now, u],
    })).rejects.toThrow()
  })
})

describe('seedSpends — P1-5 (spendId por usuário, não global)', () => {
  it('dois usuários podem usar o MESMO spendId sem se atrapalhar', async () => {
    const a = asUserId('pc-seed-a')
    const b = asUserId('pc-seed-b')
    const spendId = 'compra-compartilhada-1'

    const ra = await seeds.debitar(a, { spendId, amount: 3, reason: 'pular-rodada' })
    const rb = await seeds.debitar(b, { spendId, amount: 7, reason: 'pular-rodada' })

    expect(ra.jaExistia).toBe(false)
    expect(rb.jaExistia).toBe(false)
    expect(ra.linha.amount).toBe(3)
    expect(rb.linha.amount).toBe(7) // o gasto de B é o de B, não o de A
  })

  it('o mesmo usuário continua idempotente no mesmo spendId', async () => {
    const u = asUserId('pc-seed-idem')
    const spendId = 'compra-idem-1'
    const r = await Promise.all(
      Array.from({ length: 10 }, () => seeds.debitar(u, { spendId, amount: 2, reason: 'pular-rodada' })),
    )
    expect(r.filter((x) => !x.jaExistia)).toHaveLength(1)
    expect(await contar('SELECT COUNT(*) FROM seed_spends WHERE user_id = ? AND spend_id = ?', [u, spendId])).toBe(1)
    expect(await seeds.totalGasto(u)).toBe(2) // cobrado uma vez só
  })
})
