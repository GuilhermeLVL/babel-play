// @vitest-environment jsdom
/**
 * A TELA AO VIVO DO QUEST (maquete aprovada em 01/10/2026): duas falas grandes e a chave que desliga.
 */
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import React from 'react'
import { afterEach, describe, expect, it, vi } from 'vitest'

import LegendaAoVivoDoQuest from '../src/components/views/captura/quest/LegendaAoVivoDoQuest'
import type { SpeechSegment } from '../src/lib/captura/tiposDaFala'
import {
  definirTelaNovaDoQuest,
  ESCALAS_DA_LEGENDA,
  guardarFonteDoQuest,
  lerEscalaDaLegenda,
  lerFonteDoQuest,
  mudarEscalaDaLegenda,
  telaNovaDoQuest,
} from '../src/lib/dispositivo/telaNovaDoQuest'

const fala = (id: string, original: string, traducao: string, lang?: string): SpeechSegment => ({
  id,
  speakerId: 'system',
  source: 'system',
  timestamp: '00:00',
  originalText: original,
  translatedText: traducao,
  words: [],
  ...(lang ? { lang } : {}),
})

afterEach(() => {
  cleanup()
  localStorage.clear()
})

describe('LegendaAoVivoDoQuest', () => {
  it('mostra o HISTÓRICO inteiro (só falas com texto), com a última em destaque', () => {
    const falas = [fala('a', 'one', 'um'), fala('b', 'two', 'dois'), fala('c', '', ''), fala('d', 'three', 'três')]
    const { container } = render(<LegendaAoVivoDoQuest falas={falas} escala={1} idiomaPadrao="en" aoTocar={() => {}} />)
    const linhas = [...container.querySelectorAll('.q-linha-da-fala')]
    expect(linhas.map((l) => l.querySelector('.q-t')?.textContent)).toEqual(['um', 'dois', 'três'])
    expect(linhas.map((l) => l.classList.contains('atual'))).toEqual([false, false, true])
    expect(container.querySelectorAll('.q-fala.antiga')).toHaveLength(2)
  })

  it('sem tradução ainda, o original ocupa o lugar grande (nada de linha vazia)', () => {
    const { container } = render(
      <LegendaAoVivoDoQuest falas={[fala('a', 'hello there', '')]} escala={1} idiomaPadrao="en" aoTocar={() => {}} />,
    )
    expect(container.querySelector('.q-t')?.textContent).toBe('hello there')
    expect(container.querySelector('.q-o')).toBeNull()
  })

  it('sem fala nenhuma: diz que está ouvindo', () => {
    render(<LegendaAoVivoDoQuest falas={[]} escala={1} idiomaPadrao="en" aoTocar={() => {}} />)
    expect(screen.getByText(/Ouvindo/)).toBeTruthy()
  })

  it('tocar numa fala, ou em Opções, entrega a fala e o idioma dela (o detectado, ou o do conteúdo)', () => {
    const aoTocar = vi.fn()
    const falas = [fala('a', 'hola', 'olá', 'es'), fala('b', 'bye', 'tchau')]
    const { container } = render(
      <LegendaAoVivoDoQuest falas={falas} escala={1.5} idiomaPadrao="en" aoTocar={aoTocar} />,
    )
    const botoes = container.querySelectorAll('.q-fala')
    fireEvent.click(botoes[0])
    fireEvent.click(botoes[1])
    fireEvent.click(screen.getAllByRole('button', { name: 'Opções da fala' })[0])
    expect(aoTocar.mock.calls.map(([f, lang]) => [f.id, lang])).toEqual([
      ['a', 'es'],
      ['b', 'en'],
      ['a', 'es'],
    ])
    expect((container.querySelector('.q-leg') as HTMLElement).style.getPropertyValue('--q-escala')).toBe('1.5')
  })

  it('"Ouvir de novo" só aparece na fala que tem áudio guardado, e toca essa fala', () => {
    const aoOuvir = vi.fn()
    const falas = [fala('a', 'one', 'um'), fala('b', 'two', 'dois')]
    render(
      <LegendaAoVivoDoQuest
        falas={falas}
        escala={1}
        idiomaPadrao="en"
        aoTocar={() => {}}
        temAudio={(id) => id === 'b'}
        aoOuvir={aoOuvir}
      />,
    )
    const ouvir = screen.getAllByRole('button', { name: 'Ouvir de novo' })
    expect(ouvir).toHaveLength(1)
    fireEvent.click(ouvir[0])
    expect(aoOuvir.mock.calls[0][0].id).toBe('b')
    expect(screen.getAllByRole('button', { name: 'Opções da fala' })).toHaveLength(2)
  })
})

describe('a fonte do Quest', () => {
  it('de fábrica são OS DOIS; a escolha fica guardada; valor estranho volta ao padrão', () => {
    expect(lerFonteDoQuest()).toBe('ambos')
    guardarFonteDoQuest('mic')
    expect(lerFonteDoQuest()).toBe('mic')
    localStorage.setItem('babel.quest.fonte', 'qualquer')
    expect(lerFonteDoQuest()).toBe('ambos')
  })
})

describe('a chave das telas novas e o tamanho da legenda', () => {
  it('ligada de fábrica; desligar e religar vale na hora', () => {
    expect(telaNovaDoQuest()).toBe(true)
    definirTelaNovaDoQuest(false)
    expect(telaNovaDoQuest()).toBe(false)
    definirTelaNovaDoQuest(true)
    expect(telaNovaDoQuest()).toBe(true)
  })

  it('o tamanho anda um passo por vez, para nas pontas e fica guardado', () => {
    expect(lerEscalaDaLegenda()).toBe(1)
    expect(mudarEscalaDaLegenda(1, 1)).toBe(1.25)
    expect(lerEscalaDaLegenda()).toBe(1.25)
    const maior = ESCALAS_DA_LEGENDA[ESCALAS_DA_LEGENDA.length - 1]
    expect(mudarEscalaDaLegenda(maior, 1)).toBe(maior)
    expect(mudarEscalaDaLegenda(ESCALAS_DA_LEGENDA[0], -1)).toBe(ESCALAS_DA_LEGENDA[0])
  })
})
