// @vitest-environment jsdom
/**
 * CONVITES SEM CONTA (auditoria de 14/11/2026, change `convites-sem-conta`).
 *
 * No modo público sem conta, Ajustes mostrava o ramo "com conta": e-mail vazio "· não verificado",
 * "Trocar senha" e "Ativar 2FA" clicáveis (o 2FA chamava o Supabase sem sessão), "Sair", "Sair dos
 * outros" e "Excluir a conta" com o diálogo inteiro até um 501. "Pedir uma cópia" virava um toast de
 * "tente de novo" para uma rota que nunca responde sem conta. Agora cada um vira convite (ou a ação que
 * existe de verdade sem conta: apagar o que este navegador guarda).
 */
import { readFileSync } from 'node:fs'
import { join } from 'node:path'

import { act, cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const { supa, store, toast } = vi.hoisted(() => ({
  supa: { carregar: vi.fn(async () => null) },
  store: { limparTudo: vi.fn(async () => {}) },
  toast: { askConfirm: vi.fn(async (_pedido: { title: string; danger?: boolean }) => true) },
}))
vi.mock('../src/lib/supabase', () => ({
  supabase: null,
  authRequired: true,
  carregarSupabase: supa.carregar,
  getAccessToken: async () => null,
}))
vi.mock('../src/data/efemero/store', () => store)
vi.mock('../src/components/Toast', async (orig) => ({
  ...(await orig<typeof import('../src/components/Toast')>()),
  askConfirm: toast.askConfirm,
}))
vi.mock('../src/lib/preferencias', async (orig) => {
  const real = await orig<typeof import('../src/lib/preferencias')>()
  return { ...real, usePreferencias: () => real.PADRAO, salvarPreferencias: vi.fn(async () => true) }
})
vi.mock('../src/lib/usePerfil', () => ({ usePerfil: () => ({ perfil: null }) }))
vi.mock('../src/components/anuncios/AnunciosNosAjustes', () => ({ default: () => null }))

import { conviteNoLugarDaTela, EXIGE_CONTA } from '../src/components/conta/exigeConta'
import AbaConta from '../src/components/views/ajustes/AbaConta'
import AbaNotificacoes from '../src/components/views/ajustes/AbaNotificacoes'
import AbaPrivacidade from '../src/components/views/ajustes/AbaPrivacidade'
import { _reiniciarIdentidade, definirIdentidade } from '../src/lib/identidade'
import { EVENTO_PEDIR_ENTRADA } from '../src/lib/pedirConta'
import type { ViewType } from '../src/types'

let pedidos: string[] = []
const ouvir = (e: Event) => pedidos.push((e as CustomEvent<{ modo: string }>).detail.modo)

beforeEach(() => {
  _reiniciarIdentidade()
  definirIdentidade('anonimo')
  pedidos = []
  window.addEventListener(EVENTO_PEDIR_ENTRADA, ouvir)
  vi.clearAllMocks()
})
afterEach(() => {
  window.removeEventListener(EVENTO_PEDIR_ENTRADA, ouvir)
  cleanup()
})

describe('Ajustes → Conta sem conta', () => {
  it('sem e-mail, senha, 2FA, aparelhos, sair nem excluir; o convite com Criar conta e Já tenho conta', () => {
    render(<AbaConta onReplayTour={() => {}} aoIrParaPrivacidade={() => {}} />)
    for (const nome of [/Trocar/, /Trocar senha/, /^Ativar$/, /Sair dos outros/, /^Sair$/, /Excluir a conta/])
      expect(screen.queryByRole('button', { name: nome }), String(nome)).toBeNull()
    expect(screen.queryByText(/não verificado/)).toBeNull()
    expect(screen.queryByText('Aparelhos conectados')).toBeNull()
    /* Nem pergunta ao Supabase quem é a pessoa: não há conta. */
    expect(supa.carregar).not.toHaveBeenCalled()

    const cartao = screen.getByTestId('cartao-de-convite')
    expect(cartao.textContent).toContain('Você está usando o Frasy sem conta')
    fireEvent.click(within(cartao).getByRole('button', { name: 'Criar conta' }))
    fireEvent.click(within(cartao).getByRole('button', { name: 'Já tenho conta' }))
    expect(pedidos).toEqual(['signup', 'login'])
    /* Rever a apresentação continua. */
    expect(screen.getByRole('button', { name: /Rever/ })).toBeTruthy()
  })

  it('"Apagar sessões, palavras e progresso" pergunta antes, diz o que fica (livros, avatar) e só então apaga', async () => {
    render(<AbaConta onReplayTour={() => {}} aoIrParaPrivacidade={() => {}} />)
    toast.askConfirm.mockResolvedValueOnce(false)
    fireEvent.click(screen.getByRole('button', { name: 'Apagar sessões, palavras e progresso deste navegador' }))
    await waitFor(() => expect(toast.askConfirm).toHaveBeenCalledTimes(1))
    expect(store.limparTudo).not.toHaveBeenCalled()
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'Apagar sessões, palavras e progresso deste navegador' }))
    })
    await waitFor(() => expect(store.limparTudo).toHaveBeenCalledTimes(1))
    const pedido = toast.askConfirm.mock.calls[1][0] as { title: string; detail?: string; danger?: boolean }
    expect(pedido).toMatchObject({ title: 'Apagar sessões, palavras e progresso deste navegador?', danger: true })
    expect(pedido.detail).toMatch(/livros da sua estante, o avatar/)
  })

  it('a sessão que chega depois (anonimo → conta) troca a aba para o ramo da conta, sem o botão de apagar', async () => {
    render(<AbaConta onReplayTour={() => {}} aoIrParaPrivacidade={() => {}} />)
    expect(screen.getByTestId('cartao-de-convite')).toBeTruthy()
    act(() => definirIdentidade('conta'))
    expect(screen.queryByTestId('cartao-de-convite')).toBeNull()
    expect(screen.queryByRole('button', { name: /Apagar sessões/ })).toBeNull()
    expect(screen.getByRole('button', { name: /Trocar senha/ })).toBeTruthy()
    await waitFor(() => expect(supa.carregar).toHaveBeenCalled())
  })

  it('Privacidade e Notificações também acompanham a identidade', () => {
    render(
      <>
        <AbaPrivacidade />
        <AbaNotificacoes />
      </>,
    )
    expect(screen.getByTestId('email-sem-conta')).toBeTruthy()
    act(() => definirIdentidade('conta'))
    expect(screen.queryByTestId('cartao-de-convite')).toBeNull()
    expect(screen.queryByTestId('email-sem-conta')).toBeNull()
    expect(screen.getByRole('button', { name: /Pedir uma cópia/ })).toBeTruthy()
  })

  it('com conta, o ramo de sempre (e-mail, senha, 2FA, sair, excluir)', async () => {
    definirIdentidade('conta')
    render(<AbaConta onReplayTour={() => {}} aoIrParaPrivacidade={() => {}} />)
    expect(screen.getByRole('button', { name: /Trocar senha/ })).toBeTruthy()
    expect(screen.getByRole('button', { name: /Excluir a conta/ })).toBeTruthy()
    expect(screen.queryByTestId('cartao-de-convite')).toBeNull()
    await waitFor(() => expect(supa.carregar).toHaveBeenCalled())
  })
})

