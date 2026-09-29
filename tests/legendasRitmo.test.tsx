// @vitest-environment jsdom
/**
 * A JANELINHA COM RITMO (ei/leg) — relato do dono: "a legenda some rápido demais, não dá para
 * voltar, pausar, ouvir nem tocar numa palavra". Aqui, com as falas entrando como na captura:
 *  - a fala nova espera a atual cumprir o tempo de leitura (não a empurra);
 *  - pausar (botão, Espaço, mouse em cima) congela a janela; continuar pula para a mais recente;
 *  - rolar para cima / ← volta pelo histórico, e o "N novas ↓" traz de volta ao fim;
 *  - tocar uma palavra abre o cartão (glosa, ouvir, salvar); as ações da fala ouvem, copiam, salvam;
 *  - o leitor de tela ouve só a fala nova já fechada, nunca cada parcial;
 *  - a aparência nova é guardada, e a antiga (sem os campos novos) abre com os padrões.
 */
import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import React from 'react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('../src/data/api', () => ({
  fetchSettings: vi.fn(async () => null),
  patchUiSettings: vi.fn(async () => {}),
}))

import LegendasFlutuantes, { type LegendaAoVivo } from '../src/components/views/captura/LegendasFlutuantes'

const f = (id: string, original: string, extra: Partial<LegendaAoVivo> = {}): LegendaAoVivo => ({
  id,
  quem: 'Outros',
  original,
  traducao: `(${original})`,
  lado: 'eles',
  lang: 'en',
  ...extra,
})
const A = f('a', 'Hello there, friend.')
const B = f('b', 'Second sentence here.')
const C = f('c', 'Third one now.')
const D = f('d', 'Fourth goes on.')
const E = f('e', 'Fifth and last.')

type Props = React.ComponentProps<typeof LegendasFlutuantes>
const base = (extra: Partial<Props> = {}): Props => ({ falas: [A], emJanela: false, aoFechar: vi.fn(), ...extra })

/** O texto inteiro de cada fala à vista, na ordem. */
const aVista = () => [...document.querySelectorAll('.leg-o')].map((e) => e.textContent)
const emFoco = () => document.querySelector('.leg-fala.atual .leg-o')?.textContent
const regiao = () => screen.getByRole('region', { name: 'Legendas flutuantes' })

beforeEach(() => {
  localStorage.clear()
  vi.useFakeTimers()
})
afterEach(() => {
  cleanup()
  vi.useRealTimers()
})

describe('o ritmo de leitura', () => {
  it('a fala nova ESPERA a atual cumprir o tempo de leitura, e depois entra em foco', () => {
    const { rerender } = render(<LegendasFlutuantes {...base()} />)
    rerender(<LegendasFlutuantes {...base({ falas: [A, B] })} />)
    expect(aVista()).toEqual([A.original])
    // A (20 caracteres + 22 da tradução) a 15/s ≈ 2,8 s.
    act(() => void vi.advanceTimersByTime(1500))
    expect(aVista()).toEqual([A.original])
    act(() => void vi.advanceTimersByTime(1500))
    expect(aVista()).toEqual([A.original, B.original])
    expect(emFoco()).toBe(B.original)
  })

  it('o parcial da fala atual cresce no lugar, sem atraso', () => {
    const { rerender } = render(<LegendasFlutuantes {...base({ falas: [f('p', 'Hel', { parcial: true })] })} />)
    rerender(<LegendasFlutuantes {...base({ falas: [f('p', 'Hello wor', { parcial: true })] })} />)
    expect(aVista()).toEqual(['Hello wor'])
  })

  it('"Leitura: rápida" encurta a espera e fica guardada', () => {
    const { rerender } = render(<LegendasFlutuantes {...base()} />)
    fireEvent.change(screen.getByRole('combobox', { name: 'Ritmo de leitura' }), { target: { value: 'rapida' } })
    rerender(<LegendasFlutuantes {...base({ falas: [A, B] })} />)
    act(() => void vi.advanceTimersByTime(2000)) // 42 / 22 ≈ 1,9 s
    expect(aVista()).toContain(B.original)
    expect(JSON.parse(localStorage.getItem('babel.legendasFlutuantes')!).leitura).toBe('rapida')
  })
})

