// @vitest-environment jsdom
/**
 * O CHECKOUT ACEITA O CICLO (C5 da change `planos-v2`) — só o necessário para o anual e o 12x
 * funcionarem; a tela de Planos nova, com o seletor Mensal/Anual, é o C7.
 *
 * 1. O passo 1 oferece Mensal recorrente, Anual em uma vez e Anual em 12x no cartão, com o preço de
 *    cada um saído da matriz (R$ 19,90, R$ 149,90, 11 × R$ 12,49 + R$ 12,51).
 * 2. O pedido ao servidor leva `ciclo` e `meio`: o anual é `assinatura` anual; o 12x é `parcelamento`.
 * 3. O texto legal diz o que cada forma autoriza: o anual renova em um ano; o 12x não renova sozinho,
 *    e depois dos 7 dias cancelar não devolve o proporcional (padrão do dono, a validar com o jurídico).
 */
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'

afterEach(() => {
  cleanup()
  vi.resetModules()
  vi.restoreAllMocks()
  vi.doUnmock('../src/data/api')
  vi.doUnmock('../src/data/rotas/idade')
  localStorage.clear()
  sessionStorage.clear()
})

function mockApi() {
  const chamadas: { url: string; corpo: any }[] = []
  vi.doMock('../src/data/api', () => ({
    apiFetch: vi.fn(async (url: string, init?: RequestInit) => {
      chamadas.push({ url, corpo: init?.body ? JSON.parse(String(init.body)) : undefined })
      if (url.includes('/api/billing/assinar'))
        return { ok: true, status: 200, json: async () => ({ linkDePagamento: 'https://sandbox.asaas.com/i/1' }) }
      return { ok: false, status: 404, json: async () => ({}) }
    }),
  }))
  vi.doMock('../src/data/rotas/idade', () => ({
    lerAbertura: async () => ({ cadastro: true, checkout: true }),
    declararNascimento: vi.fn(),
    carregarProtecao: async () => null,
    ehFalha: (r: { ok: boolean }) => r.ok === false,
  }))
  return chamadas
}

async function abrir() {
  vi.spyOn(window, 'open').mockReturnValue(null)
  const { default: Checkout } = await import('../src/components/views/planos/Checkout')
  render(
    <Checkout
      plano="premium"
      aoTrocarPlano={() => {}}
      plan="free"
      conta={{ estado: 'gratis', plano: null, valeAte: null }}
      status={{ configurado: true, assinatura: null }}
    />,
  )
}

function preencher() {
  fireEvent.change(screen.getByLabelText('Nome completo'), { target: { value: 'Ana Souza' } })
  fireEvent.change(screen.getByLabelText('CPF'), { target: { value: '24971563792' } })
  fireEvent.change(screen.getByLabelText('E-mail para o recibo'), { target: { value: 'ana@exemplo.com' } })
}

describe('as três formas de pagar o Premium', () => {
  it('o passo 1 mostra mensal, anual e 12x com os preços da matriz', async () => {
    mockApi()
    await abrir()
    expect(screen.getByRole('button', { name: /Mensal recorrente/ }).getAttribute('aria-pressed')).toBe('true')
    expect(screen.getByRole('button', { name: /Anual em uma vez/ }).textContent).toContain('R$ 149,90')
    const dozeVezes = screen.getByRole('button', { name: /Anual em 12x no cartão/ })
    expect(dozeVezes.textContent).toContain('R$ 12,49')
    expect(dozeVezes.textContent).toContain('R$ 12,51')
  })

  it('anual: o pedido vai com `ciclo: anual` e `meio: assinatura`, e o texto legal fala da renovação em um ano', async () => {
    const chamadas = mockApi()
    await abrir()
    fireEvent.click(screen.getByRole('button', { name: /Anual em uma vez/ }))
    fireEvent.click(screen.getByRole('button', { name: /Ir para o pagamento/ }))
    expect(screen.getByText(/renovada todo ano/)).toBeTruthy()
    preencher()
    fireEvent.click(screen.getByRole('button', { name: /Assinar e pagar R\$ 149,90/ }))
    await waitFor(() => expect(chamadas.some((c) => c.url === '/api/billing/assinar')).toBe(true))
    const pedido = chamadas.find((c) => c.url === '/api/billing/assinar')?.corpo
    expect(pedido).toMatchObject({ plano: 'premium', ciclo: 'anual', meio: 'assinatura' })
  })

  it('12x: o pedido vai como parcelamento do anual, e o texto diz que não renova sozinho', async () => {
    const chamadas = mockApi()
    await abrir()
    fireEvent.click(screen.getByRole('button', { name: /Anual em 12x no cartão/ }))
    fireEvent.click(screen.getByRole('button', { name: /Ir para o pagamento/ }))
    expect(screen.getByText(/sem renovação automática/)).toBeTruthy()
    expect(screen.getByText(/sem reembolso proporcional/)).toBeTruthy()
    preencher()
    fireEvent.click(screen.getByRole('button', { name: /em 12x de R\$ 12,49/ }))
    await waitFor(() => expect(chamadas.some((c) => c.url === '/api/billing/assinar')).toBe(true))
    const pedido = chamadas.find((c) => c.url === '/api/billing/assinar')?.corpo
    expect(pedido).toMatchObject({ plano: 'premium', ciclo: 'anual', meio: 'parcelamento' })
  })

  it('mensal continua o de sempre: `ciclo: mensal`', async () => {
    const chamadas = mockApi()
    await abrir()
    fireEvent.click(screen.getByRole('button', { name: /Ir para o pagamento/ }))
    preencher()
    fireEvent.click(screen.getByRole('button', { name: /Assinar e pagar R\$ 19,90/ }))
    await waitFor(() => expect(chamadas.some((c) => c.url === '/api/billing/assinar')).toBe(true))
    expect(chamadas.find((c) => c.url === '/api/billing/assinar')?.corpo).toMatchObject({
      ciclo: 'mensal',
      meio: 'assinatura',
    })
  })
})
