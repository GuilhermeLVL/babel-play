// @vitest-environment jsdom
/**
 * A BIBLIOTECA DO QUEST (maquete aprovada em 01/10/2026, tela 9): páginas no lugar de rolagem, uma
 * gravação selecionada por vez e as ações dela na faixa de baixo.
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
  }
  const tela = render(<BibliotecaDoQuest gravacoes={gravacoes} ordem="recentes" {...acoes} {...extra} />)
  const linhas = () => [...tela.container.querySelectorAll<HTMLButtonElement>('.q-linha')]
  const titulos = () => linhas().map((l) => l.querySelector('b')?.textContent)
  const selecionadas = () => linhas().filter((l) => l.getAttribute('aria-pressed') === 'true')
  const botao = (nome: RegExp) => screen.getByRole('button', { name: nome }) as HTMLButtonElement
  return { ...tela, acoes, linhas, titulos, selecionadas, botao }
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

  it('uma gravação selecionada por vez: a primeira da página, até a pessoa escolher outra', () => {
    const { linhas, selecionadas, botao } = montar(seis)
    expect(selecionadas().map((l) => l.querySelector('b')?.textContent)).toEqual(['Sessão a'])

    fireEvent.click(linhas()[2])
    expect(selecionadas().map((l) => l.querySelector('b')?.textContent)).toEqual(['Sessão c'])

    // Trocar de página leva a seleção para a primeira linha da página nova.
    fireEvent.click(botao(/Próxima/))
    expect(selecionadas().map((l) => l.querySelector('b')?.textContent)).toEqual(['Sessão e'])
  })

  it('cada ação da faixa entrega a gravação SELECIONADA, e só "Abrir" é o botão principal', () => {
    const { container, linhas, acoes, botao } = montar(seis)
    fireEvent.click(linhas()[1])
    fireEvent.click(botao(/^Abrir$/))
    fireEvent.click(botao(/Jogar com esta/))
    fireEvent.click(botao(/Revisar palavras/))
    expect(acoes.aoAbrir.mock.calls.map(([g]) => g.id)).toEqual(['b'])
    expect(acoes.aoJogar.mock.calls.map(([g]) => g.id)).toEqual(['b'])
    expect(acoes.aoRevisar.mock.calls.map(([g]) => g.id)).toEqual(['b'])
    expect([...container.querySelectorAll('.q-faixa .q-ctl.pri')].map((b) => b.textContent?.trim())).toEqual(['Abrir'])
  })

  it('a linha diz data, minutos e idioma, e no fim a contagem de palavras', () => {
    const { linhas } = montar([gravacao('a', { wordCount: 1 }), gravacao('b', { durationStr: '-', idioma: undefined })])
    expect(linhas()[0].querySelector('small')?.textContent).toBe('Ontem · 38 min · inglês')
    expect(linhas()[0].querySelector('.q-fim')?.textContent).toBe('1 palavra')
    expect(linhas()[1].querySelector('small')?.textContent).toBe('Ontem')
    expect(linhas()[1].querySelector('.q-fim')?.textContent).toBe('120 palavras')
  })

  it('gravação sem texto ainda: abre, mas não oferece jogar nem revisar', () => {
    const { linhas, acoes, botao } = montar([gravacao('a', { pronta: false, wordCount: 0 })])
    expect(linhas()[0].querySelector('.q-fim')?.textContent).toBe('Sem texto ainda')
    expect(botao(/Jogar com esta/).disabled).toBe(true)
    expect(botao(/Revisar palavras/).disabled).toBe(true)
    fireEvent.click(botao(/^Abrir$/))
    expect(acoes.aoAbrir).toHaveBeenCalledTimes(1)
  })

  it('o chip da ordem passa para a próxima ordem e volta à primeira página', () => {
    const { acoes, botao, titulos } = montar(seis)
    fireEvent.click(botao(/Próxima/))
    fireEvent.click(botao(/Mais recentes/))
    expect(acoes.aoTrocarOrdem).toHaveBeenCalledWith('palavras')
    expect(titulos()[0]).toBe('Sessão a')
  })

  it('"Tela completa" pede a Biblioteca de sempre', () => {
    const { acoes, botao } = montar(seis)
    fireEvent.click(botao(/Tela completa/))
    expect(acoes.aoTelaCompleta).toHaveBeenCalledTimes(1)
  })

  it('biblioteca vazia: uma frase curta e um único botão principal, que leva à captura', () => {
    const { container, acoes, botao } = montar([])
    expect(container.querySelector('.q-linha')).toBeNull()
    expect(container.querySelector('.q-faixa')).toBeNull()
    expect(screen.getByText(/Nada gravado ainda/)).toBeTruthy()
    expect(container.querySelectorAll('.q-ctl.pri')).toHaveLength(1)
    fireEvent.click(botao(/Capturar uma sessão/))
    expect(acoes.aoCapturar).toHaveBeenCalledTimes(1)
  })
})
