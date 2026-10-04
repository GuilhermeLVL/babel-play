// @vitest-environment jsdom
/**
 * A PORTA DE ENTRADA PASSA INTEIRA POR `t()`.
 *
 * Login, cadastro, "esqueci a senha", a redefinição pelo link do e-mail, o desafio do 2FA e a
 * seção "Conta e Segurança" tinham o texto cravado em português: quem escolhia inglês via o app
 * em inglês e a porta — a primeira tela de quem cria conta — em português. Nenhum teste percebia,
 * porque o fallback do `t()` é o próprio português e a tela continua legível.
 *
 * O detector é o PSEUDO-IDIOMA (`public/i18n/xx.json`, o mesmo catálogo do e2e de
 * pseudo-localização): toda frase que passou por `t()` sai acentuada — `Entrar` vira
 * `[Éñtŕáŕ ··]` — e o pseudo não deixa vogal minúscula sem acento. Vogal limpa num texto da tela,
 * num `aria-label`, num `placeholder` ou num `alt` é frase que escapou da extração. Isso vale
 * também para as mensagens que `src/lib/auth.ts` devolve (senha errada, senha curta, link
 * enviado), que chegam à tela prontas.
 */
import { readFileSync } from 'node:fs'
import { join } from 'node:path'

import { act, cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'

const { supa, estado } = vi.hoisted(() => {
  const fator = { id: 'f1', status: 'verified' }
  return {
    estado: { configurado: true, cadastro: true, fatores: [] as Array<{ id: string; status: string }>, fator },
    supa: {
      auth: {
        getSession: vi.fn(async () => ({ data: { session: null } })),
        signInWithPassword: vi.fn(async () => ({ error: { message: 'Invalid login credentials' } })),
        signUp: vi.fn(async () => ({ data: { session: null }, error: null })),
        signInWithOAuth: vi.fn(async () => ({ error: { message: 'provider disabled' } })),
        resetPasswordForEmail: vi.fn(async () => ({})),
        updateUser: vi.fn(async () => ({ error: null })),
        signOut: vi.fn(async () => ({})),
        mfa: {
          listFactors: vi.fn(async () => ({ data: { totp: [] as unknown[] } })),
          enroll: vi.fn(async () => ({
            data: { id: 'f-novo', totp: { qr_code: 'data:image/png;base64,AAAA', secret: 'JBSWY3DPEHPK3PXP' } },
            error: null,
          })),
          challenge: vi.fn(async () => ({ data: { id: 'ch1' }, error: null })),
          verify: vi.fn(async () => ({ error: { message: 'Invalid TOTP code entered' } })),
          unenroll: vi.fn(async () => ({ error: null })),
        },
      },
    },
  }
})

/* `supabase` como GETTER: o mesmo arquivo precisa da porta configurada e da porta sem Supabase
   (o aviso "Login não configurado"), e o módulo é importado uma vez só. */
vi.mock('../src/lib/supabase', () => ({
  get supabase() {
    return estado.configurado ? supa : null
  },
  authRequired: true,
  carregarSupabase: async () => (estado.configurado ? supa : null),
  getAccessToken: async () => null,
}))
vi.mock('../src/data/rotas/idade', async (original) => ({
  ...(await original<typeof import('../src/data/rotas/idade')>()),
  lerAbertura: async () => ({ cadastro: estado.cadastro, checkout: true }),
}))

import AccountSecuritySection from '../src/components/auth/AccountSecuritySection'
import DesafioSegundoFator from '../src/components/auth/DesafioSegundoFator'
import ResetPassword from '../src/components/auth/ResetPassword'
import SecurityPanel from '../src/components/auth/SecurityPanel'
import Login from '../src/components/Login'
import { registrarCatalogo, usarIdioma } from '../src/lib/i18n'

const PSEUDO = JSON.parse(readFileSync(join(__dirname, '..', 'public', 'i18n', 'xx.json'), 'utf8')) as Record<
  string,
  string
>
/** O rótulo como a tela o mostra em pseudo — para achar botão e campo pelo nome acessível. */
const px = (frase: string) => PSEUDO[frase] ?? `(sem pseudo) ${frase}`

/** Marca não se traduz. */
const NAO_SE_TRADUZ = new Set(['Babel Play'])
/** O pseudo acentua toda vogal minúscula; sobrou uma, a frase não passou por `t()`. */
const VOGAL_LIMPA = /[aeiou]/

/** Todo texto que a pessoa lê ou ouve: nós de texto e os atributos que o leitor de tela anuncia. */
function textosDaInterface(raiz: HTMLElement): string[] {
  const achados: string[] = []
  const anda = document.createTreeWalker(raiz, NodeFilter.SHOW_TEXT)
  for (let n = anda.nextNode(); n; n = anda.nextNode()) {
    const texto = (n.textContent ?? '').trim()
    // `<code>` guarda nome de variável e o segredo do 2FA — dado, não frase.
    if (texto && !n.parentElement?.closest('code')) achados.push(texto)
  }
  for (const el of raiz.querySelectorAll('[aria-label], [placeholder], [alt], [title]')) {
    for (const atributo of ['aria-label', 'placeholder', 'alt', 'title']) {
      const v = el.getAttribute(atributo)
      if (v) achados.push(v)
    }
  }
  return achados
}

function queEscaparam(): string[] {
  return textosDaInterface(document.body).filter((t) => !NAO_SE_TRADUZ.has(t) && VOGAL_LIMPA.test(t))
}

const aguardar = () => act(async () => new Promise((r) => setTimeout(r, 0)))

beforeAll(async () => {
  registrarCatalogo('xx', PSEUDO)
  await usarIdioma('xx')
})
beforeEach(() => {
  estado.configurado = true
  estado.cadastro = true
  supa.auth.mfa.listFactors.mockImplementation(async () => ({ data: { totp: estado.fatores } }))
  estado.fatores = []
})
afterEach(() => {
  cleanup()
  vi.clearAllMocks()
})

describe('a porta de login em outro idioma', () => {
  it('entrar: títulos, rótulos, placeholders, o olho da senha e o erro de senha errada', async () => {
    render(<Login onContinuarSemConta={() => {}} />)
    await aguardar()
    expect(screen.getByRole('heading', { name: px('Entrar') })).toBeTruthy()
    expect(queEscaparam()).toEqual([])

    fireEvent.click(screen.getByRole('button', { name: px('Mostrar senha') }))
    expect(screen.getByRole('button', { name: px('Ocultar senha') })).toBeTruthy()

    fireEvent.change(screen.getByLabelText(px('E-mail')), { target: { value: 'a@x.com' } })
    fireEvent.change(screen.getByLabelText(px('Senha')), { target: { value: 'errada-123' } })
    await act(async () => {
      fireEvent.submit(screen.getByLabelText(px('E-mail')).closest('form')!)
    })
    expect(screen.getByRole('alert').textContent).toBe(px('E-mail ou senha incorretos.'))
    expect(queEscaparam()).toEqual([])
  })

  it('o login com Google que não abre diz por quê, no idioma da tela', async () => {
    render(<Login />)
    await aguardar()
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: px('Continuar com Google') }))
    })
    // O id do provedor entra como VALOR (`{provedor}`): é dado do código, e fica como veio.
    const alerta = screen.getByRole('alert').textContent
    expect(alerta).toBe(px('Não foi possível iniciar o login com {provedor}.').replace('{provedor}', 'google'))
    expect(queEscaparam().filter((texto) => texto !== alerta)).toEqual([])
  })

  it('criar conta: senha curta, e depois o aviso de confirmar o e-mail', async () => {
    render(<Login onContinuarSemConta={() => {}} />)
    await aguardar()
    fireEvent.click(screen.getByRole('button', { name: px('Criar uma conta') }))
    expect(screen.getByRole('heading', { name: px('Criar conta') })).toBeTruthy()
    expect(queEscaparam()).toEqual([])

    const senha = screen.getByLabelText(px('Senha'))
    fireEvent.change(screen.getByLabelText(px('E-mail')), { target: { value: 'a@x.com' } })
    fireEvent.change(senha, { target: { value: '1234567' } })
    await act(async () => {
      fireEvent.submit(senha.closest('form')!)
    })
    // O número entra pela interpolação, não pela frase: `{n}` sobrevive ao pseudo e vira 8.
    expect(screen.getByRole('alert').textContent).toContain('8')
    expect(queEscaparam()).toEqual([])

    fireEvent.change(senha, { target: { value: 'senha-forte-123' } })
    fireEvent.change(screen.getByLabelText(px('Confirmar senha')), { target: { value: 'senha-forte-123' } })
    await act(async () => {
      fireEvent.submit(senha.closest('form')!)
    })
    expect(screen.getByRole('status')).toBeTruthy()
    // O painel "confira seu e-mail" mostra o endereço digitado: é dado da pessoa, não frase nossa.
    expect(queEscaparam().filter((texto) => texto !== 'a@x.com')).toEqual([])
  })

  it('esqueci a senha: o painel da marca, o formulário e o aviso do link enviado', async () => {
    render(<Login onContinuarSemConta={() => {}} />)
    await aguardar()
    fireEvent.click(screen.getByRole('button', { name: px('Esqueci') }))
    expect(screen.getByRole('heading', { name: px('Recuperar senha') })).toBeTruthy()
    expect(queEscaparam()).toEqual([])

    fireEvent.change(screen.getByLabelText(px('E-mail')), { target: { value: 'a@x.com' } })
    await act(async () => {
      fireEvent.submit(screen.getByLabelText(px('E-mail')).closest('form')!)
    })
    expect(screen.getByRole('status').textContent).toBe(
      px('Se existir uma conta com esse e-mail, enviamos um link de recuperação.'),
    )
    // O painel "confira seu e-mail" mostra o endereço digitado: é dado da pessoa, não frase nossa.
    expect(queEscaparam().filter((texto) => texto !== 'a@x.com')).toEqual([])
  })

  it('cadastro pausado: a explicação no lugar do "Criar uma conta"', async () => {
    estado.cadastro = false
    render(<Login onContinuarSemConta={() => {}} />)
    await aguardar()
    expect(screen.queryByRole('button', { name: px('Criar uma conta') })).toBeNull()
    expect(queEscaparam()).toEqual([])
  })

  it('sem Supabase configurado: o aviso, com o nome das variáveis intacto', async () => {
    estado.configurado = false
    render(<Login />)
    await aguardar()
    expect(screen.getByRole('alert').querySelector('code')?.textContent).toBe('VITE_SUPABASE_*')
    expect(queEscaparam()).toEqual([])
  })
})

