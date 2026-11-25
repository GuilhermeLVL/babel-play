/**
 * COLAR UMA LISTA E CSV AVULSO (openspec `cartoes`, 7.3): o parser de texto aceita duas colunas por vírgula ou
 * tabulação, aspas (com o separador dentro e aspas duplicadas), linhas vazias e comentários, e a terceira coluna vira
 * a frase de exemplo. O mesmo leitor serve ao arquivo `.txt/.csv/.tsv` e ao texto colado.
 */
import { describe, expect, it } from 'vitest'

import { lerTextoAnki } from '../src/core/anki'
import { dividirLinha } from '../src/core/anki/texto'

describe('dividirLinha', () => {
  it('separa sem aspas como o split simples', () => {
    expect(dividirLinha('house,casa', ',')).toEqual(['house', 'casa'])
    expect(dividirLinha('house\tcasa\tI live here.', '\t')).toEqual(['house', 'casa', 'I live here.'])
  })

  it('aspas protegem o separador, "" é uma aspa e as aspas de fora saem', () => {
    expect(dividirLinha('"hello, world",olá mundo', ',')).toEqual(['hello, world', 'olá mundo'])
    expect(dividirLinha('say,"ele disse ""oi"""', ',')).toEqual(['say', 'ele disse "oi"'])
  })

  it('campo vazio no meio fica vazio', () => {
    expect(dividirLinha('a,,c', ',')).toEqual(['a', '', 'c'])
  })
})

describe('lerTextoAnki com uma lista colada', () => {
  it('duas colunas por vírgula', () => {
    const r = lerTextoAnki('house,casa\nwater,água')
    expect(r.notas.map((n) => [n.frente, n.verso])).toEqual([
      ['house', 'casa'],
      ['water', 'água'],
    ])
    expect(r.formato).toContain('separado por ,')
  })

  it('duas colunas por tabulação, com a frase na terceira', () => {
    const r = lerTextoAnki('house\tcasa\tI live in a house.\nwater\tágua')
    expect(r.notas).toHaveLength(2)
    expect(r.notas[0]).toMatchObject({ frente: 'house', verso: 'casa', exemplo: 'I live in a house.' })
    expect(r.notas[1].exemplo).toBeUndefined()
    expect(r.formato).toContain('tabulação')
  })

  it('aspas com vírgula dentro não quebram a nota', () => {
    const r = lerTextoAnki('"to look up, to search",procurar\n"say ""hi""",dizer oi')
    expect(r.notas.map((n) => [n.frente, n.verso])).toEqual([
      ['to look up, to search', 'procurar'],
      ['say "hi"', 'dizer oi'],
    ])
  })

  it('linha vazia, espaços e comentário (#) são ignorados; CRLF funciona', () => {
    const r = lerTextoAnki('# minha lista\r\nhouse,casa\r\n\r\n   \r\nwater,água\r\n')
    expect(r.notas.map((n) => n.frente)).toEqual(['house', 'water'])
    expect(r.descartadas).toBe(0)
  })

  it('o cabeçalho (palavra, frente...) não vira nota', () => {
    const r = lerTextoAnki('word,translation\nhouse,casa')
    expect(r.campos).toEqual(['word', 'translation'])
    expect(r.notas.map((n) => n.frente)).toEqual(['house'])
  })

  it('linha sem a segunda coluna é descartada e contada, sem derrubar o resto', () => {
    const r = lerTextoAnki('house,casa\nsozinha\nwater,água')
    expect(r.notas).toHaveLength(2)
    expect(r.descartadas).toBe(1)
  })

  it('texto vazio não dá nota', () => {
    expect(lerTextoAnki('').notas).toEqual([])
    expect(lerTextoAnki('\n\n  \n').notas).toEqual([])
  })
})
