// @vitest-environment jsdom
/**
 * A ESCUTA GUIADA na tela: o seletor, o texto oculto, "Próximo passo", o Enter e a preferência guardada
 * no aparelho. A ordem dos passos é provada em `escutaGuiada.test.ts`; aqui, o que a pessoa vê e toca.
 */
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react'
import React from 'react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import EscutaGuiada from '../src/components/views/analise/EscutaGuiada'
import { enterLivrePara, lerModoDeEscuta, useEscutaGuiada } from '../src/lib/analise/escutaGuiada'
import type { FalaDaAnalise } from '../src/lib/analise/tiposDaAnalise'

const falas = [0, 1, 2].map(
  (i) =>
    ({
      id: `u${i}`,
      original: `frase ${i}`,
      translation: `t${i}`,
      lang: 'en',
      index: i,
      startTime: i * 4,
    }) as FalaDaAnalise,
)
const seekTo = vi.fn()
const setIsPlaying = vi.fn()

function Tela({ nivel = null }: { nivel?: 'A2' | 'B2' | null }) {
  const [ativo, setAtivo] = React.useState(0)
  const escuta = useEscutaGuiada({
    falas,
    indiceAtivo: ativo,
    nivel,
    seekTo: (t) => {
      seekTo(t)
      setAtivo(Math.round(t / 4))
    },
    setIsPlaying,
  })
  return (
    <>
      <EscutaGuiada escuta={escuta} nivel={nivel} />
      <p data-testid="oculta">{String(escuta.fraseOculta)}</p>
    </>
  )
}

beforeEach(() => {
  localStorage.clear()
  seekTo.mockClear()
  setIsPlaying.mockClear()
})
afterEach(cleanup)

const escolher = (valor: string) =>
  fireEvent.change(screen.getByRole('combobox', { name: 'Modo de escuta' }), { target: { value: valor } })

describe('escuta guiada na tela', () => {
  it('começa em livre, sem passos, e indica a sugestão pelo nível', () => {
    render(<Tela nivel="A2" />)
    expect(screen.getByRole('combobox', { name: 'Modo de escuta' })).toHaveProperty('value', 'livre')
    expect(screen.getByText('Sugerido para A2: Ouvir antes de ler')).toBeTruthy()
    expect(screen.queryByRole('button', { name: 'Próximo passo' })).toBeNull()
    expect(screen.getByTestId('oculta').textContent).toBe('null')
  })

  it('B2 sugere livre; sem nível a sugestão não cita nível', () => {
    const { unmount } = render(<Tela nivel="B2" />)
    expect(screen.getByText('Sugerido para B2: Livre')).toBeTruthy()
    unmount()
    render(<Tela />)
    expect(screen.getByText('Sugerido: Ouvir antes de ler')).toBeTruthy()
  })

  it('ouvir antes de ler: oculta, revela, passa de frase e guarda a escolha', () => {
    render(<Tela />)
    escolher('ouvir-primeiro')
    expect(lerModoDeEscuta()).toBe('ouvir-primeiro')
    expect(screen.getByTestId('oculta').textContent).toBe('0')
    /* o texto visível do botão É o nome acessível (sem aria-label divergente) */
    const revelar = screen.getByRole('button', { name: 'Texto oculto — toque para revelar' })
    fireEvent.click(revelar)
    expect(screen.getByTestId('oculta').textContent).toBe('null')
    expect(screen.getByText('Passo: leia a frase')).toBeTruthy()
    fireEvent.click(screen.getByRole('button', { name: 'Próximo passo' }))
    expect(screen.getByText('Passo: ouça de novo, com o texto')).toBeTruthy()
    expect(seekTo).toHaveBeenLastCalledWith(0)
    fireEvent.click(screen.getByRole('button', { name: 'Próximo passo' }))
    expect(seekTo).toHaveBeenLastCalledWith(4)
    expect(screen.getByTestId('oculta').textContent).toBe('1')
  })

  it('ler antes de ouvir: nunca oculta o texto; na última frase o botão desliga', () => {
    render(<Tela />)
    escolher('ler-primeiro')
    expect(screen.getByTestId('oculta').textContent).toBe('null')
    for (let i = 0; i < 4; i++) fireEvent.click(screen.getByRole('button', { name: 'Próximo passo' }))
    expect(seekTo).toHaveBeenLastCalledWith(8)
    expect(screen.getByText('Passo: leia a frase')).toBeTruthy()
    fireEvent.click(screen.getByRole('button', { name: 'Próximo passo' }))
    expect((screen.getByRole('button', { name: 'Próximo passo' }) as HTMLButtonElement).disabled).toBe(true)
  })

  it('Enter avança o passo quando nada tem o foco; com o foco num botão, não', () => {
    render(<Tela />)
    escolher('ouvir-primeiro')
    act(() => {
      fireEvent.keyDown(window, { key: 'Enter' })
    })
    expect(screen.getByText('Passo: leia a frase')).toBeTruthy()
    const revelar = screen.getByRole('button', { name: 'Próximo passo' })
    fireEvent.keyDown(revelar, { key: 'Enter' })
    expect(screen.getByText('Passo: leia a frase')).toBeTruthy()
  })

  it('lembra o modo ao reabrir a tela', () => {
    render(<Tela />)
    escolher('ler-primeiro')
    cleanup()
    render(<Tela />)
    expect(screen.getByRole('combobox', { name: 'Modo de escuta' })).toHaveProperty('value', 'ler-primeiro')
  })

  it('enterLivrePara respeita campos, botões e diálogos abertos', () => {
    expect(enterLivrePara(document.body)).toBe(true)
    const campo = document.createElement('input')
    document.body.append(campo)
    expect(enterLivrePara(campo)).toBe(false)
    campo.remove()
    const dialogo = document.createElement('div')
    dialogo.setAttribute('role', 'dialog')
    document.body.append(dialogo)
    expect(enterLivrePara(document.body)).toBe(false)
    dialogo.remove()
  })
})
