// @vitest-environment jsdom
/**
 * Fase 6 — a tela do código de 6 dígitos que aparece depois do login quando a conta tem 2FA.
 */
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'

const { verificar } = vi.hoisted(() => ({ verificar: vi.fn() }))
vi.mock('../src/lib/auth', () => ({ verificarSegundoFator: verificar, signOut: vi.fn() }))

import DesafioSegundoFator from '../src/components/auth/DesafioSegundoFator'

afterEach(() => {
  cleanup()
  vi.clearAllMocks()
})

describe('DesafioSegundoFator', () => {
  it('só habilita o botão com 6 dígitos, e ignora o que não é dígito', () => {
    render(<DesafioSegundoFator onConcluido={() => {}} />)
    const campo = screen.getByLabelText('Código') as HTMLInputElement
    const botao = screen.getByRole('button', { name: 'Confirmar' }) as HTMLButtonElement
    expect(botao.disabled).toBe(true)
    fireEvent.change(campo, { target: { value: '12a34 56' } })
    expect(campo.value).toBe('123456')
    expect(botao.disabled).toBe(false)
  })

  it('código aceito → onConcluido', async () => {
    verificar.mockResolvedValue({ ok: true })
    const concluido = vi.fn()
    render(<DesafioSegundoFator onConcluido={concluido} />)
    fireEvent.change(screen.getByLabelText('Código'), { target: { value: '123456' } })
    fireEvent.click(screen.getByRole('button', { name: 'Confirmar' }))
    await waitFor(() => expect(concluido).toHaveBeenCalledOnce())
    expect(verificar).toHaveBeenCalledWith('123456')
  })

  it('código recusado → mensagem, e fica na tela', async () => {
    verificar.mockResolvedValue({ ok: false, message: 'Código inválido. Tente de novo.' })
    const concluido = vi.fn()
    render(<DesafioSegundoFator onConcluido={concluido} />)
    fireEvent.change(screen.getByLabelText('Código'), { target: { value: '000000' } })
    fireEvent.click(screen.getByRole('button', { name: 'Confirmar' }))
    expect(await screen.findByRole('alert')).toBeTruthy()
    expect(concluido).not.toHaveBeenCalled()
  })
})
