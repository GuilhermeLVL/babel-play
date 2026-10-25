// @vitest-environment jsdom
/**
 * A PiP INTELIGENTE na janela completa (`LegendasFlutuantes` com `naJanela`): o layout segue o tamanho
 * REAL da janela, o formato troca na barra (e avisa quem redimensiona), o que a fala mostra
 * (original / tradução / os dois), a letra, o fundo, os controles que somem sozinhos, o "S" que salva
 * a frase e a costura das abas (Fase C).
 */
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react'
import React from 'react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('../src/data/api', () => ({
  fetchSettings: vi.fn(async () => null),
  patchUiSettings: vi.fn(async () => {}),
}))

import LegendasFlutuantes, {
  CONTROLES_SOMEM_MS,
  type LegendaAoVivo,
} from '../src/components/views/captura/LegendasFlutuantes'

const FALAS: LegendaAoVivo[] = [
  { id: '1', quem: 'Outros', original: 'First line.', traducao: 'Primeira linha.', lado: 'eles', lang: 'en' },
  { id: '2', quem: 'Outros', original: 'Second line.', traducao: 'Segunda linha.', lado: 'eles', lang: 'en' },
  { id: '3', quem: 'Você', original: 'Third line.', traducao: 'Terceira linha.', lado: 'voce', lang: 'en' },
]

type Props = React.ComponentProps<typeof LegendasFlutuantes>
const montar = (extra: Partial<Props> = {}) =>
  render(<LegendasFlutuantes falas={FALAS} aoFechar={vi.fn()} {...extra} />)

const raiz = () => document.getElementById('leg-flut') as HTMLElement
const aVista = () => [...document.querySelectorAll('.leg-o')].map((e) => e.textContent)

function tamanhoDaJanela(largura: number, altura: number) {
  Object.defineProperty(window, 'innerWidth', { configurable: true, value: largura })
  Object.defineProperty(window, 'innerHeight', { configurable: true, value: altura })
  act(() => void window.dispatchEvent(new Event('resize')))
}

beforeEach(() => {
  localStorage.clear()
  document.documentElement.classList.remove('dark')
})
afterEach(() => {
  cleanup()
  vi.useRealTimers()
})

describe('o layout segue o tamanho real da janela', () => {
  it('abre no formato sugerido e muda de layout quando a pessoa redimensiona', () => {
    tamanhoDaJanela(720, 110)
    montar({ naJanela: true, formatoInicial: 'faixa' })
    expect(raiz().dataset.layout).toBe('faixa')
    expect(aVista()).toEqual(['Third line.'])
    expect(raiz().style.getPropertyValue('--leg-letra')).toBe('24px')

    tamanhoDaJanela(420, 480) // esticou em pé
    expect(raiz().dataset.layout).toBe('conversa')
    expect(raiz().className).toContain('modo-conversa')
    expect(aVista()).toEqual(['First line.', 'Second line.', 'Third line.'])
    expect(screen.getByText('Você')).toBeTruthy()

    tamanhoDaJanela(600, 170)
    expect(raiz().dataset.layout).toBe('legenda')
  })

  it('fora da janela (sem medida) vale o formato e a preferência de falas, como antes', () => {
    montar()
    expect(raiz().dataset.layout).toBe('legenda')
    expect(aVista()).toHaveLength(3)
    expect(raiz().style.getPropertyValue('--leg-letra')).toBe('')
  })
})

