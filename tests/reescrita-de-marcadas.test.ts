import { describe, expect, it } from 'vitest'

import { chaveDaPalavraNaVersao } from '../src/core/texto/palavra'
import { contarChaves } from '../src/core/texto/palavrasVistas'
import { planejarReescritaDeMarcadas } from '../src/core/texto/reescritaDeChaves'

describe('planejarReescritaDeMarcadas', () => {
  const marcadas = [
    { lang: 'es', chave: 'ano', estado: 'conhecida' },
    { lang: 'pt', chave: 'agua', estado: 'conhecida' },
  ]
  it('ida: acrescenta a v2 das palavras conhecidas e nunca troca nem apaga', () => {
    const p = planejarReescritaDeMarcadas(
      marcadas,
      [
        { palavra: 'año', lang: 'es' },
        { palavra: 'Água', lang: 'pt-BR' },
      ],
      2,
    )
    expect(p.inserir).toEqual([{ lang: 'es', chave: 'año', estado: 'conhecida' }])
    expect(p.mover).toEqual([])
    expect(p.apagar).toEqual([])
    expect(p.semDesdobra).toBe(1) // `agua` não ganha marca em pt
  })
  it('ida: não repete linha que já existe', () => {
    const p = planejarReescritaDeMarcadas(
      [...marcadas, { lang: 'es', chave: 'año', estado: 'ignorada' }],
      [{ palavra: 'año', lang: 'es' }],
      2,
    )
    expect(p.inserir).toEqual([])
  })
  it('volta: move para a v1 e apaga quando o destino existe', () => {
    const p = planejarReescritaDeMarcadas(
      [
        { lang: 'es', chave: 'ano', estado: 'conhecida' },
        { lang: 'es', chave: 'año', estado: 'ignorada' },
        { lang: 'de', chave: 'schön', estado: 'conhecida' },
      ],
      [],
      1,
    )
    expect(p.apagar).toEqual([{ lang: 'es', chave: 'año' }])
    expect(p.mover).toEqual([{ lang: 'de', de: 'schön', para: 'schon', estado: 'conhecida' }])
  })
})

describe('contarChaves por versão', () => {
  it('a v2 guarda a chave com marca; o corte continua pela v1', () => {
    const falas = [{ texto: 'schön schön und', idioma: 'de', idx: 0 }]
    expect([...contarChaves(falas, 1).keys()]).toEqual(['de|schon'])
    expect([...contarChaves(falas, 2).keys()]).toEqual(['de|schön']) // `und` é funcional: fora nas duas
    expect(chaveDaPalavraNaVersao('Água', 'pt', 2)).toBe('agua')
  })
})
