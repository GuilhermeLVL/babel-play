// @vitest-environment jsdom
/**
 * O TESTE DE 14 DIAS COMEÇA COM UM TOQUE (C6) — no checkout, o único lugar de hoje onde se adquire o
 * Premium (a tela de Planos nova, com o teste em destaque, é o C7).
 *
 * 1. Quem pode testar (`/api/billing/status` diz `teste.estado: 'disponivel'`) vê "Testar 14 dias
 *    grátis" no passo 1; UM clique chama `POST /api/billing/teste` — sem nome, CPF nem cartão — e a
 *    tela diz até quando vale e que nada é cobrado.
 * 2. Perfil protegido não recebe o botão: recebe "peça ao seu responsável".
 * 3. O responsável que escolheu o menor vinculado ativa o teste PARA ele (`paraUsuario`).
 * 4. Servidor anterior ao C6 (sem `teste` no status): nada muda na tela.
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

const TERMINA = new Date(2026, 9, 14, 15, 0).getTime()

function mockApi(
  resposta: { status: number; corpo: unknown } = {
    status: 200,
    corpo: { teste: { iniciadoEm: 1, terminaEm: TERMINA, dias: 14 } },
  },
) {
  const chamadas: { url: string; corpo: any }[] = []
  vi.doMock('../src/data/api', () => ({
    apiFetch: vi.fn(async (url: string, init?: RequestInit) => {
      chamadas.push({ url, corpo: init?.body ? JSON.parse(String(init.body)) : undefined })
      if (url.includes('/api/billing/teste'))
        return { ok: resposta.status < 400, status: resposta.status, json: async () => resposta.corpo }
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

async function abrir(teste: unknown) {
  const { default: Checkout } = await import('../src/components/views/planos/Checkout')
  render(
    <Checkout
      plano="premium"
      aoTrocarPlano={() => {}}
      plan="free"
      conta={{ estado: 'gratis', plano: null, valeAte: null }}
      status={{ configurado: true, assinatura: null, ...(teste ? { teste } : {}) } as never}
    />,
  )
}

describe('um toque', () => {
  it('quem pode testar começa com um clique, sem CPF nem cartão, e vê até quando vale', async () => {
    const chamadas = mockApi()
    await abrir({ estado: 'disponivel', dias: 14 })
    fireEvent.click(screen.getByRole('button', { name: /Testar 14 dias grátis/ }))
    await waitFor(() => expect(screen.getByText(/14\/10\/2026/)).toBeTruthy())
    expect(screen.getByText(/nada é cobrado/i)).toBeTruthy()
    const pedidos = chamadas.filter((c) => c.url === '/api/billing/teste')
    expect(pedidos).toHaveLength(1)
    expect(pedidos[0].corpo ?? {}).toEqual({})
  })

  it('perfil protegido não recebe o botão: "peça ao seu responsável"', async () => {
    mockApi()
    await abrir({ estado: 'indisponivel', dias: 14, motivo: 'perfil_protegido' })
    expect(screen.queryByRole('button', { name: /Testar 14 dias grátis/ })).toBeNull()
    expect(screen.getByText(/peça ao seu responsável/i)).toBeTruthy()
  })

  it('o responsável ativa o teste para o menor vinculado escolhido', async () => {
    sessionStorage.setItem('babel.checkout.para', JSON.stringify({ id: 'menor-1', nome: 'Bia' }))
    const chamadas = mockApi()
    await abrir({ estado: 'usado', dias: 14, iniciadoEm: 1, terminaEm: 2 })
    fireEvent.click(screen.getByRole('button', { name: /Ativar o teste de 14 dias para Bia/ }))
    await waitFor(() => expect(chamadas.some((c) => c.url === '/api/billing/teste')).toBe(true))
    expect(chamadas.find((c) => c.url === '/api/billing/teste')?.corpo).toEqual({ paraUsuario: 'menor-1' })
  })

  it('o servidor recusa (e-mail já testou): a tela diz por quê', async () => {
    mockApi({
      status: 409,
      corpo: { error: 'o teste do Premium já foi usado por esta pessoa', code: 'teste_ja_usado' },
    })
    await abrir({ estado: 'disponivel', dias: 14 })
    fireEvent.click(screen.getByRole('button', { name: /Testar 14 dias grátis/ }))
    await waitFor(() => expect(screen.getByText(/já foi usado/)).toBeTruthy())
  })

  it('servidor sem o teste (anterior ao C6): nada muda', async () => {
    mockApi()
    await abrir(null)
    expect(screen.queryByRole('button', { name: /Testar/ })).toBeNull()
    expect(screen.queryByText(/responsável/)).toBeNull()
  })
})
