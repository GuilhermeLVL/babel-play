import { sql } from 'drizzle-orm'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'

import { registrarObservadorDeConsultas } from '../../server/db/observadorDeConsultas'
import { type EphemeralDb, setupEphemeralDb } from '../harness/ephemeralDb'

type Modulo = typeof import('../../server/db/db')

describe('driver do banco (PGlite embutido)', () => {
  let h: EphemeralDb
  let m: Modulo

  beforeAll(async () => {
    h = await setupEphemeralDb()
    m = await h.load<Modulo>('../../server/db/db')
  })
  afterAll(async () => {
    await h.cleanup()
  })

  const contarFlags = async () =>
    m.linhas<{ n: number }>(await m.db.execute(sql`select count(*)::int as n from flags`))[0].n
  const inserirFlag = (tx: import('../../server/db/db').ExecutorDb, chave: string) =>
    tx.execute(sql`insert into flags (chave, atualizado_em) values (${chave}, 1)`)

  it('abre PGlite em memória e responde select 1', async () => {
    expect(m.linhas<{ um: number }>(await m.db.execute(sql`select 1 as um`))).toEqual([{ um: 1 }])
  })

  it('emTransacao desfaz tudo quando a função lança', async () => {
    const antes = await contarFlags()
    await expect(
      m.emTransacao(async (tx) => {
        await inserirFlag(tx, 'tx-desfeita')
        throw new Error('falha proposital')
      }),
    ).rejects.toThrow('falha proposital')
    expect(await contarFlags()).toBe(antes)
  })

  it('erro engolido dentro da transação ainda aborta o COMMIT', async () => {
    const antes = await contarFlags()
    // O Drizzle embrulha o erro do Postgres em `DrizzleQueryError`; a mensagem original fica em `cause`.
    const falha = await m
      .emTransacao(async (tx) => {
        try {
          // chave nula viola NOT NULL e aborta a transação no Postgres
          await tx.execute(sql`insert into flags (chave, atualizado_em) values (null, 1)`)
        } catch {
          /* engolido de propósito */
        }
        await inserirFlag(tx, 'depois-do-erro')
      })
      .then(
        () => undefined,
        (e: Error & { cause?: Error }) => e,
      )
    expect(falha).toBeDefined()
    expect(`${falha?.message} ${falha?.cause?.message}`).toMatch(/current transaction is aborted/)
    expect(await contarFlags()).toBe(antes)
  })

  it('emLote devolve os resultados na ordem e numa transação só', async () => {
    const antes = await contarFlags()
    const ok = await m.emLote((tx) => [
      () => inserirFlag(tx, 'lote-a'),
      () => tx.execute(sql`select chave from flags where chave = 'lote-a'`),
    ])
    expect(m.linhas<{ chave: string }>(ok[1])).toEqual([{ chave: 'lote-a' }])
    expect(await contarFlags()).toBe(antes + 1)

    await expect(
      m.emLote((tx) => [
        () => inserirFlag(tx, 'lote-b'),
        () => inserirFlag(tx, 'lote-c'),
        () => tx.execute(sql`insert into flags (chave, atualizado_em) values (null, 1)`),
      ]),
    ).rejects.toThrow()
    expect(await contarFlags()).toBe(antes + 1)
  })

  it('linhasAfetadas lê rowCount e affectedRows', () => {
    expect(m.linhasAfetadas({ rowCount: 2 })).toBe(2)
    expect(m.linhasAfetadas({ affectedRows: 3 })).toBe(3)
    expect(m.linhasAfetadas({})).toBe(0)
  })

  it('linhas converte count(*) para number', async () => {
    const [r] = m.linhas<{ n: unknown }>(await m.db.execute(sql`select count(*) as n from flags`))
    expect(typeof r.n).toBe('number')
  })

  it('emLote com atualizações ligadas ao tx é atômico (tudo ou nada)', async () => {
    await inserirFlag(m.db, 'atomica-a')
    await inserirFlag(m.db, 'atomica-b')
    await expect(
      m.emLote((tx) => [
        () => tx.execute(sql`update flags set descricao = 'x' where chave = 'atomica-a'`),
        () => tx.execute(sql`update flags set descricao = 'x' where chave = 'atomica-b'`),
        () => tx.execute(sql`update flags set chave = null where chave = 'atomica-b'`),
      ]),
    ).rejects.toThrow()
    const r = m.linhas<{ n: number }>(
      await m.db.execute(sql`select count(*)::int as n from flags where chave like 'atomica-%' and descricao = 'x'`),
    )
    expect(r[0].n).toBe(0)
  })

  it('o observador de consultas recebe a instrução e a duração', async () => {
    const recebidas: Array<{ instrucoes: string[]; segundos: number }> = []
    registrarObservadorDeConsultas((o) => recebidas.push(o))
    try {
      await m.db.execute(sql`select 1`)
    } finally {
      registrarObservadorDeConsultas(undefined)
    }
    const o = recebidas.find((x) => x.instrucoes.some((i) => i.includes('select 1')))
    expect(o).toBeDefined()
    expect(typeof o?.segundos).toBe('number')
    expect(o?.segundos).toBeGreaterThan(0)
  })

  it('instruções dentro de emTransacao e de emLote também chegam ao observador', async () => {
    const recebidas: string[] = []
    registrarObservadorDeConsultas((o) => recebidas.push(...o.instrucoes))
    try {
      await m.emTransacao(async (tx) => {
        await tx.execute(sql`select 'dentro-da-transacao' as x`)
      })
      await m.emLote((tx) => [
        () => tx.execute(sql`select 'dentro-do-lote-1' as x`),
        () => tx.execute(sql`select 'dentro-do-lote-2' as x`),
      ])
    } finally {
      registrarObservadorDeConsultas(undefined)
    }
    expect(recebidas.filter((i) => i.includes('dentro-da-transacao'))).toHaveLength(1)
    expect(recebidas.filter((i) => i.includes('dentro-do-lote-'))).toHaveLength(2)
    // O controle da transação não é trabalho da aplicação e não entra.
    expect(recebidas.filter((i) => /^\s*(begin|commit|rollback)\b/i.test(i))).toEqual([])
  })
})
