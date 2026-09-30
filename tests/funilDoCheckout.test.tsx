// @vitest-environment jsdom
/**
 * O FUNIL DO CHECKOUT (teste de ponta a ponta com o Asaas sandbox, 2026-09-29) — os furos que ele
 * mostrou, cada um preso aqui:
 * 1. Sem conta no modo público o checkout dizia "Nesta instalação não há cobrança" (o status falha
 *    para quem não entrou). Agora diz "Entre na sua conta para assinar", guarda a intenção e abre o
 *    login; o cartão de Planos já leva direto ao login ("Entrar e assinar o X").
 * 2. O seletor Cartão/Pix/Boleto era cosmético (o servidor manda `UNDEFINED`): saiu, e uma linha
 *    diz que a escolha é na página do Asaas.
 * 3. Esperando o pagamento, voltar à aba (foco/visibilidade) confere o status NA HORA.
 * 4. 403 `idade_nao_informada` pede a data de nascimento ali mesmo e tenta de novo.
 * 5. Venda pausada: o cartão mostra "Vendas reabrem em breve", desabilitado.
 * 6. A confirmação e "Sua assinatura" mostram a PRÓXIMA COBRANÇA do Asaas, não o fim da graça.
 */
import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'

afterEach(() => {
  cleanup()
  vi.resetModules()
  vi.restoreAllMocks()
  vi.doUnmock('../src/data/api')
  vi.doUnmock('../src/data/rotas/idade')
  localStorage.clear()
  sessionStorage.clear()
  window.history.replaceState({}, '', '/')
})

type Resposta = { ok: boolean; status?: number; json: () => Promise<unknown> }
type Rota = unknown | ((init?: RequestInit) => { status: number; corpo: unknown })

function mockApi(rotas: Record<string, Rota>) {
  const chamadas: { url: string; init?: RequestInit }[] = []
  vi.doMock('../src/data/api', () => ({
    apiFetch: vi.fn(async (url: string, init?: RequestInit): Promise<Resposta> => {
      chamadas.push({ url, init })
      const chave = Object.keys(rotas).find((k) => url.includes(k))
      if (!chave) return { ok: false, status: 404, json: async () => ({}) }
      const r = rotas[chave]
      if (typeof r === 'function') {
        const { status, corpo } = (r as (i?: RequestInit) => { status: number; corpo: unknown })(init)
        return { ok: status < 400, status, json: async () => corpo }
      }
      return { ok: true, status: 200, json: async () => r }
    }),
  }))
  return chamadas
}

/** A abertura (venda ligada/pausada) e a declaração da idade, sem rede. */
function mockIdade(o: { checkout?: boolean; faixaDeclarada?: 'adulto' | '16-17' } = {}) {
  const declarar = vi.fn(async (nascimento: string) => {
    const { definirProtecao } = await import('../src/lib/protecaoDoMenor')
    const estado = {
      nascimentoInformado: true,
      faixa: o.faixaDeclarada ?? 'adulto',
      protegido: o.faixaDeclarada === '16-17',
      exigeResponsavel: false,
      exigeConsentimentoEspecifico: false,
      vinculo: { estado: 'nenhum' as const },
      restrita: false,
    }
    definirProtecao(estado)
    return { ok: true as const, estado, nascimento }
  })
  vi.doMock('../src/data/rotas/idade', () => ({
    lerAbertura: async () => ({ cadastro: true, checkout: o.checkout ?? true }),
    declararNascimento: declarar,
    carregarProtecao: async () => null,
    ehFalha: (r: { ok: boolean }) => r.ok === false,
  }))
  return declarar
}

const contaGratis = { estado: 'gratis', plano: null, valeAte: null } as const

async function preencherEPagar() {
  fireEvent.change(screen.getByLabelText('Nome completo'), { target: { value: 'Ana Souza' } })
  fireEvent.change(screen.getByLabelText('CPF'), { target: { value: '12345678901' } })
  fireEvent.change(screen.getByLabelText('E-mail para o recibo'), { target: { value: 'ana@exemplo.com' } })
  fireEvent.click(screen.getByRole('button', { name: /Assinar e pagar/ }))
}

