/**
 * PARTIR A TRADUÇÃO EM FRASES para a voz por frase (task 4.1): `Intl.Segmenter` quando existe, regex quando
 * não; fragmentos curtos colam na vizinha e há um teto de frases (cada uma é um pedido de síntese).
 */
import { afterEach, describe, expect, it, vi } from 'vitest'

import { partirEmFrases } from '../src/lib/voz/frasesDaVoz'

afterEach(() => vi.unstubAllGlobals())

describe('partirEmFrases', () => {
  it('uma frase só volta inteira', () => {
    expect(partirEmFrases('Where is the station?', 'en-US')).toEqual(['Where is the station?'])
  })

  it('parte em frases na ordem do texto', () => {
    expect(partirEmFrases('I arrived late today. The train was full! Can you help me find a taxi?', 'en-US')).toEqual([
      'I arrived late today.',
      'The train was full!',
      'Can you help me find a taxi?',
    ])
  })

  it('sem Intl.Segmenter cai na regex e dá o mesmo resultado', () => {
    vi.stubGlobal('Intl', { ...Intl, Segmenter: undefined })
    expect(partirEmFrases('Cheguei tarde hoje. O trem estava lotado! Pode me ajudar a achar um táxi?', 'pt-BR')).toEqual([
      'Cheguei tarde hoje.',
      'O trem estava lotado!',
      'Pode me ajudar a achar um táxi?',
    ])
  })

  it('fragmento curto cola na frase seguinte (um pedido a menos, prosódia melhor)', () => {
    expect(partirEmFrases('Yes. I will meet you at the main station tomorrow morning.', 'en')).toEqual([
      'Yes. I will meet you at the main station tomorrow morning.',
    ])
  })

  it('fragmento curto no fim cola na anterior', () => {
    expect(partirEmFrases('I will meet you at the main station tomorrow morning. Ok.', 'en')).toEqual([
      'I will meet you at the main station tomorrow morning. Ok.',
    ])
  })

  it('texto vazio ou só espaço não gera frase', () => {
    expect(partirEmFrases('   ', 'en')).toEqual([])
  })

  it('passa do teto: o resto vira a última frase, sem perder texto', () => {
    const texto = Array.from({ length: 12 }, (_, i) => `This is the sentence number ${i + 1} of the text.`).join(' ')
    const frases = partirEmFrases(texto, 'en')
    expect(frases).toHaveLength(8)
    expect(frases.join(' ')).toBe(texto)
  })
})
