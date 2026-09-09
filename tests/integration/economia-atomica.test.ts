/**
 * O SALDO NÃO PODE ESTOURAR — e o cofre do passe não pode sair antes do nível.
 *
 * Dois furos da auditoria de 07/09, fechados juntos porque são a mesma pergunta ("quem decide?"):
 *
 * 1. GASTO CONCORRENTE. `POST /seeds/gastar` conferia o saldo com um SELECT e inseria depois. O
 *    próprio código admitia a corrida em comentário: duas compras DIFERENTES em voo passavam as
 *    duas pela conferência e o saldo estourava. Agora o teto entra no INSERT.
 * 2. CRÉDITO DE PASSE. Os cofres respondiam 400 "crédito desconhecido"; agora creditam o valor do
 *    slot, e só a partir do nível da década.
 *
 * O teste do item 1 é sobre o MECANISMO, não sobre um espião: dez gastos simultâneos contra um
 * saldo que paga poucos, e a conta do que entrou no ledger.
 */
import { afterAll,beforeAll, describe, expect, it } from 'vitest'

import { asUserId } from '../../server/lib/authContext'
import { slotsDoPasse } from '../../src/core/passe'
import { type EphemeralDb,setupEphemeralDb } from '../harness/ephemeralDb'

let h: EphemeralDb
let metricsRouter: any
let seedSpendsRepo: any
let economiaDoUsuario: any
let exerciseResultsRepo: any

function handler(caminho: string): (req: any, res: any) => Promise<void> {
  const camada = metricsRouter.stack.find((l: any) => l.route?.path === caminho && l.route?.methods?.post)
  return camada.route.stack[0].handle
}
function mockRes(): any {
  const r: any = { statusCode: 200, body: undefined }
  r.status = (c: number) => { r.statusCode = c; return r }
  r.json = (b: any) => { r.body = b; return r }
  return r
}
const req = (body: unknown, u: string) => ({ userId: asUserId(u), body, requestId: 'req-at', path: '/x' })

/** Rodadas perfeitas de 20 itens: 25 Seeds cada (20 acertos + 5 de rodada perfeita). */
async function ganhar(userId: string, rodadas: number) {
  for (let n = 0; n < rodadas; n++) {
    await exerciseResultsRepo.addRodada(asUserId(userId), {
      roundId: `r-${userId}-${n}`, exerciseKind: 'termo', origem: 'baralho', score: 100,
      melhorSequencia: 20,
      itens: Array.from({ length: 20 }, (_, i) => ({ itemRef: `w${n}-${i}`, correct: 1, kind: 'drill' })),
    })
  }
}

beforeAll(async () => {
  h = await setupEphemeralDb()
  ;({ metricsRouter } = (await h.load('../../server/routes/metrics')) as any)
  ;({ seedSpendsRepo } = (await h.load('../../server/db/repositories/seedSpends')) as any)
  ;({ economiaDoUsuario } = (await h.load('../../server/db/repositories/metrics')) as any)
  ;({ exerciseResultsRepo } = (await h.load('../../server/db/repositories/exerciseResults')) as any)
})
afterAll(async () => { await h.cleanup() })

