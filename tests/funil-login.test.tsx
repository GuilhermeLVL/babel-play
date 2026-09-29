// @vitest-environment jsdom
/**
 * O FUNIL DO LOGIN (teste de ponta a ponta com o Asaas, 2026-09-29).
 *
 * Três furos medidos: (A) quem entrava — pela mesma aba, pelo Google ou pela confirmação do e-mail —
 * caía no Início e perdia o "eu ia assinar"; (F) o modal "Guardar na sua conta…" subia por cima do
 * checkout, mesmo com 0 sessão e 0 cartão; e a porta pedia 6 caracteres quando o Supabase de
 * produção exige 8.
 */
import { act, cleanup, fireEvent, render, renderHook, screen } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const { supa, store } = vi.hoisted(() => ({
  supa: {
    auth: {
      getSession: vi.fn(async () => ({ data: { session: null } })),
      signUp: vi.fn(async () => ({ data: { session: null }, error: null })),
      updateUser: vi.fn(async () => ({ data: {}, error: null })),
      signInWithPassword: vi.fn(async () => ({ error: null })),
    },
  },
  store: { temDadosLocais: vi.fn(async () => false) },
}))
vi.mock('../src/lib/supabase', () => ({
  supabase: supa,
  authRequired: true,
  carregarSupabase: async () => supa,
  getAccessToken: async () => null,
}))
vi.mock('../src/data/efemero/store', () => store)

import Login from '../src/components/Login'
import * as auth from '../src/lib/auth'
import { useEmCheckout } from '../src/lib/estado/useEmCheckout'
import { useGateDeConta } from '../src/lib/estado/useGateDeConta'
import { useNavegacao } from '../src/lib/estado/useNavegacao'
import { _reiniciarIdentidade, definirIdentidade } from '../src/lib/identidade'
import { guardarIntencao, lerIntencao } from '../src/lib/intencaoDeLogin'
import { ehRotaDeCheckout, estadoDaIntencao } from '../src/lib/rotas'

const irPara = (caminho: string) => window.history.replaceState({}, '', caminho)
const aguardar = () => new Promise((r) => setTimeout(r, 0))

beforeEach(() => {
  localStorage.clear()
  sessionStorage.clear()
  _reiniciarIdentidade()
  irPara('/')
  vi.clearAllMocks()
  store.temDadosLocais.mockResolvedValue(false)
})
afterEach(cleanup)

describe('rotas da intenção e do checkout', () => {
  it('a intenção só vira rota conhecida do app; o resto cai no Início', () => {
    expect(estadoDaIntencao('/plano/assinar')).toEqual({ view: 'planos', planosTela: 'assinar' })
    expect(estadoDaIntencao('/capturar')).toEqual({ view: 'capture' })
    expect(estadoDaIntencao('/nao-existe')).toEqual({ view: 'hub' })
    expect(estadoDaIntencao('/auth/callback')).toEqual({ view: 'hub' })
  })

  it('checkout é /plano/assinar e /plano/assinado (singular ou plural), não a tela de planos', () => {
    expect(ehRotaDeCheckout('/plano/assinar')).toBe(true)
    expect(ehRotaDeCheckout('/plano/assinado')).toBe(true)
    expect(ehRotaDeCheckout('/planos/assinar')).toBe(true)
    expect(ehRotaDeCheckout('/plano')).toBe(false)
    expect(ehRotaDeCheckout('/plano/cancelar')).toBe(false)
    expect(ehRotaDeCheckout('/')).toBe(false)
  })

  it('useEmCheckout segue a view e a sub-tela da URL', () => {
    irPara('/plano/assinar')
    const { result, rerender } = renderHook(({ v }) => useEmCheckout(v), { initialProps: { v: 'planos' } })
    expect(result.current).toBe(true)
    rerender({ v: 'hub' })
    expect(result.current).toBe(false)
    rerender({ v: 'planos' })
    act(() => {
      irPara('/plano')
      window.dispatchEvent(new PopStateEvent('popstate'))
    })
    expect(result.current).toBe(false)
  })
})

describe('pedir o login guarda de onde a pessoa veio', () => {
  it('pedido genérico guarda a rota atual', () => {
    irPara('/capturar')
    const { result } = renderHook(() => useGateDeConta())
    act(() => result.current.setPedindoLogin(true))
    expect(result.current.pedindoLogin).toBe(true)
    expect(lerIntencao()?.rota).toBe('/capturar')
  })

  it('não sobrescreve a intenção específica guardada há instantes (o Checkout)', () => {
    irPara('/plano')
    guardarIntencao({ rota: '/plano/assinar', plano: 'pro' })
    const { result } = renderHook(() => useGateDeConta())
    act(() => result.current.setPedindoLogin(true))
    expect(lerIntencao()).toMatchObject({ rota: '/plano/assinar', plano: 'pro' })
  })

  it('uma intenção antiga (não de agora) é trocada pelo lugar atual', () => {
    irPara('/jogar')
    guardarIntencao({ rota: '/plano/assinar' }, Date.now() - 60_000)
    const { result } = renderHook(() => useGateDeConta())
    act(() => result.current.setPedindoLogin(true))
    expect(lerIntencao()?.rota).toBe('/jogar')
  })
})

describe('o modal da migração', () => {
  it('não abre quando não há nada para subir (0 sessão, 0 cartão)', async () => {
    definirIdentidade('anonimo')
    const { result } = renderHook(() => useGateDeConta())
    await act(async () => {
      definirIdentidade('conta')
      await aguardar()
    })
    expect(store.temDadosLocais).toHaveBeenCalled()
    expect(result.current.migracao).toBe(false)
  })

  it('com dados, abre; mas espera a pessoa sair do checkout', async () => {
    store.temDadosLocais.mockResolvedValue(true)
    definirIdentidade('anonimo')
    const { result, rerender } = renderHook(({ adiar }) => useGateDeConta({ adiarMigracao: adiar }), {
      initialProps: { adiar: true },
    })
    await act(async () => {
      definirIdentidade('conta')
      await aguardar()
    })
    expect(result.current.migracao).toBe(false)
    rerender({ adiar: false })
    expect(result.current.migracao).toBe(true)
  })
})

