// @vitest-environment jsdom
/**
 * AS TELAS DE ANTES DA CASCA NO META QUEST (segunda rodada do headset, 02/10/2026): entrar, criar
 * conta, recuperar e redefinir a senha, o segundo fator, a pergunta de idade e o aceite do responsável.
 *
 * A regra do guia (`docs/design/quest-desenho.md`): NENHUMA FUNÇÃO SOME. Cada teste monta a tela no
 * desenho do headset (`.qen`, de `questEntrada.css`) e confere que o que a tela de sempre oferece
 * continua alcançável e chama o MESMO caminho de autenticação. Fora do Quest, a tela de sempre.
 */
import { readFileSync } from 'node:fs'

import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import React from 'react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const quest = vi.hoisted(() => ({ ligado: true }))
vi.mock('../src/lib/dispositivo/telaNovaDoQuest', async (original) => {
  const real = await original<typeof import('../src/lib/dispositivo/telaNovaDoQuest')>()
  return { ...real, useQuestNovo: () => quest.ligado }
})

vi.mock('../src/lib/supabase', () => ({
  supabase: { auth: {} },
  authRequired: true,
  carregarSupabase: async () => null,
  getAccessToken: async () => null,
}))

const auth = vi.hoisted(() => ({
  signInEmail: vi.fn(),
  signUpEmail: vi.fn(),
  sendPasswordReset: vi.fn(),
  signInWithProvider: vi.fn(),
  updatePassword: vi.fn(),
  verificarSegundoFator: vi.fn(),
  signOut: vi.fn(),
}))
vi.mock('../src/lib/auth', async (original) => ({
  ...(await original<typeof import('../src/lib/auth')>()),
  ...auth,
}))

const idade = vi.hoisted(() => ({
  lerAbertura: vi.fn(),
  declararNascimento: vi.fn(),
  verConvite: vi.fn(),
  aceitarConvite: vi.fn(),
}))
vi.mock('../src/data/rotas/idade', async (original) => ({
  ...(await original<typeof import('../src/data/rotas/idade')>()),
  ...idade,
}))

const rotas = vi.hoisted(() => ({ navegarPara: vi.fn() }))
vi.mock('../src/lib/rotas', async (original) => ({
  ...(await original<typeof import('../src/lib/rotas')>()),
  ...rotas,
}))

import DesafioSegundoFator from '../src/components/auth/DesafioSegundoFator'
import ResetPassword from '../src/components/auth/ResetPassword'
import AceiteDoResponsavel from '../src/components/conta/AceiteDoResponsavel'
import PerguntaDeIdade from '../src/components/conta/PerguntaDeIdade'
import Login from '../src/components/Login'

const aguardar = () => act(async () => {})
const campo = (rotulo: string) => screen.getByLabelText(rotulo) as HTMLInputElement
const enviar = async (dentroDe: HTMLElement) => {
  await act(async () => {
    fireEvent.submit(dentroDe.closest('form')!)
  })
}

beforeEach(() => {
  quest.ligado = true
  for (const f of [...Object.values(auth), ...Object.values(idade), rotas.navegarPara]) f.mockReset()
  idade.lerAbertura.mockResolvedValue({ cadastro: true, checkout: true })
  auth.signInEmail.mockResolvedValue({ ok: true })
  auth.signUpEmail.mockResolvedValue({ ok: true, needsEmailConfirm: true })
  auth.sendPasswordReset.mockResolvedValue({ ok: true })
  auth.signInWithProvider.mockResolvedValue({ ok: true })
  auth.updatePassword.mockResolvedValue({ ok: true })
  auth.verificarSegundoFator.mockResolvedValue({ ok: true })
  auth.signOut.mockResolvedValue(undefined)
})
afterEach(() => {
  cleanup()
  sessionStorage.clear()
})

