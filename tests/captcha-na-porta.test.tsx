// @vitest-environment jsdom
/**
 * CAPTCHA NA PORTA DE ENTRADA — entrar, criar conta e recuperar senha.
 *
 * Até aqui só o convidado anônimo passava pelo Turnstile (`src/lib/convidado.ts`). O Supabase Auth
 * confere o captcha NO SERVIDOR DELE quando o projeto tem a proteção ligada, e aí `signUp`,
 * `signInWithPassword` e `resetPasswordForEmail` sem `options.captchaToken` são recusados.
 *
 * O que fica travado:
 *   - sem `VITE_TURNSTILE_SITE_KEY`, nada muda e nada é carregado (nem script, nem widget);
 *   - com a variável, o widget aparece, o envio espera a resposta do desafio e ela vai nas três
 *     chamadas;
 *   - a resposta é de uso único: depois de um envio o widget é reiniciado;
 *   - expirou, falhou, não carregou ou o Supabase recusou → mensagem na tela, e dá para refazer.
 *
 * O widget é simulado: `window.turnstile` de mentira guarda as opções do `render`, e o teste chama
 * os callbacks como o Cloudflare chamaria. Todos os valores abaixo são de mentira.
 */
import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

type ErroFalso = null | { message: string; code?: string }

const { supa, build } = vi.hoisted(() => ({
  /** O valor de `VITE_TURNSTILE_SITE_KEY` neste "build": `null` = variável ausente. */
  build: { sitio: null as string | null, quest: false },
  supa: {
    auth: {
      getSession: vi.fn(async () => ({ data: { session: null } })),
      signUp: vi.fn(async () => ({ data: { session: null }, error: null })),
      updateUser: vi.fn(async () => ({ data: {}, error: null })),
      signInWithPassword: vi.fn(async () => ({ error: null as ErroFalso })),
      resetPasswordForEmail: vi.fn(async () => ({ error: null as ErroFalso })),
    },
  },
}))
vi.mock('../src/lib/supabase', () => ({
  supabase: supa,
  authRequired: true,
  carregarSupabase: async () => supa,
  getAccessToken: async () => null,
}))

/* A variável é lida num lugar só (`chaveDoTurnstile`, que o convidado já usa). O módulo guarda o
   `import.meta.env` na carga, fora do alcance de `vi.stubEnv` — então o teste troca a leitura. */
vi.mock('../src/lib/turnstile', async (original) => ({
  ...(await original<typeof import('../src/lib/turnstile')>()),
  chaveDoTurnstile: () => build.sitio,
}))

vi.mock('../src/lib/dispositivo/telaNovaDoQuest', async (original) => ({
  ...(await original<typeof import('../src/lib/dispositivo/telaNovaDoQuest')>()),
  useQuestNovo: () => build.quest,
}))

import Login from '../src/components/Login'
import * as auth from '../src/lib/auth'
import { SCRIPT_DO_TURNSTILE } from '../src/lib/turnstile'

const SITIO = 'sitio-de-teste'
const EMAIL = 'a@x.com'
const FRASE = 'frase-longa-123'
const RETORNO = `${window.location.origin}/auth/callback`
const RECUSA = { message: 'captcha verification process failed', code: 'captcha_failed' }

type Opcoes = {
  sitekey: string
  callback: (resposta: string) => void
  'error-callback': (codigo?: string) => unknown
  'expired-callback': () => void
}
type JanelaComTurnstile = { turnstile?: unknown }

/** O `window.turnstile` de mentira: guarda o que foi pedido ao `render`. */
function instalarTurnstile() {
  const widgets: Opcoes[] = []
  const api = {
    render: vi.fn((_alvo: HTMLElement, o: Opcoes) => {
      widgets.push(o)
      return `w${widgets.length}`
    }),
    reset: vi.fn(),
    remove: vi.fn(),
  }
  ;(window as unknown as JanelaComTurnstile).turnstile = api
  return { api, widgets }
}

const aguardar = () => new Promise((r) => setTimeout(r, 0))
const scriptsDoTurnstile = () => document.querySelectorAll(`script[src="${SCRIPT_DO_TURNSTILE}"]`)
const caixa = () => screen.getByTestId('captcha-da-porta')

