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
  lerEscalaDaLegenda,
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
  it('mostra só as DUAS últimas falas com texto: a atual em destaque e a anterior esmaecida', () => {
    const falas = [fala('a', 'one', 'um'), fala('b', 'two', 'dois'), fala('c', '', ''), fala('d', 'three', 'três')]
    const { container } = render(<LegendaAoVivoDoQuest falas={falas} escala={1} idiomaPadrao="en" aoTocar={() => {}} />)
    const visiveis = [...container.querySelectorAll('.q-fala')]
    expect(visiveis.map((v) => v.querySelector('.q-t')?.textContent)).toEqual(['dois', 'três'])
    expect(visiveis[0].className).toContain('antiga')
    expect(visiveis[1].className).not.toContain('antiga')
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

  it('tocar numa fala entrega a fala e o idioma dela (o detectado, ou o do conteúdo)', () => {
    const aoTocar = vi.fn()
    const falas = [fala('a', 'hola', 'olá', 'es'), fala('b', 'bye', 'tchau')]
    const { container } = render(
      <LegendaAoVivoDoQuest falas={falas} escala={1.5} idiomaPadrao="en" aoTocar={aoTocar} />,
    )
    const botoes = container.querySelectorAll('.q-fala')
    fireEvent.click(botoes[0])
    fireEvent.click(botoes[1])
    expect(aoTocar.mock.calls.map(([f, lang]) => [f.id, lang])).toEqual([
      ['a', 'es'],
      ['b', 'en'],
    ])
    expect((container.querySelector('.q-leg') as HTMLElement).style.getPropertyValue('--q-escala')).toBe('1.5')
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
