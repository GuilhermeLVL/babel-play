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
const funil = vi.hoisted(() => ({ eventos: [] as string[] }))
vi.mock('../src/lib/ofertas/funilDaPorta', () => ({
  registrarEventoDaPorta: (e: string) => funil.eventos.push(e),
  registrarCadastroIniciadoNaPorta: (via: string) => funil.eventos.push(`porta_cadastro_iniciado:${via}`),
  contarContaDoGooglePelaPorta: () => {},
}))

import PortaDeEntrada from '../src/components/conta/PortaDeEntrada'
import Login from '../src/components/Login'
import { EVENTO_EXIGE_CONTA } from '../src/data/efemero/nucleo'
import * as auth from '../src/lib/auth'
import { useEmCheckout } from '../src/lib/estado/useEmCheckout'
import { useGateDeConta } from '../src/lib/estado/useGateDeConta'
import { useNavegacao } from '../src/lib/estado/useNavegacao'
import { _reiniciarIdentidade, definirIdentidade } from '../src/lib/identidade'
import { guardarIntencao, lerIntencao } from '../src/lib/intencaoDeLogin'
import { pedirConta, pedirEntrada } from '../src/lib/pedirConta'
import { ehRotaDeCheckout, estadoDaIntencao } from '../src/lib/rotas'

const irPara = (caminho: string) => window.history.replaceState({}, '', caminho)
const aguardar = () => new Promise((r) => setTimeout(r, 0))

beforeEach(() => {
  localStorage.clear()
  sessionStorage.clear()
  _reiniciarIdentidade()
  irPara('/')
  vi.clearAllMocks()
  funil.eventos = []
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
    /* O pedido genérico abre a porta em "Entrar". */
    expect(result.current.pedindoLogin).toBe('login')
    expect(lerIntencao()?.rota).toBe('/capturar')
  })

  it('não sobrescreve a intenção específica guardada há instantes (o Checkout)', () => {
    irPara('/plano')
    guardarIntencao({ rota: '/plano/assinar', plano: 'premium' })
    const { result } = renderHook(() => useGateDeConta())
    act(() => result.current.setPedindoLogin(true))
    expect(lerIntencao()).toMatchObject({ rota: '/plano/assinar', plano: 'premium' })
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
    /* Já logado = sessão guardada no navegador: a identidade nasce `carregando` (carga-rapida-no-celular). */
    localStorage.setItem('sb-teste-auth-token', '{}')
    _reiniciarIdentidade()
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

describe('a porta obrigatória (acesso sem conta v2) também termina onde a pessoa ia', () => {
  it('a porta guarda a tela da 2ª sessão; o login leva de volta a ela', () => {
    irPara('/capturar')
    definirIdentidade('anonimo')
    render(<PortaDeEntrada faixa={null} aoDeclarar={vi.fn()} />)
    expect(lerIntencao()?.rota).toBe('/capturar')
    const { setActiveView } = montarNavegacao()
    act(() => definirIdentidade('conta'))
    expect(setActiveView).toHaveBeenCalledWith('capture')
    expect(lerIntencao()).toBeNull()
  })

  it('a porta não troca a intenção específica de instantes atrás (o Checkout)', () => {
    irPara('/plano')
    guardarIntencao({ rota: '/plano/assinar', plano: 'premium' })
    render(<PortaDeEntrada faixa={null} aoDeclarar={vi.fn()} />)
    expect(lerIntencao()).toMatchObject({ rota: '/plano/assinar', plano: 'premium' })
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
      error: {
        name: 'AuthWeakPasswordError',
        code: 'weak_password',
        message: 'Password should be at least 8 characters.',
        reasons: ['length'],
      },
    } as never)
    expect((await auth.signUpEmail('a@x.com', 'curta')).message).toMatch(/pelo menos 8 caracteres/)
    supa.auth.signUp.mockResolvedValueOnce({
      data: { session: null },
      error: {
        name: 'AuthWeakPasswordError',
        code: 'weak_password',
        message: 'Password is known to be weak',
        reasons: ['pwned'],
      },
    } as never)
    expect((await auth.signUpEmail('a@x.com', 'senha1234')).message).toMatch(/vazamento/)
  })
})

