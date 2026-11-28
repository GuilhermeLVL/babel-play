// @vitest-environment jsdom
/**
 * A FLAG `estudo_palavras_v2` NA FOLHA DA PALAVRA, NA BUSCA GLOBAL E NA COBERTURA (frente `palavras`):
 *   · "Perguntar ao tutor" só onde o tutor responderia, e abre a janela do tutor com a pergunta no campo;
 *   · a busca global acha ações, baralhos e telas de Cartões, e a palavra abre na lista;
 *   · a cobertura diz "você conhece X% das palavras", nunca "entende".
 * Desligada, nada disso aparece.
 */
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import React from 'react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { EVENTO_PERGUNTAR_AO_TUTOR } from '../src/core/palavras/perguntaAoTutor'
import type { VocabCard } from '../src/types'
import { prepararDialogoNoJsdom } from './_dialogoNoJsdom'

prepararDialogoNoJsdom()

const mundo = vi.hoisted(() => ({
  flag: true,
  identidade: 'conta' as string,
  protegido: false,
  restrita: false,
  conhecimento: { conhecidas: new Set<string>(), sessoes: 5, temConta: true },
}))
vi.mock('../src/lib/flags', () => ({ useFlag: () => mundo.flag }))
vi.mock('../src/lib/identidade', async (orig) => ({
  ...(await orig<typeof import('../src/lib/identidade')>()),
  estadoDeIdentidade: () => mundo.identidade,
}))
vi.mock('../src/lib/protecaoDoMenor', async (orig) => ({
  ...(await orig<typeof import('../src/lib/protecaoDoMenor')>()),
  perfilProtegido: () => mundo.protegido,
  estadoDaProtecao: () => ({ restrita: mundo.restrita }) as never,
}))
vi.mock('../src/lib/etiquetas/conhecimentoDoIdioma', () => ({ useConhecimentoDoIdioma: () => mundo.conhecimento }))
vi.mock('../src/data/api', () => ({
  fetchMemoriaDoCartao: vi.fn(async () => null),
  fetchOcorrencias: vi.fn(async () => []),
  fetchSessionTranscript: vi.fn(),
  updateCard: vi.fn(),
  fetchDeck: vi.fn(async () => [
    { id: 'c1', word: 'harvest', translation: 'colheita', inDeck: true },
    { id: 'c2', word: 'garden', translation: 'jardim', inDeck: true },
  ]),
}))
vi.mock('../src/data/rotas/conteudo', () => ({
  lerContagensDeConteudo: async () => ({
    agora: 1,
    idioma: '',
    idiomas: [{ id: 'en', palavras: 3 }],
    tudo: { palavras: 3, frases: 0, paraHoje: 0 },
    dificeis: { palavras: 0, frases: 0, paraHoje: 0 },
    sessoes: [],
    anki: [
      { id: 'dA', nome: 'Verbos frasais', tipo: null, quando: 1, duracaoMs: null, palavras: 3, frases: 0, paraHoje: 1 },
    ],
    trilha: null,
  }),
}))
vi.mock('../src/lib/dictionary', () => ({
  lookup: vi.fn(async () => null),
  forvoUrl: () => '#',
  wiktionaryUrl: () => '#',
}))

const { default: GavetaDaPalavra } = await import('../src/components/views/vocab/GavetaDaPalavra')
const { default: BuscaGlobal } = await import('../src/components/BuscaGlobal')
const { default: CoberturaDoConteudo } = await import('../src/components/CoberturaDoConteudo')
const { pedidoDePalavraPendente, consumirPedidoDePalavra } = await import('../src/lib/palavras/abrirPalavra')

beforeEach(() => {
  mundo.flag = true
  mundo.identidade = 'conta'
  mundo.protegido = false
  mundo.restrita = false
  localStorage.clear()
  consumirPedidoDePalavra()
})
afterEach(cleanup)

const cartao = {
  id: 'c1',
  word: 'harvest',
  translation: 'colheita',
  sentence: 'We harvest in autumn.',
  srcLang: 'en',
  fsrsState: 'New',
  inDeck: true,
} as unknown as VocabCard
const gaveta = () =>
  render(
    <GavetaDaPalavra
      cartao={cartao}
      velocidade={1}
      aoTrocarVelocidade={() => {}}
      aoFalar={() => {}}
      aoFechar={() => {}}
      aoMudar={() => {}}
      aoExcluir={() => {}}
      aoExercitar={() => {}}
      aoRevisar={() => {}}
    />,
  )

