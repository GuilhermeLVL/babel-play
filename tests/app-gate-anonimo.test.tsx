// @vitest-environment jsdom
/**
 * Fatia 5 / passo 4 — o gate por VIEW em vez do gate global.
 *
 * Falha-antes: `App.tsx` tinha `if (authRequired && !session) return <Login/>` — sem conta, nem o
 * hub nem a captura existiam; e `Login` não tinha como seguir sem conta.
 */
import { afterEach, describe, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render, screen } from '@testing-library/react'

vi.mock('../src/lib/supabase', () => ({
  supabase: null, authRequired: true, carregarSupabase: async () => null, getAccessToken: async () => null,
}))

import Login from '../src/components/Login'
import CartaoDeConvite from '../src/components/conta/CartaoDeConvite'
import GateDeConta from '../src/components/conta/GateDeConta'
import { EXIGE_CONTA, exigeConta, porta } from '../src/components/conta/exigeConta'

afterEach(cleanup)

describe('a regra da porta', () => {
  it('sem login exigido, sempre app', () => {
    expect(porta({ authRequired: false, temSessao: false, anonimoAceito: false, pedindoLogin: false })).toBe('app')
  })
  it('com sessão, app — mesmo pedindo login (o pedido caduca ao entrar)', () => {
    expect(porta({ authRequired: true, temSessao: true, anonimoAceito: false, pedindoLogin: true })).toBe('app')
  })
  it('sem sessão: login na 1ª visita; app depois de aceitar seguir sem conta; login de novo se pedir', () => {
    expect(porta({ authRequired: true, temSessao: false, anonimoAceito: false, pedindoLogin: false })).toBe('login')
    expect(porta({ authRequired: true, temSessao: false, anonimoAceito: true, pedindoLogin: false })).toBe('app')
    expect(porta({ authRequired: true, temSessao: false, anonimoAceito: true, pedindoLogin: true })).toBe('login')
  })
  it('o que exige conta é o que persiste; capturar, jogar, início e ajustes ficam livres', () => {
    for (const v of ['library', 'analysis', 'study', 'reading', 'metrics', 'profile']) expect(exigeConta(v), v).toBe(true)
    for (const v of ['hub', 'capture', 'play', 'settings']) expect(exigeConta(v), v).toBe(false)
    expect(EXIGE_CONTA.size).toBe(6)
  })
})

describe('as telas do gate', () => {
  it('Login oferece "Continuar sem conta" só quando o App permite, e nunca no fluxo de recuperação', () => {
    const seguir = vi.fn()
    const { unmount } = render(<Login onContinuarSemConta={seguir} />)
    fireEvent.click(screen.getByRole('button', { name: 'Continuar sem conta' }))
    expect(seguir).toHaveBeenCalledTimes(1)
    fireEvent.click(screen.getByRole('button', { name: 'Esqueci' }))
    expect(screen.queryByRole('button', { name: 'Continuar sem conta' })).toBeNull()
    unmount()
    render(<Login />)
    expect(screen.queryByRole('button', { name: 'Continuar sem conta' })).toBeNull()
  })

  it('o convite diz o que a conta desbloqueia NAQUELA tela e tem as duas saídas', () => {
    const entrar = vi.fn(); const voltar = vi.fn()
    render(<CartaoDeConvite view="library" onEntrar={entrar} onVoltar={voltar} />)
    expect(screen.getByText('Sua biblioteca fica na sua conta')).toBeTruthy()
    fireEvent.click(screen.getByRole('button', { name: 'Entrar ou criar conta' }))
    fireEvent.click(screen.getByRole('button', { name: 'Continuar sem conta' }))
    expect(entrar).toHaveBeenCalledTimes(1)
    expect(voltar).toHaveBeenCalledTimes(1)
  })

  it('o gate é um diálogo com o motivo, fecha no Escape e não perde a tela', () => {
    const fechar = vi.fn(); const entrar = vi.fn()
    render(<GateDeConta aberto motivo="Importar do YouTube precisa de conta." onFechar={fechar} onEntrar={entrar} />)
    const dialogo = screen.getByRole('dialog')
    expect(dialogo.textContent).toContain('Importar do YouTube precisa de conta.')
    fireEvent.keyDown(document, { key: 'Escape' })
    expect(fechar).toHaveBeenCalledTimes(1)
    fireEvent.click(screen.getByRole('button', { name: 'Entrar ou criar conta' }))
    expect(entrar).toHaveBeenCalledTimes(1)
  })

  it('fechado, o gate não renderiza nada', () => {
    const { container } = render(<GateDeConta aberto={false} motivo="" onFechar={() => {}} onEntrar={() => {}} />)
    expect(container.innerHTML).toBe('')
  })
})