describe('pausar', () => {
  it('o botão congela a janela (a captura continua); continuar pula para a mais recente', () => {
    const { rerender } = render(<LegendasFlutuantes {...base()} />)
    fireEvent.click(screen.getByRole('button', { name: 'Pausar legendas' }))
    rerender(<LegendasFlutuantes {...base({ falas: [A, B, C] })} />)
    act(() => void vi.advanceTimersByTime(20_000))
    expect(aVista()).toEqual([A.original])
    expect(screen.getByRole('button', { name: /2 novas/ })).toBeTruthy()
    fireEvent.click(screen.getByRole('button', { name: 'Continuar as legendas' }))
    expect(aVista()).toEqual([A.original, B.original, C.original])
    expect(emFoco()).toBe(C.original)
  })

  it('o mouse em cima pausa enquanto está lá; sair retoma o ritmo', () => {
    const { rerender } = render(<LegendasFlutuantes {...base()} />)
    fireEvent.mouseEnter(regiao())
    rerender(<LegendasFlutuantes {...base({ falas: [A, B] })} />)
    act(() => void vi.advanceTimersByTime(10_000))
    expect(aVista()).toEqual([A.original])
    fireEvent.mouseLeave(regiao())
    act(() => void vi.advanceTimersByTime(100))
    expect(aVista()).toEqual([A.original, B.original])
  })

  it('segurar o dedo na janela também pausa; desligar "Pausar ao passar o mouse" tira isso', () => {
    const { rerender } = render(<LegendasFlutuantes {...base()} />)
    fireEvent.touchStart(regiao())
    rerender(<LegendasFlutuantes {...base({ falas: [A, B] })} />)
    act(() => void vi.advanceTimersByTime(10_000))
    expect(aVista()).toEqual([A.original])
    fireEvent.touchEnd(regiao())
    act(() => void vi.advanceTimersByTime(100))
    expect(aVista()).toContain(B.original)

    fireEvent.click(screen.getByRole('button', { name: 'Personalizar' }))
    fireEvent.click(screen.getByRole('switch', { name: 'Pausar ao passar o mouse' }))
    fireEvent.mouseEnter(regiao())
    rerender(<LegendasFlutuantes {...base({ falas: [A, B, C] })} />)
    act(() => void vi.advanceTimersByTime(10_000))
    expect(aVista()).toContain(C.original)
  })
})

describe('o histórico', () => {
  it('"Mostrar N falas" decide quantas ficam à vista', () => {
    render(<LegendasFlutuantes {...base({ falas: [A, B, C, D, E] })} />)
    expect(aVista()).toEqual([C.original, D.original, E.original])
    fireEvent.click(screen.getByRole('button', { name: 'Personalizar' }))
    fireEvent.click(screen.getByRole('radio', { name: '1 fala' }))
    expect(aVista()).toEqual([E.original])
    fireEvent.click(screen.getByRole('radio', { name: '5 falas' }))
    expect(aVista()).toHaveLength(5)
  })

  it('rolar para cima volta uma fala por vez e para de seguir o fim; "N novas ↓" traz de volta', () => {
    const { rerender } = render(<LegendasFlutuantes {...base({ falas: [A, B, C, D, E] })} />)
    const corpo = document.querySelector('.leg-corpo') as HTMLElement
    fireEvent.wheel(corpo, { deltaY: -120 })
    expect(aVista()).toEqual([B.original, C.original, D.original])
    expect(emFoco()).toBe(D.original)
    // Uma fala nova chega enquanto você lê o passado: a janela não pula, o contador sobe.
    const F = f('f', 'Sixth arrives.')
    rerender(<LegendasFlutuantes {...base({ falas: [A, B, C, D, E, F] })} />)
    act(() => void vi.advanceTimersByTime(15_000))
    expect(aVista()).toEqual([B.original, C.original, D.original])
    fireEvent.click(screen.getByRole('button', { name: /2 novas/ }))
    expect(aVista()).toEqual([D.original, E.original, F.original])
  })
})

