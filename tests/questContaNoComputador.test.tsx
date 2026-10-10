// @vitest-environment jsdom
/**
 * A ENTRADA E A CONTA NO COMPUTADOR (02/10/2026: o desenho do headset passou a valer também no
 * computador; desde 08/10/2026 é o único, em todo aparelho). O aparelho é trocado pelo perfil, como em
 * `tests/questInstitucional.test.tsx`.
 *
 * A auditoria desta área concluiu que todo `useQuestNovo()` dela é DESENHO (nenhum queria dizer "este
 * aparelho é um headset"). Estes testes seguram a conclusão: no computador, o ramo novo guarda o que o
 * teclado, o gerenciador de senhas e o colar precisam, e nenhuma frase da área fala em headset.
 */
import { readdirSync, readFileSync, statSync } from 'node:fs'
import { join } from 'node:path'

import { act, cleanup, fireEvent, render, screen } from '@testing-library/react'
import React from 'react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const aparelho = vi.hoisted(() => ({ tipo: 'desktop-com-gpu' as string }))
vi.mock('../src/lib/dispositivo/perfil', async (original) => {
  const real = await original<typeof import('../src/lib/dispositivo/perfil')>()
  /* O celular e o tablet de verdade têm tela de toque; o jsdom não tem nenhuma. */
  const perfilDoDispositivo = () => {
    const p = real.perfilDoDispositivo()
    const toques = aparelho.tipo.startsWith('celular') ? 5 : 0
    return { ...p, tipo: aparelho.tipo, sinais: { ...p.sinais, toques } }
  }
  return { ...real, perfilDoDispositivo }
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

vi.mock('../src/data/rotas/idade', async (original) => ({
  ...(await original<typeof import('../src/data/rotas/idade')>()),
  lerAbertura: async () => ({ cadastro: true, checkout: true }),
}))

import DesafioSegundoFator from '../src/components/auth/DesafioSegundoFator'
import ResetPassword from '../src/components/auth/ResetPassword'
import Login from '../src/components/Login'

const aguardar = () => act(async () => {})
const campo = (rotulo: string) => screen.getByLabelText(rotulo) as HTMLInputElement

beforeEach(() => {
  aparelho.tipo = 'desktop-com-gpu'
  for (const f of Object.values(auth)) f.mockReset()
  auth.signInEmail.mockResolvedValue({ ok: true })
  auth.signUpEmail.mockResolvedValue({ ok: true, needsEmailConfirm: true })
  auth.updatePassword.mockResolvedValue({ ok: true })
  auth.verificarSegundoFator.mockResolvedValue({ ok: true })
  auth.signOut.mockResolvedValue(undefined)
})
afterEach(() => {
  cleanup()
  localStorage.clear()
  sessionStorage.clear()
})

describe('a entrada nova, em todo aparelho', () => {
  it('computador, headset e celular: a mesma entrada, sem chave para ligar', async () => {
    for (const tipo of ['desktop-com-gpu', 'quest', 'celular-bom']) {
      aparelho.tipo = tipo
      const { container, unmount } = render(<Login />)
      await aguardar()
      expect(container.querySelector('.qen'), tipo).not.toBeNull()
      expect(container.querySelector('.field-input'), tipo).toBeNull()
      unmount()
    }
  })
})

describe('Entrar no computador com o desenho novo', () => {
  it('o gerenciador de senhas acha os campos: e-mail, senha atual ao entrar, senha nova ao criar', async () => {
    render(<Login onContinuarSemConta={() => {}} />)
    await aguardar()
    expect(campo('E-mail').type).toBe('email')
    expect(campo('E-mail').autocomplete).toBe('email')
    expect(campo('Senha').type).toBe('password')
    expect(campo('Senha').autocomplete).toBe('current-password')
    // E-mail e senha no MESMO formulário: é o que o navegador oferece para salvar.
    expect(campo('E-mail').closest('form')).toBe(campo('Senha').closest('form'))

    fireEvent.click(screen.getByRole('button', { name: 'Criar uma conta' }))
    expect(campo('Senha').autocomplete).toBe('new-password')
    expect(campo('Senha').minLength).toBe(8)
  })

  it('Enter envia (o botão principal é o `submit` do formulário) e o olho mostra a senha', async () => {
    const { container } = render(<Login />)
    await aguardar()
    const principal = container.querySelector<HTMLButtonElement>('.qen-botao.pri')!
    expect(principal.type).toBe('submit')
    expect(principal.closest('form')).toBe(campo('Senha').closest('form'))
    // Os botões que não enviam (esqueci, olho, Google, trocar de modo) não roubam o Enter.
    for (const b of container.querySelectorAll<HTMLButtonElement>('button:not(.pri)')) expect(b.type).toBe('button')

    fireEvent.change(campo('E-mail'), { target: { value: 'ana@exemplo.com' } })
    fireEvent.change(campo('Senha'), { target: { value: 'senha-forte-1' } })
    await act(async () => {
      fireEvent.submit(campo('Senha').closest('form')!)
    })
    expect(auth.signInEmail).toHaveBeenCalledWith('ana@exemplo.com', 'senha-forte-1')

    fireEvent.click(screen.getByRole('button', { name: 'Mostrar senha' }))
    expect(campo('Senha').type).toBe('text')
  })

  it('os links de quem cria conta continuam lá, e nada na tela fala em headset', async () => {
    const { container } = render(<Login onContinuarSemConta={() => {}} />)
    await aguardar()
    expect(screen.getByRole('link', { name: 'termos de uso' }).getAttribute('href')).toBe('/termos.html')
    expect(screen.getByRole('link', { name: 'política de privacidade' }).getAttribute('href')).toBe('/privacidade.html')
    expect(screen.getByRole('button', { name: 'Esqueci' })).toBeTruthy()
    expect(screen.getByRole('button', { name: 'Continuar com Google' })).toBeTruthy()
    expect(container.textContent).not.toMatch(/headset|Quest|controle|gatilho/i)
  })
})

describe('O segundo fator e a senha nova no computador com o desenho novo', () => {
  it('o código: foco ao abrir, preenchimento automático do código, colar só os dígitos, Enter confirma', async () => {
    const aoConcluir = vi.fn()
    const { container } = render(<DesafioSegundoFator onConcluido={aoConcluir} />)
    expect(container.querySelector('.qen')).not.toBeNull()
    const codigo = campo('Código')
    expect(document.activeElement).toBe(codigo)
    expect(codigo.autocomplete).toBe('one-time-code')
    expect(codigo.inputMode).toBe('numeric')
    // O que chega colado (ou do gerenciador) passa pelo mesmo filtro de dígitos.
    fireEvent.change(codigo, { target: { value: '123456' } })
    expect(codigo.value).toBe('123456')
    const confirmar = screen.getByRole('button', { name: 'Confirmar' }) as HTMLButtonElement
    expect(confirmar.type).toBe('submit')
    await act(async () => {
      fireEvent.submit(codigo.closest('form')!)
    })
    expect(auth.verificarSegundoFator).toHaveBeenCalledWith('123456')
    expect(aoConcluir).toHaveBeenCalledTimes(1)
    expect(container.textContent).not.toMatch(/headset|Quest|controle|gatilho/i)
  })

  it('redefinir a senha: os dois campos são de senha nova, cada um com o seu olho', () => {
    const { container } = render(<ResetPassword onDone={() => {}} />)
    expect(container.querySelector('.qen')).not.toBeNull()
    expect(campo('Nova senha').autocomplete).toBe('new-password')
    expect(campo('Confirmar senha').autocomplete).toBe('new-password')
    expect(container.querySelectorAll('.qen-olho')).toHaveLength(2)
    expect(container.querySelector<HTMLButtonElement>('.qen-botao.pri')!.type).toBe('submit')
    expect(container.textContent).not.toMatch(/headset|Quest|controle|gatilho/i)
  })
})

/* ═══════════════ O QUE É DO APARELHO NÃO PERGUNTA PELO DESENHO ═══════════════
   Nesta área (conta, planos, login, ofertas) o desenho novo é o mesmo no headset e no computador: não há
   frase que fale em headset ou em Quest. Se uma entrar, ela depende do APARELHO: pergunte por
   `noHeadset()` (ou pelo recurso em `recursos.ts`), dê o texto neutro ao computador, e tire o arquivo
   desta varredura com o motivo escrito. */
describe('as frases da área não falam em headset', () => {
  const RAIZ = 'src/components'
  const ARQUIVOS_SOLTOS = ['Login.tsx', 'CardDePlanos.tsx', 'views/Perfil.tsx', 'views/Planos.tsx']
  const PASTAS = ['conta', 'auth', 'ofertas', 'views/perfil', 'views/planos']

  const listar = (pasta: string): string[] =>
    readdirSync(pasta).flatMap((nome) => {
      const caminho = join(pasta, nome)
      return statSync(caminho).isDirectory() ? listar(caminho) : /\.tsx?$/.test(nome) ? [caminho] : []
    })
  const semComentarios = (fonte: string) => fonte.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:'"`])\/\/.*$/gm, '$1')

  it('nenhuma frase com "headset" ou "Quest" fora dos comentários', () => {
    /* FORA DA VARREDURA, com o motivo: `quatroPlanos.ts` traz os textos da tela dos quatro planos, que
       falam do Quest como APARELHO de quem lê ("celular, notebook fraco, Quest", o cartão "Você está num
       Meta Quest", que só aparece no headset: `aparelhoAtual()`), não como o desenho da tela. */
    const arquivos = [
      ...ARQUIVOS_SOLTOS.map((a) => join(RAIZ, a)),
      ...PASTAS.flatMap((p) => listar(join(RAIZ, p))),
    ].filter((a) => !a.replace(/\\/g, '/').endsWith('views/planos/quatroPlanos.ts'))
    expect(arquivos.length).toBeGreaterThan(30)
    for (const arquivo of arquivos) {
      const codigo = semComentarios(readFileSync(arquivo, 'utf8'))
      /* `\b`: os nomes do código (`GateDeContaDoQuest`, `usePedacoDoQuest`, `./quest/…`) não contam.
         "controle" e "gatilho" ficam de fora da varredura: são palavras do código das ofertas (o
         gatilho de uma oferta), não do aparelho; as telas montadas acima conferem o texto à vista. */
      expect(codigo.match(/\bheadset\b|\bQuest\b/g), arquivo).toBeNull()
    }
  })
})
