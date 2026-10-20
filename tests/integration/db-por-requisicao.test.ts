/**
 * `db` POR REQUISIÇÃO (Fase 2, Task 6). Num Worker, cada requisição roda em `comExecutor(executor, fn)`
 * com um `pg.Client` do Hyperdrive; dentro de `fn`, todo `db.*`, `emTransacao`, `emLote` e `travar*`
 * usam esse executor. Fora, o `db` de sempre do Node (Pool ou PGlite).
 *
 * A prova de "passou pelo executor" é uma tabela TEMPORÁRIA: ela só existe na sessão (conexão) que a
 * criou — no Postgres, o `Client` do executor; no modo PGlite, o PGlite próprio do dublê. Quem a enxerga
 * está naquela conexão.
 *
 * Os casos de isolamento entre conexões (uma transação aberta não é vista por outra) só fazem sentido
 * num Postgres de verdade: exigem `TESTE_POSTGRES_URL`.
 */
import { sql } from 'drizzle-orm'
import { integer, pgTable } from 'drizzle-orm/pg-core'
import { afterAll, beforeAll, describe, expect, expectTypeOf, it } from 'vitest'

import type { DB } from '../../server/db/db'
import { abrirBancoDeTeste } from '../harness/bancoDeTeste'
import type { EphemeralDb } from '../harness/ephemeralDb'
import type { DubleDoHyperdrive } from '../harness/workers/hyperdriveDuble'

type ModuloDb = typeof import('../../server/db/db')
type ModuloExecutor = typeof import('../../server/db/executor')

const URL_PG = process.env.TESTE_POSTGRES_URL
const marca = pgTable('marca_exec', { x: integer('x') })

