import { describe, expect, it } from 'vitest'

import { ehVozAceita } from '../src/core/voz/melhorVoz'
import { vozesUteis } from '../src/core/voz/vozesUteis'

const v = (name: string, lang = 'en-US', local = true) => ({ name, lang, local })

describe('vozes de efeito e robóticas são recusadas', () => {
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
    'Fred',
    'Junior',
    'Kathy',
    'Ralph',
  ])('%s é recusada', (nome) => expect(ehVozAceita({ name: nome })).toBe(false))

  it('ignora maiúsculas, acento e o que vem entre parênteses', () => {
    expect(ehVozAceita({ name: 'WOBBLE' })).toBe(false)
    expect(ehVozAceita({ name: 'Wobble (English (US))' })).toBe(false)
    expect(ehVozAceita({ name: '  bad news ' })).toBe(false)
    expect(ehVozAceita({ name: 'Ralph (English (US))' })).toBe(false)
  })

  it('vozes de verdade são aceitas', () => {
    for (const n of ['Daniel', 'Moira', 'Samantha', 'Alex', 'Daniel (Enhanced)', 'Google US English'])
      expect(ehVozAceita({ name: n })).toBe(true)
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

  it('só há efeito e robótica: lista vazia (voz de robô não é último recurso)', () => {
    expect(vozesUteis([v('Zarvox'), v('Fred'), v('Bells')], 'en')).toEqual([])
  })

  it('vozes de outro idioma não passam', () => {
    const lista = [v('Luciana', 'pt-BR'), v('Fred'), v('Wobble')]
    expect(vozesUteis(lista, 'pt').map((x) => x.name)).toEqual(['Luciana'])
    expect(vozesUteis(lista, 'en')).toEqual([])
    expect(vozesUteis(lista, 'fr')).toEqual([])
  })
})
