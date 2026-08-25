// @vitest-environment jsdom
/**
 * Marco 1 — Commit 12: a tela de Login.
 *
 * Renderiza o componente real (com Supabase não configurado → supabase=null, sem rede) e verifica
 * os campos e a alternância entrar/criar. A porta de boot no App.tsx (só ativa no modo público) é
 * coberta por typecheck + build.
 */
import { describe, it, expect, afterEach } from 'vitest'
import { render, screen, fireEvent, cleanup } from '@testing-library/react'
import Login from '../src/components/Login'

afterEach(cleanup) // sem globals no vitest, o auto-cleanup do testing-library não roda

describe('Marco 1 — tela de Login', () => {
  it('renderiza e-mail/senha e alterna entrar ↔ criar', () => {
    render(<Login />)
    expect(screen.getByLabelText('E-mail')).toBeTruthy()
    expect(screen.getByLabelText('Senha')).toBeTruthy()
    expect(screen.getByRole('button', { name: 'Entrar' })).toBeTruthy()

    fireEvent.click(screen.getByRole('button', { name: /Criar uma/ }))
    expect(screen.getByRole('button', { name: 'Criar conta' })).toBeTruthy()
  })

  it('senha tem toggle de visibilidade (olho) acessível com aria-label dinâmico', () => {
    render(<Login />)
    const btn = screen.getByRole('button', { name: 'Mostrar senha' })
    expect(btn).toBeTruthy()
    fireEvent.click(btn)
    expect(screen.getByRole('button', { name: 'Ocultar senha' })).toBeTruthy()
  })

  it('social oculto por ora (só e-mail/senha) e fluxo de recuperar senha', () => {
    render(<Login />)
    expect(screen.queryByRole('button', { name: /Continuar com Google/ })).toBeNull()
    fireEvent.click(screen.getByRole('button', { name: 'Esqueci' }))
    expect(screen.getByRole('button', { name: 'Enviar link' })).toBeTruthy()
  })
})
