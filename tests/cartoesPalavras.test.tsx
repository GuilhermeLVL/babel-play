// @vitest-environment jsdom
/**
 * A ABA "PALAVRAS" DOS CARTÕES (`views/cartoes/Palavras.tsx`), porte de `ctPalavras` do protótipo enxuto:
 *   · a busca presa no alto, os estados numa linha com "Difíceis" em segundo, e "Filtros" com a ordem e o
 *     que está fora da revisão; sem filtro de idioma, de sessão nem de baralho (quem manda é a ficha);
 *   · a lista só tem os cartões do conteúdo escolhido, e as contagens de cada estado são as dele;
 *   · a seleção em massa suspende de verdade, com "Desfazer", e "Praticar" leva os ids à folha das práticas.
 */
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import React from 'react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import type { VocabCard } from '../src/types'

const api = vi.hoisted(() => ({ atualizar: null as unknown as ReturnType<(typeof import('vitest'))['vi']['fn']> }))
vi.mock('../src/data/api', () => {
  api.atualizar = vi.fn(async (id: string, patch: { inDeck?: boolean }) => ({ ...porId.get(id)!, ...patch }))
  return { updateCard: api.atualizar }
})

import Palavras from '../src/components/views/cartoes/Palavras'
import type { Conteudo } from '../src/lib/conteudo/estado'

const AGORA = Date.now()
const DIA = 86_400_000
const c = (id: string, o: Partial<VocabCard> & { lapses?: number } = {}): VocabCard =>
  ({
    id,
    word: id,
    translation: `tradução de ${id}`,
    sentence: `A frase de ${id}.`,
    srcLang: 'en',
    inDeck: true,
    fsrsState: 'Review',
    dueAtMs: AGORA + 3 * DIA,
    createdAtMs: AGORA - 10 * DIA,
    ...o,
  }) as VocabCard

const BARALHO: VocabCard[] = [
  c('ship', { sourceSessionId: 's1', dueAtMs: AGORA - DIA }),
  c('though', { sourceSessionId: 's1', dueAtMs: AGORA - 2 * DIA, lapses: 9 }),
  c('roadmap', { sourceSessionId: 's1', fsrsState: 'New', dueAtMs: null }),
  c('nap', { sourceSessionId: 's2', fsrsState: 'Learning', dueAtMs: AGORA + DIA }),
  c('put off', { daAnki: true, baralhosAnki: ['dA'] }),
  c('loading', { sourceSessionId: 's1', inDeck: false }),
  c('tarea', { srcLang: 'es' }),
]
const porId = new Map(BARALHO.map((x) => [x.id, x]))

const TUDO: Conteudo = { idioma: 'en', fonte: { tipo: 'tudo' } }
const montar = (extra: Partial<React.ComponentProps<typeof Palavras>> = {}) => {
  const p = { aoAbrir: vi.fn(), aoPraticar: vi.fn(), aoExportar: vi.fn(), aoMudar: vi.fn() }
  render(
    <Palavras
      cartoes={BARALHO}
      carregando={false}
      conteudo={TUDO}
      rotuloDoConteudo="Tudo em inglês"
      sessoes={[{ id: 's1', title: 'Reunião de produto' } as never]}
      {...p}
      {...extra}
    />,
  )
  return p
}
const palavras = () => [...document.querySelectorAll('tbody tr')].map((tr) => tr.getAttribute('data-palavra'))
const estado = (nome: RegExp) => within(screen.getByRole('radiogroup', { name: 'Estado do cartão' })).getByRole('radio', { name: nome })

beforeEach(() => localStorage.clear())
afterEach(() => {
  cleanup()
  vi.clearAllMocks()
})

