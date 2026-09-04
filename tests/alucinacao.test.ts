import { describe, it, expect } from 'vitest'
import { filtrarAlucinacao } from '../src/gateway/alucinacao'

describe('filtro de alucinação do Whisper', () => {
  it('descarta os créditos e agradecimentos clássicos do silêncio', () => {
    for (const t of ['Legendas pela comunidade Amara.org', 'Thank you for watching!', 'Obrigado por assistir.', 'Subtitles by the Amara.org community', '...', 'you'])
      expect(filtrarAlucinacao(t, 2)).toBe('')
  })
  it('descarta texto rápido demais para a duração e o token repetido', () => {
    expect(filtrarAlucinacao('one two three four five six seven eight nine ten', 1)).toBe('')
    expect(filtrarAlucinacao('no no no no no', 3)).toBe('')
  })
  it('mantém fala legítima, inclusive curta', () => {
    expect(filtrarAlucinacao('Thank you so much for your help today.', 3)).toBe('Thank you so much for your help today.')
    expect(filtrarAlucinacao('Vamos começar a reunião.', 2)).toBe('Vamos começar a reunião.')
    expect(filtrarAlucinacao('Sí.', 1)).toBe('Sí.')
  })
})

describe('filtro por idioma da dica', () => {
  it('"Ah." e "Hum." em português são respostas legítimas, não silêncio', () => {
    expect(filtrarAlucinacao('Ah.', 1, 'pt')).toBe('Ah.')
    expect(filtrarAlucinacao('ah', 1, 'en')).toBe('')
  })
  it('português falado rápido (7 palavras/s) passa; em inglês o teto segue 6/s', () => {
    const sete = 'eu acho que a gente vai lá'
    expect(filtrarAlucinacao(sete, 1, 'pt')).toBe(sete)
    expect(filtrarAlucinacao('I think that we will go there', 1, 'en')).toBe('')
  })
})
