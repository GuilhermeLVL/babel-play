// @vitest-environment jsdom
/**
 * A OPÇÃO DA LEGENDA SEGURA EM AJUSTES → PRIVACIDADE (change `legenda-segura-para-menores`, tarefa 3.2): ligada e
 * travada, com a explicação, no perfil protegido; desligada por padrão e alternável para o adulto declarado.
 */
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react'
import React from 'react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const perfil = vi.hoisted(() => ({ protegido: true }))
vi.mock('../src/lib/protecaoDoMenor', async (orig) => ({
  ...(await orig<typeof import('../src/lib/protecaoDoMenor')>()),
  perfilProtegido: () => perfil.protegido,
}))
vi.mock('../src/data/api', () => ({
  patchUiSettings: vi.fn(async () => true),
  fetchSettings: vi.fn(async () => null),
}))
vi.mock('../src/lib/pedirConta', () => ({ useSemContaComPorta: () => false }))
vi.mock('../src/components/anuncios/AnunciosNosAjustes', () => ({ default: () => null }))

import AbaPrivacidade from '../src/components/views/ajustes/AbaPrivacidade'
import { politicaDaLegendaAtual } from '../src/lib/politicaDaLegenda'
import { _reiniciarPreferencias, lerPreferencias } from '../src/lib/preferencias'

const opcao = () => screen.getByRole('switch', { name: 'Ocultar palavras sensíveis na legenda' })

beforeEach(() => {
  localStorage.clear()
  _reiniciarPreferencias()
})
afterEach(cleanup)

describe('Ajustes → Ocultar palavras sensíveis na legenda', () => {
  it('perfil protegido: ligada, travada e explicada', () => {
    perfil.protegido = true
    render(<AbaPrivacidade />)
    expect(opcao().getAttribute('aria-checked')).toBe('true')
    expect((opcao() as HTMLButtonElement).disabled).toBe(true)
    expect(screen.getByTestId('opcao-legenda-segura').textContent).toContain('proteção do perfil')
    fireEvent.click(opcao())
    expect(lerPreferencias().legendaSegura).toBe(false)
    expect(politicaDaLegendaAtual().ligada).toBe(true)
  })

  it('adulto: desligada por padrão; ligar muda a política', async () => {
    perfil.protegido = false
    render(<AbaPrivacidade />)
    expect(opcao().getAttribute('aria-checked')).toBe('false')
    expect(politicaDaLegendaAtual().ligada).toBe(false)
    await act(async () => {
      fireEvent.click(opcao())
    })
    expect(lerPreferencias().legendaSegura).toBe(true)
    expect(opcao().getAttribute('aria-checked')).toBe('true')
    expect(politicaDaLegendaAtual().ligada).toBe(true)
  })
})
