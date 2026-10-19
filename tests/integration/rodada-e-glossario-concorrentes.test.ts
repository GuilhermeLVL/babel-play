/**
 * OS OUTROS DOIS SITES SOB A TRAVA DO USUÁRIO, provados com pedidos em voo ao mesmo tempo:
 *
 *  - a mesma rodada (`roundId`) enviada 8 vezes: só uma grava, e as linhas contam uma vez só;
 *  - o glossário a uma entrada do teto: 8 termos novos simultâneos e o total fica exatamente no teto.
 *
 * Mesmo esquema de `gasto-concorrente.test.ts`: PGlite por padrão (uma conexão, serializa de
 * qualquer jeito) e, com `TESTE_POSTGRES_URL=postgres://…`, um Postgres real com pool de 5, onde a
 * corrida existe. Sem suposição de PGlite: ids sorteados e só a API pública.
 */
import { randomUUID } from 'node:crypto'

import { afterAll, beforeAll, describe, expect, it } from 'vitest'

import { type EphemeralDb, setupEphemeralDb } from '../harness/ephemeralDb'

const URL_PG = process.env.TESTE_POSTGRES_URL

async function abrirBanco(): Promise<EphemeralDb> {
  if (!URL_PG) return setupEphemeralDb()
  process.env.DATABASE_URL = URL_PG
  const { db, fecharBanco } = await import('../../server/db/db')
  const { migrate } = await import('drizzle-orm/node-postgres/migrator')
  await migrate(db as Parameters<typeof migrate>[0], {
    migrationsFolder: process.env.MIGRATIONS_DIR ?? './server/db/migrations-pg',
  })
  return { load: (spec) => import(spec), cleanup: fecharBanco }
}

const EM_VOO = 8

let h: EphemeralDb
let exerciseResultsRepo: any
let glossarioRepo: any

beforeAll(async () => {
  h = await abrirBanco()
  ;({ exerciseResultsRepo } = await h.load('../../server/db/repositories/exerciseResults'))
  ;({ glossarioRepo } = await h.load('../../server/db/repositories/glossario'))
}, 60_000)

afterAll(async () => {
  await h?.cleanup()
})

describe('rodada e glossário concorrentes', () => {
  it('a mesma rodada 8 vezes em voo: uma grava, as linhas entram uma vez', async () => {
    const userId = `rodada-conc-${randomUUID()}`
    const roundId = `r-${randomUUID()}`
    const rodada = {
      roundId,
      exerciseKind: 'memory',
      origem: 'baralho',
      score: 10,
      itens: [
        { itemRef: 'water', correct: 1, attempts: 1, kind: 'srs' },
        { itemRef: 'fire', correct: 0, attempts: 2, kind: 'srs' },
      ],
    }
    const resultados = await Promise.all(
      Array.from({ length: EM_VOO }, () => exerciseResultsRepo.addRodada(userId, rodada)),
    )
    expect(resultados.filter((r: any) => r.gravados > 0)).toHaveLength(1)
    expect(resultados.filter((r: any) => r.jaExistia)).toHaveLength(EM_VOO - 1)
    expect(await exerciseResultsRepo.listarPorRodada(userId, roundId)).toHaveLength(2)
  }, 60_000)

  it('glossário a uma entrada do teto: 8 termos novos em voo e o total fica no teto', async () => {
    const userId = `gloss-conc-${randomUUID()}`
    const teto = 5
    const entrada = (termo: string) => ({
      origem: 'en',
      destino: 'pt',
      termo,
      termoNorm: termo,
      traducao: `sentido de ${termo}`,
    })
    for (let i = 0; i < teto - 1; i++)
      expect((await glossarioRepo.gravar(userId, entrada(`base${i}`), teto)).ok).toBe(true)
    const resultados = await Promise.all(
      Array.from({ length: EM_VOO }, (_, i) => glossarioRepo.gravar(userId, entrada(`novo${i}`), teto)),
    )
    expect(resultados.filter((r: any) => r.ok)).toHaveLength(1)
    expect(await glossarioRepo.contar(userId)).toBe(teto)
  }, 60_000)
})
