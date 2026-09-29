// @vitest-environment jsdom
/**
 * LEGENDAS FLUTUANTES NO DESENHO DO PROTÓTIPO (C6), com as falas REAIS da captura: a barra enxuta
 * (pausar, leitura, tradução, personalizar, fechar; o título recolhe), o corpo com as últimas falas
 * e o painel de personalização (modo, predefinições, esconder…), guardado entre aberturas. O ritmo,
 * o histórico, o teclado e o cartão da palavra estão em `legendasRitmo.test.tsx`.
 */
import { cleanup, fireEvent, render, screen, within } from '@testing-library/react'
import React from 'react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('../src/data/api', () => ({
  fetchSettings: vi.fn(async () => null),
  patchUiSettings: vi.fn(async () => {}),
}))

import LegendasFlutuantes, { type LegendaAoVivo } from '../src/components/views/captura/LegendasFlutuantes'

const FALAS: LegendaAoVivo[] = [
  { id: '1', quem: 'Outros', original: 'First line.', traducao: 'Primeira linha.', lado: 'eles' },
  { id: '2', quem: 'Outros', original: 'Second line.', traducao: 'Segunda linha.', lado: 'eles' },
  { id: '3', quem: 'Você', original: 'Third line.', traducao: 'Terceira linha.', lado: 'voce' },
]

/** O original vem em pedaços tocáveis (uma `span` por palavra): confere o texto da linha inteira. */
const falaVisivel = (texto: string) => [...document.querySelectorAll('.leg-o')].some((e) => e.textContent === texto)

beforeEach(() => localStorage.clear())
afterEach(cleanup)

const montar = (extra: Partial<React.ComponentProps<typeof LegendasFlutuantes>> = {}) =>
  render(<LegendasFlutuantes falas={FALAS} emJanela={false} aoFechar={vi.fn()} {...extra} />)

