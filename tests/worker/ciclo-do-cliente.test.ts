/**
 * O CICLO DO `Client` DA REQUISIÇÃO NO WORKER (revisão final da Fase 2, achado C1).
 *
 * As rotas respondem e só DEPOIS, no `finally`, devolvem a vaga de IA em voo ou estornam a cota (uma
 * escrita travada). No Worker, o `Client` fechava assim que o corpo saía e a lista do `waitUntil`
 * esvaziava — ninguém esperava a promessa do handler do Express — e o `end()` do `pg` cortava a escrita.
 * As duas defesas, provadas aqui:
 *   (a) o executor conta o trabalho em voo (consultas e a fila de transações) e o `fechar()` espera ficar
 *       ocioso (com teto) antes do `end()`; depois do fechar, toda consulta rejeita com o motivo;
 *   (b) no modo Worker, `capturarAssincrono` registra a promessa do handler em `emSegundoPlano`: o
 *       `waitUntil` da requisição segura o `Client` até o handler terminar, `finally` incluído.
 *
 * Roda no PGlite (o dublê do Hyperdrive) e num Postgres real com `TESTE_POSTGRES_URL` — no Postgres, a
 * gravação é conferida também por outra conexão (a do Node).
 */
import { sql } from 'drizzle-orm'
import express, { type NextFunction, type Request, type Response } from 'express'
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from 'vitest'

import type { Executor } from '../../server/db/executor'
import { abrirBancoDeTeste } from '../harness/bancoDeTeste'
import type { EphemeralDb } from '../harness/ephemeralDb'
import type { DubleDoHyperdrive } from '../harness/workers/hyperdriveDuble'

type ModuloDb = typeof import('../../server/db/db')

const URL_PG = process.env.TESTE_POSTGRES_URL

let h: EphemeralDb
let m: ModuloDb
let escopo: typeof import('../../server/lib/escopoDaRequisicao')
let erro: typeof import('../../server/lib/erroGlobal')
let hyperdrive: DubleDoHyperdrive

beforeAll(async () => {
  h = await abrirBancoDeTeste({ migrar: false })
  m = await h.load<ModuloDb>('../../server/db/db')
  escopo = await h.load('../../server/lib/escopoDaRequisicao')
  erro = await h.load('../../server/lib/erroGlobal')
  await m.db.execute(sql`select 1`)
  const { dubleDoHyperdrive } = await import('../harness/workers/hyperdriveDuble')
  hyperdrive = dubleDoHyperdrive(m.urlDoBanco())
})
afterAll(async () => {
  await h.cleanup()
})
afterEach(() => {
  delete process.env.BABEL_RUNTIME
  vi.restoreAllMocks()
})

async function abrirComTabelas(opcoes?: { tetoDaEsperaMs?: number }): Promise<Executor> {
  const e = await hyperdrive.abrir(opcoes)
  await e.db.execute(sql`create table if not exists travas (chave text primary key, criado_em bigint)`)
  await e.db.execute(sql`create table if not exists ciclo_marca (id text)`)
  return e
}

/** Quantas marcas `id` o banco tem, por OUTRA conexão (só no Postgres: no PGlite cada executor é um banco). */
async function marcasPorOutraConexao(id: string): Promise<number | undefined> {
  if (!URL_PG) return undefined
  const r = await m.db.execute(sql`select count(*)::int as n from ciclo_marca where id = ${id}`)
  return m.linhas<{ n: number }>(r)[0]?.n
}

/** A cadeia de mensagens da rejeição (o Drizzle embrulha o erro do driver em `Failed query`, com `cause`). */
async function motivoDaRejeicao(p: PromiseLike<unknown>): Promise<string> {
  try {
    await p
    return 'resolveu'
  } catch (err) {
    const partes: string[] = []
    for (let e = err as { message?: string; cause?: unknown } | undefined; e; e = e.cause as typeof e)
      partes.push(String(e.message))
    return partes.join(' <- ')
  }
}

/** O `ctx` do Worker: anota cada `waitUntil`; `assentar()` espera a lista parar de crescer. */
function contextoFalso() {
  const promessas: Promise<unknown>[] = []
  return {
    ctx: { waitUntil: (p: Promise<unknown>) => void promessas.push(p) },
    async assentar() {
      for (let vistos = -1; vistos !== promessas.length; ) {
        vistos = promessas.length
        await Promise.allSettled(promessas)
      }
    },
  }
}

