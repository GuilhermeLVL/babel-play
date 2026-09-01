// @vitest-environment jsdom
/**
 * COMPRAR CRÉDITOS (economia-legivel-e-moedas) — os contratos que valem dinheiro:
 * 1. Não aparece onde não há o que vender (self-host / billing não configurado).
 * 2. O preço vem do catálogo do core, nunca de string escrita à mão na tela.
 * 3. O botão só inicia a cobrança — o texto diz que o crédito entra na confirmação, e o
 *    estado pós-envio NÃO finge sucesso.
 * 4. Nome e CPF incompletos não deixam pagar (o Asaas recusaria, e o erro seria do usuário).
 */
import { it, expect, afterEach, vi } from 'vitest'
import { render, screen, cleanup, fireEvent, waitFor } from '@testing-library/react'
import { CATALOGO_DE_CREDITOS, PRECO_DO_PASSE_CENTAVOS, precoEmReais } from '../src/core/creditos'

afterEach(() => { cleanup(); vi.resetModules(); vi.restoreAllMocks() })

/** Sobe a tela com billing ligado e conta exigida — o único cenário em que ela existe. */
async function montar(opts: { configurado?: boolean; auth?: boolean; link?: string | null } = {}) {
  const { configurado = true, auth = true, link = 'https://asaas.example/cobranca/1' } = opts
  vi.doMock('../src/lib/supabase', () => ({ authRequired: auth }))
  vi.doMock('../src/data/api', () => ({
    apiFetch: vi.fn(async (url: string) => {
      if (url.includes('/status')) return { ok: true, json: async () => ({ configurado }) }
      if (url.includes('/creditos')) return { ok: true, json: async () => ({ saldo: 120, temPasse: false, compras: [] }) }
      if (url.includes('/comprar')) return { ok: true, json: async () => ({ linkDePagamento: link }) }
      return { ok: false, status: 404, json: async () => ({}) }
    }),
  }))
  const { default: ComprarCreditos } = await import('../src/components/views/loja/ComprarCreditos')
  const r = render(<ComprarCreditos />)
  await waitFor(() => expect(screen.queryByTestId('comprar-creditos')).toBeTruthy())
  return r
}

it('mostra o preço do catálogo, não um número escrito à mão', async () => {
  await montar()
  const tela = screen.getByTestId('comprar-creditos')
  // Se alguém mudar o preço no core e esquecer a tela, isto reprova.
  // Comparar com a função (e não com "R$ 24,90" literal) é o próprio contrato: o preço da tela
  // é o do catálogo. De quebra, evita o falso negativo do espaço não-quebrável do Intl.
  for (const p of CATALOGO_DE_CREDITOS) {
    expect(tela.textContent, p.sku).toContain(precoEmReais(p.precoCentavos))
  }
  expect(precoEmReais(PRECO_DO_PASSE_CENTAVOS)).toMatch(/14,90/)
})

it('diz o saldo que o servidor derivou', async () => {
  await montar()
  expect(screen.getByTestId('comprar-creditos').textContent).toContain('120')
})

it('declara que crédito não compra progresso — é a linha que separa isto de pay-to-win', async () => {
  await montar()
  const t = screen.getByTestId('comprar-creditos').textContent ?? ''
  expect(t).toContain('Não compram progresso')
})

it('não existe onde não há o que vender', async () => {
  vi.doMock('../src/lib/supabase', () => ({ authRequired: false }))
  vi.doMock('../src/data/api', () => ({ apiFetch: vi.fn(async () => ({ ok: true, json: async () => ({ configurado: true }) })) }))
  const { default: ComprarCreditos } = await import('../src/components/views/loja/ComprarCreditos')
  const { container } = render(<ComprarCreditos />)
  expect(container.querySelector('[data-testid="comprar-creditos"]')).toBeNull()
})

it('sem billing configurado, some — nada de prometer compra que não existe', async () => {
  vi.doMock('../src/lib/supabase', () => ({ authRequired: true }))
  vi.doMock('../src/data/api', () => ({
    apiFetch: vi.fn(async (url: string) => (url.includes('/status')
      ? { ok: true, json: async () => ({ configurado: false }) }
      : { ok: false, status: 404, json: async () => ({}) })),
  }))
  const { default: ComprarCreditos } = await import('../src/components/views/loja/ComprarCreditos')
  const { container } = render(<ComprarCreditos />)
  await waitFor(() => expect(container.querySelector('[data-testid="comprar-creditos"]')).toBeNull())
})

it('pagar exige nome e CPF completos', async () => {
  await montar()
  fireEvent.click(screen.getByText('Passe da Temporada 1'))
  const botao = await screen.findByRole('button', { name: /Pagar/ })
  expect((botao as HTMLButtonElement).disabled).toBe(true)

  fireEvent.change(screen.getByLabelText('Seu nome completo'), { target: { value: 'Fulano de Tal' } })
  fireEvent.change(screen.getByLabelText('CPF, só números'), { target: { value: '12345678901' } })
  expect((screen.getByRole('button', { name: /Pagar/ }) as HTMLButtonElement).disabled).toBe(false)
})

it('depois de abrir o pagamento, NÃO finge sucesso — diz que nada muda até confirmar', async () => {
  vi.stubGlobal('open', vi.fn())
  await montar()
  fireEvent.click(screen.getByText('Passe da Temporada 1'))
  fireEvent.change(screen.getByLabelText('Seu nome completo'), { target: { value: 'Fulano de Tal' } })
  fireEvent.change(screen.getByLabelText('CPF, só números'), { target: { value: '12345678901' } })
  fireEvent.click(screen.getByRole('button', { name: /Pagar/ }))
  await waitFor(() => {
    const t = screen.getByTestId('comprar-creditos').textContent ?? ''
    expect(t).toContain('Nada muda até lá')
  })
})
