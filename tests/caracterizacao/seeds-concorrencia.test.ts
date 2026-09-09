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
import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import { subirApp, semear, type AppDeTeste } from './_app'

let s: AppDeTeste
/** Saldo derivado como a tela deriva (ganhas − gastas), lido do próprio perfil. */
async function saldo(): Promise<number> {
  const p = await (await s.get('/api/metrics/profile')).json()
  const ganhas = (p.deckSize ?? 0) * 1 + (p.correctReviews ?? 0) * 2 + (p.drillCorrect ?? 0) * 1
    + (p.rodadasPerfeitas ?? 0) * 5 + (p.presencas ?? 0) * 5
    + Math.floor((p.capturaMinutosPremiados ?? 0) / 5) * 1 + (p.sequencias7 ?? 0) * 25
    + (p.seedsCreditadas ?? 0)
  return Math.max(0, ganhas - (p.seedsGastas ?? 0))
}
const gastas = async () => (await (await s.get('/api/metrics/profile')).json()).seedsGastas as number

beforeAll(async () => {
  s = await subirApp({ modo: 'self-host' })
  await semear(s, 'local-owner')
})
afterAll(async () => { await s.encerrar() })

describe('compras simultâneas na mesma conta', () => {
  it('o saldo nunca fica negativo, e a soma aceita nunca passa do que havia', async () => {
    const antes = await saldo()
    const gastasAntes = await gastas()
    /* Itens reais da prateleira de Seeds, com o preço do catálogo (o servidor recusa preço
       divergente). Somados passam do saldo de uma conta recém-semeada — é essa a corrida. */
    const itens = [
      { id: 'gal-cat-esportes', preco: 40 },
      { id: 'gal-cat-patos', preco: 40 },
      { id: 'cur-pata', preco: 45 },
      { id: 'part-pixel', preco: 45 },
      { id: 'cur-cafe', preco: 50 },
      { id: 'cur-mira', preco: 50 },
    ]
    expect(itens.reduce((n, i) => n + i.preco, 0), 'a soma tem de passar do saldo, senão não há corrida').toBeGreaterThan(antes)

    const respostas = await Promise.all(itens.map((i) => s.post('/api/metrics/seeds/gastar', {
      spendId: `conc-${i.id}-${Date.now()}`, amount: i.preco, reason: `loja:${i.id}`,
    })))
    const status = respostas.map((r) => r.status)
    /* Só dois desfechos são aceitáveis: passou (200) ou não cabia (402). Um 500 aqui seria a
       corrida estourando dentro do banco. */
    expect(status.every((c) => c === 200 || c === 402), `status inesperados: ${status.join(',')}`).toBe(true)

    const aceitos = itens.filter((_, n) => status[n] === 200)
    const somaAceita = aceitos.reduce((n, i) => n + i.preco, 0)
    expect(somaAceita, 'o servidor aceitou mais do que havia em conta').toBeLessThanOrEqual(antes)
    expect(await gastas(), 'o débito registrado tem de ser exatamente a soma do que passou').toBe(gastasAntes + somaAceita)
    expect(await saldo(), 'saldo negativo').toBeGreaterThanOrEqual(0)
    expect(await saldo()).toBe(antes - somaAceita)
  })

  it('o mesmo spendId em paralelo cobra uma vez só', async () => {
    /* O caso anterior esvaziou a conta de proposito. Ganhar Seeds aqui e o mesmo caminho do jogo:
       `POST /api/exercises/rodada` com todos os itens certos (5 por rodada perfeita, 1 por item). */
    const cartoes = await (await s.get('/api/vocab')).json() as Array<{ id: string; word: string }>
    for (let n = 0; (await saldo()) < 50 && n < 12; n++) {
      await s.post('/api/exercises/rodada', {
        roundId: `conc-ganho-${n}-${Date.now()}`, exerciseKind: 'memory', origem: 'baralho', sessionId: 'conc', score: 100,
        itens: cartoes.map((c) => ({ cardId: c.id, itemRef: c.word, correct: 1, attempts: 1, ms: 800, hinted: 0, kind: 'drill' })),
      })
    }
    const antes = await saldo()
    const gastasAntes = await gastas()
    const item = { id: 'cur-tinteiro', preco: 50 }
    expect(antes, 'saldo insuficiente para este caso').toBeGreaterThanOrEqual(item.preco)
    const corpo = { spendId: 'conc-idempotente-1', amount: item.preco, reason: `loja:${item.id}` }
    const rs = await Promise.all([1, 2, 3].map(() => s.post('/api/metrics/seeds/gastar', corpo)))
    expect(rs.map((r) => r.status).every((c) => c === 200)).toBe(true)
    expect(await gastas(), 'três requisições com o mesmo spendId debitaram mais de uma vez').toBe(gastasAntes + item.preco)
    expect(await saldo()).toBe(antes - item.preco)
  })
})
