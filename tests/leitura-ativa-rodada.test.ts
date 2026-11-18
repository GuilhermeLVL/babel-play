/**
 * O RESULTADO DAS PERGUNTAS VIRA UMA RODADA (spec `leitura-ativa-perguntas-e-pratica`, "Só o resultado das perguntas
 * vai ao servidor"): uma linha por pergunta com acerto de 1ª, de 2ª, não acertou ou pulada — sem a opção escolhida,
 * sem tempo, sem texto da pessoa.
 */
import { describe, expect, it } from 'vitest'

import { itensDaRodadaDeLeitura, rodadaDaLeitura } from '../src/core/leitura/rodadaDaLeitura'

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
