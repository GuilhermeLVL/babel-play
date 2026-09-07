/**
 * Testes da detecção de voz passiva (heurística de token, sem IA).
 *
 * O objetivo não é um parser gramatical perfeito — é documentar exatamente o que o padrão
 * "be + particípio" pega e o que ele erra de propósito (ver cabeçalho de passive-voice.ts). Os
 * casos de falso-positivo/negativo abaixo são a especificação viva desses limites.
 */
import { describe, it, expect } from 'vitest'
import { detectarVozPassiva, temReguaDeVozPassiva } from '../src/core/learning/passive-voice'

/* A régua é de INGLÊS e agora precisa ser pedida por nome: `detectarVozPassiva(texto, lang)`
   devolve `null` para idioma sem régua, em vez de zero com cara de medição. Os casos abaixo
   continuam sendo sobre o padrão "be + particípio", então pedem inglês explicitamente. */
const emIngles = (texto: string) => detectarVozPassiva(texto, 'en')!

describe('detectarVozPassiva', () => {
  it('detecta particípio regular ("-ed") após "be"', () => {
    const r = emIngles('The book was written by her.')
    expect(r.ocorrencias).toBe(1)
    expect(r.exemplos).toEqual(['was written'])
  })

  it('detecta particípio irregular (fora do padrão "-ed")', () => {
    const r = emIngles('The window was broken yesterday.')
    expect(r.ocorrencias).toBe(1)
    expect(r.exemplos).toEqual(['was broken'])
  })

  it('NÃO confunde voz ativa com "be" + gerúndio/adjetivo comum', () => {
    expect(emIngles('I am writing a letter.').ocorrencias).toBe(0)
    expect(emIngles('She is happy today.').ocorrencias).toBe(0)
  })

  it('aceita negação/advérbio único entre "be" e o particípio', () => {
    expect(emIngles('The report was not finished.').ocorrencias).toBe(1)
    expect(emIngles('The house was quickly built.').ocorrencias).toBe(1)
  })

  it('não conta quando há DOIS advérbios entre "be" e o particípio (fora do padrão)', () => {
    expect(emIngles('It was really quite finished.').ocorrencias).toBe(0)
  })

  it('encadeia formas de "be" consecutivas ("was being")', () => {
    const r = emIngles('The car was being repaired.')
    expect(r.ocorrencias).toBe(1)
    expect(r.exemplos).toEqual(['was being repaired'])
  })

  it('FALSO NEGATIVO conhecido e aceito: adjetivo -ed de alta frequência não conta', () => {
    // "excited" está na lista de exclusão (estado, não voz-passiva-alvo) — ver ADJETIVOS_ED_EXCLUIDOS.
    expect(emIngles('She was excited about the trip.').ocorrencias).toBe(0)
  })

  it('conta múltiplas ocorrências na mesma passagem, sem sobreposição', () => {
    const r = emIngles('The cake was eaten. The song was sung by the choir.')
    expect(r.ocorrencias).toBe(2)
  })

  it('texto vazio não divide por zero', () => {
    const r = emIngles('')
    expect(r.ocorrencias).toBe(0)
    expect(r.palavras).toBe(0)
    expect(r.por100Palavras).toBe(0)
  })

  it('a taxa é por 100 palavras, usando o total de palavras como denominador', () => {
    const texto = 'was written ' + 'word '.repeat(98) // 100 tokens, 1 ocorrência
    const r = emIngles(texto)
    expect(r.palavras).toBe(100)
    expect(r.ocorrencias).toBe(1)
    expect(r.por100Palavras).toBe(1)
  })

  it('é indiferente à caixa', () => {
    expect(emIngles('THE BOOK WAS WRITTEN BY HER.').ocorrencias).toBe(1)
  })

  it('limita os exemplos exibidos a 6, mas conta todas as ocorrências', () => {
    const texto = Array.from({ length: 9 }, () => 'It was built.').join(' ')
    const r = emIngles(texto)
    expect(r.ocorrencias).toBe(9)
    expect(r.exemplos.length).toBe(6)
  })

  /* AUSÊNCIA DECLARADA, e não zero. "Você não usa voz passiva" e "não sei medir voz passiva em
     alemão" são respostas diferentes, e a segunda era exibida como a primeira. */
  it('idioma sem régua devolve null, não zero', () => {
    expect(detectarVozPassiva('Das Buch wurde von ihr geschrieben.', 'de')).toBeNull()
    expect(detectarVozPassiva('The book was written by her.', 'ja')).toBeNull()
    expect(temReguaDeVozPassiva('en')).toBe(true)
    expect(temReguaDeVozPassiva('de')).toBe(false)
  })
})
