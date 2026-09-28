// @vitest-environment jsdom
/**
 * A MESMA RODADA GRAVADA DUAS VEZES CONTA UMA VEZ — NAS DUAS PONTAS (revisão de 27/09, P1;
 * Review Focus 4 do plano das recompensas v2).
 *
 * `addRodada` (Express) inseria as linhas de novo para o mesmo `roundId`, e o espelho sem conta
 * gravava com `uuid()` novo a cada chamada: o retry do cliente (rede instável no fim da rodada)
 * dobrava os acertos — Seeds, XP da conta, XP de temporada — e o que a rodada vale em maestria só
 * não dobrava porque a soma da maestria já deduplica por `roundId`. A chave é (usuário, `roundId`):
 * o segundo envio devolve `jaExistia: true` sem gravar nada.
 */
import 'fake-indexeddb/auto'

import { afterAll, beforeAll, describe, expect, it } from 'vitest'

import { asUserId } from '../../server/lib/authContext'
import { economiaDeMetricas } from '../../src/core/learning/xp'
import { maestriaPorJogo } from '../../src/core/maestria'
import { linhasDoHistoricoLocal, perfilEfemero } from '../../src/data/efemero/rotas/metricas'
import { servidorEfemero } from '../../src/data/efemero/servidor'
import { fecharStore, limparTudo } from '../../src/data/efemero/store'
import { type EphemeralDb, setupEphemeralDb } from '../harness/ephemeralDb'

let h: EphemeralDb
let exerciseResultsRepo: any
let computeProfile: any
let linhasDoHistoricoDeXp: any

const U = asUserId('contrato-rodada-uma-vez')

const RODADA = {
  roundId: 'blitz-duas-vezes-1',
  exerciseKind: 'blitz',
  origem: 'baralho',
  score: 120,
  melhorSequencia: 8,
  itens: Array.from({ length: 10 }, (_, i) => ({ itemRef: `w${i}`, correct: i < 9 ? 1 : 0, kind: 'drill' })),
}

async function noEfemero(corpo: unknown) {
  const res = await servidorEfemero('/api/exercises/rodada', { method: 'POST', body: JSON.stringify(corpo) })
  return res.json()
}

beforeAll(async () => {
  h = await setupEphemeralDb()
  ;({ exerciseResultsRepo } = (await h.load('../../server/db/repositories/exerciseResults')) as any)
  ;({ computeProfile, linhasDoHistoricoDeXp } = (await h.load('../../server/db/repositories/metrics')) as any)
  await limparTudo()
})
afterAll(async () => {
  await fecharStore()
  await h?.cleanup?.()
})

describe('rodada gravada duas vezes', () => {
  it('o segundo envio devolve jaExistia sem gravar, nas duas pontas', async () => {
    const e1 = await exerciseResultsRepo.addRodada(U, RODADA)
    const l1 = await noEfemero(RODADA)
    expect(e1).toMatchObject({ gravados: 10, jaExistia: false })
    expect(l1).toMatchObject({ gravados: 10, jaExistia: false })

    const antesExpress = await computeProfile(U)
    const antesLocal = await perfilEfemero(null)
    const pontos = async () =>
      maestriaPorJogo(await exerciseResultsRepo.linhasDeMaestria(U)).find((x) => x.jogo === 'blitz')?.pontos
    const pontosAntes = await pontos()

    const e2 = await exerciseResultsRepo.addRodada(U, RODADA)
    const l2 = await noEfemero(RODADA)
    expect(e2).toMatchObject({ gravados: 0, jaExistia: true, roundId: RODADA.roundId })
    expect(l2).toMatchObject({ gravados: 0, jaExistia: true })

    const depoisExpress = await computeProfile(U)
    const depoisLocal = await perfilEfemero(null)
    // Seeds e XP da conta: os acertos contam uma vez.
    expect(depoisExpress.drillItems).toBe(10)
    expect(depoisLocal.drillItems).toBe(10)
    expect(economiaDeMetricas(depoisExpress)).toEqual(economiaDeMetricas(antesExpress))
    expect(economiaDeMetricas(depoisLocal)).toEqual(economiaDeMetricas(antesLocal))
    expect(economiaDeMetricas(depoisLocal).ganhas).toBe(economiaDeMetricas(depoisExpress).ganhas)
    // XP de temporada lê as mesmas linhas: dez itens, não vinte.
    expect((await linhasDoHistoricoDeXp(U)).itensDeJogo).toHaveLength(10)
    expect((await linhasDoHistoricoLocal()).itensDeJogo).toHaveLength(10)
    // Maestria: os pontos de uma rodada, não de duas.
    expect(pontosAntes).toBeGreaterThan(0)
    expect(await pontos()).toBe(pontosAntes)
  })

  it('dois envios SIMULTÂNEOS da mesma rodada gravam uma vez só (Express)', async () => {
    const rodada = { ...RODADA, roundId: 'blitz-simultanea-1' }
    const [a, b] = await Promise.all([exerciseResultsRepo.addRodada(U, rodada), exerciseResultsRepo.addRodada(U, rodada)])
    expect([a.jaExistia, b.jaExistia].sort()).toEqual([false, true])
    expect(await exerciseResultsRepo.listarPorRodada(U, rodada.roundId)).toHaveLength(10)
  })

  it('a mesma roundId de OUTRA conta não é duplicata', async () => {
    const r = await exerciseResultsRepo.addRodada(asUserId('outra-conta-rodada'), RODADA)
    expect(r).toMatchObject({ gravados: 10, jaExistia: false })
  })
})
