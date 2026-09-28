// @vitest-environment jsdom
/**
 * O REENVIO DE UM CRÉDITO JÁ LANÇADO RESPONDE `jaExistia: true` — NAS DUAS PONTAS (revisão de
 * 27/09, P2).
 *
 * O Express conferia a janela e a assinatura ANTES do `ON CONFLICT`: o reenvio de uma `meta:<dia>`
 * antiga levava 400 (`dia_fora_da_janela`) e o de uma casa de assinante depois do fim da assinatura
 * levava 403 — enquanto o espelho sem conta respondia `jaExistia: true`. A mesma tela recebia
 * respostas diferentes para o mesmo fato ("isso já é seu"). Agora as duas pontas olham primeiro se o
 * crédito já existe.
 */
import 'fake-indexeddb/auto'

import { afterAll, beforeAll, describe, expect, it } from 'vitest'

import { asUserId } from '../../server/lib/authContext'
import { servidorEfemero } from '../../src/data/efemero/servidor'
import { abrirStore, fecharStore, limparTudo } from '../../src/data/efemero/store'
import { type EphemeralDb, setupEphemeralDb } from '../harness/ephemeralDb'

let h: EphemeralDb
let metricsRouter: any
let economiaRepo: any

const U = asUserId('contrato-reenvio')

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
  const res = fakeRes()
  await camada.route.stack[0].handle({ userId: U, path: '/seeds/creditar', body: corpo, requestId: 'r' }, res)
  return { status: res.statusCode, body: res.body }
}

async function noEfemero(corpo: unknown) {
  const res = await servidorEfemero('/api/metrics/seeds/creditar', { method: 'POST', body: JSON.stringify(corpo) })
  return { status: res.status, body: await res.json() }
}

/** O crédito lançado no passado, direto no razão das duas pontas (a janela dele já passou). */
async function jaLancado(creditoId: string, amount: number, xp: number) {
  await economiaRepo.creditar(U, { creditoId, amount, xp, reason: creditoId })
  const db = await abrirStore()
  await db.put('creditos', { creditoId, amount, xp, reason: creditoId, createdAt: 1 })
}

beforeAll(async () => {
  h = await setupEphemeralDb()
  ;({ metricsRouter } = (await h.load('../../server/routes/metrics')) as any)
  ;({ economiaRepo } = (await h.load('../../server/db/repositories/economia')) as any)
  await limparTudo()
})
afterAll(async () => {
  await fecharStore()
  await h?.cleanup?.()
})

describe('reenvio de crédito já lançado', () => {
  it('meta de um dia fora da janela: jaExistia nas duas, sem 400', async () => {
    await jaLancado('meta:2026-01-15', 15, 20)
    const e = await noExpress({ creditoId: 'meta:2026-01-15' })
    const l = await noEfemero({ creditoId: 'meta:2026-01-15' })
    expect(e.status).toBe(200)
    expect(l.status).toBe(200)
    expect(e.body).toMatchObject({ jaExistia: true })
    expect(l.body).toMatchObject({ jaExistia: true })
    expect(e.body.seedsCreditadas).toBe(l.body.seedsCreditadas)
  })

  it('casa de assinante sem assinatura ativa (acabou): jaExistia nas duas, sem 403', async () => {
    await jaLancado('temporada:t1:1:assinante', 0, 0)
    const e = await noExpress({ creditoId: 'temporada:t1:1:assinante' })
    const l = await noEfemero({ creditoId: 'temporada:t1:1:assinante' })
    expect(e).toMatchObject({ status: 200, body: { jaExistia: true } })
    expect(l).toMatchObject({ status: 200, body: { jaExistia: true } })
  })

  it('o crédito NOVO continua conferido: a mesma meta antiga, nunca lançada, é recusada nas duas', async () => {
    const e = await noExpress({ creditoId: 'meta:2026-01-16' })
    const l = await noEfemero({ creditoId: 'meta:2026-01-16' })
    expect(e.status).toBe(400)
    expect(l.status).toBe(400)
    expect(e.body.code).toBe('dia_fora_da_janela')
    expect(l.body.code).toBe('dia_fora_da_janela')
  })
})
