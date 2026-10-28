// @vitest-environment jsdom
/**
 * A TRADUÇÃO DO CAPÍTULO (`src/lib/leitor/traducaoDeCapitulo.ts`) e a leitura dos parágrafos
 * (`src/lib/leitor/paragrafos.ts`): andamento em lotes, cancelamento, falhas e o que NÃO é parágrafo.
 */
import { describe, expect, it, vi } from 'vitest'

import {
  elementosDosParagrafos,
  indiceDoParagrafoComTexto,
  indiceDoParagrafoNoRange,
  paragrafosDoDocumento,
} from '../src/lib/leitor/paragrafos'
import { traduzirParagrafos } from '../src/lib/leitor/traducaoDeCapitulo'

const semPausa = () => Promise.resolve()

describe('traduzirParagrafos', () => {
  it('traduz tudo na ordem, em lotes, e avisa o progresso a cada parágrafo', async () => {
    const pausas: number[] = []
    const progresso: number[] = []
    const r = await traduzirParagrafos(['a', 'b', 'c', 'd', 'e'], async (t) => t.toUpperCase(), {
      lote: 2,
      pausaMs: 7,
      esperar: async (ms) => void pausas.push(ms),
      aoProgresso: (feitos) => progresso.push(feitos),
    })
    expect(r.fim).toBe('completo')
    expect(r.traducoes).toEqual(['A', 'B', 'C', 'D', 'E'])
    expect(progresso).toEqual([0, 1, 2, 3, 4, 5])
    expect(pausas).toEqual([7, 7]) // entre os 3 lotes, não depois do último
  })

  it('cancela no meio: o que já saiu fica e o resto não é chamado', async () => {
    const ctrl = new AbortController()
    const traduzir = vi.fn(async (t: string) => {
      if (t === 'b') ctrl.abort()
      return t.toUpperCase()
    })
    const r = await traduzirParagrafos(['a', 'b', 'c', 'd'], traduzir, { sinal: ctrl.signal, esperar: semPausa })
    expect(r.fim).toBe('cancelado')
    expect(r.traducoes[0]).toBe('A')
    expect(r.traducoes[2]).toBeUndefined()
    expect(traduzir).toHaveBeenCalledTimes(2)
  })

  it('já cancelado antes de começar: não chama o tradutor', async () => {
    const ctrl = new AbortController()
    ctrl.abort()
    const traduzir = vi.fn(async (t: string) => t)
    const r = await traduzirParagrafos(['a'], traduzir, { sinal: ctrl.signal })
    expect(r.fim).toBe('cancelado')
    expect(traduzir).not.toHaveBeenCalled()
  })

  it('uma falha isolada vira null e o resto segue', async () => {
    const r = await traduzirParagrafos(
      ['a', 'b', 'c'],
      async (t) => {
        if (t === 'b') throw new Error('modelo')
        return t.toUpperCase()
      },
      { esperar: semPausa },
    )
    expect(r.fim).toBe('completo')
    expect(r.traducoes).toEqual(['A', null, 'C'])
  })

  it('falhas em sequência encerram com erro, sem tentar o resto', async () => {
    const traduzir = vi.fn(async () => null)
    const r = await traduzirParagrafos(['a', 'b', 'c', 'd', 'e'], traduzir, { esperar: semPausa })
    expect(r.fim).toBe('erro')
    expect(traduzir).toHaveBeenCalledTimes(3)
  })

  it('pula o que a pessoa já traduziu um a um', async () => {
    const traduzir = vi.fn(async (t: string) => t.toUpperCase())
    const r = await traduzirParagrafos(['a', 'b', 'c'], traduzir, {
      esperar: semPausa,
      jaTraduzidos: [undefined, 'B!', undefined],
    })
    expect(traduzir).toHaveBeenCalledTimes(2)
    expect(r.traducoes).toEqual(['A', 'B!', 'C'])
  })
})

describe('parágrafos do documento', () => {
  const doc = () => {
    const d = document.implementation.createHTMLDocument('x')
    d.body.innerHTML = `
      <h2>Capítulo 1</h2>
      <p>Era uma   vez
        um livro.</p>
      <blockquote><p>Citação dentro.</p></blockquote>
      <ul><li>Item um</li></ul>
      <p>   </p>
      <p>123</p>
      <p>Último parágrafo.</p>`
    return d
  }

  it('lê os blocos de texto na ordem, sem repetir o que está dentro de outro bloco nem os vazios', () => {
    expect(paragrafosDoDocumento(doc())).toEqual([
      'Capítulo 1',
      'Era uma vez um livro.',
      'Citação dentro.',
      'Item um',
      'Último parágrafo.',
    ])
  })

  it('acha o parágrafo pelo texto e pelo range', () => {
    const d = doc()
    const ps = paragrafosDoDocumento(d)
    expect(indiceDoParagrafoComTexto(ps, 'uma   vez  um livro')).toBe(1) // tolera espaços diferentes
    expect(indiceDoParagrafoComTexto(ps, 'Item um')).toBe(3)
    expect(indiceDoParagrafoComTexto(ps, '')).toBe(-1)
    const el = elementosDosParagrafos(d)[4]
    const range = d.createRange()
    range.selectNodeContents(el)
    expect(indiceDoParagrafoNoRange(d, range)).toBe(4)
    expect(indiceDoParagrafoNoRange(d, null)).toBe(-1)
  })
})