describe('Login no Quest', () => {
  it('monta no desenho do headset: marca, formulário, um botão principal e as alternativas', async () => {
    const semConta = vi.fn()
    const { container } = render(<Login onContinuarSemConta={semConta} />)
    await aguardar()
    expect(container.querySelector('.qen')).not.toBeNull()
    expect(container.querySelector('.qen-marca')).not.toBeNull()
    expect(container.querySelector('.field-input')).toBeNull()
    expect(screen.getByRole('heading', { level: 1, name: 'Entrar' })).toBeTruthy()
    expect(campo('E-mail').type).toBe('email')
    expect(campo('Senha').type).toBe('password')
    // Uma ação principal na tela: a do formulário.
    expect(container.querySelectorAll('.qen-botao.pri')).toHaveLength(1)
    expect(screen.getByRole('button', { name: 'Entrar' }).className).toContain('pri')
    expect(screen.getByRole('button', { name: 'Continuar com Google' })).toBeTruthy()
    fireEvent.click(screen.getByRole('button', { name: 'Continuar sem conta' }))
    expect(semConta).toHaveBeenCalledTimes(1)
    // Quem cria conta consegue ler o que aceita.
    expect(screen.getByRole('link', { name: 'termos de uso' }).getAttribute('href')).toBe('/termos.html')
    expect(screen.getByRole('link', { name: 'política de privacidade' }).getAttribute('href')).toBe('/privacidade.html')
  })

  it('entrar chama o mesmo caminho de autenticação, e o erro fica à vista', async () => {
    auth.signInEmail.mockResolvedValue({ ok: false, message: 'E-mail ou senha incorretos.' })
    render(<Login />)
    await aguardar()
    fireEvent.change(campo('E-mail'), { target: { value: 'ana@exemplo.com' } })
    fireEvent.change(campo('Senha'), { target: { value: 'senha-forte-1' } })
    await enviar(campo('Senha'))
    expect(auth.signInEmail).toHaveBeenCalledWith('ana@exemplo.com', 'senha-forte-1')
    expect(screen.getByRole('alert').textContent).toContain('E-mail ou senha incorretos.')
  })

  it('criar conta: a senha curta não vai ao servidor; a conta criada pede a confirmação do e-mail', async () => {
    render(<Login />)
    await aguardar()
    fireEvent.click(screen.getByRole('button', { name: 'Criar uma conta' }))
    expect(screen.getByRole('heading', { level: 1, name: 'Criar conta' })).toBeTruthy()
    expect(campo('Senha').minLength).toBe(8)
    expect(screen.queryByRole('button', { name: 'Esqueci' })).toBeNull()

    fireEvent.change(campo('E-mail'), { target: { value: 'ana@exemplo.com' } })
    fireEvent.change(campo('Senha'), { target: { value: '1234567' } })
    await enviar(campo('Senha'))
    expect(screen.getByRole('alert').textContent).toMatch(/8 caracteres/)
    expect(auth.signUpEmail).not.toHaveBeenCalled()

    fireEvent.change(campo('Senha'), { target: { value: 'senha-forte-1' } })
    await enviar(campo('Senha'))
    expect(auth.signUpEmail).toHaveBeenCalledWith('ana@exemplo.com', 'senha-forte-1')
    expect(screen.getByRole('status').textContent).toMatch(/Confirme pelo link/)

    fireEvent.click(screen.getByRole('button', { name: 'Entrar' }))
    expect(screen.getByRole('heading', { level: 1, name: 'Entrar' })).toBeTruthy()
  })

  it('recuperar a senha: só o e-mail, o link enviado e a volta ao login', async () => {
    const semConta = vi.fn()
    render(<Login onContinuarSemConta={semConta} />)
    await aguardar()
    fireEvent.click(screen.getByRole('button', { name: 'Esqueci' }))
    expect(screen.getByRole('heading', { level: 1, name: 'Recuperar senha' })).toBeTruthy()
    expect(screen.queryByLabelText('Senha')).toBeNull()
    // Na recuperação não há provedores nem "sem conta".
    expect(screen.queryByRole('button', { name: 'Continuar com Google' })).toBeNull()
    expect(screen.queryByRole('button', { name: 'Continuar sem conta' })).toBeNull()

    fireEvent.change(campo('E-mail'), { target: { value: 'ana@exemplo.com' } })
    await enviar(campo('E-mail'))
    expect(auth.sendPasswordReset).toHaveBeenCalledWith('ana@exemplo.com', expect.stringContaining('/auth/callback'))
    expect(screen.getByRole('status').textContent).toMatch(/enviamos um link/)

    fireEvent.click(screen.getByRole('button', { name: /Voltar ao login/ }))
    expect(screen.getByRole('heading', { level: 1, name: 'Entrar' })).toBeTruthy()
  })

  it('Google chama o provedor; o olho mostra e esconde a senha', async () => {
    render(<Login />)
    await aguardar()
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'Continuar com Google' }))
    })
    expect(auth.signInWithProvider).toHaveBeenCalledWith('google', expect.stringContaining('/auth/callback'))

    const olho = screen.getByRole('button', { name: 'Mostrar senha' })
    expect(olho.className).toContain('qen-olho')
    fireEvent.click(olho)
    expect(campo('Senha').type).toBe('text')
    fireEvent.click(screen.getByRole('button', { name: 'Ocultar senha' }))
    expect(campo('Senha').type).toBe('password')
  })

  it('cadastro pausado no servidor: sem "Criar uma conta", e a tela diz por quê', async () => {
    idade.lerAbertura.mockResolvedValue({ cadastro: false, checkout: true })
    render(<Login />)
    await aguardar()
    expect(screen.queryByRole('button', { name: 'Criar uma conta' })).toBeNull()
    expect(screen.getByText(/cadastro de contas novas está pausado/)).toBeTruthy()
  })

  it('fora do Quest, a porta de sempre', async () => {
    quest.ligado = false
    const { container } = render(<Login />)
    await aguardar()
    expect(container.querySelector('.qen')).toBeNull()
    expect(container.querySelector('.field-input')).not.toBeNull()
  })
})

