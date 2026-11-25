/**
 * A CHAVE DE DUPLICATA POR IDIOMA (openspec `modelo-do-aluno-e-dados`, 5.1): a v2 mantém as marcas que
 * distinguem palavras e é sempre um REFINAMENTO da v1 (a reescrita de `norm_key` nunca junta cartões).
 */
import { describe, expect, it } from 'vitest'

import { chaveDaPalavra, chaveDaPalavraV2, chaveDedup } from '../src/core/texto/palavra'

const v2 = (p: string, l: string) => chaveDedup(p, l, 2)

describe('chaveDedup v2: o que passa a ser palavra diferente', () => {
  it.each([
    ['es', 'año', 'ano'],
    ['de', 'schön', 'schon'],
    ['pt', 'avó', 'avô'],
    ['pt', 'mão', 'mao'],
    ['pt', 'caça', 'caca'],
    ['fr', 'où', 'ou'],
    ['fr', 'sûr', 'sur'],
    ['ja', 'がっこう', 'かっこう'],
    ['ru', 'й', 'и'],
    ['ru', 'ёж', 'еж'],
    ['hi', 'कि', 'क'],
    ['th', 'ไก่', 'ไก'],
  ])('%s: %s e %s ficam distintas', (lang, a, b) => {
    expect(v2(a, lang)).not.toBe(v2(b, lang))
    // e a v1 de hoje as juntava (é o defeito)
    expect(chaveDedup(a, lang)).toBe(chaveDedup(b, lang))
  })

  it('mantém iguais o que é só acento tônico ou caixa', () => {
    expect(v2('Água', 'pt-BR')).toBe(v2('agua', 'pt'))
    expect(v2('está', 'es')).toBe(v2('esta', 'es'))
    expect(v2('été', 'fr')).toBe(v2('ete', 'fr'))
    expect(v2('Café!', 'en-US')).toBe(v2('cafe', 'en'))
    expect(v2('SCHÖN', 'de')).toBe(v2('schön', 'de'))
  })

  it('o formato é `idioma|palavra` e o padrão (versão 1) não mudou', () => {
    expect(chaveDedup('Água!', 'pt-BR')).toBe('pt|agua')
    expect(chaveDedup('año', 'es')).toBe('es|ano')
    expect(v2('año', 'es-MX')).toBe('es|año')
  })

  it('vogais do árabe e do hebraico não distinguem (a escrita comum não as traz)', () => {
    expect(chaveDaPalavraV2('كَتَبَ', 'ar')).toBe(chaveDaPalavraV2('كتب', 'ar'))
  })

  it('entradas vazias', () => {
    expect(chaveDaPalavraV2('', 'pt')).toBe('')
    expect(chaveDaPalavraV2(null, 'pt')).toBe('')
  })
})

describe('v2 refina a v1 (a reescrita nunca junta cartões)', () => {
  const palavras = [
    'año',
    'ano',
    'schön',
    'schon',
    'avó',
    'avô',
    'avo',
    'Água',
    'agua',
    'café',
    'cafe',
    'mão',
    'mao',
    'são',
    'sao',
    'がっこう',
    'かっこう',
    'ゔ',
    'й',
    'и',
    'ёлка',
    'елка',
    'हिंदी',
    'ไก่',
    'كَتَبَ',
    'كتب',
    '한국어',
    'łatwy',
    'ça',
    'ca',
    'où',
    'ou',
    'über',
    'uber',
    'ß',
    'straße',
    'naïve',
    'naive',
    'ǆ',
    'é',
    'é',
    'ẫ',
  ]
  const langs = ['pt', 'es', 'de', 'fr', 'en', 'ja', 'ru', 'hi', 'th', 'ar', 'ko', 'pl']
  it('v2(x) = v2(y) implica v1(x) = v1(y), em todos os idiomas', () => {
    for (const l of langs) {
      for (const x of palavras) {
        for (const y of palavras) {
          if (chaveDaPalavraV2(x, l) === chaveDaPalavraV2(y, l)) {
            expect(chaveDaPalavra(x), `${l}: ${x} x ${y}`).toBe(chaveDaPalavra(y))
          }
        }
      }
    }
  })

  it('NFC e NFD da mesma palavra dão a mesma chave v2', () => {
    for (const l of langs) {
      for (const x of palavras) {
        expect(chaveDaPalavraV2(x.normalize('NFD'), l)).toBe(chaveDaPalavraV2(x.normalize('NFC'), l))
      }
    }
  })
})