function preencher(frase = FRASE) {
  fireEvent.change(screen.getByLabelText('E-mail'), { target: { value: EMAIL } })
  const campo = screen.queryByLabelText('Senha')
  if (campo) fireEvent.change(campo, { target: { value: frase } })
}
async function enviar() {
  await act(async () => {
    fireEvent.submit(screen.getByLabelText('E-mail').closest('form')!)
    await aguardar()
  })
}
/** Monta a porta e espera o widget (carregado sob demanda) pedir o desafio. */
async function montarComWidget() {
  const falso = instalarTurnstile()
  render(<Login />)
  await waitFor(() => expect(falso.api.render).toHaveBeenCalledTimes(1))
  return falso
}
/** O Cloudflare entrega a resposta do desafio. */
function responder(widgets: Opcoes[], resposta: string) {
  act(() => widgets[widgets.length - 1].callback(resposta))
}

beforeEach(() => {
  localStorage.clear()
  sessionStorage.clear()
  vi.clearAllMocks()
  build.sitio = null
  build.quest = false
  delete (window as unknown as JanelaComTurnstile).turnstile
  scriptsDoTurnstile().forEach((s) => s.remove())
})
afterEach(cleanup)

describe('sem a variável do Turnstile nada muda', () => {
  it('a porta não mostra widget, não carrega script e entra sem captcha', async () => {
    render(<Login />)
    await act(aguardar)
    expect(screen.queryByTestId('captcha-da-porta')).toBeNull()
    expect(scriptsDoTurnstile().length).toBe(0)
    preencher()
    await enviar()
    expect(supa.auth.signInWithPassword).toHaveBeenCalledWith({ email: EMAIL, password: FRASE })
  })

  it('o serviço de auth mantém a forma antiga das chamadas', async () => {
    await auth.signInEmail(EMAIL, FRASE)
    expect(supa.auth.signInWithPassword).toHaveBeenCalledWith({ email: EMAIL, password: FRASE })
    await auth.sendPasswordReset(EMAIL, RETORNO)
    expect(supa.auth.resetPasswordForEmail).toHaveBeenCalledWith(EMAIL, { redirectTo: RETORNO })
    await auth.sendPasswordReset(EMAIL)
    expect(supa.auth.resetPasswordForEmail).toHaveBeenLastCalledWith(EMAIL, {})
  })
})

