// @vitest-environment jsdom
/**
 * C4: A % DE PALAVRAS CONHECIDAS DO CAPÍTULO ANTES DE ABRI-LO (openspec `leitura-assistida`). O cálculo puro, a leitura
 * do texto das seções pelo livro (sem abrir o capítulo na tela) e o sumário que mostra o número. Tudo no aparelho.
 */
import { cleanup, render, screen } from '@testing-library/react'
import React from 'react'
import { afterEach, describe, expect, it, vi } from 'vitest'

import {
  MINIMO_DE_PALAVRAS_PARA_PORCENTAGEM,
  porcentagemDeConhecidasDoTexto,
  resumoDeConhecidasDoTexto,
} from '../src/core/leitura/conhecidasDoTexto'
import type { FonteDeVocabulario } from '../src/core/leitura/destaqueDeVocabulario'
import { montarIndiceDeForcas, montarIndiceDoCaderno } from '../src/core/vocabulario/etiquetas'
import { montarIndiceDeMarcadas } from '../src/core/vocabulario/marcadas'

const fonte = (
  conhecidas: string[] = [],
  cartoes: Array<{ palavra: string; forca: 1 | 2 | 3 | 4 }> = [],
): FonteDeVocabulario => {
  const cs = cartoes.map((c) => ({
    palavra: c.palavra,
    lang: 'en',
    estado: c.forca === 1 ? ('nova' as const) : c.forca === 4 ? ('dominada' as const) : ('aprendendo' as const),
    forca: c.forca,
  }))
  return {
    caderno: montarIndiceDoCaderno(cs),
    forcas: montarIndiceDeForcas(cs),
    marcadas: montarIndiceDeMarcadas(
      conhecidas.map((chave) => ({ lang: 'en', chave, estado: 'conhecida' as const, atualizadoEm: 1 })),
    ),
  }
}

/* 40 palavras de conteúdo distintas e nenhuma funcional: a conta fica exata. */
const PALAVRAS = Array.from(
  { length: 40 },
  (_, i) => `zorblax${String.fromCharCode(97 + (i % 26))}${String.fromCharCode(97 + Math.floor(i / 26))}`,
)
const TEXTO = PALAVRAS.join(' ')

describe('C4 cálculo: a % de conhecidas do texto', () => {
  it('sem nada marcado, 0% (tudo novo)', () => {
    expect(porcentagemDeConhecidasDoTexto(TEXTO, 'en', fonte())).toBe(0)
  })

  it('metade marcada como conhecida: 50%; aprendendo também conta (a pessoa não precisa de ajuda)', () => {
    const metade = PALAVRAS.slice(0, 20)
    expect(porcentagemDeConhecidasDoTexto(TEXTO, 'en', fonte(metade))).toBe(50)
    const comCartao = fonte(
      PALAVRAS.slice(0, 10),
      PALAVRAS.slice(10, 20).map((palavra) => ({ palavra, forca: 2 as const })),
    )
    expect(porcentagemDeConhecidasDoTexto(TEXTO, 'en', comCartao)).toBe(50)
  })

  it('arredonda para baixo: 39 de 40 é 97%, não 98%', () => {
    expect(porcentagemDeConhecidasDoTexto(TEXTO, 'en', fonte(PALAVRAS.slice(0, 39)))).toBe(97)
  })

  it('texto curto demais ou vocabulário ainda não carregado: sem número (sem chute)', () => {
    expect(PALAVRAS.length).toBeGreaterThanOrEqual(MINIMO_DE_PALAVRAS_PARA_PORCENTAGEM)
    expect(porcentagemDeConhecidasDoTexto('one two three', 'en', fonte())).toBeNull()
    expect(resumoDeConhecidasDoTexto(TEXTO, 'en', { caderno: null, marcadas: null })).toBeNull()
    expect(resumoDeConhecidasDoTexto(TEXTO, '', fonte())).toBeNull()
  })
})

const livroFalso = (secoes: string[], hrefs: Record<string, number>) => ({
  sections: secoes.map((texto) => ({
    id: texto.slice(0, 4),
    load: () => '',
    size: texto.length,
    createDocument: vi.fn(async () =>
      new DOMParser().parseFromString(`<html><body><p>${texto}</p></body></html>`, 'text/html'),
    ),
  })),
  resolveHref: (href: string) => (href in hrefs ? { index: hrefs[href] } : null),
})

