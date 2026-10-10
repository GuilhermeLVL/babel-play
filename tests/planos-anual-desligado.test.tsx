// @vitest-environment jsdom
/**
 * `ANUAL_ENABLED=0` NA TELA — o MVP vende só o mensal (R$ 19,90) e o teste de 14 dias.
 *
 * `GET /api/abertura` passa a dizer `anual`. Com `anual: false`, nos DOIS desenhos do app:
 * 1. Planos: some o seletor Mensal/Anual, e nada na aba promete o anual (nem "R$ 149,90", nem "12x",
 *    nem "equivale a 4 meses grátis" — cartão, comparativo e perguntas).
 * 2. Checkout: só a forma "Mensal recorrente"; quem tinha escolhido o anual nesta aba paga o mensal.
 * 3. Sua assinatura (mensal): sem o cartão "Passar para o anual".
 * Com `anual: true` — ou ausente na resposta, que é o servidor de antes — tudo fica como era.
 */
import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'

afterEach(() => {
  cleanup()
  vi.resetModules()
  vi.restoreAllMocks()
  vi.unstubAllGlobals()
  vi.doUnmock('../src/data/api')
  vi.doUnmock('../src/data/rotas/idade')
  vi.doUnmock('../src/lib/entitlements')
  localStorage.clear()
  sessionStorage.clear()
  window.history.replaceState({}, '', '/')
})

const TITULO = 'Legenda bilíngue de qualquer coisa que você ouve, em qualquer aparelho'
const PROMETE_O_ANUAL = /anual|149,90|12x|meses grátis|por ano|\/ano/i

const statusMensal = {
  configurado: true,
  assinatura: {
    plano: 'premium',
    status: 'active',
    valeAte: new Date(2026, 9, 22).getTime(),
    provedor: 'asaas',
    ciclo: 'mensal',
    meio: 'assinatura',
  },
  proximaCobranca: '2026-10-22',
}

type Resposta = { ok: boolean; status: number; json: () => Promise<unknown> }

function montarMocks(o: { anual?: boolean; status?: unknown; plano?: string } = {}) {
  const chamadas: { url: string; corpo: any }[] = []
  vi.doMock('../src/data/api', () => ({
    apiFetch: vi.fn(async (url: string, init?: RequestInit): Promise<Resposta> => {
      chamadas.push({ url, corpo: init?.body ? JSON.parse(String(init.body)) : undefined })
      if (url.includes('/api/billing/status'))
        return { ok: true, status: 200, json: async () => o.status ?? { configurado: true, assinatura: null } }
      if (url.includes('/api/billing/faturas')) return { ok: true, status: 200, json: async () => ({ faturas: [] }) }
      if (url.includes('/api/billing/assinar'))
        return { ok: true, status: 200, json: async () => ({ linkDePagamento: 'https://sandbox.asaas.com/i/1' }) }
      return { ok: false, status: 404, json: async () => ({}) }
    }),
  }))
  vi.doMock('../src/data/rotas/idade', () => ({
    /* `anual` ausente = o servidor de antes da chave: a tela mostra o anual, como sempre. */
    lerAbertura: async () => ({ cadastro: true, checkout: true, ...(o.anual === undefined ? {} : { anual: o.anual }) }),
    declararNascimento: vi.fn(),
    carregarProtecao: async () => null,
    ehFalha: (r: { ok: boolean }) => r.ok === false,
  }))
  /* Nos testes `authRequired` é falso (self-host); a tela precisa da conta hospedada. */
  vi.doMock('../src/lib/entitlements', async (original) => {
    const real = (await original()) as typeof import('../src/lib/entitlements')
    const ents = {
      plan: o.plano ?? 'free',
      youtubeImport: false,
      managedCloudStt: false,
      managedCloudLlm: false,
      largerModels: false,
      traducaoNuance: false,
      vozNatural: false,
      armazenamento: null,
      teste: null,
    }
    return { ...real, getEntitlements: () => ents, carregarEntitlements: async () => ents }
  })
  return chamadas
}