describe('com a variável, a porta passa pelo captcha', () => {
  beforeEach(() => {
    build.sitio = SITIO
  })

  it('o widget é pedido com o valor público, e o envio espera a resposta', async () => {
    const { widgets } = await montarComWidget()
    expect(widgets[0].sitekey).toBe(SITIO)
    expect(caixa()).toBeTruthy()
    preencher()
    await enviar()
    expect(screen.getByRole('alert').textContent).toMatch(/verificação de segurança/i)
    expect(supa.auth.signInWithPassword).not.toHaveBeenCalled()
  })

  it('entrar leva a resposta; depois do envio o widget recomeça (uso único)', async () => {
    const { api, widgets } = await montarComWidget()
    responder(widgets, 'r-1')
    preencher()
    await enviar()
    const [pedido] = supa.auth.signInWithPassword.mock.calls[0] as unknown as [Record<string, unknown>]
    expect(pedido).toMatchObject({ email: EMAIL, options: { captchaToken: 'r-1' } })
    expect(api.reset).toHaveBeenCalledWith('w1')
    // Sem resposta nova, o segundo envio não vai ao Supabase com a que já foi gasta.
    await enviar()
    expect(supa.auth.signInWithPassword).toHaveBeenCalledTimes(1)
  })

  it('criar conta leva a resposta junto do retorno da confirmação', async () => {
    const { widgets } = await montarComWidget()
    fireEvent.click(screen.getByRole('button', { name: /Criar uma/ }))
    responder(widgets, 'r-cadastro')
    preencher()
    await enviar()
    const [pedido] = supa.auth.signUp.mock.calls[0] as unknown as [{ options: unknown }]
    expect(pedido.options).toEqual({ emailRedirectTo: RETORNO, captchaToken: 'r-cadastro' })
  })

  it('senha curta no cadastro não gasta a resposta', async () => {
    const { api, widgets } = await montarComWidget()
    fireEvent.click(screen.getByRole('button', { name: /Criar uma/ }))
    responder(widgets, 'r-2')
    preencher('1234567')
    await enviar()
    expect(supa.auth.signUp).not.toHaveBeenCalled()
    expect(api.reset).not.toHaveBeenCalled()
  })

  it('recuperar senha leva a resposta', async () => {
    const { widgets } = await montarComWidget()
    fireEvent.click(screen.getByRole('button', { name: 'Esqueci' }))
    responder(widgets, 'r-reset')
    preencher()
    await enviar()
    expect(supa.auth.resetPasswordForEmail).toHaveBeenCalledWith(EMAIL, {
      redirectTo: RETORNO,
      captchaToken: 'r-reset',
    })
    expect(screen.getByRole('status').textContent).toMatch(/enviamos um link/i)
  })

  it('resposta expirada: avisa na tela e o envio volta a esperar', async () => {
    const { widgets } = await montarComWidget()
    responder(widgets, 'r-velha')
    act(() => widgets[0]['expired-callback']())
    expect(caixa().textContent).toMatch(/expirou/i)
    preencher()
    await enviar()
    expect(supa.auth.signInWithPassword).not.toHaveBeenCalled()
    // O desafio refeito limpa o aviso.
    responder(widgets, 'r-nova')
    expect(caixa().textContent).not.toMatch(/expirou/i)
  })

  it('erro do desafio: avisa e oferece refazer', async () => {
    const { api, widgets } = await montarComWidget()
    act(() => {
      widgets[0]['error-callback']('110200')
    })
    expect(caixa().textContent).toMatch(/falhou/i)
    fireEvent.click(screen.getByRole('button', { name: 'Tentar de novo' }))
    expect(api.reset).toHaveBeenCalledWith('w1')
  })

  it('o Supabase recusa o captcha: a mensagem é da verificação, não de senha errada', async () => {
    const { api, widgets } = await montarComWidget()
    supa.auth.signInWithPassword.mockResolvedValueOnce({ error: RECUSA })
    responder(widgets, 'r-recusada')
    preencher()
    await enviar()
    const alerta = screen.getByRole('alert').textContent ?? ''
    expect(alerta).toMatch(/verificação de segurança/i)
    expect(alerta).not.toMatch(/incorretos/i)
    expect(api.reset).toHaveBeenCalled()
  })

  it('o script do Cloudflare só entra agora, sob demanda; se não carregar, avisa e deixa tentar de novo', async () => {
    render(<Login />)
    await waitFor(() => expect(scriptsDoTurnstile().length).toBe(1))
    act(() => {
      scriptsDoTurnstile()[0].dispatchEvent(new Event('error'))
    })
    await waitFor(() => expect(caixa().textContent).toMatch(/não foi possível carregar/i))
    preencher()
    await enviar()
    expect(supa.auth.signInWithPassword).not.toHaveBeenCalled()

    fireEvent.click(screen.getByRole('button', { name: 'Tentar de novo' }))
    await waitFor(() => expect(scriptsDoTurnstile().length).toBe(1))
    const { api } = instalarTurnstile()
    act(() => {
      scriptsDoTurnstile()[0].dispatchEvent(new Event('load'))
    })
    await waitFor(() => expect(api.render).toHaveBeenCalledTimes(1))
  })
})

describe('no desenho do headset', () => {
  beforeEach(() => {
    build.sitio = SITIO
    build.quest = true
  })

  it('o mesmo widget, dentro do formulário, com o aviso nas peças do Quest', async () => {
    const { widgets } = await montarComWidget()
    expect(screen.getByTestId('login-do-quest')).toBeTruthy()
    expect(caixa().closest('form')).toBeTruthy()
    act(() => widgets[0]['expired-callback']())
    expect(caixa().querySelector('.qen-erro')?.textContent).toMatch(/expirou/i)
    responder(widgets, 'r-quest')
    preencher()
    await enviar()
    const [pedido] = supa.auth.signInWithPassword.mock.calls[0] as unknown as [Record<string, unknown>]
    expect(pedido).toMatchObject({ options: { captchaToken: 'r-quest' } })
  })
})

describe('serviço de auth com captcha', () => {
  it('cadastro e recuperação recusados pelo captcha dizem isso (sem inventar "link enviado")', async () => {
    supa.auth.signUp.mockResolvedValueOnce({ data: { session: null }, error: RECUSA } as never)
    expect((await auth.signUpEmail(EMAIL, FRASE, { captchaToken: 'r' })).message).toMatch(/captcha/i)
    supa.auth.resetPasswordForEmail.mockResolvedValueOnce({ error: RECUSA })
    expect((await auth.sendPasswordReset(EMAIL, undefined, { captchaToken: 'r' })).ok).toBe(false)
  })

  it('recuperação continua genérica para qualquer outro erro (anti-enumeração)', async () => {
    supa.auth.resetPasswordForEmail.mockResolvedValueOnce({ error: { message: 'User not found' } })
    expect(await auth.sendPasswordReset(EMAIL, undefined, { captchaToken: 'r' })).toMatchObject({ ok: true })
  })
})
