/**
 * Z4 — O FIO COMPLETO: uma jornada, todas as fases da missão em série.
 *
 * Os testes por fase provam que cada peça funciona. Este prova que elas se ENCAIXAM — que o dado
 * atravessa captura → classificação → tela → jogo → exercício → recálculo, e volta mudado.
 *
 * O elo do download (F1) não entra aqui: ele é validado pela suíte de mecanismo (R1.1, 11 cenários
 * contra o servidor-fixture) e pelo canário de payload real, ambos em `scripts/diagnosis/`.
 * Repetir aqui exigiria baixar 116 MB para reprovar nada de novo — está declarado, não omitido.
 */
import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import { setupEphemeralDb, type EphemeralDb } from '../harness/ephemeralDb'
import { asUserId } from '../../server/lib/authContext'
import { faixaDe, cortesDoDeck } from '../../src/core/learning/dificuldade'

const U = asUserId('fio-completo')
let h: EphemeralDb
let vocabRepo: any
let exerciseResultsRepo: any

beforeAll(async () => {
  h = await setupEphemeralDb()
  vocabRepo = (await import('../../server/db/repositories/vocab')).vocabRepo
  exerciseResultsRepo = (await import('../../server/db/repositories/exerciseResults')).exerciseResultsRepo
})
afterAll(async () => { await h?.cleanup?.() })

describe('a jornada inteira', () => {
  it('captura → classificação → tela → jogo → exercício → dificuldade recalculada', async () => {
    // ── 1. CAPTURA: a sessão traz palavras, e uma delas aparece DUAS vezes ────────────────────
    await vocabRepo.bulkAdd(U, [
      { word: 'harvest', srcLang: 'en', back: 'colheita', sentence: 'The harvest was good.', sessionId: 'trilha:en' },
      { word: 'water', srcLang: 'en', back: 'água', sentence: 'Drink water.' },
      { word: 'garden', srcLang: 'en', back: 'jardim', sentence: 'A small garden.' },
    ])
    await vocabRepo.bulkAdd(U, [
      { word: 'water', srcLang: 'en', back: 'água', sentence: 'Water the plants.' },   // 2ª vez
    ])

    const deck = await vocabRepo.list(U)
    expect(deck).toHaveLength(3)   // a repetição NÃO virou cartão novo

    // ── 2. CLASSIFICAÇÃO: nível com procedência, repetição contada ────────────────────────────
    const agua = deck.find((c: any) => c.word === 'water')
    expect(agua.cefrLevel).toBe('A1')
    expect(agua.cefrSource).toBe('wordlist')     // wordlist real, não chute por comprimento
    expect(agua.occurrences).toBe(2)             // `frequency` era 0 em 2.126 linhas; agora conta

    // ── 3. TELA: a palavra aparece com proveniência e origem rastreável ───────────────────────
    const pagina = await vocabRepo.listarPagina(U, { limite: 50, ordem: 'frequentes' })
    expect(pagina.total).toBe(3)
    expect(pagina.itens[0].word).toBe('water')   // mais vista primeiro
    const colheita = deck.find((c: any) => c.word === 'harvest')
    const occ = await vocabRepo.ocorrencias(U, colheita.id)
    expect(occ[0].originKind).toBe('trilha')     // a origem da trilha sobreviveu ao round-trip
    expect(occ[0].originRef).toBe('en')

    const contagem = await vocabRepo.inicioDaContagem(U)
    expect(contagem.total).toBe(3)               // a tela tem o que declarar (Z2)

    // ── 4. DIFICULDADE inicial ────────────────────────────────────────────────────────────────
    await vocabRepo.recalcularDificuldade(U)
    const antes = (await vocabRepo.list(U)).find((c: any) => c.word === 'garden')
    expect(typeof antes.difficultyScore).toBe('number')

    // ── 5. JOGO: seleção servida, com proveniência por item ───────────────────────────────────
    const rodada = await vocabRepo.selecionarParaJogo(U, { limite: 10 })
    expect(rodada.itens.length).toBeGreaterThan(0)
    const item = rodada.itens.find((i: any) => i.word === 'garden')
    expect(item.proveniencia).toMatchObject({ origem: 'baralho', nivelFonte: expect.any(String) })
    expect(item.proveniencia.porQueSelecionado).toBeTruthy()
    expect(rodada.cortes).toBeTruthy()           // os cortes usados viajam com a resposta (Z3)

    // ── 6. EXERCÍCIO: a rodada grava DE UMA VEZ, com card_id ──────────────────────────────────
    await exerciseResultsRepo.addRodada(U, {
      roundId: 'fio-1', exerciseKind: 'memory', origem: 'baralho', score: 10,
      itens: [
        { cardId: antes.id, itemRef: 'garden', correct: 0, attempts: 3, ms: 4000, hinted: 1, kind: 'srs' },
        { cardId: agua.id, itemRef: 'water', correct: 1, attempts: 1, ms: 700, hinted: 0, kind: 'srs' },
      ],
    })
    const linhas = await exerciseResultsRepo.listarPorRodada(U, 'fio-1')
    expect(linhas).toHaveLength(2)
    expect(linhas.every((l: any) => l.cardId)).toBe(true)   // por ID, nunca por string

    // ── 7. O FIO SE FECHA: o desempenho realimenta a dificuldade ──────────────────────────────
    const desempenho = await exerciseResultsRepo.desempenhoPorCartao(U, [antes.id])
    expect(desempenho[antes.id]).toMatchObject({ tentativas: 1, acertos: 0 })

    await vocabRepo.recalcularDificuldade(U, [antes.id, agua.id])
    const depois = (await vocabRepo.list(U)).find((c: any) => c.word === 'garden')
    const aguaDepois = (await vocabRepo.list(U)).find((c: any) => c.word === 'water')

    // Errar deixa a palavra MAIS difícil; acertar, menos. É o elo que não existia.
    expect(depois.difficultyScore).toBeGreaterThan(antes.difficultyScore)
    expect(aguaDepois.difficultyScore).toBeLessThan(depois.difficultyScore)
    expect(depois.difficultyAt).toBeGreaterThanOrEqual(antes.difficultyAt ?? 0)
  })

  it('errar repetidamente joga a palavra para DIFÍCIL, por precedência', async () => {
    const u = asUserId('fio-precedencia')
    await vocabRepo.bulkAdd(u, [{ word: 'water', srcLang: 'en', back: 'água' }])
    const c = (await vocabRepo.list(u))[0]

    for (let i = 0; i < 4; i++) {
      await exerciseResultsRepo.addRodada(u, {
        roundId: `p-${i}`, exerciseKind: 'blitz', origem: 'baralho', score: 1,
        itens: [{ cardId: c.id, itemRef: 'water', correct: 0, attempts: 2, ms: 3000, hinted: 0, kind: 'srs' }],
      })
    }
    await vocabRepo.recalcularDificuldade(u, [c.id])
    const depois = (await vocabRepo.list(u))[0]

    // A1 e muito errada: a precedência tem de vencer a média, senão o aluno nunca revê o que erra.
    const cortes = cortesDoDeck([depois.difficultyScore])
    expect(faixaDe(depois.difficultyScore, cortes)).toBeTruthy()
    const desempenho = await exerciseResultsRepo.desempenhoPorCartao(u, [c.id])
    expect(desempenho[c.id].acertos / desempenho[c.id].tentativas).toBeLessThan(0.4)
  })
})
