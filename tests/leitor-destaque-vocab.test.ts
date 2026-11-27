// @vitest-environment jsdom
/**
 * O DESTAQUE POR VOCABULÁRIO DO LEITOR (openspec `leitura-assistida`, Fatia C): as regras puras (C1, C2, C6), o desenho no
 * documento com a CSS Custom Highlight API (C3, com a API falsa: o jsdom não a tem) e a escolha de força do cartão (C5).
 */
import { describe, expect, it, vi } from 'vitest'

import { forcaDoCartao } from '../src/core/learning/forcaDoCartao'
import {
  ALFA_DA_NOVA,
  ALFA_DO_APRENDENDO,
  alfaDaClasse,
  classeDoDestaque,
  CLASSES_DO_DESTAQUE,
  estadoInicialDaForca,
  type FonteDeVocabulario,
  frequenciaRelativa,
  type InfoDaPalavra,
  infoDaPalavra,
  intensidadeDoDestaque,
  palavrasAMarcarAoPaginar,
  PISO_DE_FREQUENCIA_AO_PAGINAR,
  resumoDoCapitulo,
} from '../src/core/leitura/destaqueDeVocabulario'
import { palavrasDoCapitulo } from '../src/core/leitura/glosaDoCapitulo'
import { montarIndiceDeForcas, montarIndiceDoCaderno } from '../src/core/vocabulario/etiquetas'
import { montarIndiceDeMarcadas } from '../src/core/vocabulario/marcadas'
import { cssDosGrifos, DestaqueDoCapitulo, suportaGrifos } from '../src/lib/leitor/destaqueNoDocumento'

const fonte = (o: {
  cartoes?: Array<{ palavra: string; forca: 1 | 2 | 3 | 4; estado?: 'nova' | 'aprendendo' | 'dominada' }>
  marcadas?: Array<{ chave: string; estado: 'conhecida' | 'ignorada' }>
}): FonteDeVocabulario => {
  const cartoes = (o.cartoes ?? []).map((c) => ({
    palavra: c.palavra,
    lang: 'en',
    estado:
      c.estado ?? (c.forca === 1 ? ('nova' as const) : c.forca === 4 ? ('dominada' as const) : ('aprendendo' as const)),
    forca: c.forca,
  }))
  return {
    caderno: montarIndiceDoCaderno(cartoes),
    forcas: montarIndiceDeForcas(cartoes),
    marcadas: montarIndiceDeMarcadas(
      (o.marcadas ?? []).map((m) => ({ lang: 'en', chave: m.chave, estado: m.estado, atualizadoEm: 1 })),
    ),
  }
}

describe('C1 infoDaPalavra: o estado e a força a partir dos índices que já existem', () => {
  it('sem cartão e sem marca: nova, força 0', () => {
    expect(infoDaPalavra(fonte({}), ['lantern'], 'en', 0.5)).toEqual({ status: 'nova', forca: 0, frequencia: 0.5 })
  })
  it.each([1, 2, 3] as const)('cartão de força %i: aprendendo', (forca) => {
    expect(infoDaPalavra(fonte({ cartoes: [{ palavra: 'lantern', forca }] }), ['lantern'], 'en')).toMatchObject({
      status: 'aprendendo',
      forca,
    })
  })
  it('cartão de força 4: conhecida', () => {
    expect(infoDaPalavra(fonte({ cartoes: [{ palavra: 'lantern', forca: 4 }] }), ['lantern'], 'en')).toMatchObject({
      status: 'conhecida',
      forca: 4,
    })
  })
  it('"Já sei" e "Ignorar" sem cartão', () => {
    const f = fonte({
      marcadas: [
        { chave: 'harbor', estado: 'conhecida' },
        { chave: 'quill', estado: 'ignorada' },
      ],
    })
    expect(infoDaPalavra(f, ['harbor'], 'en').status).toBe('conhecida')
    expect(infoDaPalavra(f, ['quill'], 'en').status).toBe('ignorada')
  })
  it('o cartão manda sobre a marca; entre lemas vale o de maior força', () => {
    const f = fonte({
      cartoes: [{ palavra: 'apple', forca: 2 }],
      marcadas: [{ chave: 'apple', estado: 'ignorada' }],
    })
    expect(infoDaPalavra(f, ['apples', 'apple'], 'en')).toMatchObject({ status: 'aprendendo', forca: 2 })
  })
  it('palavra funcional ou nome próprio (semDestaque) conta como conhecida', () => {
    expect(infoDaPalavra(fonte({}), ['the'], 'en', 1, true).status).toBe('conhecida')
  })
  it('sem o índice de forças, a força sai do estado do caderno', () => {
    const f = fonte({ cartoes: [{ palavra: 'lantern', forca: 2 }] })
    expect(infoDaPalavra({ ...f, forcas: null }, ['lantern'], 'en')).toMatchObject({ status: 'aprendendo', forca: 2 })
  })
})