describe('1. sem conta, no checkout', () => {
  it('status nulo e identidade anônima: pede para entrar, guarda a intenção e abre o login', async () => {
    mockApi({})
    mockIdade()
    const { definirIdentidade } = await import('../src/lib/identidade')
    definirIdentidade('anonimo')
    const aoEntrar = vi.fn()
    const { default: Checkout } = await import('../src/components/views/planos/Checkout')
    render(
      <Checkout
        plano="premium"
        aoTrocarPlano={() => {}}
        plan="free"
        conta={contaGratis}
        status={null}
        aoEntrar={aoEntrar}
      />,
    )
    fireEvent.click(screen.getByRole('button', { name: /Ir para o pagamento/ }))
    expect(screen.getByRole('heading', { name: 'Entre na sua conta para assinar' })).toBeTruthy()
    expect(screen.queryByText(/não há cobrança/)).toBeNull()
    fireEvent.click(screen.getByRole('button', { name: 'Entrar ou criar conta' }))
    expect(aoEntrar).toHaveBeenCalledTimes(1)
    const { lerIntencao } = await import('../src/lib/intencaoDeLogin')
    expect(lerIntencao()).toMatchObject({ rota: '/plano/assinar', plano: 'premium' })
  })
})

describe('2. forma de pagamento', () => {
  it('sem seletor cosmético: a escolha é na página do Asaas', async () => {
    mockApi({})
    mockIdade()
    const { default: Checkout } = await import('../src/components/views/planos/Checkout')
    render(
      <Checkout
        plano="premium"
        aoTrocarPlano={() => {}}
        plan="free"
        conta={contaGratis}
        status={{ configurado: true, assinatura: null }}
      />,
    )
    fireEvent.click(screen.getByRole('button', { name: /Ir para o pagamento/ }))
    expect(screen.queryByRole('radiogroup', { name: 'Forma de pagamento' })).toBeNull()
    expect(screen.queryByRole('radio', { name: /Pix/ })).toBeNull()
    expect(screen.getByText('Você escolhe Pix, cartão ou boleto na página segura do Asaas.')).toBeTruthy()
    expect(screen.getByText(/não vê nem guarda esses dados/)).toBeTruthy()
  })
})

describe('3. voltar da aba do Asaas', () => {
  it('foco e visibilidade conferem o status na hora, sem esperar os 5 s', async () => {
    let statusAtual = 'trialing'
    const chamadas = mockApi({
      '/api/billing/assinar': { linkDePagamento: 'https://sandbox.asaas.com/i/1' },
      '/api/billing/status': () => ({
        status: 200,
        corpo: { configurado: true, assinatura: { plano: 'premium', status: statusAtual, valeAte: null } },
      }),
    })
    mockIdade()
    vi.spyOn(window, 'open').mockReturnValue(null)
    window.history.replaceState({}, '', '/plano/assinar')
    const { default: Checkout } = await import('../src/components/views/planos/Checkout')
    render(
      <Checkout
        plano="premium"
        aoTrocarPlano={() => {}}
        plan="free"
        conta={contaGratis}
        status={{ configurado: true, assinatura: null }}
      />,
    )
    fireEvent.click(screen.getByRole('button', { name: /Ir para o pagamento/ }))
    await preencherEPagar()
    expect(await screen.findByText(/Aguardando a confirmação do pagamento/)).toBeTruthy()
    const perguntas = () => chamadas.filter((c) => c.url === '/api/billing/status').length

    const antes = perguntas()
    await act(async () => {
      window.dispatchEvent(new Event('focus'))
    })
    await waitFor(() => expect(perguntas()).toBe(antes + 1))

    statusAtual = 'active'
    Object.defineProperty(document, 'visibilityState', { configurable: true, get: () => 'visible' })
    await act(async () => {
      document.dispatchEvent(new Event('visibilitychange'))
    })
    await waitFor(() => expect(window.location.pathname).toBe('/plano/assinado'))
    expect(perguntas(), 'uma pergunta por volta à aba, sem esperar o intervalo').toBe(antes + 2)
  })
})

/* 20 s por teste, e não os 5 s padrão: cada teste espera até 5 s por DUAS telas seguidas (o campo da
   data e o aviso do responsável) depois de reimportar o Checkout inteiro (`vi.resetModules`). Na suíte
   cheia do CI, com 700 arquivos disputando a máquina, o teste estourava os 5 s antes de as esperas
   dele acabarem (30/09/2026) — o limite do teste tem de caber as esperas que ele mesmo declara. */
