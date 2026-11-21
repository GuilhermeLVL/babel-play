// @vitest-environment jsdom
/**
 * A COBERTURA NAS SESSÕES E NOS LIVROS (spec `cobertura-em-sessoes-e-livros`): a conta em qualquer idioma, o número só
 * quando é honesto, e a linha da tela (com o nível por extenso).
 */
import { cleanup, render, screen, waitFor } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'

import {
  coberturaDoConteudo,
  idiomaTemCobertura,
  LIMITE_DE_CARACTERES,
  textosNoIdioma,
  trechosDaSessao,
} from '../src/core/leitura/coberturaDoConteudo'

const conhecimento = vi.hoisted(() => ({
  atual: { conhecidas: new Set<string>(), sessoes: 5, temConta: true },
}))
vi.mock('../src/lib/etiquetas/conhecimentoDoIdioma', () => ({
  useConhecimentoDoIdioma: () => conhecimento.atual,
}))

import CoberturaDoConteudo from '../src/components/CoberturaDoConteudo'

/** 40 palavras: 38 conhecidas (as 38 do conjunto) e 2 novas. */
const SABIDAS = Array.from({ length: 38 }, (_, i) => `palavra${String.fromCharCode(97 + (i % 26))}${i}`)
const frase = (novas: string[]) => [...SABIDAS, ...novas].join(' ') + '.'

describe('coberturaDoConteudo', () => {
  it('em português: conta flexão e funcionais, e dá o mesmo número da Leitura ativa', () => {
    const texto = 'Os gatos e os cachorros comem as casas. '.repeat(6) + 'A zebra corre.'
    const r = coberturaDoConteudo([texto], 'pt-BR', new Set(['gato', 'cachorro', 'comem', 'casa', 'corre']))
    expect(r).not.toBeNull()
    expect(r!.desconhecidas).toEqual(['zebra'])
    expect(r!.porcentagem).toBeGreaterThanOrEqual(95)
    expect(r!.amostra).toBe(false)
  })

  it('em francês: "l\'homme" vale "homme" (a elisão sai antes da conta)', () => {
    const texto = "L'homme mange. ".repeat(12) + "Qu'il dort. D'abord il mange la pomme."
    const r = coberturaDoConteudo([texto], 'fr', new Set(['homme', 'manger', 'dormir', 'abord', 'pomme']))
    expect(r).not.toBeNull()
    expect(r!.desconhecidas).not.toContain('lhomme')
    expect(r!.desconhecidas).not.toContain('dabord')
  })

  it('japonês, chinês e tailandês: sem número (não há espaço para segmentar com honestidade)', () => {
    const longo = '私は毎日学校に行きます。'.repeat(40)
    expect(coberturaDoConteudo([longo], 'ja', new Set())).toBeNull()
    expect(coberturaDoConteudo([longo], 'zh-CN', new Set())).toBeNull()
    expect(coberturaDoConteudo([longo], 'th', new Set())).toBeNull()
    expect(idiomaTemCobertura('ja-JP')).toBe(false)
    expect(idiomaTemCobertura('es')).toBe(true)
    expect(idiomaTemCobertura('')).toBe(false)
  })

  it('pouco texto (menos de 30 palavras) não dá número', () => {
    expect(coberturaDoConteudo(['The cat sat on the mat.'], 'en', new Set(['cat']))).toBeNull()
  })

  it('texto grande vira amostra e não promete o total de palavras novas', () => {
    const trecho = 'The quick brown fox jumps over the lazy dog near the river bank. '
    const trechos = Array.from({ length: 2000 }, () => trecho)
    expect(trechos.join('').length).toBeGreaterThan(LIMITE_DE_CARACTERES)
    const r = coberturaDoConteudo(trechos, 'en', new Set(['quick', 'brown', 'fox']))
    expect(r?.amostra).toBe(true)
    expect(r!.total).toBeLessThan(2000 * 13)
  })

  it('sem lematizador no idioma (ru): vale a chave exata', () => {
    const texto = 'Я люблю читать книги и пить чай. '.repeat(6)
    const r = coberturaDoConteudo([texto], 'ru', new Set(['люблю', 'читать']))
    expect(r).not.toBeNull()
    expect(r!.desconhecidas).toContain('книги')
    expect(r!.desconhecidas).not.toContain('люблю')
  })
})

describe('textosNoIdioma', () => {
  it('só as falas no idioma do conteúdo; fala sem idioma vale', () => {
    const falas = [
      { texto: 'hello there', lang: 'en-US' },
      { texto: 'olá', lang: 'pt' },
      { texto: 'sem idioma', lang: '' },
    ]
    expect(textosNoIdioma(falas, 'en')).toEqual(['hello there', 'sem idioma'])
  })
})

