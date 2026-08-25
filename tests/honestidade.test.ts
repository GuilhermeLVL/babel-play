/**
 * F3 — UMA CONFIANÇA, UM LIMIAR.
 *
 * O defeito que estes testes travam: existiam QUATRO implementações de "confiança" com limiares
 * divergentes —
 *   Metrics.tsx:102          `confidence < 0.5`
 *   Hub.tsx:75               `wpmConfidence < 0.5`
 *   MetricsExpandedKpi:37    sempre âmbar (limiar nenhum)
 *   Analysis.tsx:2017        `nivelConfianca < 0.6`   ← o desviante
 *
 * Consequência observável: uma estimativa de 55% de confiança era rotulada "estimativa" na aba
 * da Sessão e NÃO era rotulada na tela de Analytics. O usuário que compara as duas conclui,
 * corretamente, que uma das duas está errada — e passa a não confiar em nenhuma.
 *
 * O valor 0,5 é o já majoritário (2 dos 3 limiares explícitos). O 0,6 era o desvio.
 */
import { describe, it, expect } from 'vitest'
import { LIMIAR_CONFIANCA, ehBaixaConfianca, rotuloDeConfianca } from '../src/components/Honestidade'

describe('o limiar é único e explícito', () => {
  it('vale 0,5 — o valor que já era maioria', () => {
    expect(LIMIAR_CONFIANCA).toBe(0.5)
  })
})

describe('ehBaixaConfianca — a mesma resposta em qualquer tela', () => {
  it('55% NÃO é baixa confiança — sob o antigo 0,6 da Sessão, era', () => {
    // É exatamente o caso que produzia rótulos contraditórios entre as duas telas.
    expect(ehBaixaConfianca(0.55)).toBe(false)
  })

  it('abaixo de 0,5 é baixa', () => {
    expect(ehBaixaConfianca(0.49)).toBe(true)
    expect(ehBaixaConfianca(0.12)).toBe(true)
  })

  it('exatamente 0,5 não é baixa — o limiar é o piso do aceitável', () => {
    expect(ehBaixaConfianca(0.5)).toBe(false)
  })

  it('trata ausência de dado como baixa confiança, nunca como alta', () => {
    expect(ehBaixaConfianca(Number.NaN)).toBe(true)
    expect(ehBaixaConfianca(undefined as unknown as number)).toBe(true)
  })
})

describe('rotuloDeConfianca — uma redação só', () => {
  it('arredonda para inteiro e diz o percentual', () => {
    expect(rotuloDeConfianca(0.62)).toBe('confiança 62%')
  })

  it('prefixa "estimativa" quando o número é estimado', () => {
    expect(rotuloDeConfianca(0.62, true)).toBe('estimativa · confiança 62%')
  })

  it('o MESMO valor produz o MESMO rótulo — era isso que divergia entre as telas', () => {
    expect(rotuloDeConfianca(0.55, true)).toBe(rotuloDeConfianca(0.55, true))
    expect(rotuloDeConfianca(0.55)).toBe('confiança 55%')
  })

  it('nunca inventa um número quando não há confiança', () => {
    expect(rotuloDeConfianca(Number.NaN)).toBe('confiança desconhecida')
    expect(rotuloDeConfianca(undefined as unknown as number, true)).toBe('confiança desconhecida')
  })
})
