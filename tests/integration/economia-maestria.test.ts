/**
 * A MAESTRIA NO EXPRESS (recompensas v2, Task 3.1).
 *
 * O que só o banco prova: os pontos saem das linhas GRAVADAS desta conta, uma vez por `roundId`
 * (a rodada salva duas vezes não conta em dobro), e `maestria:<jogo>:<nível>` só credita quando
 * esses pontos alcançam o limiar — com Seeds `20 × nível`, uma vez.
 */
import { afterAll, beforeAll, describe, expect, it } from 'vitest'

import { asUserId } from '../../server/lib/authContext'
import { type EphemeralDb, setupEphemeralDb } from '../harness/ephemeralDb'

let h: EphemeralDb
let metricsRouter: any
let exerciseResultsRepo: any

function handler(caminho: string, metodo: 'get' | 'post'): (req: any, res: any) => Promise<void> {
  const camada = metricsRouter.stack.find((l: any) => l.route?.path === caminho && l.route?.methods?.[metodo])
  return camada.route.stack[0].handle
}
function mockRes(): any {
  const r: any = { statusCode: 200, body: undefined }
  r.status = (c: number) => {
    r.statusCode = c
    return r
  }
  r.json = (b: any) => {
    r.body = b
    return r
  }
  return r
}

async function maestria(u: string) {
  const r = mockRes()
  await handler('/maestria', 'get')({ userId: asUserId(u), query: {}, requestId: 'req-m', path: '/maestria' }, r)
  return r
}
async function creditar(u: string, creditoId: string) {
  const r = mockRes()
  await handler('/seeds/creditar', 'post')(
    { userId: asUserId(u), body: { creditoId }, requestId: 'req-m', path: '/seeds/creditar' },
    r,
  )
  return r
}
/** Uma rodada de Memória: `certos` de `n`, combo máximo `combo`. */
async function rodada(u: string, roundId: string, certos: number, n: number, combo: number) {
  await exerciseResultsRepo.addRodada(asUserId(u), {
    roundId,
    exerciseKind: 'memory',
    melhorSequencia: combo,
    itens: Array.from({ length: n }, (_, i) => ({ itemRef: `p${i}`, correct: i < certos ? 1 : 0 })),
  })
}

beforeAll(async () => {
  h = await setupEphemeralDb()
  ;({ metricsRouter } = (await h.load('../../server/routes/metrics')) as any)
  ;({ exerciseResultsRepo } = (await h.load('../../server/db/repositories/exerciseResults')) as any)
})
afterAll(async () => {
  await h.cleanup()
})

describe('GET /api/metrics/maestria e o crédito conferido', () => {
  it('sem rodada: os 18 jogos com zero, e o Bronze é recusado', async () => {
    const r = await maestria('u-maestria-vazia')
    expect(r.statusCode).toBe(200)
    expect(r.body.jogos).toHaveLength(18)
    expect(r.body.jogos.every((j: { pontos: number }) => j.pontos === 0)).toBe(true)
    const c = await creditar('u-maestria-vazia', 'maestria:memory:1')
    expect(c.statusCode).toBe(400)
    expect(c.body.code).toBe('maestria_nao_alcancada')
  })

  it('soma as rodadas gravadas; a mesma rodada salva de novo (retry) não conta em dobro', async () => {
    const u = 'u-maestria-retry'
    await rodada(u, 'mem-1', 10, 10, 10) // 23
    await new Promise((ok) => setTimeout(ok, 5))
    await rodada(u, 'mem-1', 10, 10, 10) // o retry: mesmo roundId, outro carimbo
    const r = await maestria(u)
    expect(r.body.jogos.find((j: { jogo: string }) => j.jogo === 'memory')).toMatchObject({ pontos: 23, nivel: 0, proximo: 30 })
  })

  it('maestria:memory:3 só credita com 220 pontos, e vale 20 × 3 Seeds, uma vez', async () => {
    const u = 'u-maestria-ouro'
    for (let i = 0; i < 9; i++) await rodada(u, `r${i}`, 10, 10, 10) // 9 × 23 = 207
    expect((await creditar(u, 'maestria:memory:3')).body.code).toBe('maestria_nao_alcancada')
    await rodada(u, 'r9', 10, 10, 10) // 230
    const a = await creditar(u, 'maestria:memory:3')
    expect(a.statusCode).toBe(200)
    expect(a.body).toMatchObject({ jaExistia: false, seedsCreditadas: 60 })
    const b = await creditar(u, 'maestria:memory:3')
    expect(b.body).toMatchObject({ jaExistia: true, seedsCreditadas: 60 })
    expect((await maestria(u)).body.creditados).toEqual(['maestria:memory:3'])
  })

  it('pontos de OUTRA conta não contam', async () => {
    for (let i = 0; i < 2; i++) await rodada('u-maestria-dona', `d${i}`, 10, 10, 10)
    expect((await creditar('u-maestria-intrusa', 'maestria:memory:1')).statusCode).toBe(400)
  })
})
