import { describe, expect, it } from 'vitest'
import { agruparFases, estrelasDaRodada, nivelNoJogo, RODADAS_POR_NIVEL } from '../src/core/minigames/fases'

describe('estrelasDaRodada', () => {
  it('segue a régua 100/75/50', () => {
    expect(estrelasDaRodada(100)).toBe(3)
    expect(estrelasDaRodada(99)).toBe(2)
    expect(estrelasDaRodada(75)).toBe(2)
    expect(estrelasDaRodada(74)).toBe(1)
    expect(estrelasDaRodada(50)).toBe(1)
    expect(estrelasDaRodada(49)).toBe(0)
    expect(estrelasDaRodada(0)).toBe(0)
  })
})

describe('agruparFases', () => {
  const linhas = [
    // rodada A do termo: 2 acertos em 2, score repetido por linha (formato F3)
    { roundId: 'a', exerciseKind: 'termo', itemRef: 'gato', correct: 1, score: 120, melhorSequencia: 4, createdAt: 100 },
    { roundId: 'a', exerciseKind: 'termo', itemRef: 'cão', correct: 1, score: 120, melhorSequencia: 4, createdAt: 110 },
    // rodada B do termo, mais nova, com 1 erro em 2
    { roundId: 'b', exerciseKind: 'termo', itemRef: 'sol', correct: 0, score: 40, createdAt: 200 },
    { roundId: 'b', exerciseKind: 'termo', itemRef: 'lua', correct: 1, score: 40, createdAt: 210 },
    // outro jogo: não entra
    { roundId: 'c', exerciseKind: 'memory', itemRef: 'mar', correct: 1, score: 999, createdAt: 300 },
    // linha sem roundId: rodada antiga sem identidade, ignorada
    { exerciseKind: 'termo', itemRef: 'rio', correct: 1, score: 500, createdAt: 400 },
  ]

  it('agrupa por rodada, mais recente primeiro, só do jogo pedido', () => {
    const fases = agruparFases(linhas, 'termo')
    expect(fases.map(f => f.roundId)).toEqual(['b', 'a'])
  })

  it('calcula precisão, estrelas, combo e refs de cada fase', () => {
    const [b, a] = agruparFases(linhas, 'termo')
    expect(a).toMatchObject({ pontos: 120, combo: 4, acertos: 2, total: 2, precisao: 100, estrelas: 3 })
    expect(a.refs).toEqual(['gato', 'cão'])
    expect(b).toMatchObject({ pontos: 40, combo: 0, acertos: 1, total: 2, precisao: 50, estrelas: 1 })
  })

  it('sem linhas do jogo devolve vazio', () => {
    expect(agruparFases(linhas, 'blitz')).toEqual([])
  })
})

describe('nivelNoJogo', () => {
  it('começa no 1 e sobe a cada bloco de rodadas', () => {
    expect(nivelNoJogo(0)).toMatchObject({ nivel: 1, noNivel: 0, pct: 0 })
    expect(nivelNoJogo(RODADAS_POR_NIVEL - 1).nivel).toBe(1)
    expect(nivelNoJogo(RODADAS_POR_NIVEL)).toMatchObject({ nivel: 2, noNivel: 0 })
    expect(nivelNoJogo(RODADAS_POR_NIVEL + 1).pct).toBeGreaterThan(0)
  })
  it('não quebra com entrada negativa', () => {
    expect(nivelNoJogo(-3).nivel).toBe(1)
  })
})
