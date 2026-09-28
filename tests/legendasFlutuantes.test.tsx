// @vitest-environment jsdom
/**
 * LEGENDAS FLUTUANTES NO DESENHO DO PROTÓTIPO (C6), com as falas REAIS da captura: a barra
 * (travar o clique, modo, personalizar, esconder, recolher, fechar), o corpo com as últimas falas
 * e o painel de personalização, que é guardado e sobrevive a fechar e abrir.
 */
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
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

beforeEach(() => localStorage.clear())
afterEach(cleanup)

const montar = (extra: Partial<React.ComponentProps<typeof LegendasFlutuantes>> = {}) =>
  render(<LegendasFlutuantes falas={FALAS} emJanela={false} aoFechar={vi.fn()} {...extra} />)

describe('Legendas flutuantes (C6)', () => {
  it('modo vídeo com histórico mostra as DUAS últimas falas, com a tradução', () => {
    montar()
    expect(screen.queryByText('First line.')).toBeNull()
    expect(screen.getByText('Second line.')).toBeTruthy()
    expect(screen.getByText('Third line.')).toBeTruthy()
    expect(screen.getByText('Terceira linha.')).toBeTruthy()
  })

  it('mesmo idioma (tradução vazia): UMA linha só, sem linha de tradução nem marcador', () => {
    const { container } = montar({
      falas: [{ id: '9', quem: 'Outros', original: 'Alguns cruzeiros mostram Berlim.', traducao: '', lado: 'eles' }],
    })
    expect(screen.getByText('Alguns cruzeiros mostram Berlim.')).toBeTruthy()
    expect(container.querySelectorAll('.leg-t')).toHaveLength(0)
  })

  it('sem fala ainda: "Esperando a primeira fala"', () => {
    montar({ falas: [] })
    expect(screen.getByText('Esperando a primeira fala')).toBeTruthy()
  })

  it('modo conversa mostra quem fala e só a última', () => {
    montar()
    fireEvent.change(screen.getByRole('combobox', { name: 'Modo da janela' }), { target: { value: 'conversa' } })
    expect(screen.queryByText('Second line.')).toBeNull()
    expect(screen.getByText('Você')).toBeTruthy()
    expect(document.querySelector('.leg-fala.b')).toBeTruthy()
  })

  it('esconder, recolher e fechar', () => {
    const aoFechar = vi.fn()
    montar({ aoFechar })
    fireEvent.click(screen.getByRole('button', { name: 'Esconder a legenda' }))
    expect(screen.getByText('Legenda escondida')).toBeTruthy()
    fireEvent.click(screen.getByRole('button', { name: 'Recolher' }))
    expect(document.querySelector('.leg-corpo')).toBeNull()
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
    expect((screen.getByRole('combobox', { name: 'Modo da janela' }) as HTMLSelectElement).value).toBe('jogo')
    fireEvent.click(screen.getByRole('button', { name: 'Personalizar' }))
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
