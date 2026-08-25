/**
 * Testes da detecção de voz passiva (heurística de token, sem IA).
 *
 * O objetivo não é um parser gramatical perfeito — é documentar exatamente o que o padrão
 * "be + particípio" pega e o que ele erra de propósito (ver cabeçalho de passive-voice.ts). Os
 * casos de falso-positivo/negativo abaixo são a especificação viva desses limites.
 */
import { describe, it, expect } from 'vitest'
import { detectarVozPassiva } from '../src/core/learning/passive-voice'

describe('detectarVozPassiva', () => {
  it('detecta particípio regular ("-ed") após "be"', () => {
    const r = detectarVozPassiva('The book was written by her.')
    expect(r.ocorrencias).toBe(1)
    expect(r.exemplos).toEqual(['was written'])
  })

  it('detecta particípio irregular (fora do padrão "-ed")', () => {
    const r = detectarVozPassiva('The window was broken yesterday.')
    expect(r.ocorrencias).toBe(1)
    expect(r.exemplos).toEqual(['was broken'])
  })

  it('NÃO confunde voz ativa com "be" + gerúndio/adjetivo comum', () => {
    expect(detectarVozPassiva('I am writing a letter.').ocorrencias).toBe(0)
    expect(detectarVozPassiva('She is happy today.').ocorrencias).toBe(0)
  })

  it('aceita negação/advérbio único entre "be" e o particípio', () => {
    expect(detectarVozPassiva('The report was not finished.').ocorrencias).toBe(1)
    expect(detectarVozPassiva('The house was quickly built.').ocorrencias).toBe(1)
  })

  it('não conta quando há DOIS advérbios entre "be" e o particípio (fora do padrão)', () => {
    expect(detectarVozPassiva('It was really quite finished.').ocorrencias).toBe(0)
  })

  it('encadeia formas de "be" consecutivas ("was being")', () => {
    const r = detectarVozPassiva('The car was being repaired.')
    expect(r.ocorrencias).toBe(1)
    expect(r.exemplos).toEqual(['was being repaired'])
  })

  it('FALSO NEGATIVO conhecido e aceito: adjetivo -ed de alta frequência não conta', () => {
    // "excited" está na lista de exclusão (estado, não voz-passiva-alvo) — ver ADJETIVOS_ED_EXCLUIDOS.
    expect(detectarVozPassiva('She was excited about the trip.').ocorrencias).toBe(0)
  })

  it('conta múltiplas ocorrências na mesma passagem, sem sobreposição', () => {
    const r = detectarVozPassiva('The cake was eaten. The song was sung by the choir.')
    expect(r.ocorrencias).toBe(2)
  })

  it('texto vazio não divide por zero', () => {
    const r = detectarVozPassiva('')
    expect(r.ocorrencias).toBe(0)
    expect(r.palavras).toBe(0)
    expect(r.por100Palavras).toBe(0)
  })

  it('a taxa é por 100 palavras, usando o total de palavras como denominador', () => {
    const texto = 'was written ' + 'word '.repeat(98) // 100 tokens, 1 ocorrência
    const r = detectarVozPassiva(texto)
    expect(r.palavras).toBe(100)
    expect(r.ocorrencias).toBe(1)
    expect(r.por100Palavras).toBe(1)
  })

  it('é indiferente à caixa', () => {
    expect(detectarVozPassiva('THE BOOK WAS WRITTEN BY HER.').ocorrencias).toBe(1)
  })

  it('limita os exemplos exibidos a 6, mas conta todas as ocorrências', () => {
    const texto = Array.from({ length: 9 }, () => 'It was built.').join(' ')
    const r = detectarVozPassiva(texto)
    expect(r.ocorrencias).toBe(9)
    expect(r.exemplos.length).toBe(6)
  })
})
