/**
 * PALAVRAS PARA PRATICAR (spec `leitura-ativa-perguntas-e-pratica`): puladas → tocadas → palavras-alvo
 * desconhecidas, sem repetir (por lema), até 5; a que já está no caderno vem desmarcada.
 */
import { describe, expect, it } from 'vitest'

import { palavrasParaPraticar } from '../src/core/leitura/palavrasParaPraticar'

describe('palavrasParaPraticar', () => {
  it('a ordem é pulada, tocada, alvo desconhecida; todas marcadas', () => {
    const r = palavrasParaPraticar({
      puladas: ['six'],
      tocadas: ['borrow'],
      alvoDesconhecidas: ['morning', 'friend'],
      noCaderno: () => false,
      lang: 'en',
    })
    expect(r.map((x) => [x.palavra, x.motivo, x.marcada])).toEqual([
      ['six', 'pulada', true],
      ['borrow', 'tocada', true],
      ['morning', 'nova', true],
      ['friend', 'nova', true],
    ])
  })

  it('a palavra já no caderno aparece desmarcada', () => {
    const r = palavrasParaPraticar({
      puladas: ['happy'],
      tocadas: [],
      alvoDesconhecidas: [],
      noCaderno: (chave) => chave === 'happy',
      lang: 'en',
    })
    expect(r).toEqual([{ palavra: 'happy', motivo: 'pulada', marcada: false }])
  })

  it('sem repetir pelo lema, sem pontuação, e no máximo 5', () => {
    const r = palavrasParaPraticar({
      puladas: ['Apples,', 'dogs'],
      tocadas: ['apple', 'dog', 'cat'],
      alvoDesconhecidas: ['bread', 'milk', 'water', 'fruit'],
      noCaderno: () => false,
      lang: 'en',
    })
    expect(r.map((x) => x.palavra)).toEqual(['apples', 'dogs', 'cat', 'bread', 'milk'])
  })

  it('nada para praticar: lista vazia', () => {
    expect(
      palavrasParaPraticar({ puladas: [], tocadas: [], alvoDesconhecidas: [], noCaderno: () => false, lang: 'en' }),
    ).toEqual([])
  })
})