describe('as telas que o login abre', () => {
  it('redefinir a senha pelo link do e-mail, com os dois erros do formulário', async () => {
    render(<ResetPassword onDone={() => {}} />)
    expect(screen.getByRole('heading', { name: px('Definir nova senha') })).toBeTruthy()
    expect(queEscaparam()).toEqual([])

    const preencher = async (nova: string, confirma: string) => {
      fireEvent.change(screen.getByLabelText(px('Nova senha')), { target: { value: nova } })
      fireEvent.change(screen.getByLabelText(px('Confirmar senha')), { target: { value: confirma } })
      await act(async () => {
        fireEvent.click(screen.getByRole('button', { name: px('Redefinir senha') }))
      })
    }
    await preencher('abc12345', 'abc99999')
    expect(screen.getByRole('alert').textContent).toBe(px('As senhas não coincidem.'))
    await preencher('abc1234', 'abc1234')
    expect(screen.getByRole('alert').textContent).toContain('8')
    expect(queEscaparam()).toEqual([])
  })

  it('o desafio do 2FA depois do login, e o código recusado', async () => {
    estado.fatores = [estado.fator]
    render(<DesafioSegundoFator onConcluido={() => {}} />)
    expect(screen.getByRole('heading', { name: px('Verificação em duas etapas') })).toBeTruthy()
    expect(queEscaparam()).toEqual([])

    fireEvent.change(screen.getByLabelText(px('Código')), { target: { value: '000000' } })
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: px('Confirmar') }))
    })
    expect(screen.getByRole('alert').textContent).toBe(px('Código inválido. Tente de novo.'))
    expect(queEscaparam()).toEqual([])
  })

  it('Conta e Segurança: sem 2FA, cadastrando o app autenticador e com o 2FA ativo', async () => {
    render(<AccountSecuritySection />)
    await aguardar()
    expect(screen.getByRole('heading', { name: px('Conta e Segurança') })).toBeTruthy()
    expect(queEscaparam()).toEqual([])

    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: px('Habilitar 2FA') }))
    })
    expect(screen.getByAltText(px('QR do 2FA'))).toBeTruthy()
    expect(queEscaparam()).toEqual([])
    cleanup()

    estado.fatores = [estado.fator]
    render(<SecurityPanel />)
    await aguardar()
    expect(screen.getByRole('button', { name: px('Desativar') })).toBeTruthy()
    expect(queEscaparam()).toEqual([])
  })

  it('Conta e Segurança sem Supabase: o aviso de indisponível', async () => {
    estado.configurado = false
    render(<SecurityPanel />)
    expect(queEscaparam()).toEqual([])
  })
})
