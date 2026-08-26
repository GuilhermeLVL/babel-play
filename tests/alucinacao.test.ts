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
