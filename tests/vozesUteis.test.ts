import { describe, expect, it } from 'vitest'

import { ehVozDeEfeito, ehVozRobotica, vozesUteis } from '../src/core/voz/vozesUteis'

const v = (name: string, lang = 'en-US', local = true) => ({ name, lang, local })

describe('ehVozDeEfeito', () => {
  it.each([
    'Wobble',
    'Bells',
    'Whisper',
    'Organ',
    'Zarvox',
    'Bad News',
    'Bahh',
    'Boing',
    'Bubbles',
    'Cellos',
    'Good News',
    'Jester',
    'Superstar',
    'Trinoids',
    'Albert',
  ])('%s é efeito', (nome) => expect(ehVozDeEfeito(nome)).toBe(true))

  it('ignora maiúsculas, acento e o que vem entre parênteses', () => {
    expect(ehVozDeEfeito('WOBBLE')).toBe(true)
    expect(ehVozDeEfeito('Wobble (English (US))')).toBe(true)
    expect(ehVozDeEfeito('  bad news ')).toBe(true)
  })

  it('vozes de verdade não são efeito', () => {
    for (const n of ['Daniel', 'Moira', 'Samantha', 'Alex', 'Daniel (Enhanced)', 'Google US English'])
      expect(ehVozDeEfeito(n)).toBe(false)
  })
})

describe('ehVozRobotica', () => {
  it('Fred, Junior, Kathy e Ralph', () => {
    for (const n of ['Fred', 'junior', 'Kathy', 'Ralph (English (US))']) expect(ehVozRobotica(n)).toBe(true)
  })
  it('as outras não', () => {
    for (const n of ['Samantha', 'Alex', 'Frederica', 'Daniel']) expect(ehVozRobotica(n)).toBe(false)
  })
})

describe('vozesUteis', () => {
  const doSafari = [
    v('Fred'),
    v('Kathy'),
    v('Wobble'),
    v('Bells'),
    v('Whisper'),
    v('Daniel', 'en-GB'),
    v('Moira', 'en-IE'),
    v('Organ'),
    v('Samantha'),
    v('Alex'),
  ]

  it('tira efeito e voz robótica e deixa só as de verdade', () => {
    const nomes = vozesUteis(doSafari, 'en').map((x) => x.name)
    expect(nomes.sort()).toEqual(['Alex', 'Daniel', 'Moira', 'Samantha'])
  })

  it('ordena pela qualidade: natural antes, região exata antes', () => {
    const lista = [v('Samantha'), v('Google US English', 'en-US', false), v('Daniel (Enhanced)', 'en-GB')]
    const nomes = vozesUteis(lista, 'en-GB').map((x) => x.name)
    expect(nomes[0]).toBe('Daniel (Enhanced)')
    expect(nomes).toContain('Google US English')
    expect(nomes.indexOf('Google US English')).toBeLessThan(nomes.indexOf('Samantha'))
  })

  it('nunca esvazia: só há efeito e robótica, devolve as do idioma ordenadas', () => {
    const lista = [v('Zarvox'), v('Fred'), v('Bells')]
    const r = vozesUteis(lista, 'en')
    expect(r.map((x) => x.name).sort()).toEqual(['Bells', 'Fred', 'Zarvox'])
  })

  it('vozes de outro idioma não passam, nem no fallback', () => {
    const lista = [v('Luciana', 'pt-BR'), v('Fred'), v('Wobble')]
    expect(vozesUteis(lista, 'pt').map((x) => x.name)).toEqual(['Luciana'])
    expect(
      vozesUteis(lista, 'en')
        .map((x) => x.name)
        .sort(),
    ).toEqual(['Fred', 'Wobble'])
    expect(vozesUteis(lista, 'fr')).toEqual([])
  })
})