function montarNavegacao() {
  const setActiveView = vi.fn()
  const deps = {
    activeView: 'hub' as const,
    setActiveView,
    selectedRecordingId: null,
    setSelectedRecordingId: vi.fn(),
    setResumingRecordingId: vi.fn(),
    recordings: [],
    lojaAba: null,
    setLojaAba: vi.fn(),
    setPedindoLogin: vi.fn(),
  }
  renderHook(() => useNavegacao(deps))
  return { setActiveView, setPedindoLogin: deps.setPedindoLogin }
}

describe('o login termina onde a pessoa ia', () => {
  it('mesma aba (e-mail e senha): sem conta → conta leva à intenção e a consome', () => {
    definirIdentidade('anonimo')
    const { setActiveView } = montarNavegacao()
    guardarIntencao({ rota: '/plano/assinar', plano: 'pro' })
    act(() => definirIdentidade('conta'))
    expect(setActiveView).toHaveBeenCalledWith('planos')
    expect(window.location.pathname).toBe('/plano/assinar')
    expect(lerIntencao()).toBeNull()
  })

  it('volta do Google / da confirmação do e-mail em /auth/callback: vai à intenção e limpa o callback', () => {
    irPara('/auth/callback#access_token=x')
    const { setActiveView } = montarNavegacao()
    guardarIntencao({ rota: '/plano/assinar' })
    act(() => definirIdentidade('conta'))
    expect(setActiveView).toHaveBeenCalledWith('planos')
    expect(window.location.pathname).toBe('/plano/assinar')
    expect(window.location.hash).toBe('')
    expect(lerIntencao()).toBeNull()
  })

  it('/auth/callback com intenção para rota desconhecida cai no Início', () => {
    irPara('/auth/callback')
    const { setActiveView } = montarNavegacao()
    guardarIntencao({ rota: '/qualquer-coisa' })
    act(() => definirIdentidade('conta'))
    expect(setActiveView).toHaveBeenCalledWith('hub')
  })

  it('recarregar já logado não sequestra a tela (carregando → conta fora do callback)', () => {
    irPara('/capturar')
    const { setActiveView } = montarNavegacao()
    setActiveView.mockClear()
    guardarIntencao({ rota: '/plano/assinar' })
    act(() => definirIdentidade('conta'))
    expect(setActiveView).not.toHaveBeenCalledWith('planos')
    expect(lerIntencao()?.rota).toBe('/plano/assinar')
  })

  it('sem intenção, entrar não navega', () => {
    definirIdentidade('anonimo')
    const { setActiveView } = montarNavegacao()
    setActiveView.mockClear()
    act(() => definirIdentidade('conta'))
    expect(setActiveView).not.toHaveBeenCalled()
  })
})

describe('a confirmação do e-mail volta para /auth/callback', () => {
  it('signUp leva emailRedirectTo', async () => {
    await auth.signUpEmail('a@x.com', 'senha-forte-123')
    expect(supa.auth.signUp).toHaveBeenCalledWith({
      email: 'a@x.com',
      password: 'senha-forte-123',
      options: { emailRedirectTo: `${window.location.origin}/auth/callback` },
    })
  })

  it('convidado que vincula o e-mail também volta ao callback', async () => {
    supa.auth.getSession.mockResolvedValueOnce({
      data: { session: { access_token: 't', user: { is_anonymous: true } } as never },
    })
    await auth.signUpEmail('a@x.com', 'senha-forte-123')
    expect(supa.auth.updateUser).toHaveBeenCalledWith(
      { email: 'a@x.com' },
      { emailRedirectTo: `${window.location.origin}/auth/callback` },
    )
  })
})

describe('senha de 8 caracteres, como o Supabase de produção', () => {
  it('a porta diz 8 e recusa menos que isso ao criar conta, sem ir ao Supabase', async () => {
    render(<Login />)
    fireEvent.click(screen.getByRole('button', { name: /Criar uma/ }))
    const senha = screen.getByLabelText('Senha') as HTMLInputElement
    expect(senha.placeholder).toContain('8')
    expect(senha.minLength).toBe(8)
    fireEvent.change(screen.getByLabelText('E-mail'), { target: { value: 'a@x.com' } })
    fireEvent.change(senha, { target: { value: '1234567' } })
    await act(async () => {
      fireEvent.submit(senha.closest('form')!)
      await aguardar()
    })
    expect(screen.getByRole('alert').textContent).toMatch(/8 caracteres/)
    expect(supa.auth.signUp).not.toHaveBeenCalled()
  })

  it('a senha fraca do Supabase vira mensagem em português (curta e vazada)', async () => {
    supa.auth.signUp.mockResolvedValueOnce({
      data: { session: null },
      error: { name: 'AuthWeakPasswordError', code: 'weak_password', message: 'Password should be at least 8 characters.', reasons: ['length'] },
    } as never)
    expect((await auth.signUpEmail('a@x.com', 'curta')).message).toMatch(/pelo menos 8 caracteres/)
    supa.auth.signUp.mockResolvedValueOnce({
      data: { session: null },
      error: { name: 'AuthWeakPasswordError', code: 'weak_password', message: 'Password is known to be weak', reasons: ['pwned'] },
    } as never)
    expect((await auth.signUpEmail('a@x.com', 'senha1234')).message).toMatch(/vazamento/)
  })
})