describe('a barra', () => {
  it('trocar o formato avisa quem abriu (para redimensionar) e guarda', () => {
    const aoTrocarFormato = vi.fn()
    tamanhoDaJanela(600, 170)
    montar({ naJanela: true, formatoInicial: 'legenda', aoTrocarFormato })
    fireEvent.change(screen.getByRole('combobox', { name: 'Modo da janela' }), { target: { value: 'conversa' } })
    expect(aoTrocarFormato).toHaveBeenCalledWith('conversa')
    expect(JSON.parse(localStorage.getItem('babel.legendasFlutuantes')!).modo).toBe('conversa')
    /* A predefinição que muda o modo também avisa. */
    fireEvent.click(screen.getByRole('button', { name: 'Personalizar' }))
    fireEvent.click(screen.getByRole('button', { name: 'Jogo' }))
    expect(aoTrocarFormato).toHaveBeenLastCalledWith('faixa')
  })

  it('original e tradução → só o original → só a tradução → de volta', () => {
    montar()
    const botao = () => screen.getByRole('button', { name: /^Mostrar:/ })
    expect(screen.getByText('Terceira linha.')).toBeTruthy()
    fireEvent.click(botao())
    expect(botao().getAttribute('aria-label')).toBe('Mostrar: Só o original. Trocar')
    expect(screen.queryByText('Terceira linha.')).toBeNull()
    expect(aVista()).toContain('Third line.')
    fireEvent.click(botao())
    expect(botao().getAttribute('aria-label')).toBe('Mostrar: Só a tradução. Trocar')
    expect(aVista()).toContain('Terceira linha.')
    expect(aVista()).not.toContain('Third line.')
    fireEvent.click(botao())
    expect(aVista()).toContain('Third line.')
    expect(screen.getByText('Terceira linha.')).toBeTruthy()
  })

  it('letra menor e maior, com limites', () => {
    montar()
    for (let i = 0; i < 8; i++) fireEvent.click(screen.getByRole('button', { name: 'Letra maior' }))
    expect(raiz().style.getPropertyValue('--leg-tam')).toBe('1.6')
    expect((screen.getByRole('button', { name: 'Letra maior' }) as HTMLButtonElement).disabled).toBe(true)
    for (let i = 0; i < 12; i++) fireEvent.click(screen.getByRole('button', { name: 'Letra menor' }))
    expect(raiz().style.getPropertyValue('--leg-tam')).toBe('0.7')
    expect((screen.getByRole('button', { name: 'Letra menor' }) as HTMLButtonElement).disabled).toBe(true)
  })

  it('o fundo: segue o tema do app (claro/escuro), e troca com um toque', async () => {
    montar()
    expect(raiz().dataset.fundo).toBe('claro')
    /* No claro, as cores escolhidas (para fundo escuro) não são impostas. */
    expect(raiz().style.getPropertyValue('--leg-cor')).toBe('')
    await act(async () => void document.documentElement.classList.add('dark'))
    expect(raiz().dataset.fundo).toBe('escuro')
    expect(raiz().style.getPropertyValue('--leg-cor')).toBe('#FFFFFF')
    fireEvent.click(screen.getByRole('button', { name: 'Fundo: Seguir o tema. Trocar' }))
    expect(raiz().dataset.fundo).toBe('escuro')
    fireEvent.click(screen.getByRole('button', { name: 'Fundo: Escuro. Trocar' }))
    expect(raiz().dataset.fundo).toBe('preto')
    fireEvent.click(screen.getByRole('button', { name: 'Fundo: Preto. Trocar' }))
    expect(raiz().dataset.fundo).toBe('claro')
  })

  it('"Salvar a frase atual" (e a tecla S) ficha a fala em foco', async () => {
    const aoSalvarPalavra = vi.fn(async () => 'Frase salva')
    montar({ aoSalvarPalavra })
    fireEvent.click(screen.getByRole('button', { name: 'Salvar a frase atual' }))
    expect(aoSalvarPalavra).toHaveBeenCalledWith({ palavra: 'Third line.', lang: 'en', traducao: 'Terceira linha.' })
    expect(await screen.findByText('Frase salva')).toBeTruthy()
    fireEvent.keyDown(raiz(), { key: 's' })
    expect(aoSalvarPalavra).toHaveBeenCalledTimes(2)
  })
})

describe('limpa: só o texto, controles ao mexer', () => {
  it('a barra aparece ao passar o mouse e some sozinha depois de 2 s parada', () => {
    vi.useFakeTimers()
    montar()
    expect(raiz().className).not.toContain('com-controles')
    fireEvent.mouseMove(raiz())
    expect(raiz().className).toContain('com-controles')
    act(() => void vi.advanceTimersByTime(CONTROLES_SOMEM_MS - 100))
    expect(raiz().className).toContain('com-controles')
    act(() => void vi.advanceTimersByTime(200))
    expect(raiz().className).not.toContain('com-controles')
  })

  it('com o foco num controle (teclado), a barra fica', () => {
    vi.useFakeTimers()
    montar()
    const pausar = screen.getByRole('button', { name: 'Pausar legendas' })
    act(() => pausar.focus())
    expect(raiz().className).toContain('com-controles')
    act(() => void vi.advanceTimersByTime(CONTROLES_SOMEM_MS * 2))
    expect(raiz().className).toContain('com-controles')
  })

  it('o anúncio ao leitor de tela continua (aria-live)', () => {
    montar()
    expect(document.querySelector('.leg-anuncio')?.getAttribute('aria-live')).toBe('polite')
  })
})

describe('estudo e abas', () => {
  it('no Estudo, sem palavra tocada, a dica; tocada, o cartão encaixado embaixo', () => {
    montar({ formatoInicial: 'estudo' })
    expect(screen.getByText('Toque numa palavra para ver o significado, ouvir e salvar.')).toBeTruthy()
    fireEvent.click(document.querySelector('[data-palavra="Third"]')!)
    expect(screen.getByRole('dialog', { name: 'Palavra: Third' }).className).toContain('encaixado')
  })

  it('sem abas extras, nenhuma lista de abas; com uma (o Assistente da Fase C), dá para trocar', () => {
    montar()
    expect(screen.queryByRole('tablist')).toBeNull()
    cleanup()
    montar({ abasExtras: [{ id: 'assistente', rotulo: 'Assistente', conteudo: <p>Conteúdo do assistente</p> }] })
    expect(screen.getByRole('tab', { name: 'Legendas' }).getAttribute('aria-selected')).toBe('true')
    fireEvent.click(screen.getByRole('tab', { name: 'Assistente' }))
    expect(screen.getByRole('tabpanel').textContent).toBe('Conteúdo do assistente')
    expect(document.querySelector('.leg-corpo')).toBeNull()
    fireEvent.click(screen.getByRole('tab', { name: 'Legendas' }))
    expect(aVista()).toContain('Third line.')
  })
})