describe('C2 intensidadeDoDestaque', () => {
  const info = (status: InfoDaPalavra['status'], forca: InfoDaPalavra['forca'], frequencia = 0): InfoDaPalavra => ({
    status,
    forca,
    frequencia,
  })

  it('tabela: nova de 0,45 a 0,70; aprendendo 0,50 / 0,32 / 0,18; o resto sem cor', () => {
    expect(intensidadeDoDestaque(info('nova', 0, 0))).toEqual({ tom: 'nova', alfa: ALFA_DA_NOVA.base })
    expect(intensidadeDoDestaque(info('nova', 0, 1)).alfa).toBeCloseTo(0.7)
    expect(intensidadeDoDestaque(info('aprendendo', 1))).toEqual({ tom: 'aprendendo', alfa: 0.5 })
    expect(intensidadeDoDestaque(info('aprendendo', 2))).toEqual({ tom: 'aprendendo', alfa: 0.32 })
    expect(intensidadeDoDestaque(info('aprendendo', 3))).toEqual({ tom: 'aprendendo', alfa: 0.18 })
    for (const i of [info('conhecida', 4), info('ignorada', 0), info('aprendendo', 4)]) {
      expect(intensidadeDoDestaque(i)).toEqual({ tom: 'nenhum', alfa: 0 })
    }
  })
  it('monotonicidade: força maior, alfa menor; frequência maior, alfa maior', () => {
    expect(ALFA_DO_APRENDENDO[1]).toBeGreaterThan(ALFA_DO_APRENDENDO[2])
    expect(ALFA_DO_APRENDENDO[2]).toBeGreaterThan(ALFA_DO_APRENDENDO[3])
    let antes = -1
    for (let f = 0; f <= 1; f += 0.05) {
      const a = intensidadeDoDestaque(info('nova', 0, f)).alfa
      expect(a).toBeGreaterThanOrEqual(antes)
      antes = a
    }
  })
  it('a classe do grifo: 4 degraus para a nova, 3 forças para a aprendendo, nenhuma para o resto', () => {
    expect(classeDoDestaque(info('nova', 0, 0))).toBe('nova-0')
    expect(classeDoDestaque(info('nova', 0, 0.99))).toBe('nova-3')
    expect(classeDoDestaque(info('nova', 0, 1))).toBe('nova-3')
    expect(classeDoDestaque(info('aprendendo', 2))).toBe('aprendendo-2')
    expect(classeDoDestaque(info('conhecida', 4))).toBeNull()
    expect(CLASSES_DO_DESTAQUE).toHaveLength(7)
    const alfas = CLASSES_DO_DESTAQUE.map(alfaDaClasse)
    expect(alfas.slice(0, 4)).toEqual([...alfas.slice(0, 4)].sort((a, b) => a - b))
    expect(alfaDaClasse('aprendendo-1')).toBeGreaterThan(alfaDaClasse('aprendendo-3'))
  })
  it('frequenciaRelativa: 0..1, a mais repetida vale 1', () => {
    expect(frequenciaRelativa(0, 10)).toBe(0)
    expect(frequenciaRelativa(10, 10)).toBe(1)
    expect(frequenciaRelativa(3, 10)).toBeGreaterThan(frequenciaRelativa(1, 10))
  })
  it('o CSS do documento tem um grifo por classe, com fio tracejado (nova) e pontilhado (aprendendo)', () => {
    const css = cssDosGrifos({ nova: '#c63c14', aprendendo: '#3e6b44' })
    for (const c of CLASSES_DO_DESTAQUE) expect(css).toContain(`::highlight(frasy-v-${c})`)
    expect(css).toContain('underline dashed')
    expect(css).toContain('underline dotted')
  })
})

describe('C4 resumoDoCapitulo: densidade e % de conhecidas', () => {
  it('conta novas, aprendendo e conhecidas; arredonda a densidade e a cobertura para baixo', () => {
    const r = resumoDoCapitulo([
      ...Array(7).fill({ status: 'nova' }),
      ...Array(2).fill({ status: 'aprendendo' }),
      { status: 'conhecida' },
    ])
    expect(r).toMatchObject({ total: 10, novas: 7, aprendendo: 2, conhecidas: 1, porcentagemDeNovas: 70 })
    expect(r.porcentagemDeConhecidas).toBe(30)
    expect(resumoDoCapitulo([]).porcentagemDeConhecidas).toBe(100)
    expect(
      resumoDoCapitulo([...Array(2).fill({ status: 'nova' }), ...Array(1).fill({ status: 'conhecida' })])
        .porcentagemDeConhecidas,
    ).toBe(33)
  })
})

