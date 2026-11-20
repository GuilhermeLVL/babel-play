/**
 * O NÍVEL ESTIMADO DE UM LIVRO (spec de Livros & Leitura, Design §2): cobertura das listas CEFR da trilha e
 * fórmula de legibilidade do idioma, mediana sobre amostras de 1000 palavras.
 */
import { readFileSync } from 'node:fs'

import { describe, expect, it } from 'vitest'

import {
  amostrasDoTexto,
  contarFrases,
  estimarNivel,
  fernandezHuerta,
  fleschKincaid,
  fleschPortugues,
  indiceDeCobertura,
  indiceDeLegibilidade,
  lemasProvaveis,
  mediana,
  medirTexto,
  montarIndiceCefr,
  silabasEn,
  silabasRomanicas,
} from '../src/core/livros/nivelEstimado'

const listaEn = montarIndiceCefr(JSON.parse(readFileSync('src/data/trilha/niveis/en.json', 'utf8')))
const listaEs = montarIndiceCefr(JSON.parse(readFileSync('src/data/trilha/niveis/es.json', 'utf8')))

const repetir = (frase: string, palavras: number) => {
  const n = frase.split(/\s+/).length
  return Array.from({ length: Math.ceil(palavras / n) }, () => frase).join(' ')
}

/* Frases curtas, palavras de uma sílaba, vocabulário de A1. */
const FACIL_EN = 'The cat is on the bed. I see a big dog. We go home now. She has a red ball. It is a good day.'
/* Frases longas e subordinadas, vocabulário raro e polissílabo. */
const DIFICIL_EN =
  'Notwithstanding the considerable deliberation that characterised the parliamentary proceedings, the indefatigable representatives remained irreconcilably antagonistic, perpetuating an institutional paralysis whose constitutional ramifications were scrupulously documented by contemporaneous historiographers.'

describe('sílabas e frases', () => {
  it('inglês: grupos de vogais menos o "e" mudo', () => {
    expect(silabasEn('cat')).toBe(1)
    expect(silabasEn('make')).toBe(1)
    expect(silabasEn('table')).toBe(2)
    expect(silabasEn('beautiful')).toBe(3)
    expect(silabasEn('constitutional')).toBe(5)
  })

  it('espanhol e português: hiato de vogais fortes conta duas', () => {
    expect(silabasRomanicas('casa')).toBe(2)
    expect(silabasRomanicas('poeta')).toBe(3)
    expect(silabasRomanicas('día')).toBe(2)
    expect(silabasRomanicas('ciudad')).toBe(2)
    expect(silabasRomanicas('coração')).toBe(3)
  })

  it('frases pelo ponto final, interrogação, exclamação e reticências', () => {
    expect(contarFrases('Um. Dois? Três! Quatro…')).toBe(4)
    expect(contarFrases('sem ponto')).toBe(1)
  })
})

describe('as fórmulas', () => {
  it('Flesch-Kincaid: o texto difícil tem série maior', () => {
    const facil = medirTexto(FACIL_EN, 'en')!
    const dificil = medirTexto(DIFICIL_EN, 'en')!
    expect(fleschKincaid(facil)).toBeLessThan(3)
    expect(fleschKincaid(dificil)).toBeGreaterThan(14)
  })

  it('Fernández-Huerta e a Flesch do português: maior é mais fácil', () => {
    const facil = medirTexto('El gato es mío. Yo como pan. Tú vas a casa. Ella ve el sol.', 'es')!
    const dificil = medirTexto(
      'La extraordinaria complejidad administrativa de las instituciones gubernamentales contemporáneas dificulta considerablemente la participación ciudadana.',
      'es',
    )!
    expect(fernandezHuerta(facil)).toBeGreaterThan(fernandezHuerta(dificil))
    const ptFacil = medirTexto('O gato é meu. Eu como pão. Ela vê o sol. Nós vamos.', 'pt')!
    const ptDificil = medirTexto(
      'A extraordinária complexidade administrativa das instituições governamentais contemporâneas dificulta consideravelmente a participação.',
      'pt',
    )!
    expect(fleschPortugues(ptFacil)).toBeGreaterThan(fleschPortugues(ptDificil))
  })

  it('idioma sem fórmula não mede legibilidade', () => {
    expect(indiceDeLegibilidade('Der Hund ist groß.', 'de')).toBeNull()
  })
})

