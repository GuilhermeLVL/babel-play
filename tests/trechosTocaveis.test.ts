/**
 * OS TRECHOS TOCÁVEIS (Intérprete v3, Fase 1): o texto de uma bolha partido em palavras que se tocam
 * para ouvir. Juntar os trechos devolve o texto original (espaço e pontuação ficam como trechos que
 * não são palavra). Sem segmentador, idiomas sem espaço entre palavras (zh, ja, th) viram UM trecho:
 * o alvo do toque é a frase inteira, e não um caractere solto.
 */
import { describe, expect, it } from 'vitest'

import { trechosTocaveis } from '../src/lib/captura/trechosTocaveis'

const juntar = (t: ReturnType<typeof trechosTocaveis>) => t.map((x) => x.texto).join('')

describe('trechosTocaveis', () => {
  it('separa as palavras e mantém espaço e pontuação', () => {
    const t = trechosTocaveis('Eu quero arroz, por favor.', 'pt-BR')
    expect(juntar(t)).toBe('Eu quero arroz, por favor.')
    expect(t.filter((x) => x.palavra).map((x) => x.texto)).toEqual(['Eu', 'quero', 'arroz', 'por', 'favor'])
    expect(t.filter((x) => !x.palavra).every((x) => !/\p{L}/u.test(x.texto))).toBe(true)
  })

  it('usa o segmentador do aparelho em chinês', () => {
    const t = trechosTocaveis('我想要米饭', 'zh')
    expect(juntar(t)).toBe('我想要米饭')
    expect(t.filter((x) => x.palavra).length).toBeGreaterThan(1)
  })

  it('sem segmentador, chinês, japonês e tailandês viram um trecho só', () => {
    for (const lang of ['zh-CN', 'ja', 'th']) {
      const t = trechosTocaveis('我想要米饭', lang, { segmentador: null })
      expect(t).toEqual([{ texto: '我想要米饭', palavra: false }])
    }
  })

  it('sem segmentador, idioma com espaço cai para a divisão por espaço', () => {
    const t = trechosTocaveis('Olá, mundo!', 'pt', { segmentador: null })
    expect(juntar(t)).toBe('Olá, mundo!')
    expect(t.filter((x) => x.palavra).map((x) => x.texto)).toEqual(['Olá', 'mundo'])
  })

  it('texto vazio não tem trecho', () => {
    expect(trechosTocaveis('', 'pt')).toEqual([])
    expect(trechosTocaveis('   ', 'pt').filter((x) => x.palavra)).toEqual([])
  })
})