const aguardar = () => act(async () => {})

async function abrirPlanos() {
  const { default: Planos } = await import('../src/components/views/Planos')
  const tela = render(<Planos />)
  await screen.findByRole('heading', { name: TITULO })
  await aguardar()
  return tela
}

async function abrirCheckout(formaInicial?: 'mensal' | 'anual' | 'anual_12x') {
  vi.spyOn(window, 'open').mockReturnValue(null)
  const { default: Checkout } = await import('../src/components/views/planos/Checkout')
  const tela = render(
    <Checkout
      plano="premium"
      aoTrocarPlano={() => {}}
      formaInicial={formaInicial}
      plan="free"
      conta={{ estado: 'gratis', plano: null, valeAte: null }}
      status={{ configurado: true, assinatura: null }}
    />,
  )
  await aguardar()
  return tela
}

const cartao = (id: 'gratis' | 'premium') => document.querySelector<HTMLElement>(`[data-plano="${id}"]`)!

describe('anual desligado', () => {
  it('Planos: sem o seletor Mensal/Anual, e nada na aba promete o anual', async () => {
    montarMocks({ anual: false })
    const { container } = await abrirPlanos()
    await waitFor(() => expect(screen.queryByRole('radiogroup', { name: 'Período de cobrança' })).toBeNull())
    expect(container.textContent).not.toMatch(PROMETE_O_ANUAL)
    // O mensal e o teste continuam à vista.
    expect(cartao('premium').textContent).toContain('19,90')
    expect(cartao('premium').textContent).toContain('por mês')
    /* As perguntas do protótipo (`telas2.js:53-58`). */
    const perguntas = [/O teste cobra sozinho no fim\?/, /Posso cancelar\?/, /7 dias para desistir com reembolso/]
    for (const p of perguntas) expect(container.textContent).toMatch(p)
  })

  it('Planos: quem tinha escolhido o anual nesta aba vê (e assina) o mensal', async () => {
    sessionStorage.setItem('babel.checkout.forma', 'anual')
    montarMocks({ anual: false })
    await abrirPlanos()
    await waitFor(() => expect(cartao('premium').textContent).toContain('19,90'))
    expect(cartao('premium').textContent).not.toMatch(PROMETE_O_ANUAL)
    fireEvent.click(screen.getByRole('button', { name: /Assinar Premium/ }))
    expect(sessionStorage.getItem('babel.checkout.forma')).toBe('mensal')
  })

  it('Checkout: só o mensal; nem "Anual em uma vez" nem "Anual em 12x"', async () => {
    montarMocks({ anual: false })
    const { container } = await abrirCheckout()
    await waitFor(() => expect(screen.queryByRole('button', { name: /Anual em uma vez/ })).toBeNull())
    expect(screen.queryByRole('button', { name: /Anual em 12x/ })).toBeNull()
    expect(screen.getByRole('button', { name: /Mensal recorrente/ }).getAttribute('aria-pressed')).toBe('true')
    expect(container.textContent).not.toMatch(PROMETE_O_ANUAL)
  })

  it('Checkout aberto no anual (escolha guardada): cobra o MENSAL', async () => {
    const chamadas = montarMocks({ anual: false })
    const { container } = await abrirCheckout('anual')
    await waitFor(() => expect(screen.queryByRole('button', { name: /Anual em uma vez/ })).toBeNull())
    fireEvent.click(screen.getByRole('button', { name: /Ir para o pagamento/ }))
    expect(container.textContent).not.toMatch(PROMETE_O_ANUAL)
    fireEvent.change(screen.getByLabelText('Nome completo'), { target: { value: 'Ana Souza' } })
    fireEvent.change(screen.getByLabelText('CPF'), { target: { value: '24971563792' } })
    fireEvent.change(screen.getByLabelText('E-mail para o recibo'), { target: { value: 'ana@exemplo.com' } })
    fireEvent.click(screen.getByRole('button', { name: /Assinar e pagar R\$ 19,90/ }))
    await waitFor(() => expect(chamadas.some((c) => c.url === '/api/billing/assinar')).toBe(true))
    expect(chamadas.find((c) => c.url === '/api/billing/assinar')?.corpo).toMatchObject({
      ciclo: 'mensal',
      meio: 'assinatura',
    })
  })

  it('Sua assinatura (mensal): sem o cartão "Passar para o anual"; as outras ações ficam', async () => {
    montarMocks({ anual: false, status: statusMensal, plano: 'premium' })
    const { container } = await abrirPlanos()
    await act(async () => {
      fireEvent.click(screen.getByRole('tab', { name: 'Sua assinatura' }))
    })
    await waitFor(() => expect(screen.queryByRole('button', { name: /Passar para o anual/ })).toBeNull())
    expect(screen.getByRole('button', { name: /Forma de pagamento/ })).toBeTruthy()
    expect(screen.getByRole('button', { name: /Pausar a assinatura/ })).toBeTruthy()
    expect(container.textContent).not.toMatch(/Passar para o anual|Mudar para o anual|149,90/)
  })
})

