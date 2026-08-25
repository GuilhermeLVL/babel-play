// @vitest-environment jsdom
/** A seção de conta só aparece no modo com login (authRequired); no self-host não renderiza nada. */
import { it, expect, afterEach, vi } from 'vitest'
import { render, screen, cleanup } from '@testing-library/react'

afterEach(() => { cleanup(); vi.resetModules() })

it('authRequired=true → renderiza "Conta e Segurança" e o botão de sair', async () => {
  vi.doMock('../src/lib/supabase', () => ({ supabase: {}, authRequired: true, getAccessToken: async () => null }))
  vi.doMock('../src/lib/auth', () => ({ listTotpFactors: async () => [], signOut: vi.fn(), updatePassword: vi.fn() }))
  const { default: Section } = await import('../src/components/auth/AccountSecuritySection')
  render(<Section />)
  expect(screen.getByRole('heading', { name: 'Conta e Segurança' })).toBeTruthy()
  expect(await screen.findByRole('button', { name: 'Sair da conta' })).toBeTruthy()
})

it('authRequired=false (self-host) → não renderiza a seção', async () => {
  vi.doMock('../src/lib/supabase', () => ({ supabase: null, authRequired: false, getAccessToken: async () => null }))
  const { default: Section } = await import('../src/components/auth/AccountSecuritySection')
  const { container } = render(<Section />)
  expect(container.textContent).not.toContain('Conta e Segurança')
})
