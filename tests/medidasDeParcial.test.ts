import { describe, expect, it } from 'vitest'

import {
  atrasoDePalavraMs,
  casarComOFinal,
  erasure,
  fracaoCasada,
  referenciaProporcional,
  tokenizar,
} from '../src/core/legendas/medidasDeParcial'

const ref = (...p: [string, number][]) => p.map(([palavra, fimMs]) => ({ palavra, fimMs }))

describe('tokenizar', () => {
  it('tira acento, caixa e pontuação; vazio e reticências não têm palavra', () => {
    expect(tokenizar('Olá, Mundo!')).toEqual(['ola', 'mundo'])
    expect(tokenizar('…')).toEqual([])
    expect(tokenizar('')).toEqual([])
    expect(tokenizar("don't stop")).toEqual(['don', 't', 'stop'])
  })
  it('idioma sem espaço: um caractere por palavra, mantendo o latim junto', () => {
    expect(tokenizar('我爱你')).toEqual(['我', '爱', '你'])
    expect(tokenizar('日本語 ok')).toEqual(['日', '本', '語', 'ok'])
  })
})

describe('atrasoDePalavraMs', () => {
  const r = ref(['the', 1000], ['cat', 1400], ['sat', 1800])
  it('atraso = primeira aparição − fim da palavra no roteiro', () => {
    const q = [
      { t: 1500, texto: 'the' },
      { t: 2100, texto: 'the cat' },
      { t: 3000, texto: 'the cat sat' },
    ]
    expect(atrasoDePalavraMs(r, q)).toEqual({ atrasos: [500, 700, 1200], semCasamento: 0 })
  })
  it('palavra trocada: conta a primeira aparição da forma que ficou no final', () => {
    const q = [
      { t: 1500, texto: 'the bat' },
      { t: 2000, texto: 'the cat' },
      { t: 2500, texto: 'the cat sat' },
    ]
    // "cat" só apareceu em 2000, não em 1500 (que era "bat").
    expect(atrasoDePalavraMs(r, q).atrasos).toEqual([500, 600, 700])
  })
  it('palavra apagada e que REAPARECE conta a primeira aparição da forma final', () => {
    const q = [
      { t: 1500, texto: 'the cat' },
      { t: 1800, texto: 'the' },
      { t: 2200, texto: 'the cat sat' },
    ]
    expect(atrasoDePalavraMs(r, q).atrasos).toEqual([500, 100, 400])
  })
  it('palavra repetida: a 2ª ocorrência só aparece com a 2ª ocorrência', () => {
    const rr = ref(['no', 500], ['no', 900])
    const q = [
      { t: 1000, texto: 'no' },
      { t: 1600, texto: 'no no' },
    ]
    expect(atrasoDePalavraMs(rr, q).atrasos).toEqual([500, 700])
  })
  it('palavra que não ficou no final fica de fora e é contada', () => {
    const q = [
      { t: 1500, texto: 'the dog sat' },
      { t: 2000, texto: 'the dog sat' },
    ]
    expect(atrasoDePalavraMs(r, q)).toEqual({ atrasos: [500, null, -300], semCasamento: 1 })
  })
  it('sem quadro com texto: tudo sem casamento', () => {
    expect(atrasoDePalavraMs(r, [{ t: 1, texto: '…' }])).toEqual({ atrasos: [null, null, null], semCasamento: 3 })
  })
  it('idioma sem espaço', () => {
    const rr = ref(['我', 300], ['爱', 600], ['你', 900])
    const q = [
      { t: 700, texto: '我爱' },
      { t: 1200, texto: '我爱你' },
    ]
    expect(atrasoDePalavraMs(rr, q).atrasos).toEqual([400, 100, 300])
  })
})

describe('erasure', () => {
  it('crescimento puro não apaga nada', () => {
    expect(
      erasure([
        { t: 1, texto: 'a' },
        { t: 2, texto: 'a b' },
        { t: 3, texto: 'a b c' },
      ]),
    ).toEqual({
      apagadas: 0,
      final: 3,
      ne: 0,
    })
  })
  it('troca soma 1 palavra; apagar soma as que saíram', () => {
    const q = [
      { t: 1, texto: 'a b c' },
      { t: 2, texto: 'a b d' }, // c trocada por d: 1
      { t: 3, texto: 'a' }, // b, d apagadas: 2
      { t: 4, texto: 'a b d e' },
    ]
    expect(erasure(q)).toEqual({ apagadas: 3, final: 4, ne: 0.75 })
  })
  it('quadro vazio ou "…" não conta como saída; quadros iguais não somam', () => {
    const q = [
      { t: 1, texto: 'a b' },
      { t: 2, texto: '…' },
      { t: 3, texto: 'a b' },
      { t: 4, texto: 'a b' },
    ]
    expect(erasure(q)?.apagadas).toBe(0)
  })
  it('sem texto: null', () => {
    expect(erasure([{ t: 1, texto: '' }])).toBeNull()
  })
  it('idioma sem espaço', () => {
    expect(
      erasure([
        { t: 1, texto: '我爱你' },
        { t: 2, texto: '我喜欢你' },
      ]),
    ).toEqual({ apagadas: 2, final: 4, ne: 0.5 })
  })
})

describe('referência e casamento', () => {
  it('proporcional: M palavras traduzidas sobre N de origem', () => {
    const origem = ref(['a', 100], ['b', 200], ['c', 300], ['d', 400])
    expect(referenciaProporcional(['x', 'y'], origem).map((p) => p.fimMs)).toEqual([200, 400])
    expect(referenciaProporcional(['x', 'y', 'z', 'w', 'v'], origem).map((p) => p.fimMs)).toEqual([
      100, 200, 300, 400, 400,
    ])
    expect(referenciaProporcional([], origem)).toEqual([])
  })
  it('casa por Levenshtein e mede a fração', () => {
    expect(casarComOFinal(['a', 'b', 'c'], ['a', 'x', 'c'])).toEqual([0, -1, 2])
    expect(casarComOFinal(['a', 'b', 'c'], ['b', 'c'])).toEqual([-1, 0, 1])
    expect(fracaoCasada(['a', 'b', 'c', 'd'], ['a', 'b', 'c', 'z'])).toBe(0.75)
    expect(fracaoCasada([], ['a'])).toBe(0)
  })
})
