// @vitest-environment jsdom
/**
 * A EDIÇÃO ESTÁTICA nas TELAS: onde o app normal convida a entrar/criar conta, a edição sem
 * servidor diz a verdade — o recurso está na versão completa — e não oferece botão para um login
 * que não existe (link morto).
 */
import { cleanup, render, screen } from '@testing-library/react'
import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest'

// Antes dos imports (que o vitest iça): os módulos leem a edição ao carregar.
vi.hoisted(() => vi.stubEnv('VITE_EDICAO_ESTATICA', '1'))

import AvisoDeConta from '../src/components/conta/AvisoDeConta'
import CartaoDeConvite from '../src/components/conta/CartaoDeConvite'
import { motivoDoGate } from '../src/components/conta/exigeConta'
import GateDeConta from '../src/components/conta/GateDeConta'
import { urlDoAppCompleto } from '../src/lib/edicaoEstatica'
import { prepararDialogoNoJsdom } from './_dialogoNoJsdom'

prepararDialogoNoJsdom()

afterEach(cleanup)

const SEM_LOGIN = /entrar|criar conta|crie uma conta/i

describe('edição estática nas telas', () => {
  beforeAll(() => {
    localStorage.clear()
  })

  it('o cartão no lugar da tela diz que o recurso está na versão completa, sem botão de login', () => {
    render(<CartaoDeConvite view="library" onEntrar={() => {}} onVoltar={() => {}} />)
    const cartao = screen.getByTestId('cartao-de-convite')
    expect(cartao.textContent).toMatch(/versão completa/i)
    expect(cartao.textContent).not.toMatch(SEM_LOGIN)
    const botoes = screen.getAllByRole('button').map((b) => b.textContent ?? '')
    expect(botoes.some((b) => SEM_LOGIN.test(b))).toBe(false)
  })

  it('o modal de gate explica sem oferecer login', () => {
    render(<GateDeConta aberto motivo={motivoDoGate('POST /api/import/web')} onFechar={() => {}} onEntrar={() => {}} />)
    const dialogo = screen.getByRole('dialog')
    expect(dialogo.textContent).toMatch(/versão completa/i)
    expect(dialogo.textContent).not.toMatch(SEM_LOGIN)
  })

  it('o aviso de marco de uso não tem botão de criar conta', () => {
    const metrics = { sessions: 4, deckSize: 0 } as never
    render(<AvisoDeConta metrics={metrics} onEntrar={() => {}} />)
    const aviso = screen.getByTestId('aviso-de-conta')
    expect(aviso.textContent).toMatch(/demonstração/i)
    expect(aviso.textContent).not.toMatch(SEM_LOGIN)
  })
})

describe('a saída para a versão completa (VITE_URL_APP_COMPLETO)', () => {
  const URL_COMPLETA = 'https://app.exemplo.com.br'
  afterEach(() => vi.stubEnv('VITE_URL_APP_COMPLETO', ''))

  const confereLink = () => {
    const link = screen.getByRole('link', { name: /Criar conta na versão completa/ })
    expect(link.getAttribute('href')).toBe(URL_COMPLETA)
    expect(link.getAttribute('target')).toBe('_blank')
    expect(link.getAttribute('rel')).toContain('noopener')
  }

  it('com a URL, o cartão da tela ganha o link primário, e "Voltar ao início" continua', () => {
    vi.stubEnv('VITE_URL_APP_COMPLETO', URL_COMPLETA)
    render(<CartaoDeConvite view="library" onEntrar={() => {}} onVoltar={() => {}} />)
    confereLink()
    expect(screen.getByRole('button', { name: /Voltar ao início/ })).toBeTruthy()
  })

  it('com a URL, o aviso de marco de uso ganha o link, e "Entendi" continua', () => {
    vi.stubEnv('VITE_URL_APP_COMPLETO', URL_COMPLETA)
    localStorage.clear()
    render(<AvisoDeConta metrics={{ sessions: 4, deckSize: 0 } as never} onEntrar={() => {}} />)
    confereLink()
    expect(screen.getByRole('button', { name: 'Entendi' })).toBeTruthy()
  })

  it('sem a URL, ou com uma que não é http(s), nada de link', () => {
    vi.stubEnv('VITE_URL_APP_COMPLETO', 'javascript:alert(1)')
    expect(urlDoAppCompleto()).toBeNull()
    render(<CartaoDeConvite view="library" onEntrar={() => {}} onVoltar={() => {}} />)
    expect(screen.queryByRole('link')).toBeNull()
  })
})
