/**
 * CARACTERIZACAO — a economia de Seeds por HTTP, no modo self-host.
 *
 * Grava o comportamento ATUAL (rodada de saneamento, Fase 1): perfil, gasto, credito e presenca.
 * Um `expect` que pareca estranho esta marcado com `// caracterizacao:` — o teste existe para
 * detectar MUDANCA, e a correcao, quando couber, pertence a outra fase.
 */
import { afterAll, beforeAll, describe, expect, it } from 'vitest'

import { CONQUISTAS_CONFERIVEIS } from '../../src/core/economiaAutoridade'
import { diaLocal } from '../../src/core/learning/economia'
import { CATALOGO_DA_LOJA } from '../../src/core/loja'
import { type AppDeTeste, forma, resposta, semear, subirApp } from './_app'

const DONO = 'local-owner'

/** Rodadas perfeitas de 20 itens: 25 Seeds cada (20 acertos + 5 de rodada perfeita). */
async function ganhar(s: AppDeTeste, userId: string, rodadas: number) {
  const { asUserId } = await s.load('../../server/lib/authContext')
  const { exerciseResultsRepo } = await s.load('../../server/db/repositories/exerciseResults')
  for (let n = 0; n < rodadas; n++) {
    await exerciseResultsRepo.addRodada(asUserId(userId), {
      roundId: `ganho-${userId}-${n}`,
      exerciseKind: 'termo',
      origem: 'baralho',
      score: 100,
      melhorSequencia: 20,
      itens: Array.from({ length: 20 }, (_, i) => ({ itemRef: `w${n}-${i}`, correct: 1, kind: 'drill' })),
    })
  }
}

async function economia(
  s: AppDeTeste,
  userId: string,
): Promise<{ nivel: number; ganhas: number; gastas: number; saldo: number }> {
  const { asUserId } = await s.load('../../server/lib/authContext')
  const { economiaDoUsuario } = await s.load('../../server/db/repositories/metrics')
  return economiaDoUsuario(asUserId(userId))
}

