// @vitest-environment jsdom
/**
 * AS TELAS DA CONTA FALAM DO CICLO E DO MEIO (C7) — antes todas escreviam "· mensal" fixo.
 *
 * 1. Faixa, "Sua assinatura", cancelamento e confirmação dizem mensal, anual ou anual em 12x, com o
 *    valor e a renovação de cada um (o 12x NÃO renova sozinho).
 * 2. Cancelar o 12x depois dos 7 dias não para as parcelas (padrão do dono, C5): a tela não pode
 *    dizer "novas cobranças: nenhuma".
 * 3. A TROCA DE CICLO é o caminho honesto, sem rota nova: "Passar para o anual" explica que a troca
 *    é cancelar a renovação e assinar o anual no fim do período (a assinatura mensal continuaria
 *    cobrando junto) e leva ao cancelamento. O 12x não tem troca: no fim do ano, escolhe-se de novo.
 */
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'

import type { Conta } from '../src/lib/assinatura'
import { prepararDialogoNoJsdom } from './_dialogoNoJsdom'

prepararDialogoNoJsdom()

afterEach(() => {
  cleanup()
  vi.resetModules()
  vi.restoreAllMocks()
  vi.doUnmock('../src/data/api')
  window.history.replaceState({}, '', '/')
})

function mockApi(rotas: Record<string, unknown> = {}) {
  vi.doMock('../src/data/api', () => ({
    apiFetch: vi.fn(async (url: string) => {
      const chave = Object.keys(rotas).find((k) => url.includes(k))
      return chave
        ? { ok: true, status: 200, json: async () => rotas[chave] }
        : { ok: false, status: 404, json: async () => ({}) }
    }),
  }))
}

const VALE = new Date(2027, 8, 30).getTime()
const mensal: Conta = {
  estado: 'ativa',
  plano: 'premium',
  valeAte: new Date(2026, 10, 4).getTime(),
  proximaCobranca: '2026-10-30',
  ciclo: 'mensal',
  meio: 'assinatura',
}
const anual: Conta = {
  estado: 'ativa',
  plano: 'premium',
  valeAte: VALE,
  proximaCobranca: '2027-09-30',
  ciclo: 'anual',
  meio: 'assinatura',
}
const doze: Conta = { estado: 'ativa', plano: 'premium', valeAte: VALE, ciclo: 'anual', meio: 'parcelamento' }

const semAcao = () => {}

describe('a faixa "Seu plano agora"', () => {
  it('anual: "Premium · anual", renova em um ano pelo preço do ano', async () => {
    mockApi()
    const { default: FaixaDaConta } = await import('../src/components/views/planos/FaixaDaConta')
    render(<FaixaDaConta conta={anual} aoGerenciar={semAcao} aoAtualizarPagamento={semAcao} aoReativar={semAcao} />)
    const faixa = screen.getByRole('region', { name: 'Seu plano agora' })
    expect(faixa.textContent).toContain('Premium · anual')
    expect(faixa.textContent).not.toContain('mensal')
    expect(faixa.textContent).toContain('30/09/2027')
    expect(faixa.textContent).toContain('R$ 149,90')
  })

  it('12x: "Premium · anual em 12x", não renova sozinho, vale até o fim do ano', async () => {
    mockApi()
    const { default: FaixaDaConta } = await import('../src/components/views/planos/FaixaDaConta')
    render(<FaixaDaConta conta={doze} aoGerenciar={semAcao} aoAtualizarPagamento={semAcao} aoReativar={semAcao} />)
    const faixa = screen.getByRole('region', { name: 'Seu plano agora' })
    expect(faixa.textContent).toContain('Premium · anual em 12x')
    expect(faixa.textContent).toMatch(/não renova sozinho/i)
    expect(faixa.textContent).toContain('30/09/2027')
  })

  it('mensal continua "Premium · mensal", com a próxima cobrança do Asaas', async () => {
    mockApi()
    const { default: FaixaDaConta } = await import('../src/components/views/planos/FaixaDaConta')
    render(<FaixaDaConta conta={mensal} aoGerenciar={semAcao} aoAtualizarPagamento={semAcao} aoReativar={semAcao} />)
    const faixa = screen.getByRole('region', { name: 'Seu plano agora' })
    expect(faixa.textContent).toContain('Premium · mensal')
    expect(faixa.textContent).toContain('30/10/2026')
    expect(faixa.textContent).toContain('R$ 19,90')
  })
})