describe('trechosDaSessao', () => {
  it('sem idioma na sessão nem nas falas: null (nunca o idioma da pessoa)', () => {
    expect(trechosDaSessao([{ texto: 'hello', lang: '' }], '')).toBeNull()
    expect(trechosDaSessao([{ texto: 'hello' }], undefined)).toBeNull()
  })
  it('o idioma vem da sessão, ou da primeira fala que o traz', () => {
    expect(trechosDaSessao([{ texto: 'a', lang: '' }], 'es-MX')).toEqual({ idioma: 'es', trechos: ['a'] })
    expect(
      trechosDaSessao(
        [
          { texto: 'a', lang: '' },
          { texto: 'b', lang: 'fr' },
        ],
        '',
      ),
    ).toEqual({
      idioma: 'fr',
      trechos: ['a', 'b'],
    })
  })
})

describe('<CoberturaDoConteudo />', () => {
  afterEach(() => {
    cleanup()
    conhecimento.atual = { conhecidas: new Set(), sessoes: 5, temConta: true }
  })
  const trechos = [frase(['zzzuno', 'zzzdois'])]

  it('mostra a % da sessão, o nível por extenso e as palavras novas', async () => {
    conhecimento.atual = { conhecidas: new Set(SABIDAS.map((s) => s)), sessoes: 5, temConta: true }
    render(<CoberturaDoConteudo trechos={trechos} idioma="en" tipo="sessao" />)
    const el = await screen.findByTestId('cobertura-do-conteudo')
    expect(el.textContent).toContain('95% desta sessão')
    expect(el.textContent).toContain('Bom desafio')
    expect(el.textContent).toContain('cerca de 2 palavras novas')
    expect(el.getAttribute('data-rotulo')).toBe('desafio')
  })

  it('capítulo: o texto diz "deste capítulo"', async () => {
    conhecimento.atual = { conhecidas: new Set(SABIDAS), sessoes: 5, temConta: true }
    render(<CoberturaDoConteudo trechos={trechos} idioma="en" tipo="capitulo" />)
    expect((await screen.findByTestId('cobertura-do-conteudo')).textContent).toContain('deste capítulo')
  })

  it('menos de 3 sessões no idioma: nada na tela', async () => {
    conhecimento.atual = { conhecidas: new Set(SABIDAS), sessoes: 2, temConta: true }
    render(<CoberturaDoConteudo trechos={trechos} idioma="en" tipo="sessao" />)
    await new Promise((r) => setTimeout(r, 120))
    expect(screen.queryByTestId('cobertura-do-conteudo')).toBeNull()
  })

  it('sem conta: nada na tela', async () => {
    conhecimento.atual = { conhecidas: new Set(SABIDAS), sessoes: 9, temConta: false }
    render(<CoberturaDoConteudo trechos={trechos} idioma="en" tipo="sessao" />)
    await new Promise((r) => setTimeout(r, 120))
    expect(screen.queryByTestId('cobertura-do-conteudo')).toBeNull()
  })

  it('idioma sem espaço (ja): nada na tela, mesmo com histórico', async () => {
    conhecimento.atual = { conhecidas: new Set(), sessoes: 9, temConta: true }
    render(<CoberturaDoConteudo trechos={['私は毎日学校に行きます。'.repeat(40)]} idioma="ja" tipo="sessao" />)
    await new Promise((r) => setTimeout(r, 120))
    expect(screen.queryByTestId('cobertura-do-conteudo')).toBeNull()
  })

  it('muda de capítulo: recalcula com os trechos novos', async () => {
    conhecimento.atual = { conhecidas: new Set(SABIDAS), sessoes: 5, temConta: true }
    const { rerender } = render(<CoberturaDoConteudo trechos={trechos} idioma="en" tipo="capitulo" />)
    await screen.findByTestId('cobertura-do-conteudo')
    rerender(<CoberturaDoConteudo trechos={[frase([])]} idioma="en" tipo="capitulo" />)
    await waitFor(() =>
      expect(screen.getByTestId('cobertura-do-conteudo').textContent).toContain('100% deste capítulo'),
    )
  })
})

describe('<CoberturaDoConteudo /> troca de entrada', () => {
  afterEach(cleanup)
  it('ao trocar os trechos, a % do anterior some até a conta nova', async () => {
    conhecimento.atual = { conhecidas: new Set(SABIDAS), sessoes: 5, temConta: true }
    const { rerender } = render(<CoberturaDoConteudo trechos={[frase(['zzzuno'])]} idioma="en" tipo="capitulo" />)
    await screen.findByTestId('cobertura-do-conteudo')
    rerender(<CoberturaDoConteudo trechos={[frase([])]} idioma="en" tipo="capitulo" />)
    expect(screen.queryByTestId('cobertura-do-conteudo')).toBeNull()
    expect((await screen.findByTestId('cobertura-do-conteudo')).textContent).toContain('100%')
  })
  it('plural: "cerca de 1 palavra nova"', async () => {
    conhecimento.atual = { conhecidas: new Set(SABIDAS), sessoes: 5, temConta: true }
    render(<CoberturaDoConteudo trechos={[frase(['zzzuno'])]} idioma="en" tipo="capitulo" />)
    expect((await screen.findByTestId('cobertura-do-conteudo')).textContent).toContain('cerca de 1 palavra nova')
  })
})