describe('seeds por HTTP (modo self-host)', () => {
  let s: AppDeTeste
  const ITEM = CATALOGO_DA_LOJA.find((i) => i.id === 'tema-linear')!
  const CARO = CATALOGO_DA_LOJA.find((i) => i.id === 'tema-custom')!
  let saldoInicial = 0

  beforeAll(async () => {
    s = await subirApp({ modo: 'self-host' })
    await semear(s, DONO)
    await ganhar(s, DONO, 4) // 100 Seeds por rodadas perfeitas
  })
  afterAll(async () => {
    await s.encerrar()
  })

  it('GET /api/metrics/profile devolve o perfil com a forma conhecida, e o saldo e o do razao', async () => {
    const r = await s.get('/api/metrics/profile')
    expect(r.status).toBe(200)
    const corpo = await r.json()
    expect(corpo.seedsGastas).toBe(0)
    const eco = await economia(s, DONO)
    saldoInicial = eco.saldo
    expect(saldoInicial).toBeGreaterThanOrEqual(ITEM.precoSeeds!)
    expect(saldoInicial).toBeLessThan(CARO.precoSeeds!)
    await expect(JSON.stringify({ status: r.status, forma: forma(corpo) }, null, 2)).toMatchFileSnapshot(
      '__snapshots__/get.metrics.profile.seeds.json',
    )
  })

  it('POST /api/metrics/seeds/gastar com item real ao preco do catalogo: 200, e o saldo cai o preco', async () => {
    const r = await s.post('/api/metrics/seeds/gastar', {
      spendId: `compra-${ITEM.id}`,
      amount: ITEM.precoSeeds,
      reason: `loja:${ITEM.id}`,
    })
    expect(r.status).toBe(200)
    const corpo = await r.clone().json()
    expect(corpo).toMatchObject({ jaExistia: false, gasto: ITEM.precoSeeds, seedsGastas: ITEM.precoSeeds })
    await expect(JSON.stringify(await resposta(r), null, 2)).toMatchFileSnapshot(
      '__snapshots__/post.metrics.seeds.gastar.json',
    )

    const perfil = await (await s.get('/api/metrics/profile')).json()
    expect(perfil.seedsGastas).toBe(ITEM.precoSeeds)
    expect(perfil.itensComprados).toContain(ITEM.id)
    expect((await economia(s, DONO)).saldo).toBe(saldoInicial - ITEM.precoSeeds!)
  })

  it('o MESMO spendId de novo e idempotente: 200 com jaExistia=true, sem cobrar de novo', async () => {
    const r = await s.post('/api/metrics/seeds/gastar', {
      spendId: `compra-${ITEM.id}`,
      amount: ITEM.precoSeeds,
      reason: `loja:${ITEM.id}`,
    })
    expect(r.status).toBe(200)
    expect(await r.clone().json()).toMatchObject({
      jaExistia: true,
      gasto: ITEM.precoSeeds,
      seedsGastas: ITEM.precoSeeds,
    })
    await expect(JSON.stringify(await resposta(r), null, 2)).toMatchFileSnapshot(
      '__snapshots__/post.metrics.seeds.gastar.repetido.json',
    )
    expect((await economia(s, DONO)).gastas).toBe(ITEM.precoSeeds)
  })

  it('preco divergente do catalogo: 400 preco_divergente com o preco certo em detalhes', async () => {
    const r = await s.post('/api/metrics/seeds/gastar', {
      spendId: 'compra-barata-01',
      amount: 1,
      reason: `loja:${CARO.id}`,
    })
    expect(r.status).toBe(400)
    expect(await r.clone().json()).toMatchObject({ code: 'preco_divergente', detalhes: { preco: CARO.precoSeeds } })
    await expect(JSON.stringify(await resposta(r), null, 2)).toMatchFileSnapshot(
      '__snapshots__/post.metrics.seeds.gastar.preco-divergente.json',
    )
  })

  it('preco certo mas saldo que nao paga: 402 saldo_insuficiente dizendo quanto falta', async () => {
    const r = await s.post('/api/metrics/seeds/gastar', {
      spendId: `compra-${CARO.id}`,
      amount: CARO.precoSeeds,
      reason: `loja:${CARO.id}`,
    })
    expect(r.status).toBe(402)
    const corpo = await r.clone().json()
    expect(corpo).toMatchObject({ code: 'saldo_insuficiente', detalhes: { preco: CARO.precoSeeds } })
    expect(corpo.detalhes.falta).toBe(CARO.precoSeeds! - corpo.detalhes.saldo)
    await expect(JSON.stringify(await resposta(r), null, 2)).toMatchFileSnapshot(
      '__snapshots__/post.metrics.seeds.gastar.saldo-insuficiente.json',
    )
    expect((await economia(s, DONO)).gastas).toBe(ITEM.precoSeeds)
  })

  it('motivo desconhecido: 400 no envelope, com code', async () => {
    const r = await s.post('/api/metrics/seeds/gastar', {
      spendId: 'motivo-estranho-01',
      amount: 10,
      reason: 'qualquer-coisa',
    })
    expect(r.status).toBe(400)
    /* FASE 4 (correção 7): saía como `{ error }` cru, sem `code`, enquanto as outras recusas da
       MESMA rota (`preco_divergente`, `saldo_insuficiente`) já usavam o envelope canônico. */
    expect(await r.clone().json()).toEqual({
      error: 'motivo desconhecido: qualquer-coisa',
      code: 'motivo_desconhecido',
    })
    await expect(JSON.stringify(await resposta(r), null, 2)).toMatchFileSnapshot(
      '__snapshots__/post.metrics.seeds.gastar.motivo-desconhecido.json',
    )
  })

  it('item exclusivo de conquista nunca entra pela compra: 400', async () => {
    const r = await s.post('/api/metrics/seeds/gastar', {
      spendId: 'compra-aurora-01',
      amount: 10,
      reason: 'loja:tema-aurora',
    })
    expect(r.status).toBe(400)
    expect((await r.json()).error).toContain('exclusivo de conquista')
  })

  it('POST /api/metrics/seeds/creditar com conquista conferivel NAO cumprida: 400 conquista_nao_cumprida', async () => {
    expect(CONQUISTAS_CONFERIVEIS.has('nivel-10')).toBe(true)
    expect((await economia(s, DONO)).nivel).toBeLessThan(10)
    const r = await s.post('/api/metrics/seeds/creditar', { creditoId: 'conquista-nivel-10' })
    expect(r.status).toBe(400)
    const corpo = await r.clone().json()
    expect(corpo).toMatchObject({ code: 'conquista_nao_cumprida', detalhes: { meta: 10 } })
    expect(corpo.detalhes.atual).toBeLessThan(10)
    await expect(JSON.stringify(await resposta(r), null, 2)).toMatchFileSnapshot(
      '__snapshots__/post.metrics.seeds.creditar.nao-cumprida.json',
    )
    const perfil = await (await s.get('/api/metrics/profile')).json()
    expect(perfil.seedsCreditadas).toBe(0)
  })

  it('creditar com conquista conferivel CUMPRIDA: 200 com o valor da regra, e o reenvio e idempotente', async () => {
    // "sem-erro": uma rodada perfeita — as de `ganhar` ja cumprem.
    const r1 = await s.post('/api/metrics/seeds/creditar', {
      creditoId: 'conquista-sem-erro',
      amount: 9_999,
      xp: 9_999,
    })
    expect(r1.status).toBe(200)
    expect(await r1.clone().json()).toMatchObject({ jaExistia: false, seedsCreditadas: 20, xpCreditado: 30 })
    await expect(JSON.stringify(await resposta(r1), null, 2)).toMatchFileSnapshot(
      '__snapshots__/post.metrics.seeds.creditar.json',
    )
    const r2 = await s.post('/api/metrics/seeds/creditar', { creditoId: 'conquista-sem-erro' })
    expect(await r2.json()).toMatchObject({ jaExistia: true, seedsCreditadas: 20, xpCreditado: 30 })
  })

  it('creditoId desconhecido: 400 credito_desconhecido', async () => {
    const r = await s.post('/api/metrics/seeds/creditar', { creditoId: 'inventado-xyz-123' })
    expect(r.status).toBe(400)
    expect(await r.clone().json()).toMatchObject({ code: 'credito_desconhecido' })
    await expect(JSON.stringify(await resposta(r), null, 2)).toMatchFileSnapshot(
      '__snapshots__/post.metrics.seeds.creditar.desconhecido.json',
    )
  })

  it('creditoId curto demais (< 8) e 400 do Zod, antes de qualquer regra', async () => {
    const r = await s.post('/api/metrics/seeds/creditar', { creditoId: 'curto' })
    expect(r.status).toBe(400)
    expect((await r.json()).error).toMatch(/payload inválido: creditoId/)
  })

  it('POST /api/metrics/presenca {} marca o dia do servidor; repetir no mesmo dia e jaExistia=true', async () => {
    const hoje = diaLocal(Date.now())
    const r1 = await s.post('/api/metrics/presenca', {})
    expect(r1.status).toBe(200)
    expect(await r1.clone().json()).toEqual({ jaExistia: false, dia: hoje, streakPresenca: 1 })
    await expect(JSON.stringify(await resposta(r1), null, 2)).toMatchFileSnapshot(
      '__snapshots__/post.metrics.presenca.json',
    )

    const r2 = await s.post('/api/metrics/presenca', {})
    expect(r2.status).toBe(200)
    expect(await r2.json()).toEqual({ jaExistia: true, dia: hoje, streakPresenca: 1 })

    const perfil = await (await s.get('/api/metrics/profile')).json()
    expect(perfil.presencas).toBe(1)
    expect(perfil.streakPresenca).toBe(1)
  })

  it('presenca com dia 30 dias no passado: 400, sem gravar', async () => {
    const r = await s.post('/api/metrics/presenca', { dia: diaLocal(Date.now()) - 30 })
    expect(r.status).toBe(400)
    // FASE 4 (correção 7): a recusa de janela ganhou `code` e o dia do servidor em `detalhes` —
    // a causa provável é relógio do cliente errado, e a tela só sabe disso pelo código.
    const recusa = await r.clone().json()
    expect(recusa.code).toBe('dia_fora_da_janela')
    expect(recusa.error).toBe('dia fora da janela aceitável')
    expect(typeof recusa.detalhes.diaDoServidor).toBe('number')
    await expect(JSON.stringify(await resposta(r), null, 2)).toMatchFileSnapshot(
      '__snapshots__/post.metrics.presenca.fora-da-janela.json',
    )
    expect((await (await s.get('/api/metrics/profile')).json()).presencas).toBe(1)
  })

  it('presenca com dia de ontem (fuso legitimo) entra e estende a sequencia', async () => {
    const ontem = diaLocal(Date.now()) - 1
    const r = await s.post('/api/metrics/presenca', { dia: ontem })
    expect(r.status).toBe(200)
    expect(await r.json()).toEqual({ jaExistia: false, dia: ontem, streakPresenca: 1 })
    expect((await (await s.get('/api/metrics/profile')).json()).streakPresenca).toBe(2)
  })
})
