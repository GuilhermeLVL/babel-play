/**
 * CARACTERIZAÇÃO — N compras ao mesmo tempo, por HTTP, contra o app montado.
 *
 * O par em vitest do e2e `dois-dispositivos`: lá são dois navegadores e a prova é que as duas
 * telas convergem; aqui são N requisições simultâneas na mesma rota e a prova é aritmética — o
 * saldo nunca fica negativo e a soma dos débitos aceitos nunca passa do que havia.
 *
 * A corrida importa porque o caminho tem duas etapas (conferir saldo, depois gravar o gasto) e
 * `metrics.ts:80-84` documenta a janela entre elas; quem fecha a porta é o `INSERT` com teto de
 * `seedSpendsRepo.debitar`. Um teste de repositório provaria a mesma coisa sem passar pelo
 * `parseOr400`, pelo catálogo de preços nem pelo limitador — e é exatamente aí que uma refatoração
 * de rota quebraria sem ninguém ver.
 */
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest'

import { abrePorNivel, CATALOGO_DA_LOJA } from '../../src/core/loja'
import { type AppDeTeste, semear, subirApp } from './_app'

let s: AppDeTeste
/** Saldo derivado como a tela deriva (ganhas − gastas), lido do próprio perfil. */
async function saldo(): Promise<number> {
  const p = await (await s.get('/api/metrics/profile')).json()
  const ganhas =
    (p.deckSize ?? 0) * 1 +
    (p.correctReviews ?? 0) * 2 +
    (p.drillCorrect ?? 0) * 1 +
    (p.rodadasPerfeitas ?? 0) * 5 +
    (p.presencas ?? 0) * 5 +
    Math.floor((p.capturaMinutosPremiados ?? 0) / 5) * 1 +
    (p.sequencias7 ?? 0) * 25 +
    (p.seedsCreditadas ?? 0)
  return Math.max(0, ganhas - (p.seedsGastas ?? 0))
}
const gastas = async () => (await (await s.get('/api/metrics/profile')).json()).seedsGastas as number
/* Ganhar Seeds pelo mesmo caminho do jogo: `POST /api/exercises/rodada` com todos os itens certos
   (5 por rodada perfeita, 1 por item), até o saldo chegar a `minimo`. */
async function ganharAte(minimo: number): Promise<void> {
  const cartoes = (await (await s.get('/api/vocab')).json()) as Array<{ id: string; word: string }>
  for (let n = 0; (await saldo()) < minimo && n < 60; n++) {
    await s.post('/api/exercises/rodada', {
      roundId: `conc-ganho-${minimo}-${n}-${Date.now()}`,
      exerciseKind: 'memory',
      origem: 'baralho',
      sessionId: 'conc',
      score: 100,
      itens: cartoes.map((c) => ({
        cardId: c.id,
        itemRef: c.word,
        correct: 1,
        attempts: 1,
        ms: 800,
        hinted: 0,
        kind: 'drill',
      })),
    })
  }
}

beforeAll(async () => {
  s = await subirApp({ modo: 'self-host' })
  await semear(s, 'local-owner')
})
afterAll(async () => {
  await s.encerrar()
})

