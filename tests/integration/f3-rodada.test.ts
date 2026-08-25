/**
 * F3 — o resultado do exercício passa a apontar para o CARTÃO, e a rodada vira UMA gravação.
 *
 * Dois defeitos medidos no banco real:
 *  - `item_ref` guarda a PALAVRA, não o id: dos 215 resultados, 168 (78,1%) com `item_ref` nulo e
 *    **zero** casando por id. Correlação total: 14,9%. Sem isso, desempenho não realimenta a
 *    dificuldade (F4) e a tela de detalhe (F5) não tem o que mostrar.
 *  - o cliente gravava com `Promise.all` sobre os itens: 20 itens = 20 requests HTTP e ~60 queries,
 *    e uma falha parcial deixava a rodada meio gravada, sem ninguém saber.
 */
import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import { setupEphemeralDb, type EphemeralDb } from '../harness/ephemeralDb'
import { asUserId } from '../../server/lib/authContext'

const U = asUserId('f3-user')
let h: EphemeralDb
let vocabRepo: any
let exerciseResultsRepo: any

beforeAll(async () => {
  h = await setupEphemeralDb()
  vocabRepo = (await import('../../server/db/repositories/vocab')).vocabRepo
  exerciseResultsRepo = (await import('../../server/db/repositories/exerciseResults')).exerciseResultsRepo
})
afterAll(async () => { await h?.cleanup?.() })

async function cartao(word: string) {
  const r = await vocabRepo.bulkAdd(U, [{ word, srcLang: 'en', back: 'traducao' }])
  return r.cards[0] ?? (await vocabRepo.list(U)).find((c: any) => c.word === word)
}

describe('addRodada — uma rodada, uma gravação', () => {
  it('grava todos os itens de uma vez e devolve o que gravou', async () => {
    const a = await cartao('leverage')
    const b = await cartao('churn')
    const r = await exerciseResultsRepo.addRodada(U, {
      roundId: 'r-1', exerciseKind: 'memory', origem: 'baralho', score: 80,
      itens: [
        { cardId: a.id, itemRef: 'leverage', correct: 1, attempts: 1, ms: 900, hinted: 0, kind: 'srs' },
        { cardId: b.id, itemRef: 'churn', correct: 0, attempts: 2, ms: 2400, hinted: 1, kind: 'srs' },
      ],
    })
    expect(r.gravados).toBe(2)
    const linhas = await exerciseResultsRepo.listarPorRodada(U, 'r-1')
    expect(linhas).toHaveLength(2)
    expect(linhas.every((l: any) => l.roundId === 'r-1')).toBe(true)
  })

  it('REGRESSÃO: cada linha guarda o card_id, não só a palavra', async () => {
    const c = await cartao('runway')
    await exerciseResultsRepo.addRodada(U, {
      roundId: 'r-2', exerciseKind: 'blitz', origem: 'baralho', score: 10,
      itens: [{ cardId: c.id, itemRef: 'runway', correct: 1, attempts: 1, ms: 500, hinted: 0, kind: 'srs' }],
    })
    const [linha] = await exerciseResultsRepo.listarPorRodada(U, 'r-2')
    expect(linha.cardId).toBe(c.id)
  })

  it('é ATÔMICA: item inválido no meio não deixa a rodada pela metade', async () => {
    const c = await cartao('moat')
    const antes = (await exerciseResultsRepo.listarPorRodada(U, 'r-3')).length
    await expect(exerciseResultsRepo.addRodada(U, {
      roundId: 'r-3', exerciseKind: 'memory', origem: 'baralho', score: 1,
      itens: [
        { cardId: c.id, itemRef: 'moat', correct: 1, attempts: 1, ms: 1, hinted: 0, kind: 'srs' },
        { cardId: null, itemRef: null, correct: null, attempts: 1, ms: 1, hinted: 0, kind: null, forcarErro: true },
      ],
    })).rejects.toThrow()
    expect((await exerciseResultsRepo.listarPorRodada(U, 'r-3')).length).toBe(antes)
  })

  it('cardId de OUTRO usuário é recusado, não gravado às cegas', async () => {
    const alheio = asUserId('f3-outro')
    const r = await vocabRepo.bulkAdd(alheio, [{ word: 'trespass', srcLang: 'en', back: 'invadir' }])
    const cartaoAlheio = r.cards[0]
    await exerciseResultsRepo.addRodada(U, {
      roundId: 'r-4', exerciseKind: 'memory', origem: 'baralho', score: 1,
      itens: [{ cardId: cartaoAlheio.id, itemRef: 'trespass', correct: 1, attempts: 1, ms: 1, hinted: 0, kind: 'srs' }],
    })
    const [linha] = await exerciseResultsRepo.listarPorRodada(U, 'r-4')
    // O resultado continua valendo; a referência cruzada é que não pode ficar pendurada.
    expect(linha.cardId).toBeNull()
  })
})

