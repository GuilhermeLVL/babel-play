// @vitest-environment jsdom
/**
 * AS TELAS DE PAGAMENTO (checkout, confirmação, cancelamento) — os contratos de dinheiro:
 * 1. O checkout só INICIA: cria a assinatura (`/api/billing/assinar`) e abre a página do Asaas;
 *    não comemora, fica esperando a confirmação do servidor.
 * 2. Sem cobrança possível (self-host, sem conta, já assina), o passo de pagamento diz por quê e
 *    não oferece pagar.
 * 3. "Assinatura confirmada" só aparece se o SERVIDOR disser `active` — abrir a tela não basta.
 * 4. Cancelar chama `/api/billing/cancelar` só na confirmação, e diz até quando o plano vale.
 */
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'

afterEach(() => {
  cleanup()
  vi.resetModules()
  vi.restoreAllMocks()
})

type Resposta = { ok: boolean; status?: number; json: () => Promise<unknown> }
function mockApi(rotas: Record<string, unknown>) {
  const chamadas: { url: string; init?: RequestInit }[] = []
  vi.doMock('../src/data/api', () => ({
    apiFetch: vi.fn(async (url: string, init?: RequestInit): Promise<Resposta> => {
      chamadas.push({ url, init })
      const chave = Object.keys(rotas).find((k) => url.includes(k))
      return chave ? { ok: true, json: async () => rotas[chave] } : { ok: false, status: 404, json: async () => ({}) }
    }),
  }))
  return chamadas
}

const contaGratis = { estado: 'gratis', plano: null, valeAte: null } as const
const contaAtiva = { estado: 'ativa', plano: 'pro', valeAte: new Date(2026, 9, 22).getTime() } as const

describe('checkout', () => {
  it('só inicia: cria a assinatura, abre a página do Asaas e fica esperando o servidor', async () => {
    const chamadas = mockApi({ '/api/billing/assinar': { linkDePagamento: 'https://sandbox.asaas.com/i/1' } })
    const abrir = vi.spyOn(window, 'open').mockReturnValue(null)
    const { default: Checkout } = await import('../src/components/views/planos/Checkout')
    render(
      <Checkout
        plano="pro"
        aoTrocarPlano={() => {}}
        plan="free"
        conta={contaGratis}
        status={{ configurado: true, assinatura: null }}
      />,
    )
    fireEvent.click(screen.getByRole('button', { name: /Ir para o pagamento/ }))
    fireEvent.change(screen.getByLabelText('Nome completo'), { target: { value: 'Ana Souza' } })
    fireEvent.change(screen.getByLabelText('CPF'), { target: { value: '12345678901' } })
    fireEvent.change(screen.getByLabelText('E-mail para o recibo'), { target: { value: 'ana@exemplo.com' } })
    fireEvent.click(screen.getByRole('button', { name: /Assinar e pagar/ }))

    await waitFor(() => expect(abrir).toHaveBeenCalledWith('https://sandbox.asaas.com/i/1', '_blank', 'noopener'))
    const pedido = chamadas.find((c) => c.url === '/api/billing/assinar')!
    expect(JSON.parse(String(pedido.init?.body))).toEqual({
      plano: 'pro',
      nome: 'Ana Souza',
      cpfCnpj: '12345678901',
      email: 'ana@exemplo.com',
    })
    expect(screen.getByText(/Aguardando a confirmação do pagamento/)).toBeTruthy()
    expect(screen.queryByText(/Bem-vindo/)).toBeNull()
  })

  it('CPF incompleto não chega ao servidor', async () => {
    const chamadas = mockApi({})
    const { default: Checkout } = await import('../src/components/views/planos/Checkout')
    render(
      <Checkout
        plano="essencial"
        aoTrocarPlano={() => {}}
        plan="free"
        conta={contaGratis}
        status={{ configurado: true, assinatura: null }}
      />,
    )
    fireEvent.click(screen.getByRole('button', { name: /Ir para o pagamento/ }))
    fireEvent.change(screen.getByLabelText('Nome completo'), { target: { value: 'Ana' } })
    fireEvent.change(screen.getByLabelText('CPF'), { target: { value: '123' } })
    fireEvent.change(screen.getByLabelText('E-mail para o recibo'), { target: { value: 'ana@exemplo.com' } })
    fireEvent.click(screen.getByRole('button', { name: /Assinar e pagar/ }))
    expect(await screen.findByText('O CPF tem 11 dígitos.')).toBeTruthy()
    expect(chamadas.some((c) => c.url.includes('/assinar'))).toBe(false)
  })

  for (const [nome, plan, conta, status, titulo] of [
    ['self-host', 'selfhost', { estado: 'selfhost', plano: null, valeAte: null }, null, 'Nada a pagar no self-host'],
    ['sem conta', 'anonimo', contaGratis, { configurado: true, assinatura: null }, 'Entre na sua conta para assinar'],
    ['sem cobrança', 'free', contaGratis, { configurado: false, assinatura: null }, 'Nesta instalação não há cobrança'],
    ['já assina', 'pro', contaAtiva, { configurado: true, assinatura: null }, 'Você já tem uma assinatura'],
  ] as const) {
    it(`${nome}: o passo de pagamento diz por quê e não oferece pagar`, async () => {
      mockApi({})
      const { default: Checkout } = await import('../src/components/views/planos/Checkout')
      render(<Checkout plano="pro" aoTrocarPlano={() => {}} plan={plan} conta={conta} status={status} />)
      fireEvent.click(screen.getByRole('button', { name: /Ir para o pagamento/ }))
      expect(screen.getByRole('heading', { name: titulo })).toBeTruthy()
      expect(screen.queryByRole('button', { name: /Assinar e pagar/ })).toBeNull()
    })
  }
})