describe('"Sua assinatura"', () => {
  const props = {
    faturas: [],
    carregandoFaturas: false,
    aoCancelar: semAcao,
    aoTentarDeNovo: semAcao,
    aoReativar: semAcao,
  }

  it('o valor e o ciclo de cada forma', async () => {
    mockApi()
    const { default: SuaAssinatura } = await import('../src/components/views/planos/SuaAssinatura')
    const { unmount } = render(<SuaAssinatura conta={anual} abrir={semAcao} {...props} />)
    expect(screen.getByRole('heading', { name: 'Premium · anual' })).toBeTruthy()
    expect(screen.getByText('R$ 149,90 por ano')).toBeTruthy()
    unmount()

    render(<SuaAssinatura conta={doze} abrir={semAcao} {...props} />)
    expect(screen.getByRole('heading', { name: 'Premium · anual em 12x' })).toBeTruthy()
    expect(screen.getByText(/11 × R\$ 12,49 \+ R\$ 12,51/)).toBeTruthy()
  })

  it('mensal ativo: "Passar para o anual" abre o diálogo da troca; anual: "Passar para o mensal"', async () => {
    mockApi()
    const abrir = vi.fn()
    const { default: SuaAssinatura } = await import('../src/components/views/planos/SuaAssinatura')
    const { unmount } = render(<SuaAssinatura conta={mensal} abrir={abrir} {...props} />)
    fireEvent.click(screen.getByRole('button', { name: /Passar para o anual/ }))
    expect(abrir).toHaveBeenCalledWith('ciclo')
    unmount()

    render(<SuaAssinatura conta={anual} abrir={abrir} {...props} />)
    expect(screen.getByRole('button', { name: /Passar para o mensal/ })).toBeTruthy()
  })

  it('12x e cancelada: sem troca de ciclo (o 12x não renova; a cancelada já não cobra)', async () => {
    mockApi()
    const { default: SuaAssinatura } = await import('../src/components/views/planos/SuaAssinatura')
    const { unmount } = render(<SuaAssinatura conta={doze} abrir={semAcao} {...props} />)
    expect(screen.queryByRole('button', { name: /Passar para/ })).toBeNull()
    unmount()
    render(<SuaAssinatura conta={{ ...mensal, estado: 'cancelada' }} abrir={semAcao} {...props} />)
    expect(screen.queryByRole('button', { name: /Passar para/ })).toBeNull()
  })
})

describe('a troca de ciclo: o caminho honesto', () => {
  it('do mensal para o anual: cancela a renovação e assina o anual no fim do período; o botão leva ao cancelamento', async () => {
    mockApi()
    const { DialogoCiclo } = await import('../src/components/views/planos/DialogosDaAssinatura')
    render(<DialogoCiclo conta={mensal} aoFechar={semAcao} />)
    const dialogo = screen.getByRole('dialog')
    expect(dialogo.textContent).toMatch(/cobrando junto/)
    expect(dialogo.textContent).toMatch(/Cancele a renovação do mensal/)
    expect(dialogo.textContent).toContain('30/10/2026')
    expect(dialogo.textContent).toMatch(/assine o anual/)
    expect(dialogo.textContent).toMatch(/7 dias/)
    fireEvent.click(screen.getByRole('button', { name: /Cancelar a renovação/ }))
    expect(window.location.pathname).toBe('/plano/cancelar')
  })

  it('do anual para o mensal: sem reembolso proporcional depois dos 7 dias', async () => {
    mockApi()
    const { DialogoCiclo } = await import('../src/components/views/planos/DialogosDaAssinatura')
    render(<DialogoCiclo conta={anual} aoFechar={semAcao} />)
    const dialogo = screen.getByRole('dialog')
    expect(dialogo.textContent).toMatch(/Cancele a renovação do anual/)
    expect(dialogo.textContent).toMatch(/sem reembolso proporcional/)
    expect(dialogo.textContent).toMatch(/assine o mensal/)
  })
})

describe('cancelar', () => {
  const passarAteConfirmar = () => {
    fireEvent.click(screen.getByRole('button', { name: /Continuar cancelamento/ }))
    fireEvent.click(screen.getByRole('button', { name: 'Pular' }))
  }

  it('12x depois dos 7 dias: as parcelas que faltam seguem no cartão (nunca "nenhuma cobrança")', async () => {
    mockApi()
    const { default: Cancelar } = await import('../src/components/views/planos/Cancelar')
    render(<Cancelar conta={doze} faturas={[]} aoCancelado={semAcao} aoReativar={semAcao} />)
    passarAteConfirmar()
    expect(screen.getByText('Premium · anual em 12x')).toBeTruthy()
    expect(screen.getByText(/seguem no cartão/i)).toBeTruthy()
    expect(screen.queryByText('Nenhuma')).toBeNull()
  })

  it('anual: "Premium · anual", e a renovação para (nenhuma cobrança nova)', async () => {
    mockApi()
    const { default: Cancelar } = await import('../src/components/views/planos/Cancelar')
    render(<Cancelar conta={anual} faturas={[]} aoCancelado={semAcao} aoReativar={semAcao} />)
    passarAteConfirmar()
    expect(screen.getByText('Premium · anual')).toBeTruthy()
    expect(screen.getByText('Nenhuma')).toBeTruthy()
  })
})

describe('a confirmação', () => {
  it('anual: "Premium · anual" e, sem fatura, o valor do ano', async () => {
    mockApi({
      '/api/billing/status': {
        configurado: true,
        assinatura: {
          plano: 'premium',
          status: 'active',
          valeAte: VALE,
          ciclo: 'anual',
          meio: 'assinatura',
          renovacaoAutomatica: true,
        },
        proximaCobranca: '2027-09-30',
      },
      '/api/billing/faturas': { faturas: [] },
    })
    const { default: Assinado } = await import('../src/components/views/planos/Assinado')
    render(<Assinado />)
    expect(await screen.findByText('Bem-vindo ao Premium!')).toBeTruthy()
    expect(screen.getByText('Premium · anual')).toBeTruthy()
    expect(screen.getByText('R$ 149,90')).toBeTruthy()
  })
})