describe('Perguntar ao tutor na folha da palavra', () => {
  it('com conta: o botão abre o tutor com a palavra e a frase no campo', () => {
    const recebidos: string[] = []
    const ouvir = (e: Event) => recebidos.push((e as CustomEvent<{ texto: string }>).detail.texto)
    window.addEventListener(EVENTO_PERGUNTAR_AO_TUTOR, ouvir)
    gaveta()
    fireEvent.click(screen.getByTestId('perguntar-ao-tutor'))
    window.removeEventListener(EVENTO_PERGUNTAR_AO_TUTOR, ouvir)
    expect(recebidos).toHaveLength(1)
    expect(recebidos[0]).toContain('“harvest”')
    expect(recebidos[0]).toContain('We harvest in autumn.')
  })

  it('perfil protegido com a conta liberada vê o botão; com a conta restrita, não', () => {
    mundo.protegido = true
    const a = gaveta()
    expect(screen.queryByTestId('perguntar-ao-tutor')).not.toBeNull()
    a.unmount()
    mundo.restrita = true
    gaveta()
    expect(screen.queryByTestId('perguntar-ao-tutor')).toBeNull()
  })

  it('sem conta ou com a flag desligada: sem o botão', () => {
    mundo.identidade = 'anonimo'
    const a = gaveta()
    expect(screen.queryByTestId('perguntar-ao-tutor')).toBeNull()
    a.unmount()
    mundo.identidade = 'conta'
    mundo.flag = false
    gaveta()
    expect(screen.queryByTestId('perguntar-ao-tutor')).toBeNull()
  })
})

describe('busca global ampliada', () => {
  const montar = () => {
    const aoNavegar = vi.fn()
    render(
      <BuscaGlobal
        aberta
        aoFechar={() => {}}
        recordings={[]}
        aoNavegar={aoNavegar}
        vencidasAgora={0}
        escuro={false}
        aoAlternarTema={() => {}}
        perfil={'pro' as never}
      />,
    )
    return aoNavegar
  }
  const digitar = (texto: string) => fireEvent.change(screen.getByRole('combobox'), { target: { value: texto } })

  it('acha o baralho do Anki, uma ação de estudo e a tela da Memória', async () => {
    montar()
    digitar('verbos')
    await waitFor(() =>
      expect(screen.getAllByRole('option').some((o) => /Verbos frasais/.test(o.textContent ?? ''))).toBe(true),
    )
    digitar('exportar')
    await waitFor(() =>
      expect(screen.getAllByRole('option').some((o) => /Exportar palavras/.test(o.textContent ?? ''))).toBe(true),
    )
    digitar('memoria')
    await waitFor(() =>
      expect(screen.getAllByRole('option').some((o) => /Cartões · Memória/.test(o.textContent ?? ''))).toBe(true),
    )
  })

  it('a palavra deixa um pedido para a lista abrir', async () => {
    montar()
    digitar('harvest')
    const opcao = await waitFor(() => {
      const o = screen.getAllByRole('option').find((x) => /harvest/.test(x.textContent ?? ''))
      expect(o).toBeTruthy()
      return o!
    })
    fireEvent.click(opcao)
    expect(pedidoDePalavraPendente()).toBe('c1')
  })

  it('desligada: não acha ações nem baralhos', async () => {
    mundo.flag = false
    montar()
    digitar('exportar')
    await new Promise((r) => setTimeout(r, 60))
    expect(screen.queryAllByRole('option').some((o) => /Exportar palavras/.test(o.textContent ?? ''))).toBe(false)
  })
})

describe('cobertura: "você conhece X% das palavras"', () => {
  const SABIDAS = Array.from({ length: 38 }, (_, i) => `palavra${String.fromCharCode(97 + (i % 26))}${i}`)
  const trechos = [[...SABIDAS, 'zzzuno', 'zzzdois'].join(' ') + '.']
  beforeEach(() => {
    mundo.conhecimento = { conhecidas: new Set(SABIDAS), sessoes: 5, temConta: true }
  })

  it('com a flag: "Você conhece 95% das palavras desta sessão", e nunca "entende"', async () => {
    render(<CoberturaDoConteudo trechos={trechos} idioma="en" tipo="sessao" />)
    const el = await screen.findByTestId('cobertura-do-conteudo')
    expect(el.textContent).toContain('Você conhece 95% das palavras desta sessão')
    expect(el.textContent).not.toMatch(/entend/i)
  })

  it('capítulo, com a flag', async () => {
    render(<CoberturaDoConteudo trechos={trechos} idioma="en" tipo="capitulo" />)
    expect((await screen.findByTestId('cobertura-do-conteudo')).textContent).toContain(
      'Você conhece 95% das palavras deste capítulo',
    )
  })

  it('desligada: a frase de antes', async () => {
    mundo.flag = false
    render(<CoberturaDoConteudo trechos={trechos} idioma="en" tipo="sessao" />)
    const el = await screen.findByTestId('cobertura-do-conteudo')
    expect(el.textContent).toContain('Você já sabe 95% desta sessão')
    expect(el.textContent).not.toMatch(/entend/i)
  })
})