describe('assinatura confirmada', () => {
  it('não comemora se o servidor não disser active', async () => {
    mockApi({
      '/api/billing/status': { configurado: true, assinatura: { plano: 'pro', status: 'trialing', valeAte: null } },
    })
    const { default: Assinado } = await import('../src/components/views/planos/Assinado')
    render(<Assinado />)
    expect(await screen.findByText('Ainda não recebemos a confirmação')).toBeTruthy()
    expect(screen.queryByText(/Bem-vindo/)).toBeNull()
  })

  it('comemora quando o servidor confirma', async () => {
    mockApi({
      '/api/billing/status': {
        configurado: true,
        assinatura: { plano: 'pro', status: 'active', valeAte: 1_790_000_000_000 },
      },
      '/api/billing/faturas': { faturas: [] },
      '/api/me/entitlements': { plan: 'pro' },
    })
    const { default: Assinado } = await import('../src/components/views/planos/Assinado')
    render(<Assinado />)
    expect(await screen.findByText('Bem-vindo ao Pro!')).toBeTruthy()
  })
})

describe('cancelar', () => {
  it('só chama o servidor na confirmação, e diz até quando o plano vale', async () => {
    const chamadas = mockApi({ '/api/billing/cancelar': { ok: true, valeAte: contaAtiva.valeAte } })
    const { default: Cancelar } = await import('../src/components/views/planos/Cancelar')
    render(<Cancelar conta={contaAtiva} faturas={[]} aoCancelado={() => {}} aoReativar={() => {}} />)
    fireEvent.click(screen.getByRole('button', { name: /Continuar cancelamento/ }))
    fireEvent.click(screen.getByRole('button', { name: 'Pular' }))
    expect(chamadas.some((c) => c.url.includes('/cancelar'))).toBe(false)
    fireEvent.click(screen.getByRole('button', { name: /Confirmar cancelamento/ }))
    expect(await screen.findByRole('heading', { name: 'Assinatura cancelada' })).toBeTruthy()
    expect(chamadas.filter((c) => c.url === '/api/billing/cancelar')).toHaveLength(1)
    expect(screen.getAllByText(/22\/10\/2026/).length).toBeGreaterThan(0)
  })
})