describe('anual ligado (o padrão)', () => {
  it.each([
    ['`anual: true`', true],
    ['`anual` ausente na resposta', undefined],
  ])('Planos com %s: o seletor e as promessas do anual, como sempre', async (_caso, anual) => {
    montarMocks({ anual })
    const { container } = await abrirPlanos()
    const grupo = screen.getByRole('radiogroup', { name: 'Período de cobrança' })
    expect(grupo.textContent).toContain('equivale a 4 meses grátis')
    expect(container.textContent).toMatch(/Qual a diferença entre mensal e anual\?/)
    expect(container.textContent).toMatch(/Posso passar do mensal para o anual\?/)
    fireEvent.click(screen.getByRole('radio', { name: /Anual/ }))
    expect(cartao('premium').textContent).toContain('149,90')
  })

  it('Checkout: as três formas de pagar', async () => {
    montarMocks({ anual: true })
    await abrirCheckout()
    expect(screen.getByRole('button', { name: /Mensal recorrente/ })).toBeTruthy()
    expect(screen.getByRole('button', { name: /Anual em uma vez/ }).textContent).toContain('R$ 149,90')
    expect(screen.getByRole('button', { name: /Anual em 12x no cartão/ })).toBeTruthy()
  })

  it('Sua assinatura (mensal): o cartão "Passar para o anual" está lá', async () => {
    montarMocks({ anual: true, status: statusMensal, plano: 'premium' })
    await abrirPlanos()
    await act(async () => {
      fireEvent.click(screen.getByRole('tab', { name: 'Sua assinatura' }))
    })
    expect(screen.getByRole('button', { name: /Passar para o anual/ })).toBeTruthy()
  })
})

describe('lerAbertura: o `anual` da resposta', () => {
  const comResposta = async (corpo: unknown, ok = true) => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => ({ ok, status: ok ? 200 : 500, json: async () => corpo })),
    )
    const { lerAbertura } = await import('../src/data/rotas/idade')
    return lerAbertura()
  }

  it('`anual: false` desliga; ausente (servidor de antes) ou qualquer outra coisa = ligado', async () => {
    expect(await comResposta({ cadastro: true, checkout: true, anual: false })).toEqual({
      cadastro: true,
      checkout: true,
      anual: false,
    })
    expect(await comResposta({ cadastro: true, checkout: true })).toEqual({
      cadastro: true,
      checkout: true,
      anual: true,
    })
    expect(await comResposta({ cadastro: true, checkout: false, anual: true })).toMatchObject({ anual: true })
  })

  it('falha de rede ou resposta de erro: ligado (o servidor ainda recusa se estiver desligado)', async () => {
    expect(await comResposta({}, false)).toEqual({ cadastro: true, checkout: true, anual: true })
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => {
        throw new Error('sem rede')
      }),
    )
    const { lerAbertura } = await import('../src/data/rotas/idade')
    expect(await lerAbertura()).toEqual({ cadastro: true, checkout: true, anual: true })
  })
})
