import { describe, it, expect } from 'vitest'
import { bonusDeVelocidade, bonusDeTempo, pontosDoAcerto, emFever, ehMarco, rotuloDaSequencia, estrelasDaRodada } from '../src/core/minigames/blitzRegras'

describe('duelo relâmpago: regras de velocidade e tempo', () => {
  it('bônus de velocidade cai linearmente e zera aos 3 s', () => {
    expect(bonusDeVelocidade(0)).toBe(10)
    expect(bonusDeVelocidade(1500)).toBe(5)
    expect(bonusDeVelocidade(3000)).toBe(0)
    expect(bonusDeVelocidade(9000)).toBe(0)
  })
  it('resposta relâmpago devolve 2 s, rápida 1 s, pensada nada', () => {
    expect(bonusDeTempo(800)).toBe(2)
    expect(bonusDeTempo(2200)).toBe(1)
    expect(bonusDeTempo(4000)).toBe(0)
  })
  it('pontos: base × multiplicador + velocidade; fever dobra; dica anula mérito', () => {
    expect(pontosDoAcerto(1000, 3, 4, false)).toEqual({ total: 37, base: 30, velocidade: 7, fever: false })
    expect(pontosDoAcerto(1000, 3, 9, false)).toEqual({ total: 74, base: 30, velocidade: 7, fever: true })
    expect(pontosDoAcerto(500, 3, 9, true)).toEqual({ total: 10, base: 10, velocidade: 0, fever: false })
  })
  it('fever, marcos e rótulos', () => {
    expect(emFever(7)).toBe(false)
    expect(emFever(8)).toBe(true)
    expect(ehMarco(5)).toBe(true)
    expect(ehMarco(6)).toBe(false)
    expect(rotuloDaSequencia(1)).toBe('')
    expect(rotuloDaSequencia(2)).toBe('combo')
    expect(rotuloDaSequencia(5)).toBe('em chamas')
    expect(rotuloDaSequencia(8)).toBe('FEVER')
  })
})

describe('estrelas da rodada', () => {
  const o = (correct: boolean, hinted = false) => ({ correct, hinted })
  it('3 = impecável; 2 = ≥70%; 1 = acertou algo; 0 = nada ou vazio', () => {
    expect(estrelasDaRodada([])).toBe(0)
    expect(estrelasDaRodada([o(false), o(false)])).toBe(0)
    expect(estrelasDaRodada([o(true), o(true)])).toBe(3)
    expect(estrelasDaRodada([o(true), o(true, true)])).toBe(2)
    expect(estrelasDaRodada([o(true), o(true), o(true), o(false), o(true), o(true), o(true), o(true), o(true), o(true)])).toBe(2)
    expect(estrelasDaRodada([o(true), o(false), o(false)])).toBe(1)
  })
})
