/**
 * A COBERTURA DE UM TEXTO (spec `leitura-ativa-acervo`): a fração das palavras do texto que a pessoa já sabe —
 * `dominada`/`aprendendo` no caderno, palavra funcional ou nome próprio —, com lema ("apples" conta como "apple"),
 * e o rótulo honesto: sem número abaixo de 3 sessões ou sem conta.
 */
import { describe, expect, it } from 'vitest'

import { coberturaDoTexto, rotuloDaCobertura, sugestoesDoCatalogo } from '../src/core/leitura/coberturaDoTexto'
import type { FichaDeTexto } from '../src/core/leitura/fichaDeTexto'

describe('coberturaDoTexto', () => {
  it('40 palavras, 30 funcionais e 8 conhecidas no caderno = 95%', () => {
    // 30 funcionais (the, a, and, is, it, of, to, in, on, at… repetidas) + 8 do caderno + 2 desconhecidas
    const funcionais = 'the a and is it of to in on at '.repeat(3).trim().split(' ')
    const conhecidas = ['cat', 'dog', 'house', 'tree', 'red', 'blue', 'run', 'jump']
    const texto = [...funcionais, ...conhecidas, 'zebra', 'quokka'].join(' ') + '.'
    const r = coberturaDoTexto(texto, 'en', new Set(conhecidas))
    expect(r.total).toBe(40)
    expect(r.conhecidas).toBe(38)
    expect(r.porcentagem).toBe(95)
    expect(r.desconhecidas).toEqual(['zebra', 'quokka'])
  })

  it('formas flexionadas contam como a palavra: "apple" dominada, "apples" no texto', () => {
    const r = coberturaDoTexto('Apples.', 'en', new Set(['apple']))
    expect(r.conhecidas).toBe(1)
    expect(r.desconhecidas).toEqual([])
  })

  it('nome próprio conta como conhecido, também no começo da frase', () => {
    const r = coberturaDoTexto('Lia likes milk. Her friend is Lia.', 'en', new Set(['like', 'milk', 'friend']))
    expect(r.desconhecidas).toEqual([])
    expect(r.porcentagem).toBe(100)
  })

  it('número e pontuação solta não entram na conta', () => {
    const r = coberturaDoTexto('It is 7 o’clock — late!', 'en', new Set(['late', 'oclock']))
    expect(r.total).toBe(4)
  })

  it('desconhecidas saem uma vez, na ordem do texto', () => {
    const r = coberturaDoTexto('The zebra sees a zebra and a quokka.', 'en', new Set(['see']))
    expect(r.desconhecidas).toEqual(['zebra', 'quokka'])
  })
})

describe('rotuloDaCobertura', () => {
  it('≥ 98 tranquila, 95–97 bom desafio, < 95 puxado', () => {
    expect(rotuloDaCobertura({ porcentagem: 98, sessoes: 5, temConta: true })?.rotulo).toBe('tranquila')
    expect(rotuloDaCobertura({ porcentagem: 96, sessoes: 5, temConta: true })?.rotulo).toBe('desafio')
    expect(rotuloDaCobertura({ porcentagem: 95, sessoes: 5, temConta: true })?.rotulo).toBe('desafio')
    expect(rotuloDaCobertura({ porcentagem: 94, sessoes: 5, temConta: true })?.rotulo).toBe('puxado')
  })

  it('conta nova (menos de 3 sessões) ou sem conta: nenhum número', () => {
    expect(rotuloDaCobertura({ porcentagem: 96, sessoes: 1, temConta: true })).toBeNull()
    expect(rotuloDaCobertura({ porcentagem: 96, sessoes: 9, temConta: false })).toBeNull()
  })
})

const ficha = (id: string, nivel: FichaDeTexto['nivel']) => ({ id, nivel }) as FichaDeTexto

describe('sugestoesDoCatalogo', () => {
  const fichas = [
    ficha('a1-1', 'A1'),
    ficha('a1-2', 'A1'),
    ficha('a1-3', 'A1'),
    ficha('a1-4', 'A1'),
    ficha('a2-1', 'A2'),
    ficha('a2-2', 'A2'),
  ]

  it('sem histórico: "Comece por aqui" com 3 de A1 não lidos', () => {
    const s = sugestoesDoCatalogo(fichas, null, new Set(['a1-1']))
    expect(s.titulo).toBe('comece')
    expect(s.ids).toEqual(['a1-2', 'a1-3', 'a1-4'])
  })

  it('com histórico: até 3 não lidos na faixa 95–97', () => {
    const cob = new Map([
      ['a1-1', 99],
      ['a1-2', 96],
      ['a1-3', 97],
      ['a1-4', 95],
      ['a2-1', 96],
      ['a2-2', 80],
    ])
    const s = sugestoesDoCatalogo(fichas, cob, new Set(['a1-2']))
    expect(s.titulo).toBe('paraVoce')
    expect(s.ids).toEqual(['a1-3', 'a2-1', 'a1-4'])
  })

  it('nenhum na faixa: os 3 não lidos de maior cobertura abaixo de 98', () => {
    const cob = new Map([
      ['a1-1', 99],
      ['a1-2', 90],
      ['a1-3', 70],
      ['a1-4', 85],
      ['a2-1', 60],
      ['a2-2', 99],
    ])
    const s = sugestoesDoCatalogo(fichas, cob, new Set())
    expect(s.ids).toEqual(['a1-2', 'a1-4', 'a1-3'])
  })
})
