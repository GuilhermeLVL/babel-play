// @vitest-environment jsdom
/**
 * A MESMA ECONOMIA NAS DUAS PONTAS (auditoria de 07/09, seção 4).
 *
 * O Express endureceu a moeda em 01/09: o `reason` de um gasto tem de resolver no catálogo, o
 * `amount` tem de ser o preço, o saldo tem de pagar e o valor de um crédito vem da regra. O
 * servidor efêmero — o que atende quem usa sem conta — ficou como estava: gravava o `amount` e o
 * `xp` que viessem no corpo, sem catálogo e sem saldo.
 *
 * Uma economia que vale duas coisas conforme a pessoa ter conta ou não é pior do que uma economia
 * frouxa dos dois lados, por um motivo concreto: **o acervo do modo sem conta MIGRA para a conta**
 * (`src/data/migracao.ts`). O que se cunhou de graça de um lado atravessa para o outro.
 *
 * Este arquivo dispara o MESMO pedido contra os dois servidores e compara o resultado. Não é
 * comparação de forma, como em `sessoes.test.ts`: aqui os VALORES têm de bater, porque o valor é
 * justamente o que estava divergindo.
 */
import 'fake-indexeddb/auto'

import { afterAll,beforeAll, describe, expect, it } from 'vitest'

import { asUserId } from '../../server/lib/authContext'
import { itensSorteaveisNoDrop,SEEDS_DO_DROP } from '../../src/core/economiaAutoridade'
import { servidorEfemero } from '../../src/data/efemero/servidor'
import { fecharStore, limparTudo } from '../../src/data/efemero/store'
import { type EphemeralDb,setupEphemeralDb } from '../harness/ephemeralDb'

let h: EphemeralDb
let metricsRouter: any

const U = asUserId('contrato-eco')

function fakeRes() {
  const r: any = { statusCode: 200, body: undefined }
  r.status = (c: number) => { r.statusCode = c; return r }
  r.json = (b: any) => { r.body = b; return r }
  return r
}

async function noExpress(caminho: string, corpo?: unknown) {
  const camada = metricsRouter.stack.find((l: any) => l.route?.path === caminho && l.route?.methods?.post)
  if (!camada) throw new Error(`rota POST ${caminho} não existe no Express`)
  const req: any = { userId: U, path: caminho, query: {}, params: {}, body: corpo ?? {}, requestId: 'r' }
  const res = fakeRes()
  await camada.route.stack[0].handle(req, res, () => {})
  return { status: res.statusCode, body: res.body }
}