describe('funil da porta obrigatória (acesso sem conta v2, etapa 5)', () => {
  it('o cadastro por e-mail na porta conta o início e a conta criada; o Login fora da porta não conta nada', async () => {
    const preencherEEnviar = async () => {
      fireEvent.change(screen.getByLabelText('E-mail'), { target: { value: 'a@x.com' } })
      fireEvent.change(screen.getByLabelText('Senha'), { target: { value: 'senha-forte-123' } })
      fireEvent.change(screen.getByLabelText('Confirmar senha'), { target: { value: 'senha-forte-123' } })
      await act(async () => {
        fireEvent.submit((screen.getByLabelText('Senha') as HTMLInputElement).closest('form')!)
        await aguardar()
      })
    }
    const { unmount } = render(<PortaDeEntrada faixa="adulto" aoDeclarar={() => {}} />)
    expect(funil.eventos).toEqual(['porta_exibida'])
    await preencherEEnviar()
    expect(supa.auth.signUp).toHaveBeenCalled()
    expect(funil.eventos).toEqual(['porta_exibida', 'porta_cadastro_iniciado:email', 'conta_criada_pela_porta'])
    unmount()

    funil.eventos = []
    render(<Login modoInicial="signup" />)
    await preencherEEnviar()
    expect(funil.eventos).toEqual([])
  })

  it('cadastro recusado pelo Supabase: o início conta, a conta criada não', async () => {
    supa.auth.signUp.mockResolvedValueOnce({ data: { session: null }, error: { message: 'x' } } as never)
    render(<PortaDeEntrada faixa="adulto" aoDeclarar={() => {}} />)
    fireEvent.change(screen.getByLabelText('E-mail'), { target: { value: 'a@x.com' } })
    fireEvent.change(screen.getByLabelText('Senha'), { target: { value: 'senha-forte-123' } })
    fireEvent.change(screen.getByLabelText('Confirmar senha'), { target: { value: 'senha-forte-123' } })
    await act(async () => {
      fireEvent.submit((screen.getByLabelText('Senha') as HTMLInputElement).closest('form')!)
      await aguardar()
    })
    expect(funil.eventos).toEqual(['porta_exibida', 'porta_cadastro_iniciado:email'])
  })
})

describe('o plano da intenção chega ao checkout', () => {
  it('lembrarPlanoDoCheckout grava só o plano pago, na chave que a tela de Planos lê', async () => {
    const { lembrarPlanoDoCheckout, CHAVE_DO_PLANO_DO_CHECKOUT } = await import('../src/lib/assinatura')
    sessionStorage.clear()
    lembrarPlanoDoCheckout('gratis')
    expect(sessionStorage.getItem(CHAVE_DO_PLANO_DO_CHECKOUT)).toBeNull()
    lembrarPlanoDoCheckout('free')
    expect(sessionStorage.getItem(CHAVE_DO_PLANO_DO_CHECKOUT)).toBeNull()
    lembrarPlanoDoCheckout('premium')
    expect(sessionStorage.getItem(CHAVE_DO_PLANO_DO_CHECKOUT)).toBe('premium')
    // A intenção de antes do deploy ("assinar o Pro") abre o checkout no Premium.
    sessionStorage.clear()
    lembrarPlanoDoCheckout('pro')
    expect(sessionStorage.getItem(CHAVE_DO_PLANO_DO_CHECKOUT)).toBe('premium')
    // Matriz v3, venda fechada: plano que o servidor ainda não vende não abre o checkout.
    sessionStorage.clear()
    lembrarPlanoDoCheckout('essencial')
    expect(sessionStorage.getItem(CHAVE_DO_PLANO_DO_CHECKOUT)).toBeNull()
    lembrarPlanoDoCheckout('aovivo')
    expect(sessionStorage.getItem(CHAVE_DO_PLANO_DO_CHECKOUT)).toBeNull()
  })
})

