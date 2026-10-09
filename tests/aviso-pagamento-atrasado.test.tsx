// @vitest-environment jsdom
/**
 * A ASSINATURA COM PAGAMENTO ATRASADO (`past_due`) AVISA (funil de 29/09).
 *
 * Com conta e a cobrança atrasada: a faixa `aviso-info warn` diz o plano e leva a Planos → Sua
 * assinatura. Dispensar vale para a sessão do navegador (volta numa sessão nova). Ativa, sem conta
 * ou na edição estática: nada — e sem conta nem se pergunta ao servidor. No self-host também não
 * (lá não há cobrança): `estadoDaConta` devolve `selfhost`.
 */
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import type { StatusDeBilling } from '../src/lib/assinatura'

const m = vi.hoisted(() => ({
  status: null as StatusDeBilling | null,
  carregar: vi.fn(),
  navegarPara: vi.fn(),
}))

vi.mock('../src/lib/assinatura', async (original) => {
  const real = await original<typeof import('../src/lib/assinatura')>()
  return { ...real, carregarStatusDeBilling: m.carregar }
})
/* Hospedado (com login): no teste o padrão seria o self-host, onde não há cobrança. */
vi.mock('../src/lib/entitlements', async (original) => {
  const real = await original<typeof import('../src/lib/entitlements')>()
  return { ...real, getEntitlements: () => ({ ...real.getEntitlements(), plan: 'premium' }) }
})
vi.mock('../src/lib/rotas', async (original) => {
  const real = await original<typeof import('../src/lib/rotas')>()
  return { ...real, navegarPara: m.navegarPara }
})

import AvisoDePagamentoAtrasado from '../src/components/conta/AvisoDePagamentoAtrasado'
import { _reiniciarIdentidade, definirIdentidade } from '../src/lib/identidade'

const atrasada = (plano = 'premium'): StatusDeBilling => ({
  configurado: true,
  assinatura: { plano, status: 'past_due', valeAte: null, provedor: 'asaas' },
})

const montar = async () => {
  render(<AvisoDePagamentoAtrasado />)
  await act(async () => {})
}

beforeEach(() => {
  sessionStorage.clear()
  m.carregar.mockReset()
  m.carregar.mockImplementation(async () => m.status)
  m.navegarPara.mockReset()
  _reiniciarIdentidade()
  definirIdentidade('conta')
})
afterEach(() => {
  cleanup()
  vi.unstubAllEnvs()
})

describe('pagamento atrasado', () => {
  it('mostra o aviso com o plano e leva a Planos → Sua assinatura', async () => {
    m.status = atrasada('premium')
    await montar()
    const aviso = screen.getByTestId('aviso-de-pagamento-atrasado')
    /* A faixa de aviso, no tom de alerta (é um fato da conta, não um convite). */
    expect(aviso.className).toContain('q-aviso')
    expect(aviso.className).toContain('qc-alerta')
    expect(aviso.textContent).toContain(
      'Não conseguimos confirmar o pagamento da sua assinatura. Pague a fatura para continuar com o Premium.',
    )
    fireEvent.click(screen.getByRole('button', { name: /Ver minha assinatura/ }))
    expect(m.navegarPara).toHaveBeenCalledWith({ view: 'planos', planosTela: 'assinatura' })
  })

  it('dispensar esconde pelo resto da sessão do navegador', async () => {
    m.status = atrasada()
    await montar()
    fireEvent.click(screen.getByRole('button', { name: /Dispensar/ }))
    expect(screen.queryByTestId('aviso-de-pagamento-atrasado')).toBeNull()
    cleanup()
    await montar()
    expect(screen.queryByTestId('aviso-de-pagamento-atrasado')).toBeNull()
    sessionStorage.clear() // sessão nova
    cleanup()
    await montar()
    expect(screen.getByTestId('aviso-de-pagamento-atrasado')).toBeTruthy()
  })

  it('assinatura ativa: nada', async () => {
    m.status = {
      configurado: true,
      assinatura: { plano: 'premium', status: 'active', valeAte: null, provedor: 'asaas' },
    }
    await montar()
    expect(screen.queryByTestId('aviso-de-pagamento-atrasado')).toBeNull()
  })

  it('sem conta: nada, e nem pergunta ao servidor', async () => {
    _reiniciarIdentidade()
    definirIdentidade('anonimo')
    m.status = atrasada()
    await montar()
    expect(m.carregar).not.toHaveBeenCalled()
    expect(screen.queryByTestId('aviso-de-pagamento-atrasado')).toBeNull()
  })

  it('edição estática: nada', async () => {
    vi.stubEnv('VITE_EDICAO_ESTATICA', '1')
    m.status = atrasada()
    await montar()
    expect(m.carregar).not.toHaveBeenCalled()
    expect(screen.queryByTestId('aviso-de-pagamento-atrasado')).toBeNull()
  })
})
