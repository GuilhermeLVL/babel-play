// @vitest-environment jsdom
import { describe, expect, it, vi } from 'vitest'

import {
  escolherGlosas,
  indicesDasPalavrasNovas,
  JANELA_DA_GLOSA,
  OCORRENCIAS_COM_GLOSA,
  palavrasDoCapitulo,
} from '../src/core/leitura/glosaDoCapitulo'
import { desenharGlosa, glosaCurta, GlosaDoCapitulo, textoDoDocumento } from '../src/lib/leitor/glosaNoCapitulo'

vi.mock('../src/lib/dicionarioLocal', () => {
  const glosas: Record<string, string> = { lantern: 'lanterna', harbor: 'porto' }
  return {
    glosaLocal: async (palavra: string) => {
      const g = glosas[palavra.toLowerCase()]
      return g ? { glosa: g, lema: palavra } : null
    },
  }
})

const entrada = (texto: string, conhecidas: string[] = [], ignoradas: string[] = []) => ({
  palavras: palavrasDoCapitulo(texto, 'en'),
  lang: 'en',
  conhecidas: new Set(conhecidas),
  ignoradas: new Set(ignoradas),
})
const chaves = (e: ReturnType<typeof entrada>, ix: number[]) => ix.map((i) => e.palavras[i].chave)

describe('glosa das palavras novas: a régua de "nova"', () => {
  it('ignora funcionais, nomes próprios, conhecidas (com flexão) e ignoradas', () => {
    const e = entrada('The dog saw Maria near a lantern. She carried apples and a ledger.', ['apple'], ['ledger'])
    expect(chaves(e, indicesDasPalavrasNovas(e))).toEqual(['dog', 'saw', 'near', 'lantern', 'carried'])
  })
})

describe('glosa das palavras novas: escolha', () => {
  const todas = (e: ReturnType<typeof entrada>) => new Set(e.palavras.map((p) => p.chave))

  it('só palavras com glosa local entram', () => {
    const e = entrada('lantern ledger harbor quill')
    const ix = escolherGlosas(e, new Set(['harbor']))
    expect(chaves(e, ix)).toEqual(['harbor'])
  })

  it('densidade: nunca duas glosas a menos de JANELA_DA_GLOSA palavras', () => {
    const e = entrada('lantern ledger harbor quill anchor bridge cobweb dagger ember falcon garden hammer')
    const ix = escolherGlosas(e, todas(e))
    expect(ix.length).toBeGreaterThan(1)
    for (let k = 1; k < ix.length; k++) expect(ix[k] - ix[k - 1]).toBeGreaterThanOrEqual(JANELA_DA_GLOSA)
    expect(ix.length).toBeLessThanOrEqual(Math.ceil(e.palavras.length / JANELA_DA_GLOSA))
  })

  it('uma palavra repetida ganha glosa só nas primeiras ocorrências', () => {
    const e = entrada(
      'lantern one two three four lantern five six seven eight lantern nine ten eleven twelve lantern',
      [],
      ['one', 'two', 'three', 'four', 'five', 'six', 'seven', 'eight', 'nine', 'ten', 'eleven', 'twelve'],
    )
    const ix = escolherGlosas(e, new Set(['lantern']))
    expect(ix).toHaveLength(OCORRENCIAS_COM_GLOSA)
    expect(ix).toEqual([0, 5])
  })

  it('quando não cabe tudo, a mais frequente do capítulo tem prioridade', () => {
    // "quill" e "anchor" disputam a mesma janela; "anchor" aparece mais vezes no capítulo.
    const e = entrada(
      'quill anchor lantern one two three four five six seven anchor eight nine ten eleven anchor',
      [],
      ['one', 'two', 'three', 'four', 'five', 'six', 'seven', 'eight', 'nine', 'ten', 'eleven'],
    )
    const ix = escolherGlosas(e, new Set(['quill', 'anchor', 'lantern']))
    expect(chaves(e, ix)).toContain('anchor')
    expect(chaves(e, ix)).not.toContain('quill')
  })

  it('a palavra que vira conhecida sai da escolha (progressão)', () => {
    const texto = 'lantern ledger harbor quill anchor'
    const antes = entrada(texto)
    const depois = entrada(texto, ['anchor', 'lantern'])
    expect(chaves(antes, escolherGlosas(antes, todas(antes)))).toContain('lantern')
    expect(chaves(depois, escolherGlosas(depois, todas(depois)))).not.toContain('lantern')
  })
})

describe('glosa: texto, intervalo e desenho no documento', () => {
  const html = '<p>The <i>lan</i>tern burns near the harbor.</p><p>A ledger lies on the table.</p>'
  const montar = () => new DOMParser().parseFromString(`<!DOCTYPE html><body>${html}</body>`, 'text/html')

  it('mapeia a palavra de volta ao DOM mesmo partida entre nós, sem alterar o documento', () => {
    const doc = montar()
    const antes = doc.body.innerHTML
    const { texto, segmentos } = textoDoDocumento(doc)
    const p = palavrasDoCapitulo(texto, 'en').find((x) => x.chave === 'lantern')
    expect(p).toBeTruthy()
    expect(segmentos.length).toBeGreaterThan(2)
    expect(doc.body.innerHTML).toBe(antes)
  })

  it('desenha só no overlayer, refaz quando a palavra vira conhecida e some ao limpar', async () => {
    const doc = montar()
    const antes = doc.body.innerHTML
    const desenhados = new Map<string, SVGElement>()
    const overlayer = {
      add: (k: string, _r: Range, draw: (r: DOMRectList, o: never) => SVGElement, o: unknown) => {
        desenhados.set(k, draw([{ left: 10, top: 40, width: 30 }] as unknown as DOMRectList, o as never))
      },
      remove: (k: string) => void desenhados.delete(k),
    }
    const c = new GlosaDoCapitulo(doc, overlayer, 'en', 'pt')
    const aparencia = { cor: '#555', fundo: '#fff', tamanho: 18 }
    const n = await c.atualizar({ conhecidas: new Set(), aparencia })
    // `lantern` (partida entre nós) e `harbor` têm glosa; `ledger` e `table` não: nada inventado.
    expect(n).toBe(2)
    expect([...desenhados.values()].map((g) => g.textContent).sort()).toEqual(['lanterna', 'porto'])
    expect([...desenhados.values()].every((g) => g.getAttribute('aria-hidden') === 'true')).toBe(true)
    // Progressão: "lantern" virou conhecida (Já sei) — a glosa dela some, sem recarregar o capítulo.
    await c.atualizar({ conhecidas: new Set(['lantern']), aparencia })
    expect([...desenhados.values()].map((g) => g.textContent)).toEqual(['porto'])
    c.limpar()
    expect(desenhados.size).toBe(0)
    expect(doc.body.innerHTML).toBe(antes)
  })

  it('o SVG da glosa sai da árvore de acessibilidade e carrega o texto', () => {
    const g = desenharGlosa([{ left: 10, top: 40, width: 30 }] as unknown as DOMRectList, {
      texto: 'lanterna',
      cor: '#555',
      fundo: '#fff',
      tamanho: 18,
    })
    expect(g.getAttribute('aria-hidden')).toBe('true')
    expect(g.textContent).toBe('lanterna')
  })

  it('glosaCurta fica com a primeira acepção e recusa a longa demais', () => {
    expect(glosaCurta('casa, lar')).toBe('casa')
    expect(glosaCurta('uma explicação extremamente longa demais aqui')).toBeNull()
  })
})
