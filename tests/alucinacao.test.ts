import { describe, expect,it } from 'vitest'

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

describe('créditos e marcadores que o Whisper inventa no silêncio (lista ampliada)', () => {
  it('descarta créditos de legenda, pedidos de inscrição e marcadores de música, em pt/en/es/fr/de', () => {
    for (const t of [
      'Legendas pela comunidade Amara.org',
      'Legendado por Fulano',
      'Transcrição por Beltrano',
      'Inscreva-se no canal!',
      'Please subscribe.',
      'Thanks for watching.',
      'Obrigado por assistir!',
      'Subtitles by the Amara.org community',
      'Sous-titres réalisés par la communauté d’Amara.org',
      'Untertitel der Amara.org-Community',
      '♪',
      '♪♪♪',
      '[Música]',
      '(música)',
      '[Music]',
      '(MUSIC)',
      '…',
    ])
      expect(filtrarAlucinacao(t, 1.5), t).toBe('')
  })

  it('crédito DENTRO de fala real não derruba a fala (só a saída inteira igual ao crédito)', () => {
    const t = 'Hoje eu vou mostrar como se inscrever no curso de música da escola.'
    expect(filtrarAlucinacao(t, 4, 'pt')).toBe(t)
  })
})

describe('cortesias curtas: só são suspeitas quando o áudio é longo demais para elas', () => {
  it('um "Obrigado." dito de verdade (áudio curto) passa', () => {
    expect(filtrarAlucinacao('Obrigado.', 1.2, 'pt')).toBe('Obrigado.')
    expect(filtrarAlucinacao('Obrigada!', 2, 'pt')).toBe('Obrigada!')
    expect(filtrarAlucinacao('Thank you.', 1, 'en')).toBe('Thank you.')
    expect(filtrarAlucinacao('Tchau, tchau.', 1.5, 'pt')).toBe('Tchau, tchau.')
    expect(filtrarAlucinacao('E aí?', 0.8, 'pt')).toBe('E aí?')
  })

  it('o mesmo "obrigado" saindo de mais de 3 s de áudio é a alucinação clássica, e sai', () => {
    for (const t of ['Obrigado.', 'obrigada', 'Thank you.', 'Thanks!', 'Tchau, tchau.', 'E aí?', 'Gracias.'])
      expect(filtrarAlucinacao(t, 8, 'pt'), t).toBe('')
  })
})

describe('de-looping: n-grama repetido 3+ vezes seguidas vira uma ocorrência', () => {
  it('colapsa a frase em loop e mantém o que vem antes e depois', () => {
    expect(
      filtrarAlucinacao('eu acho que sim e depois a gente vai a gente vai a gente vai a gente vai embora', 6, 'pt'),
    ).toBe('eu acho que sim e depois a gente vai embora')
  })

  it('o loop sem fim de fim de trecho é salvo, não descartado inteiro', () => {
    const loop = Array.from({ length: 12 }, () => "I'm going to").join(' ')
    expect(filtrarAlucinacao(`So today ${loop}`, 5, 'en')).toBe("So today I'm going to")
  })

  it('compara sem caixa e sem pontuação', () => {
    expect(filtrarAlucinacao('Vamos lá. Vamos lá, vamos lá! Vamos lá.', 3, 'pt')).toBe('Vamos lá.')
  })

  it('duas repetições são fala normal e ficam', () => {
    const t = 'a gente vai a gente vai conseguir'
    expect(filtrarAlucinacao(t, 3, 'pt')).toBe(t)
  })

  it('palavra única repetida três vezes é ênfase ("não, não, não") e fica', () => {
    expect(filtrarAlucinacao('Não, não, não.', 2, 'pt')).toBe('Não, não, não.')
  })
})