describe('Redefinir a senha no Quest', () => {
  it('as duas senhas, a conferência e a gravação pelo mesmo caminho', async () => {
    const aoConcluir = vi.fn()
    const { container } = render(<ResetPassword onDone={aoConcluir} />)
    expect(container.querySelector('.qen')).not.toBeNull()
    expect(screen.getByRole('heading', { level: 1, name: 'Definir nova senha' })).toBeTruthy()
    expect(container.querySelectorAll('.qen-olho')).toHaveLength(2)

    fireEvent.change(campo('Nova senha'), { target: { value: 'senha-forte-1' } })
    fireEvent.change(campo('Confirmar senha'), { target: { value: 'outra-senha-1' } })
    await enviar(campo('Nova senha'))
    expect(screen.getByRole('alert').textContent).toMatch(/não coincidem/)
    expect(auth.updatePassword).not.toHaveBeenCalled()

    fireEvent.change(campo('Confirmar senha'), { target: { value: 'senha-forte-1' } })
    await enviar(campo('Nova senha'))
    expect(auth.updatePassword).toHaveBeenCalledWith('senha-forte-1')
    expect(aoConcluir).toHaveBeenCalledTimes(1)
  })

  it('fora do Quest, a tela de sempre', () => {
    quest.ligado = false
    const { container } = render(<ResetPassword onDone={() => {}} />)
    expect(container.querySelector('.qen')).toBeNull()
    expect(container.querySelectorAll('.field-input')).toHaveLength(2)
  })
})

describe('O segundo fator no Quest', () => {
  it('seis dígitos, um botão principal, o erro e a saída para outra conta', async () => {
    auth.verificarSegundoFator.mockResolvedValueOnce({ ok: false, message: 'Código inválido. Tente de novo.' })
    const aoConcluir = vi.fn()
    const { container } = render(<DesafioSegundoFator onConcluido={aoConcluir} />)
    expect(container.querySelector('.qen')).not.toBeNull()
    expect(screen.getByRole('heading', { level: 1, name: 'Verificação em duas etapas' })).toBeTruthy()
    const confirmar = screen.getByRole('button', { name: 'Confirmar' }) as HTMLButtonElement
    expect(confirmar.disabled).toBe(true)

    // Só dígitos entram no campo.
    fireEvent.change(campo('Código'), { target: { value: '12a3456' } })
    expect(campo('Código').value).toBe('123456')
    expect(confirmar.disabled).toBe(false)
    await enviar(campo('Código'))
    expect(auth.verificarSegundoFator).toHaveBeenCalledWith('123456')
    expect(screen.getByRole('alert').textContent).toMatch(/Código inválido/)
    expect(aoConcluir).not.toHaveBeenCalled()

    await enviar(campo('Código'))
    expect(aoConcluir).toHaveBeenCalledTimes(1)

    fireEvent.click(screen.getByRole('button', { name: 'Sair e entrar com outra conta' }))
    expect(auth.signOut).toHaveBeenCalledTimes(1)
  })
})