describe('C5 estadoInicialDaForca: a força escolhida volta igual pelo `forcaDoCartao`', () => {
  it.each([2, 3, 4] as const)('força %i', (f) => {
    const e = estadoInicialDaForca(f, 1_000_000)
    expect(forcaDoCartao({ stability: e.stability, reps: e.reps, lapses: e.lapses })).toBe(f)
    expect(e.dueAt).toBeGreaterThan(1_000_000)
    expect(e.lastReview).toBe(1_000_000)
  })
})

describe('C6 paginar marca como conhecida: só novas, comuns e NÃO clicadas', () => {
  const pagina = [
    { chave: 'lantern', status: 'nova' as const, frequencia: 0.9 },
    { chave: 'harbor', status: 'nova' as const, frequencia: 0.9 },
    { chave: 'quill', status: 'nova' as const, frequencia: PISO_DE_FREQUENCIA_AO_PAGINAR - 0.01 },
    { chave: 'anchor', status: 'aprendendo' as const, frequencia: 1 },
    { chave: 'bridge', status: 'ignorada' as const, frequencia: 1 },
    { chave: 'lantern', status: 'nova' as const, frequencia: 0.9 },
  ]
  it('não marca a clicada, a rara, a que tem cartão nem a ignorada; sem repetir', () => {
    expect(palavrasAMarcarAoPaginar(pagina, new Set(['harbor']))).toEqual(['lantern'])
  })
  it('sem nada clicado marca as duas comuns', () => {
    expect(palavrasAMarcarAoPaginar(pagina, new Set()).sort()).toEqual(['harbor', 'lantern'])
  })
})

/* ── C3: o desenho no documento ── */

class GrifoFalso {
  constructor(readonly ranges: Range[]) {}
}

function documentoComGrifos(html: string, comApi = true) {
  document.body.innerHTML = html
  const registro = new Map<string, GrifoFalso>()
  const janela = document.defaultView as unknown as Record<string, unknown>
  if (comApi) {
    janela.CSS = { highlights: registro }
    janela.Highlight = function (...ranges: Range[]) {
      return new GrifoFalso(ranges)
    }
  } else {
    delete janela.CSS
    delete janela.Highlight
  }
  return { registro, doc: document }
}

const APARENCIA = { nova: '#c63c14', aprendendo: '#3e6b44' }

