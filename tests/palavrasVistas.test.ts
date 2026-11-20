/**
 * PALAVRAS VISTAS (núcleo): a regra que corta a fala em chaves para o índice do servidor e para a
 * legenda. As duas pontas usam esta mesma função, então o que ela deixa de fora nunca vira etiqueta.
 */
import { describe, expect, it } from 'vitest'

import { chaveDedup } from '../src/core/texto/palavra'
import {
  chaveContavel,
  chavesDoTexto,
  contarChaves,
  diferencaDeChaves,
  fraseComAChave,
} from '../src/core/texto/palavrasVistas'

describe('chavesDoTexto', () => {
  it('tira acento, caixa e pontuação, e a chave casa com o norm_key do cartão', () => {
    expect(chavesDoTexto('Água! Café, CAFÉ.', 'pt-BR')).toEqual(['agua', 'cafe', 'cafe'])
    expect(`pt|${chavesDoTexto('Água', 'pt-BR')[0]}`).toBe(chaveDedup('Água', 'pt-BR'))
  })

  it('deixa de fora as palavras funcionais do idioma da fala', () => {
    expect(chavesDoTexto('The dog is in the kitchen', 'en')).toEqual(['dog', 'kitchen'])
    expect(chavesDoTexto('O cachorro não está na cozinha', 'pt')).toEqual(['cachorro', 'cozinha'])
  })

  it('deixa de fora número, chave com algarismo e chave de uma letra', () => {
    expect(chavesDoTexto('I have 3 cats and mp3 x files', 'en')).toEqual(['cats', 'files'])
  })

  it('um ideograma basta nos idiomas escritos sem espaço', () => {
    expect(chaveContavel('猫', 'ja')).toBe(true)
    expect(chaveContavel('x', 'en')).toBe(false)
  })

  it('sem idioma não conta nada', () => {
    expect(chavesDoTexto('dog kitchen', '')).toEqual([])
    expect(chavesDoTexto('dog kitchen', null)).toEqual([])
  })

  it('clítico do português vira o verbo (a mesma segmentação da legenda)', () => {
    expect(chavesDoTexto('Vou fazê-lo amanhã', 'pt')).toContain('fazer')
  })
})

describe('contarChaves e diferencaDeChaves', () => {
  const falas = [
    { texto: 'dog dog cat', idioma: 'en-US', idx: 3 },
    { texto: 'dog bird', idioma: 'en', idx: 1 },
    { texto: 'perro', idioma: 'es', idx: 2 },
  ]

  it('conta por idioma base e guarda o menor idx', () => {
    const m = contarChaves(falas)
    expect(m.get('en|dog')).toEqual({ lang: 'en', chave: 'dog', vezes: 3, idx: 1 })
    expect(m.get('en|cat')).toEqual({ lang: 'en', chave: 'cat', vezes: 1, idx: 3 })
    expect(m.get('es|perro')).toEqual({ lang: 'es', chave: 'perro', vezes: 1, idx: 2 })
  })

  it('a diferença traz só o que mudou, com delta negativo para o que saiu', () => {
    const saem = contarChaves([{ texto: 'dog dog cat', idioma: 'en', idx: 0 }])
    const entram = contarChaves([{ texto: 'dog dog bird', idioma: 'en', idx: 0 }])
    const d = diferencaDeChaves(saem, entram)
    expect(d).toHaveLength(2)
    expect(d).toContainEqual({ lang: 'en', chave: 'bird', vezes: 1, idx: 0 })
    expect(d).toContainEqual({ lang: 'en', chave: 'cat', vezes: -1, idx: null })
  })

  it('repetir o mesmo lote não muda nada', () => {
    const m = contarChaves(falas)
    expect(diferencaDeChaves(m, contarChaves(falas))).toEqual([])
  })
})

describe('fraseComAChave', () => {
  it('devolve a frase que contém a chave, ou null se a fala não a contém mais', () => {
    expect(fraseComAChave('I saw a dog. The cat ran away.', 'cat', 'en')).toBe('The cat ran away.')
    expect(fraseComAChave('I saw a dog.', 'cat', 'en')).toBeNull()
  })
})
