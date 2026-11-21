import { describe, expect, it } from 'vitest'

import {
  compararFrase,
  contarUnidades,
  dicaDaFrase,
  fraseDeTamanhoBom,
  frasesElegiveis,
} from '../src/core/minigames/frasesCorrigidas'

const status = (r: ReturnType<typeof compararFrase>) => r.tokens.map((t) => t.status)

describe('compararFrase', () => {
  it('frase igual: tudo certo, nota 100', () => {
    const r = compararFrase('I like green apples', 'I like green apples', 'en')
    expect(r.igual).toBe(true)
    expect(r.nota).toBe(100)
    expect(status(r)).toEqual(['certa', 'certa', 'certa', 'certa'])
  })

  it('caixa e pontuação não contam', () => {
    const r = compararFrase('Hello, world! How are you?', 'hello world how are you', 'en')
    expect(r.igual).toBe(true)
    expect(r.nota).toBe(100)
  })

  it('com pontuação ligada, a pontuação colada à palavra conta', () => {
    const r = compararFrase('Hello, world', 'Hello world', 'en', { ignorarPontuacao: false })
    expect(r.igual).toBe(false)
    expect(status(r)).toEqual(['trocada', 'certa'])
  })

  it('acento é opcional por padrão e exigido quando configurado', () => {
    const tolerante = compararFrase('Ela está na avó', 'ela esta na avo', 'pt')
    expect(tolerante.igual).toBe(true)
    const estrito = compararFrase('Ela está na avó', 'ela esta na avo', 'pt', { ignorarAcentos: false })
    expect(estrito.igual).toBe(false)
    expect(estrito.trocadas).toBe(2)
  })

  it('palavra trocada fica no lugar e com a escrita da pessoa', () => {
    const r = compararFrase('the cat sleeps here', 'the dog sleeps here', 'en')
    expect(status(r)).toEqual(['certa', 'trocada', 'certa', 'certa'])
    expect(r.tokens[1]).toMatchObject({ alvo: 'cat', resposta: 'dog' })
    expect(r.nota).toBe(75)
    expect(r.igual).toBe(false)
  })

  it('palavra faltando', () => {
    const r = compararFrase('the cat sleeps here', 'the cat here', 'en')
    expect(r.faltando).toBe(1)
    expect(r.tokens.find((t) => t.status === 'faltando')?.alvo).toBe('sleeps')
    expect(r.nota).toBe(75)
  })

  it('palavra sobrando', () => {
    const r = compararFrase('the cat sleeps', 'the big cat sleeps', 'en')
    expect(r.sobrando).toBe(1)
    expect(r.tokens.find((t) => t.status === 'sobrando')?.resposta).toBe('big')
    expect(r.nota).toBe(75)
  })

  it('erro de uma letra vale meio ponto', () => {
    const r = compararFrase('the cat sleeps', 'the cat sleaps', 'en')
    expect(status(r)).toEqual(['certa', 'certa', 'trocada'])
    expect(r.nota).toBe(83)
  })

  it('resposta vazia: tudo faltando, nota 0', () => {
    const r = compararFrase('the cat sleeps', '   ', 'en')
    expect(r.nota).toBe(0)
    expect(r.faltando).toBe(3)
    expect(r.igual).toBe(false)
  })

  it('japonês: compara por caractere, sem espaço nem pontuação', () => {
    const certa = compararFrase('私は毎日、水を飲みます。', '私は 毎日 水を飲みます', 'ja')
    expect(certa.igual).toBe(true)
    const errada = compararFrase('私は毎日水を飲みます', '私は毎日茶を飲みます', 'ja')
    expect(errada.trocadas).toBe(1)
    expect(errada.tokens.find((t) => t.status === 'trocada')).toMatchObject({ alvo: '水', resposta: '茶' })
    expect(errada.nota).toBeLessThan(100)
  })

  it('japonês: o dakuten faz parte da letra, mesmo com acento ignorado', () => {
    const r = compararFrase('食べる', '食へる', 'ja')
    expect(r.igual).toBe(false)
  })
})

describe('frases elegíveis', () => {
  const f = (id: string, text: string, translation = 'tradução', lang = 'en') => ({ id, text, translation, lang })

  it('respeita o tamanho mínimo e máximo de palavras', () => {
    expect(fraseDeTamanhoBom('too short here', 'en')).toBe(false)
    expect(fraseDeTamanhoBom('this one is long enough', 'en')).toBe(true)
    expect(fraseDeTamanhoBom(Array(15).fill('word').join(' '), 'en')).toBe(false)
  })

  it('idiomas sem espaço contam caracteres', () => {
    expect(contarUnidades('私は毎日、水を飲みます。', 'ja')).toBe(10)
    expect(fraseDeTamanhoBom('私は毎日水を飲みます', 'ja')).toBe(true)
    expect(fraseDeTamanhoBom('はい', 'ja')).toBe(false)
  })

  it('retradução exige tradução diferente do texto; ditado não', () => {
    const falas = [
      f('a', 'this sentence has a translation'),
      f('b', 'this sentence has no translation', ''),
      f('c', 'same text as its translation', 'same text as its translation'),
    ]
    expect(frasesElegiveis(falas, 'retraducao').map((x) => x.id)).toEqual(['a'])
    expect(frasesElegiveis(falas, 'ditado').map((x) => x.id)).toEqual(['a', 'b', 'c'])
  })

  it('tira duplicatas, mantém a ordem e corta na quantidade', () => {
    const falas = [
      f('1', 'one two three four'),
      f('2', 'One two three four!'),
      f('3', 'five six seven eight'),
      f('4', 'nine ten eleven twelve'),
    ]
    expect(frasesElegiveis(falas, 'ditado', { quantidade: 2 }).map((x) => x.id)).toEqual(['1', '3'])
  })
})

describe('dicaDaFrase', () => {
  it('revela a primeira letra de cada palavra', () => {
    expect(dicaDaFrase('The cat, sleeps here.', 'en')).toBe('T__ c__ s_____ h___')
  })
  it('idioma sem espaço: só o primeiro caractere', () => {
    expect(dicaDaFrase('私は水', 'ja')).toBe('私__')
  })
})
