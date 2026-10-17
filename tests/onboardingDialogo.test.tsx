// @vitest-environment jsdom
/**
 * A APRESENTAÇÃO NO DESENHO DO PROTÓTIPO (seis passos num `<dialog>`): pular (ou o Esc) leva ao último
 * passo, que não tem "Pular", e "Começar" grava `onboarded` e o modo local antes de entrar no app. O
 * passo "Como rodar a IA" saiu (pedido do dono, 02/10/2026); a chave própria fica em Ajustes.
 */
import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import React from 'react'
import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest'

import { prepararDialogoNoJsdom } from './_dialogoNoJsdom'

const saveSettings = vi.fn(async () => ({}))
vi.mock('../src/data/api', () => ({
  saveSettings: (...a: unknown[]) => saveSettings(...(a as [])),
  patchUiSettings: vi.fn(async () => ({})),
  createCredential: vi.fn(),
  testProvider: vi.fn(),
}))
vi.mock('../src/lib/langConfig', async (orig) => ({
  ...(await orig<typeof import('../src/lib/langConfig')>()),
  saveLangConfig: vi.fn(async () => undefined),
}))

import Onboarding from '../src/components/Onboarding'

describe('Onboarding — o diálogo em seis passos', () => {
  beforeAll(prepararDialogoNoJsdom)
  afterEach(cleanup)

  it('começa no passo 1 de 6 e "Continuar" anda', () => {
    render(<Onboarding onComplete={vi.fn()} />)
    expect(screen.getByRole('dialog', { name: 'Babel Play' })).toBeTruthy()
    expect(screen.getByText('1 de 6')).toBeTruthy()
    fireEvent.click(screen.getByRole('button', { name: /Continuar/ }))
    expect(screen.getByText('2 de 6')).toBeTruthy()
    expect(screen.getByRole('radio', { name: /Inglês/ }).getAttribute('aria-checked')).toBe('true')
  })

  it('pular vai ao último passo, que não tem "Pular"', () => {
    render(<Onboarding onComplete={vi.fn()} />)
    fireEvent.click(screen.getByRole('button', { name: 'Pular apresentação' }))
    expect(screen.getByText('6 de 6')).toBeTruthy()
    expect(screen.queryByRole('button', { name: 'Pular apresentação' })).toBeNull()
  })

  it('o Esc (cancel do <dialog>) pula a apresentação em vez de fechar', () => {
    render(<Onboarding onComplete={vi.fn()} />)
    const dlg = screen.getByRole('dialog') as HTMLDialogElement
    act(() => {
      dlg.dispatchEvent(new Event('cancel', { cancelable: true }))
    })
    expect(dlg.open).toBe(true)
    expect(screen.getByText('6 de 6')).toBeTruthy()
  })

  it('não há mais a escolha da IA: "Começar" grava o modo local e entra no app', async () => {
    const onComplete = vi.fn()
    render(<Onboarding onComplete={onComplete} />)
    fireEvent.click(screen.getByRole('button', { name: 'Pular apresentação' }))
    expect(screen.queryByRole('radio', { name: /Rodar local/ })).toBeNull()
    expect(screen.queryByText('Como você quer rodar a IA?')).toBeNull()
    fireEvent.click(screen.getByRole('button', { name: /Começar/ }))
    await waitFor(() => expect(onComplete).toHaveBeenCalled())
    expect(saveSettings).toHaveBeenCalledWith(
      expect.objectContaining({ ui: expect.objectContaining({ onboarded: true, providerMode: 'local' }) }),
    )
  })

  describe('passo de permissões', () => {
    const irAteAsPermissoes = () => {
      render(<Onboarding onComplete={vi.fn()} />)
      for (let n = 0; n < 4; n++) fireEvent.click(screen.getByRole('button', { name: /Continuar/ }))
      expect(screen.getByText('5 de 6')).toBeTruthy()
    }
    const mockMic = (getUserMedia: () => Promise<unknown>) =>
      Object.defineProperty(navigator, 'mediaDevices', { value: { getUserMedia }, configurable: true })

    it('permitir: mostra liberado e solta a faixa', async () => {
      const stop = vi.fn()
      const getUserMedia = vi.fn(async () => ({ getTracks: () => [{ stop }] }))
      mockMic(getUserMedia)
      irAteAsPermissoes()
      fireEvent.click(screen.getByRole('button', { name: /Liberar microfone/ }))
      await waitFor(() => expect(screen.getByText('Microfone liberado')).toBeTruthy())
      expect(getUserMedia).toHaveBeenCalledWith({ audio: true })
      expect(stop).toHaveBeenCalled()
    })

    it('negar: mostra a mensagem e "Continuar" segue disponível', async () => {
      mockMic(async () => {
        throw new DOMException('negado', 'NotAllowedError')
      })
      irAteAsPermissoes()
      fireEvent.click(screen.getByRole('button', { name: /Liberar microfone/ }))
      await waitFor(() => expect(screen.getByRole('alert').textContent).toMatch(/Permissão do microfone negada/))
      fireEvent.click(screen.getByRole('button', { name: /Continuar/ }))
      expect(screen.getByText('6 de 6')).toBeTruthy()
    })

    it('"Agora não" avança sem pedir nada nem abrir o seletor de tela', () => {
      const getUserMedia = vi.fn()
      const getDisplayMedia = vi.fn()
      Object.defineProperty(navigator, 'mediaDevices', { value: { getUserMedia, getDisplayMedia }, configurable: true })
      irAteAsPermissoes()
      expect(screen.getByText(/abre um seletor a cada captura/)).toBeTruthy()
      fireEvent.click(screen.getByRole('button', { name: 'Agora não' }))
      expect(screen.getByText('6 de 6')).toBeTruthy()
      expect(getUserMedia).not.toHaveBeenCalled()
      expect(getDisplayMedia).not.toHaveBeenCalled()
    })
  })
})
