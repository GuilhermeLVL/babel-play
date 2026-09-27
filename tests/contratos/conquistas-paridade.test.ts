// @vitest-environment jsdom
/**
 * AS 40 CONQUISTAS CONFERIDAS IGUAL NAS DUAS PONTAS (recompensas v2, onda 5).
 *
 * Até a onda 5 o espelho sem conta (`src/data/efemero/rotas/economia.ts`) conferia só o
 * Colecionador: as outras treze creditavam a qualquer pedido — e o acervo do modo sem conta MIGRA
 * para a conta. Agora as duas pontas montam o mesmo contexto (`contextoConferivelDeConquistas`) e
 * aplicam a mesma régua (`progressoNoServidor`). Este arquivo dispara o crédito de CADA conquista
 * contra o Express e contra o espelho, antes e depois de jogar, e exige a mesma resposta.
 */
import 'fake-indexeddb/auto'

import { afterAll, beforeAll, describe, expect, it } from 'vitest'

import { asUserId } from '../../server/lib/authContext'
import { CONQUISTAS } from '../../src/core/learning/conquistas'
import { servidorEfemero } from '../../src/data/efemero/servidor'
import { fecharStore, limparTudo } from '../../src/data/efemero/store'
import { type EphemeralDb, setupEphemeralDb } from '../harness/ephemeralDb'

let h: EphemeralDb
let metricsRouter: any

const U = asUserId('contrato-conquistas')

function fakeRes() {
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

async function noExpress(corpo: unknown) {
  const camada = metricsRouter.stack.find((l: any) => l.route?.path === '/seeds/creditar' && l.route?.methods?.post)
  const req: any = { userId: U, path: '/seeds/creditar', query: {}, params: {}, body: corpo, requestId: 'r' }
  const res = fakeRes()
  await camada.route.stack[0].handle(req, res, () => {})
  return { status: res.statusCode, body: res.body }
}

async function noEfemero(corpo: unknown) {
  const res = await servidorEfemero('/api/metrics/seeds/creditar', { method: 'POST', body: JSON.stringify(corpo) })
  return { status: res.status, body: await res.json().catch(() => null) }
}

/** Uma rodada gravada nas DUAS pontas. */
async function gravarRodada(roundId: string, exerciseKind: string, n: number, combo: number): Promise<void> {
  const rodada = {
    roundId,
    exerciseKind,
    origem: 'baralho',
    score: n * 20,
    melhorSequencia: combo,
    itens: Array.from({ length: n }, (_, i) => ({ itemRef: `${roundId}-${i}`, correct: 1, kind: 'drill' })),
  }
  const { exerciseResultsRepo } = (await h.load('../../server/db/repositories/exerciseResults')) as any
  await exerciseResultsRepo.addRodada(U, rodada)
  await servidorEfemero('/api/exercises/rodada', { method: 'POST', body: JSON.stringify(rodada) })
}

/** Pede o crédito de cada conquista, na ordem do catálogo, nas duas pontas. */
async function pedirTodas() {
  const out: { id: string; express: { status: number; body: any }; efemero: { status: number; body: any } }[] = []
  for (const c of CONQUISTAS) {
    const corpo = { creditoId: `conquista-${c.id}` }
    out.push({ id: c.id, express: await noExpress(corpo), efemero: await noEfemero(corpo) })
  }
  return out
}

function mesmaResposta(r: Awaited<ReturnType<typeof pedirTodas>>[number]) {
  expect(r.efemero.status, r.id).toBe(r.express.status)
  if (r.express.status === 400) {
    expect(r.efemero.body.code, r.id).toBe(r.express.body.code)
    expect(r.efemero.body.detalhes, r.id).toEqual(r.express.body.detalhes)
  } else {
    expect(r.efemero.body.jaExistia, r.id).toBe(r.express.body.jaExistia)
  }
}

beforeAll(async () => {
  h = await setupEphemeralDb()
  ;({ metricsRouter } = (await h.load('../../server/routes/metrics')) as any)
  await limparTudo()
})
afterAll(async () => {
  await fecharStore()
  await h?.cleanup?.()
})

describe('conquistas: a mesma régua no Express e no espelho', () => {
  it('sem ter feito nada, as 40 são recusadas nas duas, com o mesmo código e o mesmo progresso', async () => {
    const respostas = await pedirTodas()
    for (const r of respostas) {
      expect(r.express.status, r.id).toBe(400)
      expect(r.express.body.code, r.id).toBe('conquista_nao_cumprida')
      mesmaResposta(r)
    }
  })

  it('depois de jogar (Duelo ×20 perfeito e maestria em Qual foi?), as duas creditam as mesmas', async () => {
    await gravarRodada('blitz-paridade-1', 'blitz', 20, 20)
    await gravarRodada('escuta-paridade-1', 'escuta', 10, 10)
    await gravarRodada('escuta-paridade-2', 'escuta', 10, 10)
    const respostas = await pedirTodas()
    for (const r of respostas) mesmaResposta(r)
    const creditadas = respostas.filter((r) => r.express.status === 200).map((r) => r.id)
    expect(creditadas).toEqual(
      expect.arrayContaining(['sem-erro', 'duelista', 'imparavel', 'ouvido-afiado', 'primeiro-bronze', 'colecionador']),
    )
    expect(creditadas).not.toContain('ouvido-treinado')
  })
})
