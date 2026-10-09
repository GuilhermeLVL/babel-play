// @vitest-environment jsdom
/**
 * A BIBLIOTECA DO QUEST (maquete aprovada em 01/10/2026, tela 9; refeita em 02/10/2026): páginas no
 * lugar de rolagem, uma gravação selecionada por vez e, ao lado, o painel dela com as ações.
 */
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import React from 'react'
import { afterEach, describe, expect, it, vi } from 'vitest'

import BibliotecaDoQuest from '../src/components/views/biblioteca/quest/BibliotecaDoQuest'
import type { Recording } from '../src/types'

const gravacao = (id: string, extra: Partial<Recording> = {}): Recording => ({
  id,
  title: `Sessão ${id}`,
  date: 'Ontem',
  durationStr: '38:10',
  wordCount: 120,
  type: 'audio',
  tags: [],
  status: 'Processado',
  idioma: 'en',
  ...extra,
})

const seis = ['a', 'b', 'c', 'd', 'e', 'f'].map((id) => gravacao(id))

function montar(gravacoes: Recording[], extra: Partial<React.ComponentProps<typeof BibliotecaDoQuest>> = {}) {
  const acoes = {
    aoTrocarOrdem: vi.fn(),
    aoAbrir: vi.fn(),
    aoJogar: vi.fn(),
    aoRevisar: vi.fn(),
    aoCapturar: vi.fn(),
    aoTelaCompleta: vi.fn(),
    aoImportar: vi.fn(),
    aoFixar: vi.fn(),
    aoRenomear: vi.fn(),
    aoExcluir: vi.fn(),
  }
  const tela = render(<BibliotecaDoQuest gravacoes={gravacoes} ordem="recentes" {...acoes} {...extra} />)
  // As linhas das GRAVAÇÕES: o convite de capturar outra é uma linha, mas não é uma gravação.
  const linhas = () => [...tela.container.querySelectorAll<HTMLButtonElement>('.q-linha[aria-pressed]')]
  const titulos = () => linhas().map((l) => l.querySelector('b')?.textContent)
  const selecionadas = () => linhas().filter((l) => l.getAttribute('aria-pressed') === 'true')
  const botao = (nome: RegExp) => screen.getByRole('button', { name: nome }) as HTMLButtonElement
  const painel = () => tela.container.querySelector('.q-bib-det') as HTMLElement
  return { ...tela, acoes, linhas, titulos, selecionadas, botao, painel }
}

afterEach(cleanup)

describe('BibliotecaDoQuest', () => {
  it('mostra quatro gravações por página, com Anterior e Próxima desligados nas pontas', () => {
    const { titulos, botao } = montar(seis)
    expect(titulos()).toEqual(['Sessão a', 'Sessão b', 'Sessão c', 'Sessão d'])
    expect(botao(/Anterior/).disabled).toBe(true)
    expect(botao(/Próxima/).disabled).toBe(false)
    expect(screen.getByText('1 / 2')).toBeTruthy()

    fireEvent.click(botao(/Próxima/))
    expect(titulos()).toEqual(['Sessão e', 'Sessão f'])
    expect(botao(/Próxima/).disabled).toBe(true)
    expect(botao(/Anterior/).disabled).toBe(false)

    fireEvent.click(botao(/Anterior/))
    expect(titulos()[0]).toBe('Sessão a')
  })

  it('cada ação do painel entrega a gravação SELECIONADA, e só "Abrir" é o botão principal', () => {
    const { container, linhas, acoes, botao } = montar(seis)
    fireEvent.click(linhas()[1])
    fireEvent.click(botao(/^Abrir$/))
    fireEvent.click(botao(/Jogar com esta/))
    fireEvent.click(botao(/Revisar palavras/))
    fireEvent.click(botao(/Fixar no topo/))
    fireEvent.click(botao(/Renomear/))
    fireEvent.click(botao(/Excluir/))
    for (const acao of ['aoAbrir', 'aoJogar', 'aoRevisar', 'aoFixar', 'aoRenomear', 'aoExcluir'] as const)
      expect(
        acoes[acao].mock.calls.map(([g]) => g.id),
        acao,
      ).toEqual(['b'])
    expect([...container.querySelectorAll('.q-ctl.pri')].map((b) => b.textContent?.trim())).toEqual(['Abrir'])
  })

  it('gravação fixada: o botão passa a desafixar', () => {
    const { botao } = montar([gravacao('a', { pinned: true })])
    expect(botao(/Desafixar/)).toBeTruthy()
    expect(screen.queryByRole('button', { name: /Fixar no topo/ })).toBeNull()
  })

  it('o cabeçalho soma a biblioteca inteira: gravações, minutos e palavras', () => {
    const { container } = montar(seis)
    expect(container.querySelector('.q-sobre')?.textContent).toBe('6 gravações · 229 min · 720 palavras')
  })

  it('gravação sem texto ainda: abre, mas não oferece jogar nem revisar', () => {
    const { linhas, acoes, botao } = montar([gravacao('a', { pronta: false, wordCount: 0 })])
    expect(linhas()[0].querySelector('.q-fim')?.textContent).toBe('Sem texto ainda')
    expect(botao(/Jogar com esta/).disabled).toBe(true)
    expect(botao(/Revisar palavras/).disabled).toBe(true)
    fireEvent.click(botao(/^Abrir$/))
    expect(acoes.aoAbrir).toHaveBeenCalledTimes(1)
  })

  it('sobra linha na última página: o convite de capturar outra ocupa o lugar', () => {
    const { acoes, botao } = montar(seis.slice(0, 2))
    fireEvent.click(botao(/Capturar outra sessão/))
    expect(acoes.aoCapturar).toHaveBeenCalledTimes(1)
  })

  it('o chip da ordem passa para a próxima ordem e volta à primeira página', () => {
    const { acoes, botao, titulos } = montar(seis)
    fireEvent.click(botao(/Próxima/))
    fireEvent.click(botao(/Mais recentes/))
    expect(acoes.aoTrocarOrdem).toHaveBeenCalledWith('palavras')
    expect(titulos()[0]).toBe('Sessão a')
  })

  it('no headset (sem as props do computador): nada de busca, exportar, retomar nem duplo clique', () => {
    const { container, linhas, acoes } = montar(seis)
    expect(container.querySelector('.q-bib-busca')).toBeNull()
    expect(container.querySelector('.q-bib-levar')).toBeNull()
    expect(screen.queryByRole('button', { name: /Exportar transcrição/ })).toBeNull()
    expect(screen.queryByRole('button', { name: /Retomar captura/ })).toBeNull()
    fireEvent.doubleClick(linhas()[1])
    expect(acoes.aoAbrir).not.toHaveBeenCalled()
  })

  it('no computador: o duplo clique numa linha abre a gravação; o clique simples só seleciona', () => {
    const { linhas, acoes, selecionadas } = montar(seis, { duploCliqueAbre: true })
    fireEvent.click(linhas()[2])
    expect(acoes.aoAbrir).not.toHaveBeenCalled()
    expect(selecionadas().map((l) => l.querySelector('b')?.textContent)).toEqual(['Sessão c'])
    fireEvent.doubleClick(linhas()[2])
    expect(acoes.aoAbrir.mock.calls.map(([g]) => g.id)).toEqual(['c'])
  })
})
