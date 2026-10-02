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

  it('cabe numa página: não há botões de página', () => {
    montar(seis.slice(0, 3))
    expect(screen.queryByRole('button', { name: /Anterior/ })).toBeNull()
    expect(screen.queryByRole('button', { name: /Próxima/ })).toBeNull()
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

  it('o painel diz o que a selecionada é: tipo, título, palavras, duração, idioma e data', () => {
    const { linhas, painel } = montar([gravacao('a'), gravacao('b', { type: 'document', durationStr: '-', pinned: true })])
    expect(painel().querySelector('h2')?.textContent).toBe('Sessão a')
    expect([...painel().querySelectorAll('.q-tag')].map((e) => e.textContent)).toEqual(['Áudio'])
    expect([...painel().querySelectorAll('dd')].map((e) => e.textContent)).toEqual(['120', '38 min', 'inglês', 'Ontem'])

    fireEvent.click(linhas()[1])
    expect(painel().querySelector('h2')?.textContent).toBe('Sessão b')
    expect([...painel().querySelectorAll('.q-tag')].map((e) => e.textContent)).toEqual(['Texto', 'Fixada'])
    expect(painel().querySelectorAll('dd')[1].textContent).toBe('—')
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
      expect(acoes[acao].mock.calls.map(([g]) => g.id), acao).toEqual(['b'])
    expect([...container.querySelectorAll('.q-ctl.pri')].map((b) => b.textContent?.trim())).toEqual(['Abrir'])
  })

  it('gravação fixada: o botão passa a desafixar', () => {
    const { botao } = montar([gravacao('a', { pinned: true })])
    expect(botao(/Desafixar/)).toBeTruthy()
    expect(screen.queryByRole('button', { name: /Fixar no topo/ })).toBeNull()
  })

  it('a linha diz data, minutos e idioma, e no fim a contagem de palavras', () => {
    const { linhas } = montar([gravacao('a', { wordCount: 1 }), gravacao('b', { durationStr: '-', idioma: undefined })])
    expect(linhas()[0].querySelector('small')?.textContent).toBe('Ontem · 38 min · inglês')
    expect(linhas()[0].querySelector('.q-fim')?.textContent).toBe('1 palavra')
    expect(linhas()[1].querySelector('small')?.textContent).toBe('Ontem')
    expect(linhas()[1].querySelector('.q-fim')?.textContent).toBe('120 palavras')
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

  it('com mais de um tipo, as abas filtram a lista e voltam à primeira página', () => {
    const mistas = [...seis, gravacao('v', { type: 'video' }), gravacao('t', { type: 'document' })]
    const { titulos, botao } = montar(mistas)
    expect(botao(/^Todas/).getAttribute('aria-pressed')).toBe('true')
    expect(botao(/^Áudio/).textContent).toContain('6')

    fireEvent.click(botao(/Próxima/))
    fireEvent.click(botao(/^Vídeo/))
    expect(titulos()).toEqual(['Sessão v'])
    expect(botao(/^Vídeo/).getAttribute('aria-pressed')).toBe('true')

    fireEvent.click(botao(/^Todas/))
    expect(titulos()).toHaveLength(4)
  })

  it('com um tipo só, não há abas de tipo', () => {
    const { container } = montar(seis)
    expect(container.querySelector('.q-abas')).toBeNull()
  })

  it('o tipo filtrado esvaziou (a última dele foi excluída): a lista volta a mostrar todas', () => {
    const { titulos, botao, rerender, acoes } = montar([gravacao('a'), gravacao('v', { type: 'video' })])
    fireEvent.click(botao(/^Vídeo/))
    expect(titulos()).toEqual(['Sessão v'])
    rerender(<BibliotecaDoQuest gravacoes={[gravacao('a')]} ordem="recentes" {...acoes} />)
    expect(titulos()).toEqual(['Sessão a'])
  })

  it('sobra linha na última página: o convite de capturar outra ocupa o lugar', () => {
    const { acoes, botao } = montar(seis.slice(0, 2))
    fireEvent.click(botao(/Capturar outra sessão/))
    expect(acoes.aoCapturar).toHaveBeenCalledTimes(1)
  })

  it('página cheia: sem convite', () => {
    montar(seis)
    expect(screen.queryByRole('button', { name: /Capturar outra sessão/ })).toBeNull()
  })

  it('o chip da ordem passa para a próxima ordem e volta à primeira página', () => {
    const { acoes, botao, titulos } = montar(seis)
    fireEvent.click(botao(/Próxima/))
    fireEvent.click(botao(/Mais recentes/))
    expect(acoes.aoTrocarOrdem).toHaveBeenCalledWith('palavras')
    expect(titulos()[0]).toBe('Sessão a')
  })

  it('"Importar" e "Tela completa" pedem a Biblioteca de sempre', () => {
    const { acoes, botao } = montar(seis)
    fireEvent.click(botao(/Tela completa/))
    expect(acoes.aoTelaCompleta).toHaveBeenCalledTimes(1)
    fireEvent.click(botao(/Importar/))
    expect(acoes.aoImportar).toHaveBeenCalledTimes(1)
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

  it('no computador: "Exportar transcrição" e "Retomar captura" (só áudio) entregam a selecionada', () => {
    const aoExportar = vi.fn()
    const aoRetomar = vi.fn()
    const { container, linhas, botao } = montar([gravacao('a'), gravacao('t', { type: 'document', durationStr: '-' })], {
      aoExportar,
      aoRetomar,
    })
    fireEvent.click(botao(/Exportar transcrição/))
    fireEvent.click(botao(/Retomar captura/))
    expect(aoExportar.mock.calls.map(([g]) => g.id)).toEqual(['a'])
    expect(aoRetomar.mock.calls.map(([g]) => g.id)).toEqual(['a'])
    // "Abrir" continua sendo o único botão principal.
    expect([...container.querySelectorAll('.q-ctl.pri')].map((b) => b.textContent?.trim())).toEqual(['Abrir'])
    expect(container.querySelector('.q-bib-det')?.classList.contains('q-bib-det-mais')).toBe(true)

    // Documento não tem captura para retomar; exportar continua.
    fireEvent.click(linhas()[1])
    expect(screen.queryByRole('button', { name: /Retomar captura/ })).toBeNull()
    fireEvent.click(botao(/Exportar transcrição/))
    expect(aoExportar.mock.calls.map(([g]) => g.id)).toEqual(['a', 't'])
  })

  it('no computador: o duplo clique numa linha abre a gravação; o clique simples só seleciona', () => {
    const { linhas, acoes, selecionadas } = montar(seis, { duploCliqueAbre: true })
    fireEvent.click(linhas()[2])
    expect(acoes.aoAbrir).not.toHaveBeenCalled()
    expect(selecionadas().map((l) => l.querySelector('b')?.textContent)).toEqual(['Sessão c'])
    fireEvent.doubleClick(linhas()[2])
    expect(acoes.aoAbrir.mock.calls.map(([g]) => g.id)).toEqual(['c'])
  })

  it('no computador: a busca por título avisa quem filtra e volta à primeira página', () => {
    const aoBuscar = vi.fn()
    const { botao, titulos } = montar(seis, { busca: '', aoBuscar })
    fireEvent.click(botao(/Próxima/))
    fireEvent.change(screen.getByRole('searchbox', { name: 'Buscar na biblioteca' }), { target: { value: 'sess' } })
    expect(aoBuscar).toHaveBeenCalledWith('sess')
    expect(titulos()[0]).toBe('Sessão a')
  })

  it('no computador: a busca que não acha nada diz isso (a biblioteca não está vazia) e limpa com um toque', () => {
    const aoBuscar = vi.fn()
    const { container, botao } = montar([], { busca: 'xyz', aoBuscar })
    expect(screen.getByTestId('busca-sem-resultado').textContent).toContain('Nenhuma gravação tem “xyz” no título.')
    expect(screen.queryByText(/Nada gravado ainda/)).toBeNull()
    // O campo continua na tela, com o que foi digitado.
    expect((screen.getByRole('searchbox') as HTMLInputElement).value).toBe('xyz')
    expect(container.querySelectorAll('.q-ctl.pri')).toHaveLength(1)
    fireEvent.click(botao(/Limpar a busca/))
    expect(aoBuscar).toHaveBeenCalledWith('')
  })

  it('biblioteca vazia: o convite ocupa o palco, com um único botão principal, que leva à captura', () => {
    const { container, acoes, botao } = montar([])
    expect(container.querySelector('.q-linha')).toBeNull()
    expect(container.querySelector('.q-bib-det')).toBeNull()
    expect(screen.getByText(/Nada gravado ainda/)).toBeTruthy()
    expect(container.querySelectorAll('.q-ctl.pri')).toHaveLength(1)
    fireEvent.click(botao(/Capturar uma sessão/))
    expect(acoes.aoCapturar).toHaveBeenCalledTimes(1)
    fireEvent.click(botao(/Importar/))
    expect(acoes.aoImportar).toHaveBeenCalledTimes(1)
  })
})