describe('a lista', () => {
  it('a busca fica presa no alto, com "Filtros" e "Selecionar"; os estados numa linha, "Difíceis" em segundo', () => {
    montar()
    const fixa = document.querySelector('.ct-busca-fixa')!
    expect(fixa.querySelector('input[type="search"]')).toBeTruthy()
    expect([...fixa.querySelectorAll('button')].map((b) => b.textContent)).toEqual(['Filtros', 'Selecionar'])
    const estados = within(screen.getByRole('radiogroup', { name: 'Estado do cartão' })).getAllByRole('radio')
    /* As contagens são as do conteúdo (inglês): a palavra em espanhol e a suspensa não entram em "Todas". */
    expect(estados.map((b) => b.textContent)).toEqual([
      'Todas 5',
      'Difíceis 1',
      'Vencem hoje 2',
      'Novas 1',
      'Aprendendo 1',
      'Em revisão 3',
    ])
    expect(document.querySelector('.qv-quantas')?.textContent).toBe('5 de 5 · Tudo em inglês')
    /* Quem manda no conteúdo é a ficha: não há filtro de idioma, de sessão nem de baralho. */
    expect(screen.queryByRole('group', { name: /Idioma|Origem|Nível|Baralho|Sessão/ })).toBeNull()
    expect(document.querySelector('select')).toBeNull()
  })

  it('a ordem padrão é "volta primeiro"; a linha diz a origem, quando volta, o estado e marca a difícil', () => {
    montar()
    expect(palavras()).toEqual(['though', 'ship', 'nap', 'put off', 'roadmap'])
    const though = document.querySelector('tr[data-palavra="though"]')!
    expect(though.querySelector('.ct-marca.dif')?.getAttribute('title')).toBe('Difícil: errada 9 vezes')
    expect(though.querySelector('.ct-origem-da-linha')?.textContent).toBe('Reunião de produto')
    expect(though.querySelector('.ct-volta')?.textContent).toBe('hoje')
    expect(document.querySelector('tr[data-palavra="roadmap"] .ct-volta')?.textContent).toBe('—')
    expect(document.querySelector('tr[data-palavra="roadmap"] .qv-estado')?.textContent).toBe('Nova')
    expect(document.querySelector('tr[data-palavra="put off"] .ct-origem-da-linha')?.textContent).toBe('Anki')
    expect(document.querySelector('tr[data-palavra="ship"] .ct-marca')).toBeNull()
  })

  it('os estados e a busca recortam a lista; "Difíceis" usa a régua de 8 erros', () => {
    const { aoAbrir } = montar()
    fireEvent.click(estado(/^Difíceis/))
    expect(palavras()).toEqual(['though'])
    fireEvent.click(estado(/^Vencem hoje/))
    expect(palavras()).toEqual(['though', 'ship'])
    fireEvent.click(estado(/^Todas/))
    fireEvent.change(screen.getByPlaceholderText('Buscar palavra ou frase'), { target: { value: 'frase de nap' } })
    expect(palavras()).toEqual(['nap'])
    fireEvent.click(document.querySelector('tr[data-palavra="nap"]')!)
    expect(aoAbrir).toHaveBeenCalledWith('nap')
    fireEvent.change(screen.getByPlaceholderText('Buscar palavra ou frase'), { target: { value: 'zzz' } })
    expect(screen.getByText('Nada com esses filtros')).toBeTruthy()
    fireEvent.click(screen.getByRole('button', { name: /Limpar filtros/ }))
    expect(palavras()).toHaveLength(5)
  })

  it('"Filtros": a ordem e o que está fora da revisão, com a conta dos ligados no botão', () => {
    montar()
    const filtros = screen.getByRole('button', { name: /Filtros/ })
    expect(filtros.getAttribute('aria-expanded')).toBe('false')
    fireEvent.click(filtros)
    const ordenar = within(screen.getByRole('group', { name: 'Ordenar' }))
    expect(ordenar.getAllByRole('button').map((b) => b.textContent)).toEqual([
      'Volta primeiro',
      'Mais recentes',
      'A–Z',
      'Mais erradas',
    ])
    fireEvent.click(ordenar.getByRole('button', { name: 'A–Z' }))
    expect(palavras()).toEqual(['nap', 'put off', 'roadmap', 'ship', 'though'])
    fireEvent.click(ordenar.getByRole('button', { name: 'Mais erradas' }))
    expect(palavras()[0]).toBe('though')
    fireEvent.click(within(screen.getByRole('group', { name: 'Fora da revisão' })).getByRole('button', { name: /Suspensas/ }))
    expect(palavras()).toEqual(['loading'])
    expect(document.querySelector('tr[data-palavra="loading"] .qv-estado')?.textContent).toBe('Suspensa')
    expect(screen.getByRole('button', { name: /Filtros/ }).querySelector('.q-tag')?.textContent).toBe('2')
    /* O app não tem etiquetas nem bandeira: os grupos do protótipo não viram filtro. */
    expect(screen.queryByRole('group', { name: 'Etiqueta' })).toBeNull()
    expect(screen.queryByRole('button', { name: /Com bandeira/ })).toBeNull()
  })

  it('com uma sessão na ficha, a lista e as contagens são só dela', () => {
    montar({ conteudo: { idioma: 'en', fonte: { tipo: 'sessao', id: 's1', nome: 'Reunião de produto' } }, rotuloDoConteudo: 'Reunião de produto' })
    expect(palavras()).toEqual(['though', 'ship', 'roadmap'])
    expect(estado(/^Todas/).textContent).toBe('Todas 3')
    expect(document.querySelector('.qv-quantas')?.textContent).toBe('3 de 3 · Reunião de produto')
  })
})