describe('Ajustes → Privacidade sem conta', () => {
  it('"Pedir uma cópia" vira convite: nada de botão que termina em "tente de novo"', () => {
    render(<AbaPrivacidade />)
    expect(screen.queryByRole('button', { name: /Pedir uma cópia/ })).toBeNull()
    const cartao = screen.getByTestId('cartao-de-convite')
    expect(cartao.textContent).toContain('A cópia dos dados vem da conta')
    fireEvent.click(within(cartao).getByRole('button', { name: 'Criar conta' }))
    expect(pedidos).toEqual(['signup'])
    /* O resto da aba (os consentimentos) continua. */
    expect(screen.getByRole('switch', { name: 'Usar IA de nuvem' })).toBeTruthy()
  })
})

describe('Ajustes → Notificações sem conta', () => {
  it('o canal E-mail e o resumo semanal ficam desligados, com o convite inline', () => {
    render(<AbaNotificacoes />)
    const email = screen.getByRole('switch', { name: 'Revisão pendente por e-mail' }) as HTMLButtonElement
    expect(email.disabled).toBe(true)
    expect((screen.getByRole('switch', { name: 'Revisão pendente no app' }) as HTMLButtonElement).disabled).toBe(false)
    expect((screen.getByRole('switch', { name: 'Resumo semanal' }) as HTMLButtonElement).disabled).toBe(true)
    const aviso = screen.getByTestId('email-sem-conta')
    fireEvent.click(within(aviso).getByRole('button', { name: 'Já tenho conta' }))
    expect(pedidos).toEqual(['login'])
  })
})