describe('db por requisição (AsyncLocalStorage)', () => {
  let h: EphemeralDb
  let m: ModuloDb
  let ex: ModuloExecutor
  let hyperdrive: DubleDoHyperdrive

  beforeAll(async () => {
    h = await abrirBancoDeTeste({ migrar: false })
    m = await h.load<ModuloDb>('../../server/db/db')
    ex = await h.load<ModuloExecutor>('../../server/db/executor')
    await m.db.execute(sql`select 1`)
    const { dubleDoHyperdrive } = await import('../harness/workers/hyperdriveDuble')
    hyperdrive = dubleDoHyperdrive(m.urlDoBanco())
  })
  afterAll(async () => {
    await h.cleanup()
  })

  /** Executor com a tabela temporária `marca_exec` (x = valor) na sua sessão. */
  async function executorMarcado(valor: number) {
    const e = await hyperdrive.abrir()
    await e.db.execute(sql`create temp table marca_exec (x int)`)
    await e.db.execute(sql`insert into marca_exec values (${valor})`)
    return e
  }
  const lerMarca = async (alvo: Pick<ModuloDb['db'], 'execute'>) =>
    m.linhas<{ x: number }>(await alvo.execute(sql`select x from marca_exec`))[0]?.x

  it('fora de comExecutor não há executor, e o db é o do Node', async () => {
    expect(ex.executorAtual()).toBeUndefined()
    await expect(lerMarca(m.db)).rejects.toThrow()
    expect(m.linhas<{ um: number }>(await m.db.execute(sql`select 1 as um`))).toEqual([{ um: 1 }])
  })

  it('dentro de comExecutor, db.execute/select/transaction, emTransacao, emLote e travar* usam o executor', async () => {
    const a = await executorMarcado(7)
    await a.db.execute(sql`create temp table travas (chave text primary key, criado_em bigint)`)
    try {
      const r = await ex.comExecutor(a, async () => {
        expect(ex.executorAtual()).toBe(a)
        const execute = await lerMarca(m.db)
        const select = (await m.db.select().from(marca))[0]?.x
        const transaction = await m.db.transaction((tx) => lerMarca(tx))
        const emTransacao = await m.emTransacao(async (tx) => {
          await m.travarUsuario(tx, 'u-exec')
          await m.travarGlobal(tx, 'g-exec')
          return lerMarca(tx)
        })
        const lote = await m.emLote((tx) => [
          () => lerMarca(tx),
          () => tx.execute(sql`select count(*) as n from travas`),
        ])
        await expect(m.dbReady()).resolves.toBeUndefined()
        return { execute, select, transaction, emTransacao, lote: [lote[0], m.linhas<{ n: number }>(lote[1])[0]?.n] }
      })
      expect(r).toEqual({ execute: 7, select: 7, transaction: 7, emTransacao: 7, lote: [7, 2] })
      // Fora do escopo, de volta ao Node: a tabela temporária do executor não existe aqui.
      await expect(lerMarca(m.db)).rejects.toThrow()
    } finally {
      await a.fechar()
    }
  })

  it('o Proxy preserva o tipo DB e os métodos de drizzle', async () => {
    const a = await hyperdrive.abrir()
    try {
      expectTypeOf(a.db).toEqualTypeOf<DB>()
      expectTypeOf(m.db).toEqualTypeOf<DB>()
      await ex.comExecutor(a, async () => {
        expect(typeof m.db.transaction).toBe('function')
        expect(typeof m.db.select).toBe('function')
        expect(typeof m.db.execute).toBe('function')
        expect('transaction' in m.db).toBe(true)
      })
    } finally {
      await a.fechar()
    }
  })

  it('dois comExecutor em paralelo não se misturam (cada um vê só a sua sessão, em todo await)', async () => {
    const [a, b] = await Promise.all([executorMarcado(1), executorMarcado(2)])
    try {
      const rodar = (e: typeof a, esperado: number) =>
        ex.comExecutor(e, async () => {
          const vistos: Array<number | undefined> = []
          for (let i = 0; i < 5; i++) {
            vistos.push(await m.emTransacao((tx) => lerMarca(tx)))
            await new Promise((r) => setTimeout(r, Math.random() * 5))
            vistos.push(await lerMarca(m.db))
          }
          return vistos.every((v) => v === esperado)
        })
      expect(await Promise.all([rodar(a, 1), rodar(b, 2)])).toEqual([true, true])
    } finally {
      await Promise.all([a.fechar(), b.fechar()])
    }
  })

  it('fechar() encerra o executor: consulta depois rejeita, e dentro do escopo não cai no Node', async () => {
    const a = await hyperdrive.abrir()
    await a.fechar()
    await expect(a.db.execute(sql`select 1`)).rejects.toThrow()
    await expect(ex.comExecutor(a, () => m.db.execute(sql`select 1`))).rejects.toThrow()
    // O Node segue de pé.
    expect(m.linhas<{ um: number }>(await m.db.execute(sql`select 1 as um`))).toEqual([{ um: 1 }])
  })

  it('schemaPresente responde pelo executor do escopo', async () => {
    const { schemaPresente } = await h.load<typeof import('../../server/db/manutencao')>('../../server/db/manutencao')
    const a = await hyperdrive.abrir()
    try {
      // O banco do executor começa sem schema (PGlite próprio, ou o descartável sem migrations).
      expect(await ex.comExecutor(a, () => schemaPresente())).toBe(false)
      await a.db.execute(sql`create table public.sessions (id text)`)
      expect(await ex.comExecutor(a, () => schemaPresente())).toBe(true)
      await a.db.execute(sql`drop table public.sessions`)
      // No modo PGlite o Node está migrado: lá a resposta é outra, e quem responde é o do escopo.
      if (!URL_PG) expect(await schemaPresente()).toBe(true)
    } finally {
      await a.fechar()
    }
  })

  it('abrirClienteDoHyperdrive rejeita (sem pendurar) quando o banco não responde', async () => {
    const { abrirClienteDoHyperdrive } = await h.load<typeof import('../../server/db/clientePorRequisicao')>(
      '../../server/db/clientePorRequisicao',
    )
    await expect(abrirClienteDoHyperdrive('postgres://ninguem:x@127.0.0.1:1/nada')).rejects.toThrow()
  })

  describe.skipIf(!URL_PG)('isolamento entre conexões (exige TESTE_POSTGRES_URL)', () => {
    beforeAll(async () => {
      await m.db.execute(sql`create table if not exists t6_compartilhada (id int)`)
    })

    it('INSERT dentro de comExecutor(A), em transação aberta, não é visto pelo db do Node até o COMMIT', async () => {
      const a = await hyperdrive.abrir()
      const contar = async () =>
        m.linhas<{ n: number }>(await m.db.execute(sql`select count(*)::int as n from t6_compartilhada`))[0]?.n
      try {
        await m.db.execute(sql`delete from t6_compartilhada`)
        let liberar!: () => void
        const portao = new Promise<void>((r) => (liberar = r))
        let inserido!: () => void
        const jaInseriu = new Promise<void>((r) => (inserido = r))
        const req = ex.comExecutor(a, () =>
          m.emTransacao(async (tx) => {
            await tx.execute(sql`insert into t6_compartilhada values (1)`)
            inserido()
            await portao
          }),
        )
        await jaInseriu
        expect(await contar()).toBe(0)
        liberar()
        await req
        expect(await contar()).toBe(1)
      } finally {
        await a.fechar()
      }
    })

    it('dois requests paralelos com executores distintos não compartilham transação', async () => {
      const [a, b] = await Promise.all([hyperdrive.abrir(), hyperdrive.abrir()])
      try {
        await m.db.execute(sql`delete from t6_compartilhada`)
        let liberar!: () => void
        const portao = new Promise<void>((r) => (liberar = r))
        let inserido!: () => void
        const jaInseriu = new Promise<void>((r) => (inserido = r))
        const contarEm = async () =>
          m.linhas<{ n: number }>(await m.db.execute(sql`select count(*)::int as n from t6_compartilhada`))[0]?.n
        const reqA = ex.comExecutor(a, () =>
          m.emTransacao(async (tx) => {
            await tx.execute(sql`insert into t6_compartilhada values (1)`)
            inserido()
            await portao
            throw new Error('desfaz A')
          }),
        )
        const pids = await ex.comExecutor(b, async () => {
          await jaInseriu
          const visto = await m.emTransacao(() => contarEm())
          liberar()
          await expect(reqA).rejects.toThrow('desfaz A')
          const pidB = m.linhas<{ p: number }>(await m.db.execute(sql`select pg_backend_pid() as p`))[0]?.p
          return { visto, depois: await contarEm(), pidB }
        })
        const pidA = await ex.comExecutor(
          a,
          async () => m.linhas<{ p: number }>(await m.db.execute(sql`select pg_backend_pid() as p`))[0]?.p,
        )
        expect(pids.visto).toBe(0)
        expect(pids.depois).toBe(0)
        expect(pidA).not.toBe(pids.pidB)
      } finally {
        await Promise.all([a.fechar(), b.fechar()])
      }
    })

    it('emTransacao dentro de comExecutor passa pelo Client do executor (medido), não pelo pool', async () => {
      const { registrarObservadorDeConsultas } = await h.load<typeof import('../../server/db/observadorDeConsultas')>(
        '../../server/db/observadorDeConsultas',
      )
      const a = await hyperdrive.abrir()
      const vistas: string[] = []
      try {
        const pidDoNode = m.linhas<{ p: number }>(await m.db.execute(sql`select pg_backend_pid() as p`))[0]?.p
        registrarObservadorDeConsultas((o) => vistas.push(...o.instrucoes))
        const r = await ex.comExecutor(a, async () => {
          const fora = m.linhas<{ p: number }>(
            await m.db.execute(sql`select pg_backend_pid() as p, 'exec-avulsa' as t`),
          )[0]?.p
          const dentro = await m.emTransacao(
            async (tx) =>
              m.linhas<{ p: number }>(await tx.execute(sql`select pg_backend_pid() as p, 'exec-tx' as t`))[0]?.p,
          )
          return { fora, dentro }
        })
        expect(r.dentro).toBe(r.fora)
        expect(r.dentro).not.toBe(pidDoNode)
      } finally {
        registrarObservadorDeConsultas(undefined)
        await a.fechar()
      }
      expect(vistas.filter((i) => i.includes('exec-avulsa'))).toHaveLength(1)
      expect(vistas.filter((i) => i.includes('exec-tx'))).toHaveLength(1)
      expect(vistas.filter((i) => /^\s*(begin|commit|rollback)\b/i.test(i))).toEqual([])
    })

    it('duas emTransacao em paralelo no MESMO executor (um Client) não embaralham BEGIN/COMMIT', async () => {
      const a = await hyperdrive.abrir()
      try {
        await m.db.execute(sql`delete from t6_compartilhada`)
        await ex.comExecutor(a, async () => {
          const desfeita = m.emTransacao(async (tx) => {
            await tx.execute(sql`insert into t6_compartilhada values (1)`)
            await new Promise((r) => setTimeout(r, 20))
            throw new Error('desfaz a primeira')
          })
          const confirmada = m.emTransacao(async (tx) => {
            await tx.execute(sql`insert into t6_compartilhada values (2)`)
          })
          await expect(desfeita).rejects.toThrow('desfaz a primeira')
          await confirmada
        })
        const ids = m.linhas<{ id: number }>(await m.db.execute(sql`select id from t6_compartilhada order by id`))
        expect(ids).toEqual([{ id: 2 }])
      } finally {
        await a.fechar()
      }
    })

    it('db.transaction de dentro de outra no mesmo Client rejeita com o motivo (no Pool seria outra conexão)', async () => {
      const a = await hyperdrive.abrir()
      try {
        const r = ex.comExecutor(a, () => m.emTransacao(() => m.emTransacao(async () => 1)))
        await expect(r).rejects.toThrow(/transação aninhada/)
        // A fila não ficou presa: a próxima transação roda.
        expect(await ex.comExecutor(a, () => m.emTransacao(async () => 2))).toBe(2)
      } finally {
        await a.fechar()
      }
    })
  })
})

describe('fecharBanco antes do primeiro acesso', () => {
  it('o db não abre depois (uma instância aberta assim nunca seria fechada)', async () => {
    const { vi } = await import('vitest')
    vi.resetModules()
    process.env.DATABASE_URL = 'pglite://memory'
    const m = await import('../../server/db/db')
    await m.fecharBanco()
    expect(() => m.db.execute).toThrow(/fechado/)
  })
})