describe('4. a idade ali mesmo', { timeout: 20_000 }, () => {
  const idadeFaltando = (init?: RequestInit) => {
    void init
    return {
      status: 403,
      corpo: { error: 'informe a sua data de nascimento antes de pagar', code: 'idade_nao_informada' },
    }
  }

  it('403 idade_nao_informada: pede a data inline, declara e tenta de novo', async () => {
    let tentativas = 0
    const chamadas = mockApi({
      '/api/billing/assinar': () => {
        tentativas++
        return tentativas === 1
          ? idadeFaltando()
          : { status: 200, corpo: { linkDePagamento: 'https://sandbox.asaas.com/i/2' } }
      },
    })
    const declarar = mockIdade()
    const abrir = vi.spyOn(window, 'open').mockReturnValue(null)
    const { default: Checkout } = await import('../src/components/views/planos/Checkout')
    render(
      <Checkout
        plano="premium"
        aoTrocarPlano={() => {}}
        plan="free"
        conta={contaGratis}
        status={{ configurado: true, assinatura: null }}
      />,
    )
    fireEvent.click(screen.getByRole('button', { name: /Ir para o pagamento/ }))
    await preencherEPagar()
    const campo = await screen.findByLabelText('Data de nascimento')
    expect(abrir).not.toHaveBeenCalled()
    fireEvent.change(campo, { target: { value: '1990-05-10' } })
    fireEvent.click(screen.getByRole('button', { name: /Assinar e pagar/ }))
    await waitFor(() => expect(abrir).toHaveBeenCalledWith('https://sandbox.asaas.com/i/2', '_blank', 'noopener'))
    expect(declarar).toHaveBeenCalledWith('1990-05-10')
    expect(chamadas.filter((c) => c.url === '/api/billing/assinar')).toHaveLength(2)
  })

  it('declarou menor de 18: a tela diz que o responsável assina, sem tentar de novo', async () => {
    const chamadas = mockApi({ '/api/billing/assinar': idadeFaltando })
    mockIdade({ faixaDeclarada: '16-17' })
    const { default: Checkout } = await import('../src/components/views/planos/Checkout')
    render(
      <Checkout
        plano="premium"
        aoTrocarPlano={() => {}}
        plan="free"
        conta={contaGratis}
        status={{ configurado: true, assinatura: null }}
      />,
    )
    fireEvent.click(screen.getByRole('button', { name: /Ir para o pagamento/ }))
    await preencherEPagar()
    fireEvent.change(await screen.findByLabelText('Data de nascimento', {}, { timeout: 5000 }), {
      target: { value: '2010-01-01' },
    })
    fireEvent.click(screen.getByRole('button', { name: /Assinar e pagar/ }))
    expect(
      await screen.findByRole('heading', { name: 'Quem assina é o seu responsável' }, { timeout: 5000 }),
    ).toBeTruthy()
    expect(chamadas.filter((c) => c.url === '/api/billing/assinar')).toHaveLength(1)
    const { definirProtecao } = await import('../src/lib/protecaoDoMenor')
    definirProtecao(null)
  })
})

describe('cartões de Planos', () => {
  const basico = {
    '/api/billing/status': { configurado: true, assinatura: null },
  }

  it('1. sem conta: "Entrar e assinar o Premium" leva ao login com a intenção guardada', async () => {
    mockApi(basico)
    mockIdade()
    const { definirIdentidade } = await import('../src/lib/identidade')
    definirIdentidade('anonimo')
    const onEntrar = vi.fn()
    const { default: Planos } = await import('../src/components/views/Planos')
    render(<Planos onEntrar={onEntrar} />)
    fireEvent.click(await screen.findByRole('button', { name: 'Entrar e assinar o Premium' }))
    expect(onEntrar).toHaveBeenCalledTimes(1)
    const { lerIntencao } = await import('../src/lib/intencaoDeLogin')
    expect(lerIntencao()).toMatchObject({ rota: '/plano/assinar', plano: 'premium' })
    expect(screen.queryByRole('button', { name: 'Assinar Premium' })).toBeNull()
  })

  it('5. venda pausada (abertura): "Vendas reabrem em breve", desabilitado', async () => {
    mockApi(basico)
    mockIdade({ checkout: false })
    const { default: Planos } = await import('../src/components/views/Planos')
    render(<Planos />)
    const botoes = await screen.findAllByRole('button', { name: 'Vendas reabrem em breve' })
    // Matriz v2: um cartão pago só, o Premium.
    expect(botoes).toHaveLength(1)
    expect(botoes.every((b) => (b as HTMLButtonElement).disabled)).toBe(true)
    expect(screen.queryByRole('button', { name: /^Assinar / })).toBeNull()
  })

  it('5. venda pausada (flag vender_planos desligada)', async () => {
    mockApi(basico)
    mockIdade()
    localStorage.setItem('babel.flags', JSON.stringify({ vender_planos: { ligada: false } }))
    const { default: Planos } = await import('../src/components/views/Planos')
    render(<Planos />)
    expect(await screen.findAllByRole('button', { name: 'Vendas reabrem em breve' })).toHaveLength(1)
  })

  it('venda aberta e com conta: "Assinar Premium" continua', async () => {
    mockApi(basico)
    mockIdade()
    const { default: Planos } = await import('../src/components/views/Planos')
    render(<Planos />)
    expect(await screen.findByRole('button', { name: 'Assinar Premium' })).toBeTruthy()
  })
})

