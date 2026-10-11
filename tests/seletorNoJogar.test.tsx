// @vitest-environment jsdom
/**
 * O SELETOR DE CONTEÚDO LIGADO NO JOGAR (protótipo `cartoes-enxuto`: `fontes.js`, `seletor.js`).
 *
 *  · UM ESTADO SÓ: quem manda é o conteúdo escolhido do app; o filtro guardado e a query de `/jogar` são o
 *    espelho dele; um link com filtro vira o conteúdo escolhido;
 *  · "Difíceis" é a régua única (`lapses >= ERROS_DE_DIFICIL`), tirada do baralho;
 *  · "Tudo" joga com TODO cartão do baralho, inclusive o que só veio da Trilha (o que a contagem conta);
 *  · quem só tem a Trilha joga com ela, e a tela diz;
 *  · as peças do seletor que o Jogar pediu: a ficha sem o "x", o nome dado, a Trilha do app no catálogo.
 */
import { act, cleanup, render, screen } from '@testing-library/react'
import React from 'react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import type { ContagensDeConteudo } from '../src/core/learning/contagensDeConteudo'
import { ERROS_DE_DIFICIL } from '../src/core/learning/resumoDosCartoes'
import type { VocabCard } from '../src/types'
import { prepararDialogoNoJsdom } from './_dialogoNoJsdom'

prepararDialogoNoJsdom()

/* Pares de verdade: a régua de qualidade recusa pista que não parece tradução. */
const PARES: Array<[string, string]> = [
  ['harvest', 'colheita'],
  ['garden', 'jardim'],
  ['bridge', 'ponte'],
  ['window', 'janela'],
  ['river', 'rio'],
  ['planet', 'planeta'],
  ['silver', 'prata'],
  ['market', 'mercado'],
  ['forest', 'floresta'],
  ['candle', 'vela'],
  ['mirror', 'espelho'],
  ['ladder', 'escada'],
]
const cartao = (i: number, extra: Partial<VocabCard> = {}): VocabCard =>
  ({
    id: `c${i}`,
    word: PARES[i][0],
    translation: PARES[i][1],
    explanation: '',
    phonetics: '',
    srcLang: 'en',
    tgtLang: 'pt',
    leitnerBox: 1,
    leitnerDueAt: '',
    fsrsState: 'New',
    fsrsStability: 0,
    fsrsDifficulty: 5,
    fsrsPredictedRetention: 0,
    fsrsDueAt: '',
    dueAtMs: 0,
    createdAtMs: 0,
    inDeck: true,
    daTrilha: false,
    daAnki: false,
    baralhosAnki: [],
    ...extra,
  }) as unknown as VocabCard

const mundo = vi.hoisted(() => ({ baralho: [] as unknown[] }))
vi.mock('../src/data/api', async (orig) => ({
  ...(await orig<typeof import('../src/data/api')>()),
  fetchDeck: vi.fn(async () => mundo.baralho),
}))
vi.mock('../src/lib/soundFx', () => ({ play: vi.fn() }))
vi.mock('../src/data/rotas/conteudo', () => ({ lerContagensDeConteudo: vi.fn(async () => null) }))

const { default: Play } = await import('../src/components/views/Play')
const { deriveProgress } = await import('../src/lib/progress')
const loja = await import('../src/lib/conteudo/loja')
const { FichaDeConteudo } = await import('../src/components/conteudo/FichaDeConteudo')
const { linhasDoCatalogo } = await import('../src/components/conteudo/fontes')
const { lerUrlAtual } = await import('../src/lib/rotas')

vi.stubGlobal(
  'fetch',
  /* Sem servidor: a composição cai para a do aparelho, e a Trilha vem dos arquivos do app. */
  vi.fn(async () => new Response('', { status: 503 })),
)

const assentar = (ms = 350) =>
  act(async () => {
    await new Promise((r) => setTimeout(r, ms))
  })
const montar = async () => {
  const r = render(<Play onChangeView={() => {}} ageProfile="pro" progress={deriveProgress(null)} metrics={null} />)
  await assentar()
  return r
}
const guardado = () => JSON.parse(localStorage.getItem('babel.filtro_da_pratica') ?? 'null')
const presos = (c: HTMLElement) => [...c.querySelectorAll<HTMLElement>('.fx-falta .q-tile')].map((t) => t.dataset.jogo)
const prontos = (c: HTMLElement) =>
  [...c.querySelectorAll<HTMLElement>('#grade-de-jogos > .q-grade .q-tile')].map((t) => t.dataset.jogo)

