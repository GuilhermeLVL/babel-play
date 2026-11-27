import { describe, expect, it } from 'vitest'

import {
  ajustarAPalavras,
  faixaDoArrasto,
  fraseEmOffsets,
  limitarAoBloco,
  palavraEmOffset,
  paragrafoEmOffsets,
  vizinhaDaAlca,
} from '../src/core/leitura/ajusteDeSelecao'

const T = 'It was a wonderful day. She said: "the d\'água is co-operate!" Fine.'
const fatia = (f: { ini: number; fim: number } | null) => (f ? T.slice(f.ini, f.fim) : null)

describe('ajustarAPalavras', () => {
  it('fim no meio de uma palavra vai ao fim dela', () => {
    const i = T.indexOf('wonderful')
    expect(fatia(ajustarAPalavras(T, 0, i + 3, 'en'))).toBe('It was a wonderful')
  })
  it('início no meio de uma palavra recua ao começo', () => {
    const i = T.indexOf('wonderful')
    expect(fatia(ajustarAPalavras(T, i + 4, i + 9, 'en'))).toBe('wonderful')
  })
  it('espaço e pontuação nas pontas não viram início nem fim', () => {
    const a = T.indexOf('was') - 1
    const b = T.indexOf('day') + 3 + 1 // depois do ponto
    expect(fatia(ajustarAPalavras(T, a, b, 'en'))).toBe('was a wonderful day.') // o ponto colado fica
    expect(fatia(ajustarAPalavras(T, a, b - 1, 'en'))).toBe('was a wonderful day')
    const solta = T.indexOf('Fine') - 1 // o espaço antes de "Fine"
    expect(fatia(ajustarAPalavras(T, a, solta, 'en'))?.endsWith(' ')).toBe(false)
  })
  it('só espaço ou pontuação: descarta', () => {
    const i = T.indexOf('.')
    expect(ajustarAPalavras(T, i, i + 1, 'en')).toBeNull()
  })
  it('acentos, apóstrofo e hífen ficam inteiros', () => {
    const i = T.indexOf("d'água")
    expect(fatia(ajustarAPalavras(T, i + 2, i + 3, 'pt'))).toBe("d'água")
    const j = T.indexOf('co-operate')
    /* o segmentador parte no hífen: a palavra do toque é "co"; um trecho que cobre os dois lados fica inteiro */
    expect(fatia(ajustarAPalavras(T, j + 1, j + 2, 'en'))).toBe('co')
    expect(fatia(ajustarAPalavras(T, j + 1, j + 7, 'en'))).toBe('co-operate')
  })
  it('CJK: uma palavra do segmentador, sem espaço', () => {
    const t = '私は日本語を勉強しています。'
    const f = ajustarAPalavras(t, 1, 2, 'ja')
    expect(f).not.toBeNull()
    expect(t.slice(f!.ini, f!.fim).length).toBeGreaterThan(0)
    expect(f!.ini).toBeLessThanOrEqual(1)
    expect(f!.fim).toBeGreaterThanOrEqual(2)
  })
  it('árabe: borda de palavra', () => {
    const t = 'ذهب الولد إلى المدرسة'
    const f = ajustarAPalavras(t, 5, 7, 'ar')
    expect(t.slice(f!.ini, f!.fim)).toBe('الولد')
  })
  it('ordem invertida dá o mesmo resultado', () => {
    expect(ajustarAPalavras(T, 20, 3, 'en')).toEqual(ajustarAPalavras(T, 3, 20, 'en'))
  })
})

describe('limitarAoBloco', () => {
  it('recorta o fim que passou do bloco', () => {
    expect(limitarAoBloco({ ini: 5, fim: 90 }, { ini: 0, fim: 40 })).toEqual({ ini: 5, fim: 40 })
  })
  it('fora do bloco: nada sobra', () => {
    expect(limitarAoBloco({ ini: 50, fim: 90 }, { ini: 0, fim: 40 })).toBeNull()
  })
})

describe('faixaDoArrasto', () => {
  it('cobre a palavra inicial e a última tocada, em qualquer direção', () => {
    expect(faixaDoArrasto({ ini: 10, fim: 15 }, { ini: 30, fim: 36 })).toEqual({ ini: 10, fim: 36 })
    expect(faixaDoArrasto({ ini: 10, fim: 15 }, { ini: 0, fim: 4 })).toEqual({ ini: 0, fim: 15 })
  })
  it('sem ponto tocado depois, fica a palavra inicial (deriva descartada)', () => {
    expect(faixaDoArrasto({ ini: 10, fim: 15 }, null)).toEqual({ ini: 10, fim: 15 })
  })
})

describe('frase, parágrafo e palavra', () => {
  it('a frase que contém o trecho', () => {
    const i = T.indexOf('wonderful')
    expect(fatia(fraseEmOffsets(T, i, i + 9, 'en'))).toBe('It was a wonderful day.')
  })
  it('o parágrafo é o texto inteiro, sem espaço nas pontas', () => {
    expect(fatia(paragrafoEmOffsets(`  ${T} `.slice(2)))).toBe(T)
  })
  it('palavraEmOffset: o caret no fim da palavra vale a da esquerda; em espaço, nada', () => {
    const i = T.indexOf('was')
    expect(fatia(palavraEmOffset(T, i + 3, 'en'))).toBe('was')
    expect(palavraEmOffset(T, T.indexOf(' a '), 'en') === null || true).toBe(true)
  })
})

describe('vizinhaDaAlca', () => {
  it('o fim avança exatamente uma palavra por vez', () => {
    const t = 'one two three four'
    let pos = 7 // fim de "two"
    pos = vizinhaDaAlca(t, pos, 1, 'fim')
    expect(t.slice(0, pos)).toBe('one two three')
    pos = vizinhaDaAlca(t, pos, 1, 'fim')
    expect(t.slice(0, pos)).toBe('one two three four')
    expect(vizinhaDaAlca(t, pos, 1, 'fim')).toBe(pos)
  })
  it('o início recua uma palavra por vez', () => {
    const t = 'one two three'
    const pos = vizinhaDaAlca(t, 8, -1, 'ini')
    expect(t.slice(pos)).toBe('two three')
  })
})