describe('6. a próxima cobrança', () => {
  it('a confirmação mostra a próxima cobrança do Asaas, não o fim da graça', async () => {
    mockApi({
      '/api/billing/status': {
        configurado: true,
        assinatura: { plano: 'premium', status: 'active', valeAte: new Date(2026, 10, 4).getTime() },
        proximaCobranca: '2026-10-30',
      },
      '/api/billing/faturas': { faturas: [] },
    })
    const { default: Assinado } = await import('../src/components/views/planos/Assinado')
    render(<Assinado />)
    expect(await screen.findByText('Bem-vindo ao Premium!')).toBeTruthy()
    expect(screen.getByText('Próxima cobrança em')).toBeTruthy()
    expect(screen.getByText('30/10/2026')).toBeTruthy()
    expect(screen.queryByText('04/11/2026')).toBeNull()
  })

  it('sem a data do Asaas, a confirmação não chama o fim da graça de renovação', async () => {
    mockApi({
      '/api/billing/status': {
        configurado: true,
        assinatura: { plano: 'premium', status: 'active', valeAte: new Date(2026, 10, 4).getTime() },
      },
      '/api/billing/faturas': { faturas: [] },
    })
    const { default: Assinado } = await import('../src/components/views/planos/Assinado')
    render(<Assinado />)
    expect(await screen.findByText('Bem-vindo ao Premium!')).toBeTruthy()
    expect(screen.queryByText(/Renova em/)).toBeNull()
    expect(screen.getByText('Acesso até')).toBeTruthy()
  })

  it('Sua assinatura: "Próxima cobrança" com a data do Asaas; sem ela, "Acesso até"', async () => {
    mockApi({})
    const { default: SuaAssinatura } = await import('../src/components/views/planos/SuaAssinatura')
    const base = { estado: 'ativa', plano: 'premium', valeAte: new Date(2026, 10, 4).getTime() } as const
    const props = {
      faturas: [],
      carregandoFaturas: false,
      abrir: () => {},
      aoCancelar: () => {},
      aoTentarDeNovo: () => {},
      aoReativar: () => {},
    }
    const { unmount } = render(<SuaAssinatura conta={{ ...base, proximaCobranca: '2026-10-30' }} {...props} />)
    expect(screen.getByText('Próxima cobrança')).toBeTruthy()
    expect(screen.getByText('30/10/2026')).toBeTruthy()
    unmount()
    render(<SuaAssinatura conta={base} {...props} />)
    expect(screen.queryByText('Próxima cobrança')).toBeNull()
    expect(screen.getByText('Acesso até')).toBeTruthy()
    expect(screen.getByText('04/11/2026')).toBeTruthy()
  })

  it('estadoDaConta leva a próxima cobrança do status para a conta ativa', async () => {
    const { estadoDaConta } = await import('../src/lib/assinatura')
    const c = estadoDaConta('premium', {
      configurado: true,
      assinatura: { plano: 'premium', status: 'active', valeAte: 1, provedor: 'asaas' },
      proximaCobranca: '2026-10-30',
    })
    expect(c.proximaCobranca).toBe('2026-10-30')
  })
})