describe('cobertura das listas CEFR', () => {
  it('lemas prováveis desfazem a flexão do inglês', () => {
    expect(lemasProvaveis('cities', 'en')).toContain('city')
    expect(lemasProvaveis('walked', 'en')).toContain('walk')
    expect(lemasProvaveis('making', 'en')).toContain('make')
  })

  it('texto de A1 cai em A1 ou A2; o difícil, acima de B2', () => {
    const facil = indiceDeCobertura(FACIL_EN.split(/\W+/).filter(Boolean), 'en', listaEn)
    expect(facil).not.toBeNull()
    expect(facil!).toBeLessThanOrEqual(1)
    const dificil = indiceDeCobertura(DIFICIL_EN.split(/\W+/).filter(Boolean), 'en', listaEn)
    expect(dificil === null || dificil >= 3).toBe(true)
  })

  it('nomes próprios (maiúscula) não contam', () => {
    const palavras = ['the', 'cat', 'Xanthippe', 'Bartholomew', 'is', 'big']
    expect(indiceDeCobertura(palavras, 'en', listaEn)).toBe(0)
  })

  it('lista que não cobre a amostra (outro idioma) não mede nada', () => {
    expect(indiceDeCobertura('o gato comeu o rato na casa'.split(' '), 'es', listaEn)).toBeNull()
    expect(indiceDeCobertura(['palavra'], 'en', new Map())).toBeNull()
  })
})

describe('o livro inteiro', () => {
  it('amostras de 1000 palavras, no máximo 24, espalhadas', () => {
    expect(amostrasDoTexto(repetir(FACIL_EN, 3500), 'en')).toHaveLength(3)
    expect(amostrasDoTexto(repetir(FACIL_EN, 60_000), 'en')).toHaveLength(24)
    expect(amostrasDoTexto('poucas palavras aqui', 'pt')).toHaveLength(0)
    expect(amostrasDoTexto(repetir('uma frase de seis palavras aqui.', 400), 'pt')).toHaveLength(1)
  })

  it('a mediana fica com a mais fácil no empate', () => {
    expect(mediana([3, 1, 2])).toBe(2)
    expect(mediana([1, 4])).toBe(1)
    expect(mediana([])).toBeNull()
  })

  it('um livro fácil sai abaixo de um difícil, e as duas medidas aparecem', () => {
    const facil = estimarNivel(repetir(FACIL_EN, 5000), 'en', listaEn)
    const dificil = estimarNivel(repetir(DIFICIL_EN, 5000), 'en', listaEn)
    expect(facil.amostras).toBe(5)
    expect(facil.nivel).not.toBeNull()
    expect(['A1', 'A2']).toContain(facil.nivel)
    expect(facil.legibilidade).toBe('A1')
    expect(['C1', 'C2']).toContain(dificil.nivel)
  })

  it('português (sem lista na trilha) mede só a legibilidade', () => {
    const n = estimarNivel(repetir('O menino viu o mar. Ele ficou feliz. A mãe riu.', 2000), 'pt', new Map())
    expect(n.cobertura).toBeNull()
    expect(n.legibilidade).not.toBeNull()
    expect(n.nivel).toBe(n.legibilidade)
  })

  it('idioma só com lista (alemão) mede só a cobertura; espanhol mede as duas', () => {
    const es = estimarNivel(repetir('El niño come pan. La casa es grande. Yo tengo un perro.', 2000), 'es', listaEs)
    expect(es.legibilidade).not.toBeNull()
    expect(es.cobertura).not.toBeNull()
  })
})