describe('desempenho por cartão — o que a F4 vai ler', () => {
  it('agrega acertos e tentativas por cartão', async () => {
    const c = await cartao('cohort')
    for (const [i, ok] of [[0, 1], [1, 0], [2, 0]] as const) {
      await exerciseResultsRepo.addRodada(U, {
        roundId: `r-des-${i}`, exerciseKind: 'memory', origem: 'baralho', score: 1,
        itens: [{ cardId: c.id, itemRef: 'cohort', correct: ok, attempts: 1, ms: 100, hinted: 0, kind: 'srs' }],
      })
    }
    const d = await exerciseResultsRepo.desempenhoPorCartao(U, [c.id])
    expect(d[c.id].tentativas).toBe(3)
    expect(d[c.id].acertos).toBe(1)
  })

  it('cartão sem histórico não aparece — ausência é informação, não zero', async () => {
    const c = await cartao('greenfield')
    const d = await exerciseResultsRepo.desempenhoPorCartao(U, [c.id])
    expect(d[c.id]).toBeUndefined()
  })
})

describe('F4 — dificuldade materializada e seleção com proveniência', () => {
  it('recalcula e grava difficulty_score para o deck', async () => {
    const u = asUserId('f4-user')
    await vocabRepo.bulkAdd(u, [
      { word: 'water', srcLang: 'en', back: 'água' },
      { word: 'incomprehensible', srcLang: 'en', back: 'incompreensível' },
    ])
    const n = await vocabRepo.recalcularDificuldade(u)
    expect(n).toBeGreaterThanOrEqual(2)
    const deck = await vocabRepo.list(u)
    expect(deck.every((c: any) => typeof c.difficultyScore === 'number')).toBe(true)
    expect(deck.every((c: any) => c.difficultyAt > 0)).toBe(true)
  })

  it('cada item selecionado carrega PROVENIÊNCIA completa', async () => {
    const u = asUserId('f4-prov')
    await vocabRepo.bulkAdd(u, [{ word: 'garden', srcLang: 'en', back: 'jardim' }])
    await vocabRepo.recalcularDificuldade(u)
    const r = await vocabRepo.selecionarParaJogo(u, { limite: 5 })
    expect(r.itens.length).toBeGreaterThan(0)
    const p = r.itens[0].proveniencia
    expect(p).toMatchObject({ origem: 'baralho', nivelFonte: expect.any(String) })
    expect(p.porQueSelecionado).toBeTruthy()
    expect(p.faixa === null || ['facil', 'medio', 'dificil'].includes(p.faixa)).toBe(true)
  })

  it('o filtro de dificuldade RECORTA de verdade', async () => {
    const u = asUserId('f4-filtro')
    await vocabRepo.bulkAdd(u, [
      { word: 'music', srcLang: 'en', back: 'música' },
      { word: 'extraordinarily', srcLang: 'en', back: 'extraordinariamente' },
    ])
    await vocabRepo.recalcularDificuldade(u)
    const todos = await vocabRepo.selecionarParaJogo(u, { limite: 50 })
    const dificeis = await vocabRepo.selecionarParaJogo(u, { limite: 50, dificuldade: ['dificil'] })
    expect(dificeis.itens.length).toBeLessThanOrEqual(todos.itens.length)
    expect(dificeis.itens.every((i: any) => i.proveniencia.faixa === 'dificil')).toBe(true)
  })

  it('a origem TRILHA filtra pelas ocorrências, não por uma string de sessão', async () => {
    const u = asUserId('f4-trilha')
    await vocabRepo.bulkAdd(u, [{ word: 'harvest', srcLang: 'en', back: 'colheita', sessionId: 'trilha:en' }])
    await vocabRepo.bulkAdd(u, [{ word: 'ladder', srcLang: 'en', back: 'escada' }])
    await vocabRepo.recalcularDificuldade(u)
    const r = await vocabRepo.selecionarParaJogo(u, { fonte: 'trilha', fonteRef: 'en', limite: 20 })
    expect(r.itens.map((i: any) => i.word)).toEqual(['harvest'])
  })
})
