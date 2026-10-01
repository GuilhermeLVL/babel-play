// @vitest-environment jsdom
/**
 * A TELA PRÓPRIA DO INTÉRPRETE (relato do dono no celular, 2026-09-30: ele não achava como chegar ao
 * modo, e não via o que estava sendo preparado). Antes de começar a conversa, a pessoa:
 *   - vê os dois idiomas (o seu e o da outra pessoa) e os muda num toque, ou os troca de lugar;
 *   - vê o preparo dos dois lados (a voz e a tradução);
 *   - toca um botão grande, "Começar conversa".
 */
import { cleanup, fireEvent, render, screen, within } from '@testing-library/react'
import React from 'react'
import { afterEach, describe, expect, it, vi } from 'vitest'

import TelaDoInterprete from '../src/components/views/captura/interprete/TelaDoInterprete'
import type { LinhaDoPreparo } from '../src/lib/captura/situacaoDoInterprete'

afterEach(() => cleanup())

const linhas: LinhaDoPreparo[] = [
  { id: 'voz', rotulo: 'Reconhecer a voz', estado: 'pronto', detalhe: 'No aparelho · nada sai do celular' },
  { id: 'traducao', rotulo: 'Traduzir nos dois sentidos', estado: 'baixa', detalhe: 'Modelo do app · 226 MB a baixar' },
]

function montar(extra: Partial<React.ComponentProps<typeof TelaDoInterprete>> = {}) {
  const props = {
    meu: 'pt-BR',
    outro: 'en-US',
    linhas,
    possivel: true,
    abrindo: false,
    aoMudarIdiomas: vi.fn(),
    aoTrocar: vi.fn(),
    aoComecar: vi.fn(),
    ...extra,
  }
  render(<TelaDoInterprete {...props} />)
  return props
}

describe('TelaDoInterprete', () => {
  it('é uma tela com título, e diz quem fala em cada idioma', () => {
    montar()
    expect(screen.getByRole('heading', { level: 1, name: 'Intérprete' })).toBeTruthy()
    const par = screen.getByTestId('idiomas-do-interprete')
    expect(within(par).getByText('Eu falo')).toBeTruthy()
    expect(within(par).getByText(/Português/)).toBeTruthy()
    expect(within(par).getByText('A outra pessoa fala')).toBeTruthy()
    expect(within(par).getByText(/English/)).toBeTruthy()
  })

  it('tocar num idioma abre a escolha de idiomas', () => {
    const p = montar()
    fireEvent.click(screen.getByRole('button', { name: /Eu falo/ }))
    fireEvent.click(screen.getByRole('button', { name: /A outra pessoa fala/ }))
    expect(p.aoMudarIdiomas).toHaveBeenCalledTimes(2)
  })

  it('trocar os idiomas de lugar', () => {
    const p = montar()
    fireEvent.click(screen.getByRole('button', { name: 'Trocar os idiomas' }))
    expect(p.aoTrocar).toHaveBeenCalledTimes(1)
  })

  it('o preparo dos dois lados: a voz e a tradução, cada uma com o seu estado', () => {
    montar()
    const lista = screen.getByRole('list', { name: 'Preparo da conversa' })
    const itens = within(lista).getAllByRole('listitem')
    expect(itens).toHaveLength(2)
    expect(itens[0].textContent).toContain('Reconhecer a voz')
    expect(itens[0].textContent).toContain('No aparelho · nada sai do celular')
    expect(itens[0].getAttribute('data-estado')).toBe('pronto')
    expect(itens[1].textContent).toContain('Modelo do app · 226 MB a baixar')
    expect(itens[1].getAttribute('data-estado')).toBe('baixa')
  })

  it('"Começar conversa" é o botão grande da tela', () => {
    const p = montar()
    const botao = screen.getByRole('button', { name: 'Começar conversa' })
    expect(botao.className).toContain('grande')
    fireEvent.click(botao)
    expect(p.aoComecar).toHaveBeenCalledTimes(1)
  })

  it('abrindo: o botão espera, sem tocar duas vezes', () => {
    const p = montar({ abrindo: true })
    const botao = screen.getByRole('button', { name: /Abrindo/ }) as HTMLButtonElement
    expect(botao.disabled).toBe(true)
    fireEvent.click(botao)
    expect(p.aoComecar).not.toHaveBeenCalled()
  })

  it('os dois idiomas iguais: o botão não começa, e a tela diz o que fazer', () => {
    const p = montar({ possivel: false, outro: 'pt-PT' })
    const botao = screen.getByRole('button', { name: 'Começar conversa' }) as HTMLButtonElement
    expect(botao.disabled).toBe(true)
    expect(screen.getByRole('alert').textContent).toContain('Escolha dois idiomas diferentes')
    fireEvent.click(botao)
    expect(p.aoComecar).not.toHaveBeenCalled()
  })

  it('explica em uma frase como funciona', () => {
    montar()
    expect(screen.getByText(/Cada um fala na sua vez/)).toBeTruthy()
  })
})
