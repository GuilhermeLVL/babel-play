/**
 * "leva uns 4 minutos" é útil — desde que seja medido.
 *
 * Este arquivo trava as duas metades da regra: o número aparece quando há amostra que o sustente, e
 * NÃO aparece quando não há. A segunda metade é a que importa: é fácil alguém "melhorar" a UX
 * devolvendo um chute no lugar do `null`, e o resultado seria um número plausível e falso — a
 * mesma classe de defeito que `tests/semConteudoFabricado.test.ts` barra em outras telas.
 */
import { describe, it, expect } from 'vitest'
import { estimativaDeMinutos, medianaPorItem, rotuloDeDuracao, MIN_AMOSTRAS } from '../src/core/minigames/duracao'

/** `n` amostras de `ms` cada. */
const amostras = (n: number, ms: number) => Array.from({ length: n }, () => ms)

describe('mediana por item', () => {
  it('cala com menos amostras que o mínimo', () => {
    expect(medianaPorItem(amostras(MIN_AMOSTRAS - 1, 5000))).toBeNull()
  })

  it('responde ao atingir o mínimo', () => {
    expect(medianaPorItem(amostras(MIN_AMOSTRAS, 5000))).toBe(5000)
  })

  it('ignora a aba esquecida aberta', () => {
    // 20 respostas de 5s + uma de 40 minutos. A média diria ~2min por item; a mediana não se move.
    expect(medianaPorItem([...amostras(MIN_AMOSTRAS, 5000), 2_400_000])).toBe(5000)
  })

  it('ignora registros curtos demais para serem resposta', () => {
    expect(medianaPorItem([...amostras(MIN_AMOSTRAS, 5000), ...amostras(50, 12)])).toBe(5000)
  })

  it('lixo suficiente derruba a amostra abaixo do mínimo e volta a calar', () => {
    expect(medianaPorItem([...amostras(5, 5000), ...amostras(80, 5)])).toBeNull()
  })

  it('com número par de amostras, tira a média dos dois do meio', () => {
    const metade = MIN_AMOSTRAS / 2
    expect(medianaPorItem([...amostras(metade, 4000), ...amostras(metade, 6000)])).toBe(5000)
  })
})

describe('estimativa de minutos', () => {
  it('sem medição suficiente, não há minuto nenhum', () => {
    expect(estimativaDeMinutos(20, amostras(3, 5000))).toBeNull()
  })

  it('20 itens a 12s dão 4 minutos — o número do mockup, agora derivado', () => {
    const e = estimativaDeMinutos(20, amostras(MIN_AMOSTRAS, 12_000))
    expect(e?.minutos).toBe(4)
    expect(e?.amostras).toBe(MIN_AMOSTRAS)
  })

  it('arredonda para cima e nunca devolve zero', () => {
    expect(estimativaDeMinutos(2, amostras(MIN_AMOSTRAS, 1000))?.minutos).toBe(1)
  })

  it('rodada vazia não tem duração', () => {
    expect(estimativaDeMinutos(0, amostras(MIN_AMOSTRAS, 5000))).toBeNull()
  })
})

describe('rótulo', () => {
  it('sem estimativa, diz o que é verdade sem prometer minuto', () => {
    expect(rotuloDeDuracao(null)).toBe('rodada curta')
  })

  it('concorda em número no singular', () => {
    expect(rotuloDeDuracao({ minutos: 1, amostras: 40 })).toBe('leva cerca de 1 minuto')
    expect(rotuloDeDuracao({ minutos: 4, amostras: 40 })).toBe('leva uns 4 minutos')
  })
})
