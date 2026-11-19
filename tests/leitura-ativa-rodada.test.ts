/**
 * O RESULTADO DAS PERGUNTAS VIRA UMA RODADA (spec `leitura-ativa-perguntas-e-pratica`, "Só o resultado das perguntas
 * vai ao servidor"): uma linha por pergunta com acerto de 1ª, de 2ª, não acertou ou pulada — sem a opção escolhida,
 * sem tempo, sem texto da pessoa.
 */
import { describe, expect, it } from 'vitest'

import { TETO_DE_PALAVRAS_POR_MINUTO } from '../src/core/leitura/alinhadorDeLeitura'
import { itensDaRodadaDeLeitura, leituraValeAMissao, rodadaDaLeitura } from '../src/core/leitura/rodadaDaLeitura'

describe('itensDaRodadaDeLeitura', () => {
  it('2 certas de primeira e 1 pulada: 2 linhas certas e 1 sem resposta', () => {
    expect(itensDaRodadaDeLeitura('a1-no-mercado', ['primeira', 'primeira', 'pulada'])).toEqual([
      { itemRef: 'a1-no-mercado#1', correct: 1, attempts: 1, kind: 'leitura' },
      { itemRef: 'a1-no-mercado#2', correct: 1, attempts: 1, kind: 'leitura' },
      { itemRef: 'a1-no-mercado#3', attempts: 0, kind: 'leitura' },
    ])
  })

  it('segunda tentativa conta como certa com 2 tentativas; não acertou é 0', () => {
    expect(itensDaRodadaDeLeitura('x', ['segunda', 'nenhuma'])).toEqual([
      { itemRef: 'x#1', correct: 1, attempts: 2, kind: 'leitura' },
      { itemRef: 'x#2', correct: 0, attempts: 2, kind: 'leitura' },
    ])
  })

  it('a rodada tem o tipo leituraAtiva, um roundId, a origem do texto e nada além do resultado', () => {
    const r = rodadaDaLeitura({
      textoId: 'a1-no-mercado',
      resultados: ['primeira'],
      roundId: 'leitura-1',
      duracaoMs: 45_000,
    })
    expect(r).toEqual({
      roundId: 'leitura-1',
      exerciseKind: 'leituraAtiva',
      origem: 'leitura:a1-no-mercado',
      duracaoMs: 45_000,
      itens: [{ itemRef: 'a1-no-mercado#1', correct: 1, attempts: 1, kind: 'leitura' }],
    })
  })
})

describe('leituraValeAMissao', () => {
  it('80 palavras em 1 s não vale (ninguém lê a 4800 por minuto); em 20 s, vale', () => {
    expect(leituraValeAMissao(80, 1_000)).toBe(false)
    expect(leituraValeAMissao(80, 20_000)).toBe(true)
  })
  it('o limite é o teto de palavras por minuto', () => {
    const ms = (80 * 60_000) / TETO_DE_PALAVRAS_POR_MINUTO
    expect(leituraValeAMissao(80, ms)).toBe(true)
    expect(leituraValeAMissao(80, ms - 1_000)).toBe(false)
  })
  it('sem tempo medido, não vale', () => {
    expect(leituraValeAMissao(80, 0)).toBe(false)
  })
})