/**
 * O INVENTÁRIO: cada tela, sem conta, mostra exatamente UMA coisa — a tela, o convite no lugar dela ou o
 * "não encontrado". O `Record` obriga a listar toda `ViewType` (uma nova quebra o typecheck aqui).
 */
describe('inventário das telas sem conta', () => {
  /* `study`, `reading` e `metrics` não chegam a ser `activeView`: a navegação as leva a Cartões e à Análise. */
  const TELAS: Record<ViewType, 'tela' | 'remapeada'> = {
    hub: 'tela',
    capture: 'tela',
    interprete: 'tela',
    study: 'remapeada',
    play: 'tela',
    library: 'tela',
    livros: 'tela',
    analysis: 'tela',
    settings: 'tela',
    reading: 'remapeada',
    metrics: 'remapeada',
    cartoes: 'tela',
    profile: 'tela',
    sobre: 'tela',
    loja: 'tela',
    planos: 'tela',
    estatisticas: 'tela',
    ajuda: 'tela',
    diagnostico: 'tela',
    admin: 'tela',
    leitor: 'tela',
    leituraAtiva: 'tela',
    naoencontrado: 'tela',
  }
  const app = readFileSync(join(__dirname, '..', 'src', 'App.tsx'), 'utf8')

  it('o convite fica no lugar exatamente das telas que exigem conta (e Estatísticas abre na edição estática)', () => {
    for (const v of Object.keys(TELAS)) {
      expect(conviteNoLugarDaTela(v, true, false), v).toBe(EXIGE_CONTA.has(v as ViewType))
      expect(conviteNoLugarDaTela(v, false, false), v).toBe(false)
    }
    expect(conviteNoLugarDaTela('estatisticas', true, true)).toBe(false)
    expect(conviteNoLugarDaTela('library', true, true)).toBe(true)
  })

  it('toda tela tem o seu ramo no App, e o das que exigem conta só monta quando o convite não está', () => {
    expect(app).toMatch(/\{conviteNaTela && \(\s*<CartaoDeConvite view=\{activeView\}/)
    for (const [v, tipo] of Object.entries(TELAS)) {
      if (tipo === 'remapeada') continue
      const ramos = [...app.matchAll(new RegExp(`\\{activeView === '${v}'([^\\n]*\\n){0,2}`, 'g'))].map((m) => m[0])
      expect(ramos.length, v).toBeGreaterThan(0)
      /* Nenhum ramo de tela que exige conta monta sem perguntar ao convite: nunca as duas, nunca nenhuma. */
      if (EXIGE_CONTA.has(v as ViewType)) for (const r of ramos) expect(r, v).toContain('!conviteNaTela')
    }
  })
})
