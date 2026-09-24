// @vitest-environment jsdom
/**
 * A APRESENTAÇÃO NO DESENHO DO PROTÓTIPO (seis passos num `<dialog>`), sem perder o que ela decide:
 * pular leva à escolha da IA (que não tem "Pular": sem ela o app não roda), o Esc pula também, e
 * "Rodar local" + "Começar" grava `onboarded` e a escolha antes de entrar no app.
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

  it('pular vai para a escolha da IA, que não tem "Pular"', () => {
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

  it('"Rodar local" + "Começar" grava a escolha e entra no app', async () => {
    const onComplete = vi.fn()
    render(<Onboarding onComplete={onComplete} />)
    fireEvent.click(screen.getByRole('button', { name: 'Pular apresentação' }))
    expect(screen.getByRole('radio', { name: /Rodar local/ }).getAttribute('aria-checked')).toBe('true')
    fireEvent.click(screen.getByRole('button', { name: /Começar/ }))
    await waitFor(() => expect(onComplete).toHaveBeenCalled())
    expect(saveSettings).toHaveBeenCalledWith(
      expect.objectContaining({ ui: expect.objectContaining({ onboarded: true, providerMode: 'local' }) }),
    )
  })

  it('"Usar minha chave" + "Começar" abre o formulário da chave no mesmo diálogo', () => {
    render(<Onboarding onComplete={vi.fn()} />)
    fireEvent.click(screen.getByRole('button', { name: 'Pular apresentação' }))
    fireEvent.click(screen.getByRole('radio', { name: /Usar minha chave/ }))
    fireEvent.click(screen.getByRole('button', { name: /Começar/ }))
    expect(screen.getByLabelText('Chave de API')).toBeTruthy()
    expect(screen.getByRole('button', { name: /Testar e salvar/ })).toBeTruthy()
  })
})