describe('o teclado', () => {
  it('← → navegam, T troca a tradução da fala em foco, P ouve, Espaço pausa', () => {
    const aoOuvir = vi.fn()
    render(<LegendasFlutuantes {...base({ falas: [A, B, C, D, E], aoOuvir })} />)
    const r = regiao()
    fireEvent.keyDown(r, { key: 'ArrowLeft' })
    fireEvent.keyDown(r, { key: 'ArrowLeft' })
    expect(emFoco()).toBe(C.original)
    fireEvent.keyDown(r, { key: 'ArrowRight' })
    expect(emFoco()).toBe(D.original)
    fireEvent.keyDown(r, { key: 'ArrowRight' })
    expect(aVista()).toEqual([C.original, D.original, E.original])
    expect(screen.queryByRole('button', { name: /novas?$/ })).toBeNull()

    expect(screen.getByText(E.traducao)).toBeTruthy()
    fireEvent.keyDown(r, { key: 't' })
    expect(screen.queryByText(E.traducao)).toBeNull()
    fireEvent.keyDown(r, { key: 'T' })
    expect(screen.getByText(E.traducao)).toBeTruthy()

    fireEvent.keyDown(r, { key: 'p' })
    expect(aoOuvir).toHaveBeenCalledWith(E.original, 'en', false)

    fireEvent.keyDown(r, { key: ' ' })
    expect(screen.getByRole('button', { name: 'Continuar as legendas' }).getAttribute('aria-pressed')).toBe('true')
  })

  it('na janela sempre-no-topo as teclas valem com o foco em qualquer lugar do documento dela', () => {
    render(<LegendasFlutuantes {...base({ falas: [A, B, C], emJanela: true })} />)
    fireEvent.keyDown(document.body, { key: ' ' })
    expect(screen.getByRole('button', { name: 'Continuar as legendas' })).toBeTruthy()
  })

  it('a ajuda dos atalhos lista as quatro teclas', () => {
    render(<LegendasFlutuantes {...base()} />)
    fireEvent.click(screen.getByRole('button', { name: 'Atalhos do teclado' }))
    const ajuda = screen.getByRole('tooltip')
    for (const k of ['Espaço', '← →', 'T', 'P']) expect(ajuda.textContent).toContain(k)
  })
})

describe('tocar uma palavra e as ações da fala', () => {
  it('a palavra abre o cartão com a glosa; Ouvir e Salvar chamam os caminhos da captura', async () => {
    vi.useRealTimers()
    const aoConsultarPalavra = vi.fn(async () => ({ traducao: 'aí, lá' }))
    const aoOuvir = vi.fn()
    const aoSalvarPalavra = vi.fn(async () => '"there" adicionado ao seu deck (FSRS)!')
    render(<LegendasFlutuantes {...base({ aoConsultarPalavra, aoOuvir, aoSalvarPalavra })} />)
    fireEvent.click(document.querySelector('[data-palavra="there"]')!)
    const cartao = screen.getByRole('dialog', { name: 'Palavra: there' })
    expect(aoConsultarPalavra).toHaveBeenCalledWith('there', A.original, 'en')
    await waitFor(() => expect(cartao.textContent).toContain('aí, lá'))

    fireEvent.click(screen.getByRole('button', { name: 'Ouvir' }))
    expect(aoOuvir).toHaveBeenCalledWith('there', 'en', false)
    fireEvent.click(screen.getByRole('button', { name: 'Salvar no vocabulário' }))
    expect(aoSalvarPalavra).toHaveBeenCalledWith({ palavra: 'there', frase: A.original, lang: 'en', traducao: 'aí, lá' })
    await waitFor(() => expect(screen.getByRole('status').textContent).toContain('adicionado'))

    fireEvent.keyDown(cartao, { key: 'Escape' })
    expect(screen.queryByRole('dialog')).toBeNull()
  })

  it('com o cartão aberto a fila espera (a fala não sai debaixo dele)', () => {
    const { rerender } = render(<LegendasFlutuantes {...base({ aoConsultarPalavra: vi.fn(async () => ({ traducao: '' })) })} />)
    fireEvent.click(document.querySelector('[data-palavra="friend"]')!)
    rerender(<LegendasFlutuantes {...base({ falas: [A, B], aoConsultarPalavra: vi.fn(async () => ({ traducao: '' })) })} />)
    act(() => void vi.advanceTimersByTime(10_000))
    expect(aVista()).toEqual([A.original])
  })

  it('ouvir a frase (normal e devagar), copiar e salvar a frase', async () => {
    vi.useRealTimers()
    const aoOuvir = vi.fn()
    const aoSalvarPalavra = vi.fn(async () => 'Frase salva')
    const writeText = vi.fn(async () => {})
    Object.defineProperty(navigator, 'clipboard', { value: { writeText }, configurable: true })
    render(<LegendasFlutuantes {...base({ aoOuvir, aoSalvarPalavra })} />)
    fireEvent.click(screen.getByRole('button', { name: 'Ouvir a frase' }))
    fireEvent.click(screen.getByRole('button', { name: 'Ouvir devagar' }))
    expect(aoOuvir).toHaveBeenNthCalledWith(1, A.original, 'en', false)
    expect(aoOuvir).toHaveBeenNthCalledWith(2, A.original, 'en', true)
    fireEvent.click(screen.getByRole('button', { name: 'Copiar o texto' }))
    expect(writeText).toHaveBeenCalledWith(`${A.original}\n${A.traducao}`)
    await waitFor(() => expect(screen.getByRole('status').textContent).toBe('Texto copiado'))
    fireEvent.click(screen.getByRole('button', { name: 'Salvar a frase' }))
    expect(aoSalvarPalavra).toHaveBeenCalledWith({ palavra: A.original, lang: 'en', traducao: A.traducao })
    await waitFor(() => expect(screen.getByRole('status').textContent).toBe('Frase salva'))
  })

  it('"Tradução: ao tocar" esconde a tradução até tocar a fala', () => {
    render(<LegendasFlutuantes {...base()} />)
    fireEvent.change(screen.getByRole('combobox', { name: 'Tradução' }), { target: { value: 'toque' } })
    expect(screen.queryByText(A.traducao)).toBeNull()
    fireEvent.click(document.querySelector('.leg-fala')!)
    expect(screen.getByText(A.traducao)).toBeTruthy()
    fireEvent.click(screen.getByRole('button', { name: 'Tradução desta fala' }))
    expect(screen.queryByText(A.traducao)).toBeNull()
  })
})