describe('C3 DestaqueDoCapitulo (CSS.highlights)', () => {
  it('grifa novas e aprendendo, deixa conhecidas e funcionais sem cor, e NÃO muda o DOM do livro', async () => {
    const { registro, doc } = documentoComGrifos(
      '<p>The lantern lantern lantern swung over the harbor and the quill.</p><p>Then Maria kept the ledger.</p>',
    )
    const antes = doc.body.innerHTML
    const d = new DestaqueDoCapitulo(doc, 'en')
    const r = await d.atualizar(
      fonte({
        cartoes: [
          { palavra: 'harbor', forca: 1 },
          { palavra: 'quill', forca: 4 },
        ],
        marcadas: [{ chave: 'ledger', estado: 'conhecida' }],
      }),
      APARENCIA,
    )
    expect(doc.body.innerHTML).toBe(antes)
    expect(r).not.toBeNull()
    const nomes = [...registro.keys()]
    expect(nomes.some((n) => n.startsWith('frasy-v-nova-'))).toBe(true)
    expect(nomes).toContain('frasy-v-aprendendo-1')
    const grifadas = [...registro.values()].flatMap((g) => g.ranges.map((x) => x.toString()))
    expect(grifadas).toContain('lantern')
    expect(grifadas).toContain('harbor')
    expect(grifadas).not.toContain('quill') // força 4
    expect(grifadas).not.toContain('ledger') // "Já sei"
    expect(grifadas).not.toContain('the') // funcional
    expect(grifadas).not.toContain('Maria') // nome próprio
    expect(r!.resumo.total).toBeGreaterThan(5)
    expect(r!.candidatas[0]).toBe('lantern') // a mais repetida primeiro
    expect(r!.grifadas).toBe(grifadas.length)
  })

  it('"Já sei" tira o grifo da palavra em TODAS as ocorrências, numa passada nova', async () => {
    const { registro, doc } = documentoComGrifos('<p>The lantern and the lantern.</p>')
    const d = new DestaqueDoCapitulo(doc, 'en')
    await d.atualizar(fonte({}), APARENCIA)
    expect([...registro.values()].flatMap((g) => g.ranges).filter((r) => r.toString() === 'lantern')).toHaveLength(2)
    await d.atualizar(fonte({ marcadas: [{ chave: 'lantern', estado: 'conhecida' }] }), APARENCIA)
    expect([...registro.values()].flatMap((g) => g.ranges).filter((r) => r.toString() === 'lantern')).toHaveLength(0)
  })

  it('sem CSS.highlights: não lança, não desenha, e ainda devolve o resumo', async () => {
    const { doc } = documentoComGrifos('<p>The lantern swung.</p>', false)
    expect(suportaGrifos(doc)).toBe(false)
    const r = await new DestaqueDoCapitulo(doc, 'en').atualizar(fonte({}), APARENCIA)
    expect(r).toMatchObject({ grifadas: 0 })
    expect(r!.resumo.novas).toBeGreaterThan(0)
  })

  it('limpar() tira os grifos do registro', async () => {
    const { registro, doc } = documentoComGrifos('<p>The lantern swung.</p>')
    const d = new DestaqueDoCapitulo(doc, 'en')
    await d.atualizar(fonte({}), APARENCIA)
    expect(registro.size).toBeGreaterThan(0)
    d.limpar()
    expect(registro.size).toBe(0)
  })

  it('chamadas seguidas: só a última desenha (a anterior devolve null)', async () => {
    const { doc } = documentoComGrifos('<p>The lantern swung over the harbor.</p>')
    const d = new DestaqueDoCapitulo(doc, 'en')
    const primeira = d.atualizar(fonte({}), APARENCIA)
    const segunda = d.atualizar(fonte({}), APARENCIA)
    expect(await primeira).toBeNull() // a segunda assumiu o lugar
    expect(await segunda).not.toBeNull()
  })

  it('palavrasNoRange devolve as palavras classificadas da região visível', async () => {
    const { doc } = documentoComGrifos('<p>The lantern swung.</p><p>Over the harbor.</p>')
    const d = new DestaqueDoCapitulo(doc, 'en')
    await d.atualizar(fonte({}), APARENCIA)
    const visivel = doc.createRange()
    visivel.selectNodeContents(doc.querySelectorAll('p')[1])
    const palavras = d.palavrasNoRange(visivel).map((p) => p.chave)
    expect(palavras).toContain('harbor')
    expect(palavras).not.toContain('lantern')
  })
})

describe('C3 desempenho: uma seção de 5 mil palavras', () => {
  const texto = Array.from({ length: 5000 }, (_, i) => `palavra${i % 700}`).join(' ')

  it('classificar 5 mil palavras (a parte pura, a cada mudança do vocabulário) cabe em 50 ms', () => {
    const palavras = palavrasDoCapitulo(texto, 'en')
    const f = fonte({ cartoes: [{ palavra: 'palavra3', forca: 2 }] })
    const t0 = performance.now()
    const memo = new Map<string, InfoDaPalavra>()
    let n = 0
    for (const p of palavras) {
      let info = memo.get(p.chave)
      if (!info) memo.set(p.chave, (info = infoDaPalavra(f, [p.chave], 'en', 0.4)))
      if (classeDoDestaque(info)) n++
    }
    const ms = performance.now() - t0
    expect(n).toBeGreaterThan(4000)
    expect(ms).toBeLessThan(50)
  })

  it('o desenho de 5 mil palavras no documento termina e mede o tempo total (sem teto no jsdom, que é lento)', async () => {
    const { doc, registro } = documentoComGrifos(`<p>${texto}</p>`)
    const d = new DestaqueDoCapitulo(doc, 'en')
    const aviso = vi.spyOn(console, 'warn').mockImplementation(() => undefined)
    const r = await d.atualizar(fonte({}), APARENCIA)
    aviso.mockRestore()
    expect(r!.grifadas).toBeGreaterThan(4000)
    expect(registro.size).toBeGreaterThan(0)
    // segunda passada (o "Já sei" do cartão): os ranges já existem, só reclassifica e remonta
    const t0 = performance.now()
    await d.atualizar(fonte({ marcadas: [{ chave: 'palavra1', estado: 'conhecida' }] }), APARENCIA)
    expect(performance.now() - t0).toBeLessThan(100)
  })
})