beforeEach(() => {
  localStorage.clear()
  window.history.replaceState(null, '', '/jogar')
  loja.zerarConteudoParaTeste()
})
afterEach(cleanup)

describe('Jogar: um estado só', () => {
  it('abre com o conteúdo escolhido; trocar grava o filtro traduzido e espelha na barra', async () => {
    mundo.baralho = Array.from({ length: 12 }, (_, i) => cartao(i))
    const { container } = await montar()
    expect(container.querySelector('header.q-cab.fs-cab .fs-ficha')?.textContent).toContain('Tudo')
    expect(container.querySelector('.qj-sugestao')).toBeNull()
    expect(prontos(container)).toContain('memory')

    act(() => loja.escolherConteudo({ tipo: 'trilha' }, 'en'))
    await assentar()
    expect(container.querySelector('.fs-ficha')?.textContent).toContain('Trilha')
    expect(guardado()).toMatchObject({ fontes: ['trilha'], idiomas: ['en'] })
    expect(new URLSearchParams(lerUrlAtual().jogarQuery ?? '').get('fonte')).toBe('trilha')

    act(() => loja.voltarParaTudoNoConteudo())
    await assentar()
    expect(guardado()).toMatchObject({ fontes: ['baralho', 'sessao', 'trilha'], recorte: {} })
  })

  it('o link com filtro vira o conteúdo escolhido do app', async () => {
    mundo.baralho = Array.from({ length: 12 }, (_, i) => cartao(i, { lapses: i < 5 ? ERROS_DE_DIFICIL : 0 }))
    window.history.replaceState(null, '', '/jogar?fonte=baralho&recorte=dificeis&idioma=en')
    const { container } = await montar()
    expect(loja.conteudoAtual()).toEqual({ idioma: 'en', fonte: { tipo: 'dificeis' } })
    expect(container.querySelector('.fs-ficha')?.textContent).toContain('Difíceis')
  })
})

describe('Jogar: o que entra no jogo é o que a contagem conta', () => {
  it('"Difíceis" são as erradas ERROS_DE_DIFICIL vezes ou mais, tiradas do baralho', async () => {
    /* Três difíceis: menos que o mínimo dos jogos de palavra. Com a régua antiga (o ranking do perfil, que
       aqui é nulo) não haveria nenhuma. */
    mundo.baralho = Array.from({ length: 12 }, (_, i) =>
      cartao(i, { lapses: i < 3 ? ERROS_DE_DIFICIL : ERROS_DE_DIFICIL - 1 }),
    )
    localStorage.setItem('babel.conteudo', JSON.stringify({ idioma: 'en', fonte: { tipo: 'dificeis' } }))
    loja.zerarConteudoParaTeste()
    const { container } = await montar()
    const memoria = container.querySelector<HTMLElement>('.fx-falta .q-tile[data-jogo="memory"]')
    expect(memoria?.querySelector('.fx-motivo')?.textContent).toBe('Precisa de 4 palavras; aqui há 3.')
    /* O conteúdo pequeno é dito, com a saída para "Tudo". */
    const aviso = container.querySelector('.fx-aviso.fx-aviso-pequena') as HTMLElement
    expect(aviso.textContent).toContain('Conteúdo pequeno: 3 palavras')
    expect(screen.getByRole('button', { name: 'Usar Tudo' })).toBeTruthy()
    /* Muitos presos: uma saída só. */
    expect(container.querySelectorAll('.qj-porta')).toHaveLength(0)
    expect(screen.getByRole('button', { name: 'Trocar o conteúdo' })).toBeTruthy()
  })

  it('"Tudo" inclui o cartão que só veio da Trilha (ativado), e não as palavras prontas que a pessoa não viu', async () => {
    /* Três cartões próprios e dois da Trilha já ativados: cinco em "Tudo". */
    mundo.baralho = [
      ...Array.from({ length: 3 }, (_, i) => cartao(i)),
      ...Array.from({ length: 2 }, (_, i) => cartao(3 + i, { daTrilha: true })),
    ]
    const { container } = await montar()
    const memoria = container.querySelector<HTMLElement>('.q-tile[data-jogo="memory"]')
    expect(memoria?.closest('.fx-falta')).toBeNull()
    expect(memoria?.querySelector('.qj-conta')?.textContent).toContain('5')
    expect(container.querySelector('.fx-aviso-trilha')).toBeNull()
  })
})