describe('gasto concorrente', () => {
  it('dez "pular rodada" simultâneos com saldo para dois debitam DOIS', async () => {
    const u = 'u-corrida'
    await ganhar(u, 4) // 100 Seeds ganhas
    const { ganhas } = await economiaDoUsuario(asUserId(u))
    expect(ganhas).toBe(100)

    /* Dez gastos de 40 disparados juntos. Sem o teto no INSERT, os dez passariam pela conferência
       antecipada (todos leem o mesmo saldo de 100) e o ledger fecharia com 400 gastas contra 100
       ganhas. Com ele, o SQLite avalia a soma no momento da escrita e só cabem dois. */
    const resultados = await Promise.all(
      Array.from({ length: 10 }, (_, i) =>
        seedSpendsRepo.debitar(asUserId(u), { spendId: `pular-${i}-xxxx`, amount: 40, reason: 'pular-rodada' }, { tetoDeGasto: ganhas }),
      ),
    )
    const entraram = resultados.filter((r: any) => r.linha && !r.jaExistia)
    const recusados = resultados.filter((r: any) => r.recusadoPorSaldo)
    expect(entraram).toHaveLength(2)
    expect(recusados).toHaveLength(8)

    const depois = await economiaDoUsuario(asUserId(u))
    expect(depois.gastas).toBe(80)
    /* O INVARIANTE, dito como invariante: o gasto nunca passa do ganho. */
    expect(depois.gastas).toBeLessThanOrEqual(depois.ganhas)
    expect(depois.saldo).toBe(20)
  })

  it('sem teto o comportamento antigo continua disponível — e é justamente o que estoura', async () => {
    /* Guarda contra "arrumar" a assinatura tornando o teto obrigatório sem olhar os chamadores:
       os testes de tenancy chamam `debitar` sem teto e não devem quebrar. O que este caso
       documenta é que a proteção é do CHAMADOR, e por isso a rota sempre passa o teto. */
    const u = 'u-sem-teto'
    const r = await seedSpendsRepo.debitar(asUserId(u), { spendId: 'livre-01', amount: 9_999, reason: 'pular-rodada' })
    expect(r.linha.amount).toBe(9_999)
    expect(r.recusadoPorSaldo).toBe(false)
  })

  it('a rota responde 402 e NÃO grava quando o saldo não paga', async () => {
    const u = 'u-pobre'
    const res = mockRes()
    await handler('/seeds/gastar')(req({ spendId: 'caro-0001', amount: 40, reason: 'pular-rodada' }, u), res)
    expect(res.statusCode).toBe(402)
    expect(res.body).toMatchObject({ code: 'saldo_insuficiente' })
    expect((await economiaDoUsuario(asUserId(u))).gastas).toBe(0)
  })

  it('o reenvio de uma compra já paga não pede saldo de novo', async () => {
    const u = 'u-retry'
    await ganhar(u, 2) // 50 Seeds
    const primeiro = mockRes()
    await handler('/seeds/gastar')(req({ spendId: 'retry-001', amount: 40, reason: 'pular-rodada' }, u), primeiro)
    expect(primeiro.statusCode).toBe(200)
    /* Sobram 10 Seeds. Sem a guarda de `jaGastou`, o retry da MESMA compra viraria 402 — e a
       idempotência deixaria de ser idempotente exatamente para quem gastou quase tudo. */
    const segundo = mockRes()
    await handler('/seeds/gastar')(req({ spendId: 'retry-001', amount: 40, reason: 'pular-rodada' }, u), segundo)
    expect(segundo.statusCode).toBe(200)
    expect(segundo.body).toMatchObject({ jaExistia: true, seedsGastas: 40 })
  })
})

describe('crédito de cofre do passe', () => {
  const cofre = slotsDoPasse().find((s): s is Extract<typeof s, { tipo: 'seeds' }> => s.tipo === 'seeds' && s.decada === 2)!

  it('sem o nível da década, recusa dizendo o nível e o exigido', async () => {
    const res = mockRes()
    await handler('/seeds/creditar')(req({ creditoId: cofre.creditoId }, 'u-passe-cedo'), res)
    expect(res.statusCode).toBe(400)
    expect(res.body).toMatchObject({ code: 'nivel_insuficiente' })
    expect(res.body.detalhes).toMatchObject({ exigido: cofre.decada })
  })

  it('com o nível, credita o valor do slot — uma vez, e ignorando o corpo', async () => {
    const u = 'u-passe'
    await ganhar(u, 12) // XP suficiente para passar do nível 2
    const antes = await economiaDoUsuario(asUserId(u))
    expect(antes.nivel).toBeGreaterThanOrEqual(cofre.decada)

    const r1 = mockRes()
    await handler('/seeds/creditar')(req({ creditoId: cofre.creditoId, amount: 9_999, xp: 9_999 }, u), r1)
    expect(r1.statusCode).toBe(200)
    expect(r1.body).toMatchObject({ jaExistia: false, seedsCreditadas: cofre.quantidade, xpCreditado: 0 })

    const r2 = mockRes()
    await handler('/seeds/creditar')(req({ creditoId: cofre.creditoId }, u), r2)
    expect(r2.body).toMatchObject({ jaExistia: true, seedsCreditadas: cofre.quantidade })
  })

  it('id de crédito inventado é 400 com código, não 500', async () => {
    const res = mockRes()
    await handler('/seeds/creditar')(req({ creditoId: 'drop-partida-bau-1757000000000' }, 'u-invent'), res)
    expect(res.statusCode).toBe(400)
    expect(res.body).toMatchObject({ code: 'credito_desconhecido' })
  })
})
