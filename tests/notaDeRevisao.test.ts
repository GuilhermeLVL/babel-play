/**
 * D-006 — o modelo híbrido da nota de revisão, travado na função pura.
 *
 * `tests/gradeDeRevisaoAlcancavel.test.ts` prova que a grade de quatro botões nunca aparecia com
 * cartão na tela e que a nota era derivada do acerto. Este arquivo trava o que a substitui: erro
 * fecha em `Again`; acerto oferece Difícil/Bom/Fácil com a derivada de antes pré-selecionada.
 */
import { describe, expect, it } from 'vitest'

import { notaFinal, notasOferecidas } from '../src/core/learning/notaDeRevisao'

describe('notasOferecidas — o erro não escolhe nota, o acerto escolhe entre três', () => {
  it('resposta errada trava em Again (1), em qualquer formato', () => {
    for (const f of ['mc', 'typing', 'active-production', 'cloze'] as const) {
      expect(notasOferecidas(false, f)).toEqual({ travada: 1 })
    }
  })

  it('resposta certa em múltipla escolha ou digitação pré-seleciona Bom (3)', () => {
    expect(notasOferecidas(true, 'mc')).toEqual({ opcoes: [2, 3, 4], padrao: 3 })
    expect(notasOferecidas(true, 'typing')).toEqual({ opcoes: [2, 3, 4], padrao: 3 })
  })

  it('resposta certa em produção ativa pré-seleciona Fácil (4) — era o que handleFsrsFeedback já fazia', () => {
    expect(notasOferecidas(true, 'active-production')).toEqual({ opcoes: [2, 3, 4], padrao: 4 })
  })
})

describe('notaFinal — o que vai para POST /api/vocab/:id/review', () => {
  it('sem escolha, vai a padrão: o comportamento anterior não muda para quem só aperta Avançar', () => {
    expect(notaFinal(notasOferecidas(true, 'typing'), null)).toBe(3)
    expect(notaFinal(notasOferecidas(true, 'active-production'), null)).toBe(4)
  })

  it('a escolha da pessoa vence a padrão', () => {
    expect(notaFinal(notasOferecidas(true, 'mc'), 2)).toBe(2)
    expect(notaFinal(notasOferecidas(true, 'mc'), 4)).toBe(4)
  })

  it('no erro a escolha é ignorada: nunca sai algo diferente de Again', () => {
    expect(notaFinal(notasOferecidas(false, 'mc'), 4)).toBe(1)
  })

  it('uma nota fora da oferta (Again num acerto) cai na padrão, não no servidor', () => {
    expect(notaFinal(notasOferecidas(true, 'mc'), 1)).toBe(3)
  })
})
