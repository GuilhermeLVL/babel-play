/**
 * LOJA COM CRÉDITOS NO SERVIDOR DE VERDADE (recompensas v2, onda 6, Task 6.1) — modo público, JWT.
 *
 * Contratos de `POST /api/billing/gastar`:
 * 1. Só item da vitrine (`VITRINE_DE_CREDITOS`), pelo preço do CATÁLOGO: o `amount` do cliente só
 *    declara o que a tela mostrou; divergente é 400 com o preço certo, e o débito é sempre o do
 *    servidor.
 * 2. Maestria, conquista, temporada e item de Seeds não se compram com Créditos (400).
 * 3. PERFIL PROTEGIDO (menor de 18, ou idade não declarada) recebe 403 — mesmo com saldo (o
 *    responsável pode ter comprado um pacote para ele pela conta dele) e mesmo reenviando um
 *    `spendId` antigo. Nada é debitado.
 * 4. Idempotente por `spendId`: o reenvio devolve `jaExistia` e não cobra de novo.
 */
import { afterAll, beforeAll, describe, expect, it } from 'vitest'

import { CATALOGO_DA_LOJA, VITRINE_DE_CREDITOS } from '../../src/core/loja'
import { type AppDeTeste, subirApp } from '../caracterizacao/_app'

let s: AppDeTeste
let creditsRepo: any
let asUserId: (u: string) => any
const tokens: Record<string, string> = {}

async function tk(sub: string): Promise<string> {
  tokens[sub] ??= await s.token(sub)
  return tokens[sub]
}
function nascidoHa(anos: number): string {
  const d = new Date(Date.now() - 40 * 86_400_000)
  d.setUTCFullYear(d.getUTCFullYear() - anos)
  return d.toISOString().slice(0, 10)
}
async function declarar(sub: string, anos: number) {
  expect((await s.put('/api/me/idade', { nascimento: nascidoHa(anos) }, await tk(sub))).status).toBe(200)
}
/** Saldo pelo caminho legítimo: uma compra confirmada (como faria o webhook). */
async function darCreditos(sub: string, quanto: number) {
  const id = `pay-${sub}`
  await creditsRepo.registrarCompra(asUserId(sub), { sku: 'c700', creditos: quanto, valorCentavos: 4990, providerPaymentId: id })
  await creditsRepo.confirmarPagamento(id)
}
async function gastar(sub: string, corpo: Record<string, unknown>) {
  const r = await s.post('/api/billing/gastar', corpo, await tk(sub))
  return { status: r.status, body: (await r.json()) as any }
}
const saldo = async (sub: string) => (await creditsRepo.saldo(asUserId(sub))) as number

const ITEM = VITRINE_DE_CREDITOS[0]!

beforeAll(async () => {
  s = await subirApp({ modo: 'publico' })
  ;({ creditsRepo } = await s.load('../../server/db/repositories/credits'))
  ;({ asUserId } = await s.load('../../server/lib/authContext'))
})
afterAll(async () => {
  await s.encerrar()
})

describe('adulto compra um item da vitrine', () => {
  it('debita o preço do catálogo e o item entra na posse', async () => {
    await declarar('lc-adulto', 30)
    await darCreditos('lc-adulto', 700)
    const r = await gastar('lc-adulto', { spendId: 'lc-compra-0001', amount: ITEM.precoCreditos, reason: `premium:${ITEM.id}` })
    expect(r.status).toBe(200)
    expect(r.body).toMatchObject({ jaExistia: false, gasto: ITEM.precoCreditos, saldo: 700 - ITEM.precoCreditos! })
    expect(await creditsRepo.itensPremium(asUserId('lc-adulto'))).toContain(ITEM.id)
  })

  it('o reenvio do mesmo spendId é idempotente: não cobra de novo', async () => {
    const r = await gastar('lc-adulto', { spendId: 'lc-compra-0001', amount: ITEM.precoCreditos, reason: `premium:${ITEM.id}` })
    expect(r.status).toBe(200)
    expect(r.body.jaExistia).toBe(true)
    expect(await saldo('lc-adulto')).toBe(700 - ITEM.precoCreditos!)
  })

  it('preço divergente é recusado com o preço do servidor, e nada é debitado', async () => {
    const antes = await saldo('lc-adulto')
    for (const amount of [1, ITEM.precoCreditos! + 1]) {
      const r = await gastar('lc-adulto', { spendId: `lc-preco-${amount}`, amount, reason: `premium:${ITEM.id}` })
      expect(r.status).toBe(400)
      expect(r.body.preco).toBe(ITEM.precoCreditos)
    }
    expect(await saldo('lc-adulto')).toBe(antes)
  })

  it('maestria, conquista, temporada, Seeds e item inexistente não se compram com Créditos', async () => {
    const antes = await saldo('lc-adulto')
    const fora = [
      CATALOGO_DA_LOJA.find((i) => i.origemMaestria)!,
      CATALOGO_DA_LOJA.find((i) => i.exclusivoDe)!,
      CATALOGO_DA_LOJA.find((i) => i.origemTemporada)!,
      CATALOGO_DA_LOJA.find((i) => i.precoSeeds !== undefined)!,
    ].map((i) => `premium:${i.id}`)
    for (const [n, reason] of [...fora, 'premium:dourada-1', 'bau', 'seeds:100'].entries()) {
      const r = await gastar('lc-adulto', { spendId: `lc-fora-000${n}`, amount: 150, reason })
      expect(r.status, reason).toBe(400)
    }
    expect(await saldo('lc-adulto')).toBe(antes)
  })
})

describe('perfil protegido não compra com Créditos (403 no servidor)', () => {
  it('menor de 18 com saldo recebe 403 e nada é debitado', async () => {
    await declarar('lc-menor', 15)
    await darCreditos('lc-menor', 300)
    const r = await gastar('lc-menor', { spendId: 'lc-menor-0001', amount: ITEM.precoCreditos, reason: `premium:${ITEM.id}` })
    expect(r.status).toBe(403)
    expect(r.body.code).toBe('menor_nao_compra')
    expect(await saldo('lc-menor')).toBe(300)
    expect(await creditsRepo.itensPremium(asUserId('lc-menor'))).toEqual([])
  })

  it('idade não declarada conta como protegida (a configuração mais protetiva é a padrão)', async () => {
    await darCreditos('lc-sem-idade', 300)
    const r = await gastar('lc-sem-idade', { spendId: 'lc-semidade-01', amount: ITEM.precoCreditos, reason: `premium:${ITEM.id}` })
    expect(r.status).toBe(403)
    expect(r.body.code).toBe('idade_nao_informada')
    expect(await saldo('lc-sem-idade')).toBe(300)
  })

  it('o 403 vem antes de tudo: nem o reenvio de um spendId nem um motivo inválido passam', async () => {
    const reenvio = await gastar('lc-menor', { spendId: 'lc-compra-0001', amount: ITEM.precoCreditos, reason: `premium:${ITEM.id}` })
    expect(reenvio.status).toBe(403)
    const lixo = await gastar('lc-menor', { spendId: 'lc-menor-0002', amount: 1, reason: 'bau' })
    expect(lixo.status).toBe(403)
    expect(await saldo('lc-menor')).toBe(300)
  })
})