describe('A pergunta de idade no Quest', () => {
  it('a data, o aviso do perfil protegido e a gravação; sem data, a tela diz o que falta', async () => {
    idade.declararNascimento.mockResolvedValue({ ok: true, estado: {} })
    const aoConcluir = vi.fn()
    render(<PerguntaDeIdade aoConcluir={aoConcluir} />)
    // Enquanto o desenho do headset não chega, a tela (que bloqueia o app) mostra uma espera visível.
    expect(screen.getByRole('status').textContent).toContain('Carregando…')
    const tela = await screen.findByTestId('idade-do-quest')
    expect(tela.className).toContain('qen')
    expect(screen.getByRole('heading', { level: 1, name: 'Quando você nasceu?' })).toBeTruthy()
    expect(screen.getByText(/perfil protegido/)).toBeTruthy()

    await enviar(campo('Data de nascimento'))
    expect(screen.getByRole('alert').textContent).toMatch(/Escolha a sua data de nascimento/)
    expect(idade.declararNascimento).not.toHaveBeenCalled()

    fireEvent.change(campo('Data de nascimento'), { target: { value: '1990-05-17' } })
    await enviar(campo('Data de nascimento'))
    expect(idade.declararNascimento).toHaveBeenCalledWith('1990-05-17')
    expect(aoConcluir).toHaveBeenCalledTimes(1)
  })

  it('a recusa do servidor aparece na tela', async () => {
    idade.declararNascimento.mockResolvedValue({ ok: false, status: 400, error: 'x', code: 'nascimento_invalido' })
    render(<PerguntaDeIdade aoConcluir={() => {}} />)
    await screen.findByTestId('idade-do-quest')
    fireEvent.change(campo('Data de nascimento'), { target: { value: '1990-05-17' } })
    await enviar(campo('Data de nascimento'))
    expect(screen.getByRole('alert').textContent).toMatch(/Essa data não parece certa/)
  })

  it('fora do Quest, o cartão de sempre', () => {
    quest.ligado = false
    const { container } = render(<PerguntaDeIdade aoConcluir={() => {}} />)
    expect(container.querySelector('.qen')).toBeNull()
    expect(container.querySelector('form.cartao')).not.toBeNull()
  })

  it('se o desenho do headset não chegar (aba de antes de um deploy), vale a pergunta de sempre, sem recarregar', async () => {
    vi.resetModules()
    vi.doMock('../src/components/conta/quest/IdadeDoQuest', () => {
      throw new Error('Failed to fetch dynamically imported module')
    })
    idade.declararNascimento.mockResolvedValue({ ok: true, estado: {} })
    const aoConcluir = vi.fn()
    const { default: Pergunta } = await import('../src/components/conta/PerguntaDeIdade')
    const { container } = render(<Pergunta aoConcluir={aoConcluir} />)
    await waitFor(() => expect(container.querySelector('form.cartao')).not.toBeNull())
    expect(container.querySelector('.qen')).toBeNull()
    // E a pergunta de sempre funciona: a data vai para o mesmo caminho.
    fireEvent.change(campo('Data de nascimento'), { target: { value: '1990-05-17' } })
    await enviar(campo('Data de nascimento'))
    expect(idade.declararNascimento).toHaveBeenCalledWith('1990-05-17')
    expect(aoConcluir).toHaveBeenCalledTimes(1)
    expect(readFileSync('src/components/conta/PerguntaDeIdade.tsx', 'utf8')).not.toContain('lazyComRecarga')
    vi.doUnmock('../src/components/conta/quest/IdadeDoQuest')
  })
})

