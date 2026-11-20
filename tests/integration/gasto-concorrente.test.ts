/**
 * GASTO CONCORRENTE: duas compras DIFERENTES em voo com saldo para uma só.
 *
 * No SQLite, o `INSERT … SELECT … WHERE saldo >= valor` (Créditos) e o `WHERE soma + valor <= teto`
 * (Seeds) bastavam porque havia um escritor só. No Postgres, em READ COMMITTED, duas transações
 * concorrentes não veem a linha uma da outra antes do COMMIT: as duas passariam pela condição e o
 * saldo ficaria negativo. A trava consultiva por usuário (`travarUsuario`) é o que serializa.
 *
 * Roda no PGlite (padrão: uma conexão só, então serializa de qualquer jeito e o teste prova só a
 * regra) e, com `TESTE_POSTGRES_URL=postgres://…`, contra um Postgres de verdade com o pool de 5
 * conexões — é ali que a corrida existe e que a trava é provada. Sem suposição de PGlite: ids de
 * usuário sorteados (o banco real pode ter sobras de execuções anteriores) e só a API pública.
 */
import { randomUUID } from 'node:crypto'

import { afterAll, beforeAll, describe, expect, it } from 'vitest'

import { abrirBancoDeTeste } from '../harness/bancoDeTeste'
import type { EphemeralDb } from '../harness/ephemeralDb'

/* Várias compras ao mesmo tempo (mais do que as 5 conexões do pool) e algumas rodadas: no Postgres
   real, sem a trava, a corrida aparece quase sempre já na primeira. */
const EM_VOO = 8
const RODADAS = 5

let h: EphemeralDb
let creditsRepo: any
let seedSpendsRepo: any

beforeAll(async () => {
  h = await abrirBancoDeTeste()
  ;({ creditsRepo } = await h.load('../../server/db/repositories/credits'))
  ;({ seedSpendsRepo } = await h.load('../../server/db/repositories/seedSpends'))
}, 60_000)

afterAll(async () => {
  await h?.cleanup()
})

describe('gasto concorrente', () => {
  it('Créditos: com saldo para um gasto, só UM de vários simultâneos passa e o saldo nunca fica negativo', async () => {
    for (let rodada = 0; rodada < RODADAS; rodada++) {
      const userId = `gasto-conc-cred-${randomUUID()}`
      await creditsRepo.registrarConcessao(userId, { concessaoId: `conc-${randomUUID()}`, creditos: 10 })
      expect(await creditsRepo.saldo(userId)).toBe(10)

      const resultados = await Promise.all(
        Array.from({ length: EM_VOO }, (_, i) =>
          creditsRepo.debitar(userId, { spendId: `gasto-${i}`, amount: 10, reason: 'teste' }, { conferirSaldo: true }),
        ),
      )
      const passaram = resultados.filter((r: any) => r.linha && !r.jaExistia)
      const recusados = resultados.filter((r: any) => r.recusadoPorSaldo)
      expect(passaram).toHaveLength(1)
      expect(recusados).toHaveLength(EM_VOO - 1)
      expect(await creditsRepo.saldo(userId)).toBe(0)
    }
  }, 60_000)

  it('Seeds: com teto para um gasto, só UM de vários simultâneos passa e o gasto não passa do teto', async () => {
    for (let rodada = 0; rodada < RODADAS; rodada++) {
      const userId = `gasto-conc-seed-${randomUUID()}`
      const resultados = await Promise.all(
        Array.from({ length: EM_VOO }, (_, i) =>
          seedSpendsRepo.debitar(userId, { spendId: `gasto-${i}`, amount: 40, reason: 'teste' }, { tetoDeGasto: 40 }),
        ),
      )
      const passaram = resultados.filter((r: any) => r.linha && !r.jaExistia)
      expect(passaram).toHaveLength(1)
      expect(resultados.filter((r: any) => r.recusadoPorSaldo)).toHaveLength(EM_VOO - 1)
      expect(await seedSpendsRepo.totalGasto(userId)).toBe(40)
    }
  }, 60_000)

  it('o mesmo spendId repetido em paralelo continua idempotente (um débito só)', async () => {
    const userId = `gasto-conc-idem-${randomUUID()}`
    await creditsRepo.registrarConcessao(userId, { concessaoId: `conc-${randomUUID()}`, creditos: 30 })
    const resultados = await Promise.all(
      Array.from({ length: EM_VOO }, () =>
        creditsRepo.debitar(userId, { spendId: 'o-mesmo', amount: 10, reason: 'teste' }, { conferirSaldo: true }),
      ),
    )
    expect(resultados.every((r: any) => r.linha)).toBe(true)
    expect(resultados.filter((r: any) => !r.jaExistia)).toHaveLength(1)
    expect(await creditsRepo.saldo(userId)).toBe(20)
  }, 60_000)
})