describe('a seleção em massa', () => {
  const selecionar = (...nomes: string[]) => {
    fireEvent.click(screen.getByRole('button', { name: 'Selecionar várias' }))
    for (const n of nomes) fireEvent.click(document.querySelector(`tr[data-palavra="${n}"]`)!)
    return within(screen.getByRole('toolbar', { name: 'Ações para as selecionadas' }))
  }

  it('a linha marca em vez de abrir; "Praticar" leva os ids à folha das práticas', () => {
    const { aoAbrir, aoPraticar } = montar()
    const faixa = selecionar('ship', 'nap')
    expect(aoAbrir).not.toHaveBeenCalled()
    expect(document.querySelector('.ct-faixa-sel .q-tempo')?.textContent?.replace(/\s+/g, ' ')).toBe('2 selecionadas')
    expect(document.querySelectorAll('tr[data-marcada]')).toHaveLength(2)
    /* Em massa ficam as ações que o app cumpre: sem "Mover para Difíceis" nem "Etiquetar". */
    expect(faixa.getAllByRole('button').map((b) => b.textContent?.trim())).toEqual(['Suspender', 'Praticar', 'Exportar', 'Cancelar'])
    fireEvent.click(faixa.getByRole('button', { name: /Praticar/ }))
    expect(aoPraticar).toHaveBeenCalledWith(['ship', 'nap'], '2 palavras selecionadas')
  })

  it('"Suspender" grava no servidor, sai da seleção e deixa o "Desfazer", que devolve as palavras à revisão', async () => {
    const { aoMudar } = montar()
    fireEvent.click(selecionar('ship', 'nap').getByRole('button', { name: /Suspender/ }))
    await waitFor(() => expect(api.atualizar).toHaveBeenCalledTimes(2))
    expect(api.atualizar).toHaveBeenCalledWith('ship', { inDeck: false })
    const aviso = await waitFor(() => screen.getByRole('status'))
    expect(aviso.textContent).toContain('2 suspensas')
    expect(aoMudar).toHaveBeenLastCalledWith([expect.objectContaining({ id: 'ship', inDeck: false }), expect.objectContaining({ id: 'nap', inDeck: false })])
    expect(screen.queryByRole('toolbar', { name: 'Ações para as selecionadas' })).toBeNull()
    fireEvent.click(within(aviso).getByRole('button', { name: /Desfazer/ }))
    await waitFor(() => expect(api.atualizar).toHaveBeenCalledWith('nap', { inDeck: true }))
    await waitFor(() => expect(screen.queryByRole('status')).toBeNull())
    expect(aoMudar).toHaveBeenLastCalledWith([expect.objectContaining({ id: 'ship', inDeck: true }), expect.objectContaining({ id: 'nap', inDeck: true })])
  })

  it('"Exportar" entrega as selecionadas; "Cancelar" limpa a seleção', () => {
    const { aoExportar } = montar()
    const faixa = selecionar('though')
    fireEvent.click(faixa.getByRole('button', { name: /Exportar/ }))
    expect(aoExportar).toHaveBeenCalledWith([expect.objectContaining({ id: 'though' })])
    fireEvent.click(faixa.getByRole('button', { name: 'Cancelar a seleção' }))
    expect(document.querySelector('.ct-faixa-sel')).toBeNull()
    expect(document.querySelectorAll('tr[data-marcada]')).toHaveLength(0)
  })
})