describe('Legendas flutuantes (C6)', () => {
  it('por padrão, as TRÊS últimas falas à vista, com a tradução; a atual em foco e as anteriores esmaecidas', () => {
    montar()
    expect(falaVisivel('First line.')).toBe(true)
    expect(falaVisivel('Third line.')).toBe(true)
    expect(screen.getByText('Terceira linha.')).toBeTruthy()
    expect(document.querySelector('.leg-fala.atual')?.textContent).toContain('Third line.')
    expect(document.querySelectorAll('.leg-fala.anterior')).toHaveLength(2)
  })

  it('mesmo idioma (tradução vazia): UMA linha só, sem linha de tradução nem marcador', () => {
    const { container } = montar({
      falas: [{ id: '9', quem: 'Outros', original: 'Alguns cruzeiros mostram Berlim.', traducao: '', lado: 'eles' }],
    })
    expect(container.querySelector('.leg-o')?.textContent).toBe('Alguns cruzeiros mostram Berlim.')
    expect(container.querySelectorAll('.leg-t')).toHaveLength(0)
  })

  it('sem fala ainda: "Esperando a primeira fala"', () => {
    montar({ falas: [] })
    expect(screen.getByText('Esperando a primeira fala')).toBeTruthy()
  })

  it('modo conversa (no Personalizar) mostra quem fala', () => {
    montar()
    fireEvent.click(screen.getByRole('button', { name: 'Personalizar' }))
    fireEvent.change(screen.getByRole('combobox', { name: 'Modo da janela' }), { target: { value: 'conversa' } })
    expect(screen.getByText('Você')).toBeTruthy()
    expect(document.querySelector('.leg-fala.b')).toBeTruthy()
  })

  it('a barra enxuta: pausar, leitura, tradução, personalizar e fechar — o resto no Personalizar', () => {
    montar()
    const barra = document.querySelector('.leg-barra') as HTMLElement
    for (const nome of ['Pausar legendas', 'Personalizar', 'Fechar as legendas flutuantes'])
      expect(within(barra).getByRole('button', { name: nome })).toBeTruthy()
    expect(within(barra).getByRole('combobox', { name: 'Ritmo de leitura' })).toBeTruthy()
    expect(within(barra).getByRole('combobox', { name: 'Tradução' })).toBeTruthy()
    expect(within(barra).queryByRole('combobox', { name: 'Modo da janela' })).toBeNull()
    expect(within(barra).queryByRole('button', { name: 'Esconder a legenda' })).toBeNull()
  })

  it('esconder (no Personalizar), recolher (pelo título) e fechar', () => {
    const aoFechar = vi.fn()
    montar({ aoFechar })
    fireEvent.click(screen.getByRole('button', { name: 'Personalizar' }))
    fireEvent.click(screen.getByRole('switch', { name: 'Esconder a legenda' }))
    expect(screen.getByText('Legenda escondida')).toBeTruthy()
    fireEvent.click(screen.getByRole('button', { name: 'Recolher' }))
    expect(document.querySelector('.leg-corpo')).toBeNull()
    expect(screen.getByRole('button', { name: 'Expandir' }).getAttribute('aria-expanded')).toBe('false')
    fireEvent.click(screen.getByRole('button', { name: 'Fechar as legendas flutuantes' }))
    expect(aoFechar).toHaveBeenCalledTimes(1)
  })

  it('travar o clique deixa o corpo passar o clique; na janela sempre-no-topo o cadeado não existe', () => {
    montar()
    fireEvent.click(screen.getByRole('button', { name: 'Deixar o clique passar pela janela' }))
    expect(document.querySelector('.leg-flut.travado')).toBeTruthy()
    expect((document.querySelector('.leg-corpo') as HTMLElement).style.pointerEvents).toBe('none')
    cleanup()
    montar({ emJanela: true })
    expect(screen.queryByRole('button', { name: 'Deixar o clique passar pela janela' })).toBeNull()
  })

  it('Imersão esconde a tradução; a predefinição Conversa troca modo e tamanho', () => {
    montar()
    fireEvent.click(screen.getByRole('button', { name: 'Personalizar' }))
    fireEvent.click(screen.getByRole('button', { name: 'Imersão' }))
    expect(screen.queryByText('Terceira linha.')).toBeNull()
    fireEvent.click(screen.getByRole('button', { name: 'Conversa' }))
    expect((screen.getByRole('combobox', { name: 'Modo da janela' }) as HTMLSelectElement).value).toBe('conversa')
    expect(screen.getByText('Tamanho · 110%')).toBeTruthy()
  })

  it('a aparência é guardada e volta na próxima abertura; "Meu perfil" guarda e reaplica', () => {
    montar()
    fireEvent.click(screen.getByRole('button', { name: 'Personalizar' }))
    fireEvent.click(screen.getByRole('radio', { name: 'Sempre visível' }))
    fireEvent.click(screen.getByRole('button', { name: 'Salvar como “Meu perfil”' }))
    fireEvent.click(screen.getByRole('button', { name: 'Jogo' }))
    cleanup()
    montar()
    fireEvent.click(screen.getByRole('button', { name: 'Personalizar' }))
    expect((screen.getByRole('combobox', { name: 'Modo da janela' }) as HTMLSelectElement).value).toBe('jogo')
    fireEvent.click(screen.getByRole('button', { name: 'Meu perfil' }))
    expect((screen.getByRole('combobox', { name: 'Modo da janela' }) as HTMLSelectElement).value).toBe('video')
    expect(screen.getByRole('radio', { name: 'Sempre visível' }).getAttribute('aria-checked')).toBe('true')
  })

  describe('"Mostrar tradução" (Tradução: Só quando eu pedir / Só frases com palavra nova)', () => {
    const SOB_DEMANDA: LegendaAoVivo[] = [
      { id: 'a', quem: 'Outros', original: 'Already known.', traducao: 'Já sabida.', lado: 'eles' },
      { id: 'b', quem: 'Outros', original: 'Left untranslated.', traducao: '', lado: 'eles', sobDemanda: true },
    ]

    it('a fala deixada sem tradução ganha o botão, que chama revelarTraducao UMA vez com o id', () => {
      const aoRevelarTraducao = vi.fn()
      montar({ falas: SOB_DEMANDA, aoRevelarTraducao })
      const botoes = screen.getAllByRole('button', { name: 'Mostrar tradução' })
      expect(botoes).toHaveLength(1)
      fireEvent.click(botoes[0])
      expect(aoRevelarTraducao).toHaveBeenCalledOnce()
      expect(aoRevelarTraducao).toHaveBeenCalledWith('b')
    })

    it('sem o callback, ou em Imersão (tradução oculta), nenhum botão', () => {
      montar({ falas: SOB_DEMANDA })
      expect(screen.queryByRole('button', { name: 'Mostrar tradução' })).toBeNull()
      cleanup()
      montar({ falas: SOB_DEMANDA, aoRevelarTraducao: vi.fn() })
      fireEvent.click(screen.getByRole('button', { name: 'Personalizar' }))
      fireEvent.click(screen.getByRole('button', { name: 'Imersão' }))
      expect(screen.queryByRole('button', { name: 'Mostrar tradução' })).toBeNull()
    })

    it('fala de mesmo idioma (tradução vazia, sem sobDemanda) continua numa linha só', () => {
      montar({ falas: [FALAS[0], { ...FALAS[1], traducao: '' }], aoRevelarTraducao: vi.fn() })
      expect(screen.queryByRole('button', { name: 'Mostrar tradução' })).toBeNull()
    })
  })
})