describe('ciclo do Client da requisição (C1)', () => {
  it('rota que responde e grava travada no finally: a gravação entra e o fechar vem depois dela', async () => {
    const e = await abrirComTabelas()
    const ordem: string[] = []
    const espiado: Executor = {
      db: e.db,
      fechar: () => {
        ordem.push('fechar')
        return e.fechar()
      },
    }
    const router = express.Router()
    router.post('/estorno', async (_req, res) => {
      try {
        res.json({ ok: true })
        ordem.push('respondeu')
      } finally {
        /* Um respiro antes do estorno (como o `await` de uma chamada que falhou): sem o handler no
           `waitUntil`, o `Client` fecharia aqui. */
        await new Promise((r) => setTimeout(r, 30))
        await m.emTransacao(async (tx) => {
          await m.travarUsuario(tx, 'u-ciclo')
          await tx.execute(sql`insert into ciclo_marca values ('estorno')`)
        })
        ordem.push('gravou')
      }
    })
    erro.capturarAssincrono(router)

    process.env.BABEL_RUNTIME = 'worker'
    const { ctx, assentar } = contextoFalso()
    const status = await escopo.rodarNoEscopoDaRequisicao(espiado, ctx, async () => {
      let respondeu!: () => void
      const terminou = new Promise<void>((r) => (respondeu = r))
      const res = {
        json: () => {
          respondeu()
          return res
        },
      }
      router(
        { method: 'POST', url: '/estorno', headers: {} } as Request,
        res as unknown as Response,
        ((err?: unknown) => {
          if (err) throw err
        }) as NextFunction,
      )
      await terminou
      return [200, terminou] as [number, Promise<void>]
    })
    await assentar()
    delete process.env.BABEL_RUNTIME

    expect(status).toBe(200)
    expect(ordem).toEqual(['respondeu', 'gravou', 'fechar'])
    if (URL_PG) expect(await marcasPorOutraConexao('estorno')).toBe(1)
    expect(await motivoDaRejeicao(e.db.execute(sql`select 1`))).toMatch(/conexão da requisição já fechada/)
  })

  it('fechar() espera o trabalho em voo (consulta e transação na fila) antes de encerrar', async () => {
    const e = await abrirComTabelas()
    const consulta = e.db.execute(sql`select 1 as um`).then((r) => m.linhas<{ um: number }>(r)[0]?.um)
    const transacao = e.db.transaction(async (tx) => {
      await new Promise((r) => setTimeout(r, 50))
      await tx.execute(sql`insert into ciclo_marca values ('fila')`)
      return 'gravou'
    })
    const fechou = e.fechar()
    await expect(Promise.all([consulta, transacao])).resolves.toEqual([1, 'gravou'])
    await fechou
    if (URL_PG) expect(await marcasPorOutraConexao('fila')).toBe(1)
  })

  it('consulta depois do fechar rejeita com o motivo, sem cair em outra conexão', async () => {
    const e = await abrirComTabelas()
    await e.fechar()
    expect(await motivoDaRejeicao(e.db.execute(sql`select 1`))).toMatch(/conexão da requisição já fechada/)
    expect(await motivoDaRejeicao(e.db.transaction(async () => 1))).toMatch(/conexão da requisição já fechada/)
  })

  it('trabalho que não termina: no teto, fecha assim mesmo e avisa (warn)', async () => {
    const avisos = vi.spyOn(console, 'warn').mockImplementation(() => {})
    const e = await abrirComTabelas({ tetoDaEsperaMs: 100 })
    void e.db
      .transaction(async () => {
        await new Promise(() => {}) // nunca termina
      })
      .catch(() => {})
    const t0 = Date.now()
    await e.fechar()
    expect(Date.now() - t0).toBeGreaterThanOrEqual(90)
    expect(Date.now() - t0).toBeLessThan(5_000)
    const linha = avisos.mock.calls.map(([l]) => String(l)).find((l) => l.includes('executor_fechou_ocupado'))
    expect(linha, 'o warn do teto').toBeTruthy()
    expect(JSON.parse(linha!)).toMatchObject({ level: 'warn', total: 1 })
    expect(await motivoDaRejeicao(e.db.execute(sql`select 1`))).toMatch(/conexão da requisição já fechada/)
  })
})
