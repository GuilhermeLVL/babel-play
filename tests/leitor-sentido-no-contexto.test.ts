/**
 * O SENTIDO DA PALAVRA NO CONTEXTO (`core/leitura/sentidoNoContexto.ts`): a forma consultada no dicionário e a
 * ordem dos sentidos do verbete pela frase. O caso que motivou: "Call me Ishmael." abria "PROPER NOUN: A surname".
 */
import { describe, expect, it } from 'vitest'

import {
  classeDoSentido,
  formaDeConsulta,
  ordenarSentidos,
  pareceNomeProprio,
} from '../src/core/leitura/sentidoNoContexto'

const CALL = [
  { partOfSpeech: 'Proper noun', definition: 'A surname.' },
  { partOfSpeech: 'Noun', definition: 'A telephone conversation.' },
  { partOfSpeech: 'Verb', definition: 'To name or refer to.' },
]
const classes = (s: Array<{ partOfSpeech: string }>) => s.map((x) => classeDoSentido(x.partOfSpeech))

describe('classeDoSentido', () => {
  it('reconhece os cabeçalhos do Wikcionário em inglês, português, espanhol e francês', () => {
    expect(classeDoSentido('Proper noun')).toBe('nome-proprio')
    expect(classeDoSentido('Nome próprio')).toBe('nome-proprio')
    expect(classeDoSentido('Substantivo próprio')).toBe('nome-proprio')
    expect(classeDoSentido('Nombre propio')).toBe('nome-proprio')
    expect(classeDoSentido('Noun')).toBe('substantivo')
    expect(classeDoSentido('Substantivo')).toBe('substantivo')
    expect(classeDoSentido('Verb')).toBe('verbo')
    expect(classeDoSentido('Verbo')).toBe('verbo')
    expect(classeDoSentido('Adjetivo')).toBe('adjetivo')
    expect(classeDoSentido('Etymology 1')).toBe('outra')
  })
})

describe('Call me Ishmael', () => {
  it('no começo da frase, seguido de pronome objeto: verbo primeiro, consulta em minúscula', () => {
    const ctx = { palavra: 'Call', frase: 'Call me Ishmael.', posicao: 0, idioma: 'en' }
    expect(pareceNomeProprio(ctx)).toBe(false)
    expect(formaDeConsulta(ctx)).toBe('call')
    expect(classes(ordenarSentidos(ctx, CALL))).toEqual(['verbo', 'substantivo', 'nome-proprio'])
  })

  it('Ishmael, capitalizado no meio da frase, é nome próprio e a consulta mantém a maiúscula', () => {
    const ctx = { palavra: 'Ishmael', frase: 'Call me Ishmael.', posicao: 2, idioma: 'en' }
    expect(pareceNomeProprio(ctx)).toBe(true)
    expect(formaDeConsulta(ctx)).toBe('Ishmael')
  })
})

describe('ordenarSentidos', () => {
  it('"Mr. Call arrived.": capitalizado no meio da frase, depois de título → nome próprio primeiro', () => {
    const ctx = { palavra: 'Call', frase: 'Mr. Call arrived.', posicao: 1, idioma: 'en' }
    expect(formaDeConsulta(ctx)).toBe('Call')
    expect(classes(ordenarSentidos(ctx, CALL))[0]).toBe('nome-proprio')
  })

  it('"the call was short": depois de artigo → substantivo primeiro, nome próprio por último', () => {
    const ctx = { palavra: 'call', frase: 'the call was short', posicao: 1, idioma: 'en' }
    expect(classes(ordenarSentidos(ctx, CALL))).toEqual(['substantivo', 'verbo', 'nome-proprio'])
  })

  it('"Will you call?": depois de pronome sujeito/modal → verbo primeiro', () => {
    const ctx = { palavra: 'call', frase: 'Will you call?', posicao: 2, idioma: 'en' }
    expect(classes(ordenarSentidos(ctx, CALL))[0]).toBe('verbo')
  })

  it('sem posição, acha a palavra na frase', () => {
    const ctx = { palavra: 'call', frase: 'I will call you tomorrow.', idioma: 'en' }
    expect(classes(ordenarSentidos(ctx, CALL))[0]).toBe('verbo')
  })

  it('em minúscula sem pista nenhuma, mantém a ordem do verbete e só rebaixa o nome próprio', () => {
    const ctx = { palavra: 'call', frase: 'call', posicao: 0, idioma: 'en' }
    expect(classes(ordenarSentidos(ctx, CALL))).toEqual(['substantivo', 'verbo', 'nome-proprio'])
  })

  it('não muda a lista recebida', () => {
    const copia = [...CALL]
    ordenarSentidos({ palavra: 'Call', frase: 'Call me Ishmael.', posicao: 0 }, CALL)
    expect(CALL).toEqual(copia)
  })
})

describe('português', () => {
  const MANGA = [
    { partOfSpeech: 'Verbo', definition: 'zombar' },
    { partOfSpeech: 'Substantivo', definition: 'fruto da mangueira' },
  ]
  const CANTO = [
    { partOfSpeech: 'Substantivo', definition: 'ângulo' },
    { partOfSpeech: 'Verbo', definition: 'primeira pessoa de cantar' },
  ]
  const PORTO = [
    { partOfSpeech: 'Nome próprio', definition: 'cidade de Portugal' },
    { partOfSpeech: 'Substantivo', definition: 'lugar onde os navios atracam' },
  ]

  it('"A manga estava doce.": depois de artigo → substantivo', () => {
    const ctx = { palavra: 'manga', frase: 'A manga estava doce.', posicao: 1, idioma: 'pt' }
    expect(classes(ordenarSentidos(ctx, MANGA))[0]).toBe('substantivo')
  })

  it('"Eu canto todo dia.": depois de pronome sujeito → verbo', () => {
    const ctx = { palavra: 'canto', frase: 'Eu canto todo dia.', posicao: 1, idioma: 'pt' }
    expect(classes(ordenarSentidos(ctx, CANTO))[0]).toBe('verbo')
  })

  it('"O porto estava cheio.": minúscula → substantivo antes do nome próprio', () => {
    const ctx = { palavra: 'porto', frase: 'O porto estava cheio.', posicao: 1, idioma: 'pt' }
    expect(classes(ordenarSentidos(ctx, PORTO))).toEqual(['substantivo', 'nome-proprio'])
  })

  it('"Ele mora no Porto.": maiúscula no meio da frase → nome próprio', () => {
    const ctx = { palavra: 'Porto', frase: 'Ele mora no Porto.', posicao: 3, idioma: 'pt' }
    expect(classes(ordenarSentidos(ctx, PORTO))[0]).toBe('nome-proprio')
  })

  it('"Porto é bonito." no começo da frase: palavra comum também, consulta em minúscula', () => {
    const ctx = { palavra: 'Porto', frase: 'Porto é bonito.', posicao: 0, idioma: 'pt' }
    expect(formaDeConsulta(ctx)).toBe('porto')
  })
})

describe('alemão', () => {
  it('substantivo alemão capitalizado no meio da frase não vira nome próprio nem perde a maiúscula', () => {
    const ctx = { palavra: 'Haus', frase: 'Das Haus ist groß.', posicao: 1, idioma: 'de' }
    expect(pareceNomeProprio(ctx)).toBe(false)
    expect(formaDeConsulta(ctx)).toBe('Haus')
  })
})