async function noEfemero(caminho: string, corpo?: unknown) {
  const res = await servidorEfemero(`/api/metrics${caminho}`, {
    method: 'POST',
    body: corpo === undefined ? undefined : JSON.stringify(corpo),
  })
  return { status: res.status, body: await res.json().catch(() => null) }
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

describe('crédito: o corpo não decide o valor, nas duas pontas', () => {
  /* `colecionador` é a única conquista cuja condição o servidor não confere (eventos raros vistos
     só existem no navegador), então ela exercita o VALOR sem exigir estado montado dos dois lados. */
  const PEDIDO = { creditoId: 'conquista-colecionador', amount: 9_999, xp: 9_999, reason: 'seja o que for' }

  it('as duas creditam 100 Seeds e 120 XP, e nenhuma lê os 9.999 do corpo', async () => {
    const express = await noExpress('/seeds/creditar', PEDIDO)
    const efemero = await noEfemero('/seeds/creditar', PEDIDO)
    expect(express.status).toBe(200)
    expect(efemero.status).toBe(200)
    expect(express.body).toMatchObject({ jaExistia: false, seedsCreditadas: 100, xpCreditado: 120 })
    expect(efemero.body).toMatchObject({ jaExistia: false, seedsCreditadas: 100, xpCreditado: 120 })
  })

  it('o reenvio é idempotente nas duas, com os mesmos totais', async () => {
    const express = await noExpress('/seeds/creditar', PEDIDO)
    const efemero = await noEfemero('/seeds/creditar', PEDIDO)
    expect(express.body).toMatchObject({ jaExistia: true, seedsCreditadas: 100, xpCreditado: 120 })
    expect(efemero.body).toMatchObject({ jaExistia: true, seedsCreditadas: 100, xpCreditado: 120 })
  })

  it('um creditoId inventado é 400 nas duas, com o mesmo código', async () => {
    const inventado = { creditoId: 'drop-partida-bau-1757000000000', amount: 40 }
    const express = await noExpress('/seeds/creditar', inventado)
    const efemero = await noEfemero('/seeds/creditar', inventado)
    expect(express.status).toBe(400)
    expect(efemero.status).toBe(400)
    expect(express.body.code).toBe('credito_desconhecido')
    expect(efemero.body.code).toBe('credito_desconhecido')
  })

  it('o cofre do passe exige o nível nas duas', async () => {
    /* Década 10 — 172 Seeds, o cofre mais caro da trilha. O crédito de `colecionador` acima já
       levou os dois lados ao nível 2, e é justamente por isso que a década escolhida é a mais
       alta: o que se prende aqui é o GATE, não o nível de partida. Antes, o Express respondia
       "crédito desconhecido" e o efêmero creditava o que viesse no corpo. */
    const cofre = { creditoId: 'passe:t1:cofre-d10-1' }
    const express = await noExpress('/seeds/creditar', cofre)
    const efemero = await noEfemero('/seeds/creditar', cofre)
    expect(express.status).toBe(400)
    expect(efemero.status).toBe(400)
    expect(express.body.code).toBe('nivel_insuficiente')
    expect(efemero.body.code).toBe('nivel_insuficiente')
  })
})

describe('gasto: o preço é o do catálogo, nas duas pontas', () => {
  it('um motivo que não existe é recusado nas duas', async () => {
    const pedido = { spendId: 'inventado-0001', amount: 5, reason: 'dica' }
    const express = await noExpress('/seeds/gastar', pedido)
    const efemero = await noEfemero('/seeds/gastar', pedido)
    expect(express.status).toBe(400)
    expect(efemero.status).toBe(400)
  })

  it('o preço divergente do catálogo é recusado nas duas, com o preço certo no corpo', async () => {
    /* O caso que dava o item lendário por 1 Seed: a posse é derivada do `reason`, então gravar um
       `amount` menor que o preço fazia o servidor ATESTAR uma compra que não foi paga. */
    const pedido = { spendId: 'barato-0001', amount: 1, reason: 'pular-rodada' }
    const express = await noExpress('/seeds/gastar', pedido)
    const efemero = await noEfemero('/seeds/gastar', pedido)
    expect(express.status).toBe(400)
    expect(efemero.status).toBe(400)
    expect(express.body.detalhes).toMatchObject({ preco: 40 })
    expect(efemero.body.detalhes).toMatchObject({ preco: 40 })
  })

  it('o saldo acaba no mesmo ponto nas duas: o terceiro "pular rodada" é 402', async () => {
    /* Os dois lados têm as MESMAS 100 Seeds (o crédito de `colecionador` do bloco acima), e
       "pular rodada" custa 40. Dois passam, o terceiro não — nos dois servidores, no mesmo gasto.
       Este é o teste que o modo sem conta nunca teve: ele gravava qualquer gasto, sem saldo. */
    for (const n of [1, 2]) {
      const pedido = { spendId: `pula-000${n}`, amount: 40, reason: 'pular-rodada' }
      expect((await noExpress('/seeds/gastar', pedido)).status, `express ${n}`).toBe(200)
      expect((await noEfemero('/seeds/gastar', pedido)).status, `efêmero ${n}`).toBe(200)
    }
    const terceiro = { spendId: 'pula-0003', amount: 40, reason: 'pular-rodada' }
    const express = await noExpress('/seeds/gastar', terceiro)
    const efemero = await noEfemero('/seeds/gastar', terceiro)
    expect(express.status).toBe(402)
    expect(efemero.status).toBe(402)
    expect(express.body.detalhes.saldo).toBe(efemero.body.detalhes.saldo)
  })
})

describe('drop: o baú vale o mesmo nas duas pontas', () => {
  const permitidos = new Set(itensSorteaveisNoDrop(new Set()).map((i) => i.id))

  /* O item SORTEADO não pode ser igual dos dois lados — é sorteio. O que tem de bater é a REGRA:
     mesma exigência de rodada, mesmas Seeds, mesma idempotência, e o item saindo sempre do mesmo
     conjunto de sorteáveis. É essa a paridade que importa, porque o acervo do modo sem conta
     migra para a conta: um baú mais generoso de um lado seria cosmético cunhado de graça. */
  it('sem rodada gravada, as duas recusam com o mesmo código', async () => {
    const pedido = { creditoId: 'drop:rodada-que-nao-existe' }
    const express = await noExpress('/seeds/creditar', pedido)
    const efemero = await noEfemero('/seeds/creditar', pedido)
    expect(express.status).toBe(400)
    expect(efemero.status).toBe(400)
    expect(express.body.code).toBe('rodada_inexistente')
    expect(efemero.body.code).toBe('rodada_inexistente')
  })

  it('com a rodada gravada, as duas entregam um item sorteável e as mesmas Seeds', async () => {
    const roundId = 'termo-contrato-1'
    const itens = Array.from({ length: 5 }, (_, i) => ({ itemRef: `w${i}`, correct: 1, kind: 'drill' }))
    const rodada = { roundId, exerciseKind: 'termo', origem: 'baralho', score: 100, melhorSequencia: 5, itens }

    const { exerciseResultsRepo } = (await h.load('../../server/db/repositories/exerciseResults')) as any
    await exerciseResultsRepo.addRodada(U, rodada)
    await servidorEfemero('/api/exercises/rodada', { method: 'POST', body: JSON.stringify(rodada) })

    const antesExpress = (await noExpress('/seeds/creditar', { creditoId: 'conquista-colecionador' })).body.seedsCreditadas
    const antesEfemero = (await noEfemero('/seeds/creditar', { creditoId: 'conquista-colecionador' })).body.seedsCreditadas

    const pedido = { creditoId: `drop:${roundId}` }
    const express = await noExpress('/seeds/creditar', pedido)
    const efemero = await noEfemero('/seeds/creditar', pedido)

    expect(express.status).toBe(200)
    expect(efemero.status).toBe(200)
    expect(express.body.jaExistia).toBe(false)
    expect(efemero.body.jaExistia).toBe(false)
    expect(permitidos.has(express.body.item), `express entregou ${express.body.item}`).toBe(true)
    expect(permitidos.has(efemero.body.item), `efêmero entregou ${efemero.body.item}`).toBe(true)
    expect(express.body.seedsCreditadas - antesExpress).toBe(SEEDS_DO_DROP)
    expect(efemero.body.seedsCreditadas - antesEfemero).toBe(SEEDS_DO_DROP)
  })

  it('o reenvio devolve o MESMO item nas duas, sem creditar de novo', async () => {
    const pedido = { creditoId: 'drop:termo-contrato-1' }
    const primeiroExpress = (await noExpress('/seeds/creditar', pedido)).body
    const primeiroEfemero = (await noEfemero('/seeds/creditar', pedido)).body
    const segundoExpress = (await noExpress('/seeds/creditar', pedido)).body
    const segundoEfemero = (await noEfemero('/seeds/creditar', pedido)).body

    for (const b of [primeiroExpress, primeiroEfemero, segundoExpress, segundoEfemero]) {
      expect(b.jaExistia).toBe(true)
    }
    expect(segundoExpress.item).toBe(primeiroExpress.item)
    expect(segundoEfemero.item).toBe(primeiroEfemero.item)
    expect(segundoExpress.seedsCreditadas).toBe(primeiroExpress.seedsCreditadas)
    expect(segundoEfemero.seedsCreditadas).toBe(primeiroEfemero.seedsCreditadas)
  })
})