describe('C4 lib: lê o texto das seções pelo livro, sem abrir o capítulo', () => {
  it('uma % por href do sumário; item fora do livro fica sem número; itens da mesma seção dividem a conta', async () => {
    const { conhecidasPorItemDoSumario } = await import('../src/lib/leitor/conhecidasDoSumario')
    const livro = livroFalso([TEXTO, TEXTO], { 'a.xhtml': 0, 'a.xhtml#x': 0, 'b.xhtml': 1 })
    const m = await conhecidasPorItemDoSumario({
      livro: livro as never,
      sumario: [
        { label: 'A', href: 'a.xhtml', subitems: [{ label: 'A.1', href: 'a.xhtml#x' }] },
        { label: 'B', href: 'b.xhtml' },
        { label: 'Fora', href: 'nao-existe.xhtml' },
      ],
      idioma: 'en',
      fonte: fonte(PALAVRAS.slice(0, 20)),
      cancelado: () => false,
    })
    expect(m.get('a.xhtml')).toBe(50)
    expect(m.get('a.xhtml#x')).toBe(50)
    expect(m.get('b.xhtml')).toBe(50)
    expect(m.has('nao-existe.xhtml')).toBe(false)
    expect(livro.sections[0].createDocument).toHaveBeenCalledTimes(1)
  })

  it('cancelar interrompe a leitura das seções', async () => {
    const { conhecidasPorItemDoSumario } = await import('../src/lib/leitor/conhecidasDoSumario')
    const livro = livroFalso([TEXTO, TEXTO], { 'a.xhtml': 0, 'b.xhtml': 1 })
    const m = await conhecidasPorItemDoSumario({
      livro: livro as never,
      sumario: [
        { label: 'A', href: 'a.xhtml' },
        { label: 'B', href: 'b.xhtml' },
      ],
      idioma: 'en',
      fonte: fonte(),
      cancelado: () => (livro.sections[0].createDocument as ReturnType<typeof vi.fn>).mock.calls.length > 0,
    })
    expect(m.has('b.xhtml')).toBe(false)
    expect(livro.sections[1].createDocument).not.toHaveBeenCalled()
  })

  it('o livro inteiro soma as palavras de todas as seções', async () => {
    const { conhecidasDoLivro } = await import('../src/lib/leitor/conhecidasDoSumario')
    const livro = livroFalso([PALAVRAS.slice(0, 20).join(' '), PALAVRAS.slice(20).join(' ')], {})
    const p = await conhecidasDoLivro({
      livro: livro as never,
      idioma: 'en',
      fonte: fonte(PALAVRAS.slice(0, 20)),
      cancelado: () => false,
    })
    expect(p).toBe(50)
  })
})

describe('C4 tela: o sumário mostra a % de cada capítulo', () => {
  afterEach(cleanup)

  const montar = async (idiomaDoVocabulario?: string) => {
    vi.resetModules()
    const f = fonte(PALAVRAS.slice(0, 30))
    vi.doMock('../src/lib/etiquetas/indiceDeEtiquetas', async (orig) => ({
      ...(await orig<typeof import('../src/lib/etiquetas/indiceDeEtiquetas')>()),
      useSnapshotDasEtiquetas: () => ({ caderno: f.caderno, forcas: f.forcas, marcadas: f.marcadas }),
    }))
    const { default: PainelDoSumario } = await import('../src/components/views/leitor/PainelDoSumario')
    const livro = livroFalso([TEXTO], { 'cap1.xhtml': 0 })
    const motor = { livro, ir: vi.fn(), buscar: vi.fn(), limparBusca: vi.fn() }
    render(
      <PainelDoSumario
        motor={motor as never}
        sumario={[{ label: 'Capítulo 1', href: 'cap1.xhtml' }]}
        aoIr={() => {}}
        idiomaDoVocabulario={idiomaDoVocabulario}
      />,
    )
    return livro
  }

  it('com o idioma (flag e destaque ligados): "75% conhecidas" ao lado do capítulo', async () => {
    await montar('en')
    expect((await screen.findByTestId('sumario-conhecidas', {}, { timeout: 3000 })).textContent).toContain('75%')
  })

  it('sem o idioma (flag desligada): nenhum capítulo é lido e nada aparece', async () => {
    const livro = await montar(undefined)
    await new Promise((r) => setTimeout(r, 500))
    expect(screen.queryByTestId('sumario-conhecidas')).toBeNull()
    expect(livro.sections[0].createDocument).not.toHaveBeenCalled()
  })
})
