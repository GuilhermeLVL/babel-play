/**
 * O SERVIDOR É A AUTORIDADE SOBRE O VALOR (mudança servidor-e-autoridade).
 *
 * Este arquivo existe por causa de três ataques que a auditoria de 01/09 encontrou em
 * `POST /api/metrics/seeds/gastar` e que a suíte antiga não pegava — ela protegia CONTABILIDADE
 * (idempotência, unicidade por usuário, valor negativo) e nunca AUTORIZAÇÃO:
 *
 *   1. `{amount: 1, reason: 'loja:tema-custom'}` comprava o lendário de 600 Seeds por 1 — e como a
 *      posse é derivada do razão (`reason LIKE 'loja:%'`), o servidor passava a ATESTAR a posse.
 *   2. `reason: 'loja:tema-aurora'` entregava um item EXCLUSIVO de conquista, que a Loja não vende.
 *   3. Não havia conferência de saldo: dava para gastar o que não se tinha, porque o único guarda
 *      era o botão desabilitado na tela — e um cliente adulterado não tem botão.
 *
 * O contrato preso aqui: motivo tem de autorizar, preço tem de ser o do catálogo, saldo tem de
 * pagar — e a idempotência continua valendo mesmo depois de o saldo acabar.
 */
import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import { setupEphemeralDb, type EphemeralDb } from '../harness/ephemeralDb'
import { asUserId } from '../../server/lib/authContext'
import { CATALOGO_DA_LOJA } from '../../src/core/loja'

let h: EphemeralDb
let metricsRouter: any

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
const req = (body: unknown, u: string) => ({ userId: asUserId(u), body, requestId: 'req-aut', path: '/x' })

/** Dá saldo ao usuário pelo caminho legítimo: `colecionador` vale 100 Seeds pela regra. */
async function darSaldo(u: string): Promise<void> {
  await handler('/seeds/creditar')(req({ creditoId: 'conquista-colecionador' }, u), mockRes())
}

const gastar = async (corpo: unknown, u: string) => {
  const r = mockRes()
  await handler('/seeds/gastar')(req(corpo, u), r)
  return r
}

/* Escolhidos do catálogo REAL: se um preço mudar, o teste continua correto porque lê de lá. */
const BARATO = [...CATALOGO_DA_LOJA]
  .filter((i) => i.precoSeeds !== undefined && !i.exclusivoDe)
  .sort((a, b) => a.precoSeeds! - b.precoSeeds!)[0]
const CARO = [...CATALOGO_DA_LOJA]
  .filter((i) => i.precoSeeds !== undefined && !i.exclusivoDe)
  .sort((a, b) => b.precoSeeds! - a.precoSeeds!)[0]
const EXCLUSIVO = CATALOGO_DA_LOJA.find((i) => i.exclusivoDe)!

beforeAll(async () => {
  h = await setupEphemeralDb()
  ;({ metricsRouter } = (await h.load('../../server/routes/metrics')) as any)
})
afterAll(async () => { await h.cleanup() })

describe('o motivo precisa autorizar', () => {
  it('item inexistente é recusado', async () => {
    const r = await gastar({ spendId: 'sp-inex-01', amount: 10, reason: 'loja:nao-existe' }, 'u-a1')
    expect(r.statusCode).toBe(400)
  })

  it('EXCLUSIVO de conquista não se compra, nem pelo preço certo', async () => {
    await darSaldo('u-a2')
    const r = await gastar({ spendId: 'sp-excl-01', amount: 1, reason: `loja:${EXCLUSIVO.id}` }, 'u-a2')
    expect(r.statusCode, `${EXCLUSIVO.id} não pode ser comprável`).toBe(400)
  })

  it('motivo em formato livre é recusado — o razão deixou de ser texto solto', async () => {
    for (const reason of ['presente', 'LOJA:x', 'loja', '']) {
      const r = await gastar({ spendId: `sp-livre-${reason.length}x`, amount: 1, reason: reason || 'z' }, 'u-a3')
      expect(r.statusCode).toBe(400)
    }
  })
})

describe('o preço é o do catálogo', () => {
  it('pagar menos que o preço é recusado, e a resposta diz o preço certo', async () => {
    await darSaldo('u-a4')
    const r = await gastar({ spendId: 'sp-barato-01', amount: 1, reason: `loja:${CARO.id}` }, 'u-a4')
    expect(r.statusCode).toBe(400)
    expect(r.body).toMatchObject({ preco: CARO.precoSeeds })
  })
})

describe('o saldo precisa pagar', () => {
  it('sem saldo nenhum, a compra é recusada com 402 e o quanto falta', async () => {
    const r = await gastar({ spendId: 'sp-sem-saldo1', amount: BARATO.precoSeeds!, reason: `loja:${BARATO.id}` }, 'u-a5')
    expect(r.statusCode).toBe(402)
    expect(r.body.falta).toBe(BARATO.precoSeeds)
  })

  it('com saldo, a compra passa — e o reenvio continua idempotente mesmo com o saldo zerado', async () => {
    const u = 'u-a6'
    await darSaldo(u) // 100 Seeds
    const compravel = [...CATALOGO_DA_LOJA]
      .filter((i) => i.precoSeeds !== undefined && !i.exclusivoDe && i.precoSeeds <= 100)
      .sort((a, b) => b.precoSeeds! - a.precoSeeds!)[0]

    const r1 = await gastar({ spendId: 'sp-ok-000001', amount: compravel.precoSeeds!, reason: `loja:${compravel.id}` }, u)
    expect(r1.statusCode).toBe(200)
    expect(r1.body).toMatchObject({ jaExistia: false, gasto: compravel.precoSeeds })

    /* O REENVIO. Sem a guarda de "já foi cobrado", esta chamada viraria 402: o saldo já foi
       consumido pela primeira. Idempotência que só funciona com saldo sobrando não é idempotência. */
    const r2 = await gastar({ spendId: 'sp-ok-000001', amount: compravel.precoSeeds!, reason: `loja:${compravel.id}` }, u)
    expect(r2.statusCode).toBe(200)
    expect(r2.body.jaExistia).toBe(true)
  })
})

describe('os outros motivos do formato fechado', () => {
  it('pular rodada cobra o preço fixo', async () => {
    await darSaldo('u-a7')
    const r = await gastar({ spendId: 'sp-pular-0001', amount: 40, reason: 'pular-rodada' }, 'u-a7')
    expect(r.statusCode).toBe(200)
  })

  it('aprimoramento fora da escada é recusado', async () => {
    await darSaldo('u-a8')
    const r = await gastar({ spendId: 'sp-apr-00001', amount: 50, reason: 'aprimoramento:particulas:9' }, 'u-a8')
    expect(r.statusCode).toBe(400)
  })
})
