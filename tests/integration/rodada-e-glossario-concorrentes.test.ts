/**
 * OS OUTROS DOIS SITES SOB A TRAVA DO USUÁRIO, provados com pedidos em voo ao mesmo tempo:
 *
 *  - a mesma rodada (`roundId`) enviada 8 vezes: só uma grava, e as linhas contam uma vez só;
 *  - o glossário a uma entrada do teto: 8 termos novos simultâneos e o total fica exatamente no teto;
 *  - a reetiquetagem de idioma (`relabel`) e uma rodada do MESMO usuário ao mesmo tempo, 5 vezes, sem
 *    deadlock (40P01): os gatilhos tomam as travas de linha em ordens opostas, e só a trava do usuário
 *    como primeira instrução dos dois lotes os serializa (revisão final da Fase 1, M2).
 *
 * Mesmo esquema de `gasto-concorrente.test.ts`: PGlite por padrão (uma conexão, serializa de
 * qualquer jeito) e, com `TESTE_POSTGRES_URL=postgres://…`, um Postgres real com pool de 5, onde a
 * corrida existe. Sem suposição de PGlite: ids sorteados e só a API pública.
 */
import { randomUUID } from 'node:crypto'

import { afterAll, beforeAll, describe, expect, it } from 'vitest'

import { abrirBancoDeTeste } from '../harness/bancoDeTeste'
import type { EphemeralDb } from '../harness/ephemeralDb'

const EM_VOO = 8

let h: EphemeralDb
let exerciseResultsRepo: any
let glossarioRepo: any
let vocabRepo: any

beforeAll(async () => {
  h = await abrirBancoDeTeste()
  ;({ exerciseResultsRepo } = await h.load('../../server/db/repositories/exerciseResults'))
  ;({ glossarioRepo } = await h.load('../../server/db/repositories/glossario'))
  ;({ vocabRepo } = await h.load('../../server/db/repositories/vocab'))
}, 60_000)

afterAll(async () => {
  await h?.cleanup()
})

describe('rodada e glossário concorrentes', () => {
  it('a mesma rodada 8 vezes em voo: uma grava, as linhas entram uma vez', async () => {
    const userId = `rodada-conc-${randomUUID()}`
    const roundId = `r-${randomUUID()}`
    const rodada = {
      roundId,
      exerciseKind: 'memory',
      origem: 'baralho',
      score: 10,
      itens: [
        { itemRef: 'water', correct: 1, attempts: 1, kind: 'srs' },
        { itemRef: 'fire', correct: 0, attempts: 2, kind: 'srs' },
      ],
    }
    const resultados = await Promise.all(
      Array.from({ length: EM_VOO }, () => exerciseResultsRepo.addRodada(userId, rodada)),
    )
    expect(resultados.filter((r: any) => r.gravados > 0)).toHaveLength(1)
    expect(resultados.filter((r: any) => r.jaExistia)).toHaveLength(EM_VOO - 1)
    expect(await exerciseResultsRepo.listarPorRodada(userId, roundId)).toHaveLength(2)
  }, 60_000)

  it('glossário a uma entrada do teto: 8 termos novos em voo e o total fica no teto', async () => {
    const userId = `gloss-conc-${randomUUID()}`
    const teto = 5
    const entrada = (termo: string) => ({
      origem: 'en',
      destino: 'pt',
      termo,
      termoNorm: termo,
      traducao: `sentido de ${termo}`,
    })
    for (let i = 0; i < teto - 1; i++)
      expect((await glossarioRepo.gravar(userId, entrada(`base${i}`), teto)).ok).toBe(true)
    const resultados = await Promise.all(
      Array.from({ length: EM_VOO }, (_, i) => glossarioRepo.gravar(userId, entrada(`novo${i}`), teto)),
    )
    expect(resultados.filter((r: any) => r.ok)).toHaveLength(1)
    expect(await glossarioRepo.contar(userId)).toBe(teto)
  }, 60_000)

  it('reetiquetar idioma, gravar rodada e revisar do mesmo usuário ao mesmo tempo, 5 vezes: sem deadlock', async () => {
    const userId = `relabel-conc-${randomUUID()}`
    // Só letras: a captura descarta "palavra" com dígito. 26 × 8 = 208 cartões.
    const letra = (n: number) => String.fromCharCode(97 + n)
    const palavras = Array.from({ length: 208 }, (_, i) => `palavra${letra(Math.floor(i / 26))}${letra(i % 26)}`)
    const { cards } = await vocabRepo.bulkAdd(
      userId,
      palavras.map((word) => ({ word, srcLang: 'en', tgtLang: 'pt', back: `tradução de ${word}` })),
    )
    expect(cards.length).toBeGreaterThan(200) // a captura pode recusar alguma (ex.: palavra vetada)
    for (let i = 0; i < 5; i++) {
      // Alterna o idioma: só a troca de fato dispara o gatilho `marca_vocab_cards_idioma`.
      const idioma = i % 2 === 0 ? 'de' : 'en'
      const [reetiquetados, rodada] = await Promise.all([
        vocabRepo.relabel(
          userId,
          cards.map((c: any) => ({ id: c.id, srcLang: idioma, tgtLang: 'pt' })),
        ),
        exerciseResultsRepo.addRodada(userId, {
          roundId: `r-${randomUUID()}`,
          exerciseKind: 'memory',
          origem: 'baralho',
          score: 10,
          itens: cards
            .slice(-40)
            .map((c: any) => ({ itemRef: c.word, cardId: c.id, correct: 1, attempts: 1, kind: 'srs' })),
        }),
        // A revisão trava o cartão e depois sobe a marca do usuário: a ordem oposta à da reetiquetagem.
        ...cards.slice(-4).map((c: any) => vocabRepo.review(userId, c.id, 3)),
      ])
      expect(reetiquetados).toBe(cards.length)
      expect(rodada.gravados).toBeGreaterThan(0)
    }
  }, 60_000)
})