/* CONVITES SEM CONTA (14/11/2026): o clique explícito abre o convite sempre; o aviso automático do
   servidor em memória, uma vez por visita. "Criar conta" abre a porta no cadastro. */
describe('o convite explícito e a porta no cadastro', () => {
  const avisoDoServidor = () =>
    window.dispatchEvent(new CustomEvent(EVENTO_EXIGE_CONTA, { detail: { rota: 'POST /api/tutor/chat' } }))

  it('o aviso automático abre uma vez por visita; o clique explícito reabre no 2º toque', () => {
    const { result } = renderHook(() => useGateDeConta())
    act(avisoDoServidor)
    expect(result.current.gate).toBeTruthy()
    act(() => result.current.fecharGate())
    act(avisoDoServidor)
    expect(result.current.gate).toBeNull()
    act(() => pedirConta('POST /api/import/anki'))
    expect(result.current.gate).toBe('Importar conteúdo para a biblioteca precisa de conta.')
    act(() => result.current.fecharGate())
    act(() => pedirConta('POST /api/import/anki'))
    expect(result.current.gate).toBe('Importar conteúdo para a biblioteca precisa de conta.')
  })

  it('pedirEntrada fecha o convite e pede a porta no modo certo, guardando de onde veio', () => {
    irPara('/ajustes/conta')
    const { result } = renderHook(() => useGateDeConta())
    definirIdentidade('anonimo')
    act(() => pedirConta('conta'))
    act(() => pedirEntrada('signup'))
    expect(result.current.gate).toBeNull()
    expect(result.current.pedindoLogin).toBe('signup')
    expect(lerIntencao()?.rota).toBe('/ajustes/conta')
    act(() => result.current.setPedindoLogin(false))
    act(() => pedirEntrada('login'))
    expect(result.current.pedindoLogin).toBe('login')
  })

  it('com sessão, pedirEntrada e setPedindoLogin não fazem nada (nada fica pendurado para depois do SIGNED_OUT)', () => {
    irPara('/leitor/x')
    definirIdentidade('conta')
    const { result } = renderHook(() => useGateDeConta())
    act(() => pedirEntrada('signup'))
    expect(result.current.pedindoLogin).toBe(false)
    act(() => result.current.setPedindoLogin('signup'))
    expect(result.current.pedindoLogin).toBe(false)
    expect(lerIntencao()).toBeNull()
    act(() => definirIdentidade('anonimo'))
    expect(result.current.pedindoLogin).toBe(false)
  })

  it('navigateTo("login", { modo: "signup" }) pede a porta no cadastro', () => {
    const setPedindoLogin = vi.fn()
    const { result } = renderHook(() =>
      useNavegacao({
        activeView: 'hub',
        setActiveView: vi.fn(),
        selectedRecordingId: null,
        setSelectedRecordingId: vi.fn(),
        setResumingRecordingId: vi.fn(),
        recordings: [],
        lojaAba: null,
        setLojaAba: vi.fn(),
        setPedindoLogin,
      }),
    )
    act(() => result.current.navigateTo('login', { modo: 'signup' }))
    expect(setPedindoLogin).toHaveBeenLastCalledWith('signup')
    act(() => result.current.navigateTo('login'))
    expect(setPedindoLogin).toHaveBeenLastCalledWith(true)
  })

  it('Login com modoInicial="signup" abre em "Criar conta"; sem ele, em "Entrar"', () => {
    const { unmount } = render(<Login modoInicial="signup" />)
    expect(screen.getByRole('heading', { level: 1, name: 'Criar conta' })).toBeTruthy()
    unmount()
    render(<Login />)
    expect(screen.getByRole('heading', { level: 1, name: 'Entrar' })).toBeTruthy()
  })
})