describe('O aceite do responsável no Quest', () => {
  const convite = {
    ok: true as const,
    nomeDoMenor: 'Bia',
    faixa: '0-11',
    exigeConsentimentoEspecifico: true,
    textoDoConsentimento: 'Autorizo o Babel Play a guardar os dados de estudo.',
    versao: 'v3',
    expiraEm: Date.now() + 1000,
  }

  it('espera, mostra o texto, exige o nome e as duas confirmações, registra e oferece assinar por ele', async () => {
    idade.verConvite.mockResolvedValue(convite)
    idade.aceitarConvite.mockResolvedValue({ ok: true, nomeDoMenor: 'Bia', menorId: 'menor-1' })
    const aoSair = vi.fn()
    const { container } = render(<AceiteDoResponsavel token="tok-1" aoSair={aoSair} />)
    expect(container.querySelector('.qen.qen-uma')).not.toBeNull()
    expect(screen.getByRole('status').textContent).toMatch(/Carregando o convite/)

    expect(await screen.findByText('Autorizo o Babel Play a guardar os dados de estudo.')).toBeTruthy()
    expect(screen.getByRole('heading', { level: 1, name: 'Pedido de vínculo de responsável' })).toBeTruthy()
    expect(screen.getAllByRole('checkbox')).toHaveLength(2)

    /* LGPD, art. 14: o texto aparece INTEIRO (sem caixa de rolagem própria, que deixaria marcar a
       confirmação sem ver o fim dele), e as confirmações vêm DEPOIS dele. */
    const texto = screen.getByTestId('texto-do-consentimento')
    expect(texto.hasAttribute('tabindex')).toBe(false)
    const regra = /\.qen-texto \{([^}]*)\}/.exec(readFileSync('src/styles/questEntrada.css', 'utf8'))![1]
    expect(regra).not.toMatch(/max-height|overflow/)
    for (const caixa of screen.getAllByRole('checkbox'))
      expect(texto.compareDocumentPosition(caixa) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy()

    await enviar(campo('Seu nome completo'))
    expect(screen.getByRole('alert').textContent).toMatch(/Preencha o seu nome e marque as confirmações/)
    expect(idade.aceitarConvite).not.toHaveBeenCalled()

    fireEvent.change(campo('Seu nome completo'), { target: { value: 'Maria Souza' } })
    for (const caixa of screen.getAllByRole('checkbox')) fireEvent.click(caixa)
    await enviar(campo('Seu nome completo'))
    expect(idade.aceitarConvite).toHaveBeenCalledWith({
      token: 'tok-1',
      nomeDoResponsavel: 'Maria Souza',
      consentimentoEspecifico: true,
      versaoDoConsentimento: 'v3',
    })

    expect(await screen.findByRole('heading', { level: 1, name: 'Conta vinculada' })).toBeTruthy()
    fireEvent.click(screen.getByRole('button', { name: /Assinar um plano para Bia/ }))
    expect(rotas.navegarPara).toHaveBeenCalledWith({ view: 'planos', planosTela: 'assinar' })
    expect(JSON.parse(sessionStorage.getItem('babel.checkout.para') ?? 'null')).toEqual({ id: 'menor-1', nome: 'Bia' })
    expect(aoSair).toHaveBeenCalledTimes(1)
  })

  it('convite que não abre: o motivo e a volta ao app; o fechar também sai', async () => {
    idade.verConvite.mockResolvedValue({ ok: false, status: 410, error: 'x', code: 'convite_expirado' })
    const aoSair = vi.fn()
    render(<AceiteDoResponsavel token="tok-2" aoSair={aoSair} />)
    await waitFor(() => expect(screen.getByRole('alert').textContent).toMatch(/Este convite expirou/))
    fireEvent.click(screen.getByRole('button', { name: 'Voltar ao app' }))
    fireEvent.click(screen.getByRole('button', { name: 'Fechar' }))
    expect(aoSair).toHaveBeenCalledTimes(2)
  })

  it('fora do Quest, o cartão de sempre', async () => {
    quest.ligado = false
    idade.verConvite.mockResolvedValue(convite)
    const { container } = render(<AceiteDoResponsavel token="tok-1" aoSair={() => {}} />)
    await aguardar()
    expect(container.querySelector('.qen')).toBeNull()
    expect(container.querySelector('section.cartao')).not.toBeNull()
  })
})