describe('compras simultâneas na mesma conta', () => {
  it('o saldo nunca fica negativo, e a soma aceita nunca passa do que havia', async () => {
    const antes = await saldo()
    const gastasAntes = await gastas()
    /* Itens reais da prateleira de Seeds, com o preço do catálogo (o servidor recusa preço
       divergente). Somados passam do saldo de uma conta recém-semeada — é essa a corrida. */
    /* Os itens baratos de antes (categorias de emoji e cursores) saíram nas recompensas v2; a
       lista agora sai do catálogo, os mais baratos primeiro, até passar do saldo. */
    const itens = CATALOGO_DA_LOJA.filter((i) => i.precoSeeds !== undefined && !i.exclusivoDe && !abrePorNivel(i, 1))
      .sort((a, b) => a.precoSeeds! - b.precoSeeds!)
      .slice(0, 6)
      .map((i) => ({ id: i.id, preco: i.precoSeeds! }))
    expect(
      itens.reduce((n, i) => n + i.preco, 0),
      'a soma tem de passar do saldo, senão não há corrida',
    ).toBeGreaterThan(antes)

    const respostas = await Promise.all(
      itens.map((i) =>
        s.post('/api/metrics/seeds/gastar', {
          spendId: `conc-${i.id}-${Date.now()}`,
          amount: i.preco,
          reason: `loja:${i.id}`,
        }),
      ),
    )
    const status = respostas.map((r) => r.status)
    /* Só dois desfechos são aceitáveis: passou (200) ou não cabia (402). Um 500 aqui seria a
       corrida estourando dentro do banco. */
    expect(
      status.every((c) => c === 200 || c === 402),
      `status inesperados: ${status.join(',')}`,
    ).toBe(true)

    const aceitos = itens.filter((_, n) => status[n] === 200)
    const somaAceita = aceitos.reduce((n, i) => n + i.preco, 0)
    expect(somaAceita, 'o servidor aceitou mais do que havia em conta').toBeLessThanOrEqual(antes)
    expect(await gastas(), 'o débito registrado tem de ser exatamente a soma do que passou').toBe(
      gastasAntes + somaAceita,
    )
    expect(await saldo(), 'saldo negativo').toBeGreaterThanOrEqual(0)
    expect(await saldo()).toBe(antes - somaAceita)
  })

  it('o mesmo spendId em paralelo cobra uma vez só', async () => {
    /* O caso anterior esvaziou a conta de proposito. Ganhar Seeds aqui e o mesmo caminho do jogo:
       `POST /api/exercises/rodada` com todos os itens certos (5 por rodada perfeita, 1 por item). */
    /* "Pular rodada" (40): o motivo mais barato do formato fechado. Os itens da Loja passaram a
       custar 350+ com os preços calibrados das recompensas v2, e o que se prova aqui é o spendId. */
    const item = { preco: 40 }
    await ganharAte(item.preco)
    const antes = await saldo()
    const gastasAntes = await gastas()
    expect(antes, 'saldo insuficiente para este caso').toBeGreaterThanOrEqual(item.preco)
    const corpo = { spendId: 'conc-idempotente-1', amount: item.preco, reason: 'pular-rodada' }
    const rs = await Promise.all([1, 2, 3].map(() => s.post('/api/metrics/seeds/gastar', corpo)))
    const status = rs.map((r) => r.status)
    expect(
      status.every((c) => c === 200),
      `status: ${status.join(',')}`,
    ).toBe(true)
    expect(await gastas(), 'três requisições com o mesmo spendId debitaram mais de uma vez').toBe(
      gastasAntes + item.preco,
    )
    expect(await saldo()).toBe(antes - item.preco)
  })

  /**
   * A CORRIDA QUE O CASO ACIMA PEGAVA DE VEZ EM QUANDO, AGORA EM ORDEM FIXA.
   *
   * Três cliques com o mesmo spendId: o 2º lia `jaGastou` ANTES do commit do 1º (falso) e a economia
   * DEPOIS dele — o saldo já descontava o próprio gasto, e o reenvio de uma compra paga levava 402
   * (job `postgres-real`, 1 em ~3 execuções). Aqui o `jaGastou` "atrasado" é forçado: a 1ª leitura do
   * reenvio volta falsa, como se tivesse acontecido antes do commit. Com saldo entre 1× e 2× o preço,
   * a resposta tem de ser 200 com `jaExistia`, e nada é debitado de novo.
   */
  it('o reenvio que leu "ainda não cobrado" antes do commit não vira 402', async () => {
    const preco = 40
    await ganharAte(preco)
    const corpo = { spendId: 'conc-idempotente-atrasado', amount: preco, reason: 'pular-rodada' }
    const primeira = await s.post('/api/metrics/seeds/gastar', corpo)
    expect(primeira.status).toBe(200)
    const depois = await saldo()
    const gastasDepois = await gastas()
    expect(depois, 'o caso só prova algo se o saldo NÃO pagar outra compra').toBeLessThan(preco)

    const { seedSpendsRepo } = await s.load('../../server/db/repositories/seedSpends')
    const espiao = vi.spyOn(seedSpendsRepo, 'jaGastou').mockResolvedValueOnce(false)
    try {
      const reenvio = await s.post('/api/metrics/seeds/gastar', corpo)
      expect(espiao).toHaveBeenCalled()
      expect(reenvio.status, JSON.stringify(await reenvio.clone().json())).toBe(200)
      expect((await reenvio.json()).jaExistia).toBe(true)
    } finally {
      espiao.mockRestore()
    }
    expect(await gastas(), 'o reenvio não pode debitar de novo').toBe(gastasDepois)
    expect(await saldo()).toBe(depois)
  })
})
