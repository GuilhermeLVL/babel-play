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

describe('quem paga é adulto (Fase 4)', () => {
  it('conta de menor não vê o formulário: a tela diz que o responsável assina por ela', async () => {
    mockApi({})
    const { definirProtecao } = await import('../src/lib/protecaoDoMenor')
    definirProtecao({
      nascimentoInformado: true,
      faixa: '16-17',
      protegido: true,
      exigeResponsavel: false,
      exigeConsentimentoEspecifico: false,
      vinculo: { estado: 'nenhum' },
      restrita: false,
    })
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
    expect(screen.getByRole('heading', { name: 'Quem assina é o seu responsável' })).toBeTruthy()
    expect(screen.queryByRole('button', { name: /Assinar e pagar/ })).toBeNull()
    definirProtecao(null)
  })

  it('o responsável assinando pelo menor manda `paraUsuario`', async () => {
    const chamadas = mockApi({ '/api/billing/assinar': { linkDePagamento: 'https://sandbox.asaas.com/i/9' } })
    vi.spyOn(window, 'open').mockReturnValue(null)
    sessionStorage.setItem('babel.checkout.para', JSON.stringify({ id: 'menor-1', nome: 'Bia' }))
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
    expect(screen.getByText(/assinando para/i)).toBeTruthy()
    fireEvent.change(screen.getByLabelText('Nome completo'), { target: { value: 'Maria Souza' } })
    fireEvent.change(screen.getByLabelText('CPF'), { target: { value: '12345678901' } })
    fireEvent.change(screen.getByLabelText('E-mail para o recibo'), { target: { value: 'maria@exemplo.com' } })
    fireEvent.click(screen.getByRole('button', { name: /Assinar e pagar/ }))
    await waitFor(() => expect(chamadas.some((c) => c.url === '/api/billing/assinar')).toBe(true))
    const pedido = chamadas.find((c) => c.url === '/api/billing/assinar')!
    expect(JSON.parse(String(pedido.init?.body)).paraUsuario).toBe('menor-1')
    sessionStorage.removeItem('babel.checkout.para')
  })
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

  const hojeIso = () => new Date().toISOString().slice(0, 10)
  const faturaRecente = [
    {
      id: 'pay_1',
      data: hojeIso(),
      descricao: 'Pro · mensal',
      valor: 39.9,
      metodo: 'cartao',
      status: 'paga',
      recibo: null,
      link: null,
    },
  ]
  const passarAteConfirmar = () => {
    fireEvent.click(screen.getByRole('button', { name: /Continuar cancelamento/ }))
    fireEvent.click(screen.getByRole('button', { name: 'Pular' }))
  }

  it('dentro dos 7 dias avisa que o cancelamento devolve tudo, e confirma o pedido na hora com protocolo', async () => {
    mockApi({
      '/api/billing/cancelar': {
        ok: true,
        valeAte: null,
        arrependimento: { valor: 39.9, estornado: true, protocolo: 'arrependimento:pay_1', registradoEm: Date.now() },
      },
    })
    const { default: Cancelar } = await import('../src/components/views/planos/Cancelar')
    render(
      <Cancelar conta={contaAtiva} faturas={faturaRecente as never} aoCancelado={() => {}} aoReativar={() => {}} />,
    )
    passarAteConfirmar()
    expect(screen.getByText(/reembolso integral/i)).toBeTruthy()
    expect(screen.queryByText(/peça ao suporte/i), 'o estorno é automático, não pelo suporte').toBeNull()
    fireEvent.click(screen.getByRole('button', { name: /Confirmar cancelamento/ }))
    expect(await screen.findByRole('heading', { name: 'Reembolso solicitado' })).toBeTruthy()
    expect(screen.getByText('arrependimento:pay_1')).toBeTruthy()
    expect(screen.getAllByText(/R\$ 39,90/).length).toBeGreaterThan(0)
  })

  it('estorno que falhou: a tela diz que o reembolso será feito manualmente, com prazo', async () => {
    mockApi({
      '/api/billing/cancelar': {
        ok: true,
        valeAte: null,
        arrependimento: {
          valor: 39.9,
          estornado: false,
          protocolo: 'arrependimento:pay_1',
          registradoEm: Date.now(),
          prazoManualDias: 7,
        },
      },
    })
    const { default: Cancelar } = await import('../src/components/views/planos/Cancelar')
    render(
      <Cancelar conta={contaAtiva} faturas={faturaRecente as never} aoCancelado={() => {}} aoReativar={() => {}} />,
    )
    passarAteConfirmar()
    fireEvent.click(screen.getByRole('button', { name: /Confirmar cancelamento/ }))
    expect(await screen.findByRole('heading', { name: 'Reembolso solicitado' })).toBeTruthy()
    expect(screen.getByText(/manualmente em até 7 dias/i)).toBeTruthy()
  })
})