describe('Jogar: quem só tem a Trilha', () => {
  it('joga com as palavras prontas, a ficha diz "Trilha" sem o "x", e o aviso tem a porta para trazer', async () => {
    mundo.baralho = []
    const { container } = await montar()
    const ficha = container.querySelector('.fs-ficha') as HTMLElement
    expect(ficha.textContent).toContain('Trilha')
    expect(ficha.querySelector('[data-fs="tudo"]')).toBeNull()
    const aviso = container.querySelector('.fx-aviso.fx-aviso-trilha') as HTMLElement
    expect(aviso.textContent).toContain('Você joga com as palavras prontas da Trilha.')
    expect(aviso.querySelector('.q-ctl.pri')?.textContent).toContain('Trazer uma fonte')
    /* Sem servidor as glosas da Trilha não chegam: abrem os jogos de ouvir, que não pedem tradução. */
    expect(prontos(container).length).toBeGreaterThan(0)
    expect(presos(container)).toContain('conectores')
    /* A escolha guardada do app continua "Tudo": é a tela que joga com a Trilha enquanto não há palavra. */
    expect(loja.conteudoAtual().fonte).toEqual({ tipo: 'tudo' })
    /* O filtro guardado é só o espelho do que se joga, gravado desde a entrada. */
    expect(guardado()).toMatchObject({ fontes: ['trilha'] })
  })
})

describe('as peças do seletor que o Jogar pediu', () => {
  it('a ficha aceita ficar sem o "x" e mostrar um nome dado', () => {
    const { container } = render(
      <FichaDeConteudo
        conteudo={{ idioma: 'en', fonte: { tipo: 'trilha' } }}
        semVolta
        nome="Trilha · A1"
        aoAbrir={() => {}}
        aoVoltarParaTudo={() => {}}
      />,
    )
    expect(container.querySelector('.fs-nome b')?.textContent).toBe('Trilha · A1')
    expect(container.querySelector('.fs-ficha')?.classList.contains('fs-com-volta')).toBe(false)
    expect(container.querySelector('[data-fs="tudo"]')).toBeNull()
  })

  it('a Trilha do app aparece no catálogo mesmo sem palavra ativada, com os números dela', () => {
    const k: ContagensDeConteudo = {
      agora: 0,
      idioma: '',
      idiomas: [{ id: 'en', palavras: 3 }],
      tudo: { palavras: 3, frases: 1, paraHoje: 0 },
      dificeis: { palavras: 0, frases: 0, paraHoje: 0 },
      sessoes: [],
      anki: [],
      trilha: null,
    }
    expect(linhasDoCatalogo(k, { tipo: 'tudo' }).map((l) => l.chave)).toEqual(['tudo'])
    const trilha = linhasDoCatalogo(k, { tipo: 'tudo' }, { palavras: 2784, frases: 900 }).find(
      (l) => l.chave === 'trilha',
    )
    expect(trilha).toMatchObject({ palavras: 2784, frases: 900, paraHoje: 0 })
  })

  it('a escolha "Trilha" fica mesmo sem cartão dela, num idioma que tem trilha no app', () => {
    const semTrilha = {
      agora: 0,
      idioma: '',
      idiomas: [{ id: 'en', palavras: 3 }],
      tudo: { palavras: 3, frases: 0, paraHoje: 0 },
      dificeis: { palavras: 0, frases: 0, paraHoje: 0 },
      sessoes: [],
      anki: [],
      trilha: null,
    } satisfies ContagensDeConteudo
    act(() => loja.escolherConteudo({ tipo: 'trilha' }, 'en'))
    loja.conferirConteudo(semTrilha, 'en')
    expect(loja.conteudoAtual()).toEqual({ idioma: 'en', fonte: { tipo: 'trilha' } })
    /* Num idioma sem trilha no app, a conferência de sempre vale: volta para "Tudo". */
    act(() => loja.escolherConteudo({ tipo: 'trilha' }, 'xx'))
    loja.conferirConteudo(semTrilha, 'xx')
    expect(loja.conteudoAtual().fonte).toEqual({ tipo: 'tudo' })
  })
})
