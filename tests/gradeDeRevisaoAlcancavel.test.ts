/**
 * A GRADE DE QUATRO BOTÕES DO FSRS ESTÁ INALCANÇÁVEL — E ESTE TESTE PROVA POR QUÊ.
 *
 * `Study.tsx:1103-1145` renderiza "Errei · Difícil · Bom · Fácil", a escolha de nota que o FSRS-5
 * precisa receber do usuário. O design da rodada anterior trata esse fluxo como o produto em si
 * (`docs/design/auditoria-prototipo-v2/PROMPT.md`, item 6: "Sem isso não é o produto").
 *
 * Só que ela mora no ramo `else` de uma cadeia que nunca cai nele quando há cartão na tela:
 *
 *   Study.tsx:83   const [scheduler] = useState<SchedulerType>('fsrs')   // sem setter: sempre 'fsrs'
 *   Study.tsx:790  const format = isActiveProductionOnly
 *                    ? 'active-production'
 *                    : scheduler === 'fsrs' && currentCard ? formatForCard(currentCard) : 'cloze'
 *   Study.tsx:821 / :839 / :908   os três ramos: active-production, typing, mc
 *   Study.tsx:984  o `else` — DEFAULT FLASHCARD VIEW, onde vivem os quatro botões
 *
 * `formatForCard` só devolve 'mc' | 'typing' | 'active-production'. Os três ramos anteriores
 * esgotam o contradomínio, então o `else` só roda quando `currentCard` é `undefined` — isto é,
 * quando não há cartão nenhum e os campos saem vazios.
 *
 * Consequência prática: nos três formatos que o usuário realmente encontra, a nota é DERIVADA do
 * acerto (`isCorrect ? 3 : 1` em `Study.tsx:895` e `:971`; `res.correct ? 3 : 1` em `:826`), e
 * ele nunca escolhe entre Difícil e Bom. Foi por isso que os intervalos cravados no JSX
 * ("10m/1.2d/3.5d/8d") puderam ficar anos errados sem ninguém notar: ninguém os via.
 *
 * ESTE TESTE NÃO CONSERTA NADA. Ele trava o fato, para que a decisão de tornar a grade alcançável
 * (ou de remover o código morto) seja deliberada e não acidental. Se um dia `formatForCard` passar
 * a devolver um quarto formato, ou o `scheduler` virar alternável, este teste falha e obriga a
 * revisitar a cadeia.
 */
import { describe, expect, it } from 'vitest'

import { formatForCard, stabilityThreshold } from '../src/lib/exercicios'
import type { VocabCard } from '../src/types'

const cartao = (stability: number | undefined): VocabCard =>
  ({ id: 'c', word: 'w', translation: 't', stability }) as unknown as VocabCard

describe('formatForCard — contradomínio', () => {
  it('nunca devolve "cloze"/"flashcard", que é o ramo onde a grade de 4 botões mora', () => {
    const amostras = [undefined, 0, 1, 2.9, 3, 10, stabilityThreshold(), stabilityThreshold() + 50, 5000]
    for (const s of amostras) {
      expect(['mc', 'typing', 'active-production']).toContain(formatForCard(cartao(s)))
    }
  })

  it('cartão novo cai em múltipla escolha, e não na grade de notas', () => {
    expect(formatForCard(cartao(undefined))).toBe('mc')
  })

  it('cartão maduro cai em produção ativa, e também não na grade de notas', () => {
    expect(formatForCard(cartao(stabilityThreshold() + 1))).toBe('active-production')
  })

  it('a faixa intermediária cai em digitação', () => {
    expect(formatForCard(cartao(3))).toBe('typing')
  })
})