describe('leitor de tela', () => {
  it('anuncia só a fala nova já fechada, nunca o parcial', () => {
    const vivo = () => document.querySelector('[aria-live="polite"].leg-anuncio')!.textContent
    const { rerender } = render(<LegendasFlutuantes {...base()} />)
    expect(vivo()).toBe('') // o que já estava na tela ao abrir não é repetido
    act(() => void vi.advanceTimersByTime(5000))
    rerender(<LegendasFlutuantes {...base({ falas: [A, f('b', 'Sec', { parcial: true })] })} />)
    act(() => void vi.advanceTimersByTime(5000))
    expect(aVista()).toContain('Sec')
    expect(vivo()).toBe('')
    rerender(<LegendasFlutuantes {...base({ falas: [A, f('b', 'Second.')] })} />)
    expect(vivo()).toBe('Second. — (Second.)')
    expect(document.querySelectorAll('[aria-live]')).toHaveLength(1)
  })
})

describe('a aparência guardada', () => {
  it('uma aparência antiga (sem os campos novos) abre com os padrões: normal, 3 falas, pausa ao passar', () => {
    localStorage.setItem('babel.legendasFlutuantes', JSON.stringify({ modo: 'video', traducao: 'sempre', tam: 120 }))
    render(<LegendasFlutuantes {...base({ falas: [A, B, C, D] })} />)
    expect(aVista()).toHaveLength(3)
    expect((screen.getByRole('combobox', { name: 'Ritmo de leitura' }) as HTMLSelectElement).value).toBe('normal')
    fireEvent.click(screen.getByRole('button', { name: 'Personalizar' }))
    expect(screen.getByRole('switch', { name: 'Pausar ao passar o mouse' }).getAttribute('aria-checked')).toBe('true')
    expect(screen.getByText('Tamanho · 120%')).toBeTruthy()
  })

  it('o "histórico desligado" de antes vira "1 fala"; valores inválidos voltam ao padrão', () => {
    localStorage.setItem(
      'babel.legendasFlutuantes',
      JSON.stringify({ historico: false, leitura: 'turbo', traducao: 'xyz', pausarAoPassar: 'sim' }),
    )
    render(<LegendasFlutuantes {...base({ falas: [A, B, C] })} />)
    expect(aVista()).toEqual([C.original])
    expect((screen.getByRole('combobox', { name: 'Ritmo de leitura' }) as HTMLSelectElement).value).toBe('normal')
    expect((screen.getByRole('combobox', { name: 'Tradução' }) as HTMLSelectElement).value).toBe('discreta')
  })

  it('as escolhas novas são guardadas e voltam na próxima abertura', () => {
    render(<LegendasFlutuantes {...base({ falas: [A, B, C] })} />)
    fireEvent.change(screen.getByRole('combobox', { name: 'Ritmo de leitura' }), { target: { value: 'lenta' } })
    fireEvent.click(screen.getByRole('button', { name: 'Personalizar' }))
    fireEvent.click(screen.getByRole('radio', { name: '2 falas' }))
    fireEvent.click(screen.getByRole('switch', { name: 'Pausar ao passar o mouse' }))
    cleanup()
    render(<LegendasFlutuantes {...base({ falas: [A, B, C] })} />)
    expect(aVista()).toEqual([B.original, C.original])
    expect((screen.getByRole('combobox', { name: 'Ritmo de leitura' }) as HTMLSelectElement).value).toBe('lenta')
    const salvo = JSON.parse(localStorage.getItem('babel.legendasFlutuantes')!)
    expect(salvo).toMatchObject({ leitura: 'lenta', visiveis: 2, pausarAoPassar: false })
  })
})
