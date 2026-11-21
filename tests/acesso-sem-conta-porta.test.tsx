// @vitest-environment jsdom
/**
 * ACESSO SEM CONTA v2, A PORTA (openspec `acesso-sem-conta-v2`, etapa 3).
 *
 * O que se prende aqui, com a flag `acesso_restrito_sem_conta` LIGADA e DESLIGADA:
 *  · `useAcessoSemConta` conta as sessões do IndexedDB na chegada e ao entrar numa tela que grava, e
 *    só aí: a 1ª sessão salva não derruba a porta sobre o jogo. Desligada, nem abre o IndexedDB;
 *  · `PortaDeEntrada`: a pergunta de faixa; adulto vai ao Login SEM "Continuar sem conta"; menor segue
 *    local com o convite neutro;
 *  · os marcos: o cartão "Guarde o que você capturou" no fim da 1ª sessão, e o tom neutro do menor;
 *  · LIVROS (etapa 4): ler (`/livros/<id>/ler`) sem `podeLer` abre a porta já na 1ª visita; menor lê como
 *    hoje; flag desligada, nada muda.
 */
import { act, cleanup, fireEvent, render, renderHook, screen } from '@testing-library/react'
import { StrictMode } from 'react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const mundo = vi.hoisted(() => ({ flag: false, sessoes: 0, contagens: 0 }))

vi.mock('../src/lib/supabase', () => ({
  supabase: null,
  supabaseConfigurado: false,
  authRequired: true,
  carregarSupabase: async () => null,
  getAccessToken: async () => null,
}))
const funil = vi.hoisted(() => ({ eventos: [] as string[] }))
vi.mock('../src/lib/ofertas/funilDaPorta', () => ({
  registrarEventoDaPorta: (e: string) => funil.eventos.push(e),
  registrarCadastroIniciadoNaPorta: () => funil.eventos.push('porta_cadastro_iniciado'),
  contarContaDoGooglePelaPorta: () => {},
}))
vi.mock('../src/lib/flags', () => ({ useFlag: (chave: string) => chave === 'acesso_restrito_sem_conta' && mundo.flag }))
vi.mock('../src/data/efemero/store', () => ({
  abrirStore: async () => ({
    count: async () => {
      mundo.contagens++
      return mundo.sessoes
    },
  }),
}))

import PortaDeEntrada from '../src/components/conta/PortaDeEntrada'
import { useAcessoSemConta } from '../src/lib/estado/useAcessoSemConta'
import { lerFaixaSemConta } from '../src/lib/faixaSemConta'
import { lerIntencao } from '../src/lib/intencaoDeLogin'
import { avisoPendente, marcarVisto } from '../src/lib/marcosDeConta'

const aguardar = () => new Promise((r) => setTimeout(r, 20))

beforeEach(() => {
  localStorage.clear()
  funil.eventos = []
  mundo.flag = false
  mundo.sessoes = 0
  mundo.contagens = 0
})
afterEach(cleanup)

async function montar(props: { anonimo: boolean; activeView: string; lendoLivro?: boolean }) {
  /* StrictMode, como no app em dev: o efeito montado duas vezes não pode perder a contagem da chegada. */
  const h = renderHook((p) => useAcessoSemConta(p), { initialProps: props, wrapper: StrictMode })
  await act(aguardar)
  return h
}

describe('useAcessoSemConta', () => {
  it('flag desligada: livre, e o IndexedDB nem é aberto (o app de antes)', async () => {
    mundo.sessoes = 3
    const { result, rerender } = await montar({ anonimo: true, activeView: 'hub' })
    rerender({ anonimo: true, activeView: 'capture' })
    await act(aguardar)
    expect(result.current.acesso).toBe('livre')
    expect(mundo.contagens).toBe(0)
  })

  it('flag ligada, sem nenhuma sessão: a 1ª é livre', async () => {
    mundo.flag = true
    const { result } = await montar({ anonimo: true, activeView: 'capture' })
    expect(result.current.acesso).toBe('livre')
  })

  it('flag ligada, voltando ao app depois do 1º uso: a porta já na chegada', async () => {
    mundo.flag = true
    mundo.sessoes = 1
    const { result } = await montar({ anonimo: true, activeView: 'hub' })
    expect(result.current.acesso).toBe('porta')
  })

  it('a 1ª sessão salva não derruba a porta sobre o jogo; começar a 2ª, sim', async () => {
    mundo.flag = true
    const { result, rerender } = await montar({ anonimo: true, activeView: 'capture' })
    mundo.sessoes = 1 // a 1ª sessão foi salva; o App leva ao jogo
    rerender({ anonimo: true, activeView: 'play' })
    await act(aguardar)
    rerender({ anonimo: true, activeView: 'hub' })
    await act(aguardar)
    expect(result.current.acesso).toBe('livre')
    rerender({ anonimo: true, activeView: 'interprete' })
    await act(aguardar)
    expect(result.current.acesso).toBe('porta')
  })

  it('com conta, livre (e sem contar)', async () => {
    mundo.flag = true
    mundo.sessoes = 4
    const { result } = await montar({ anonimo: false, activeView: 'capture' })
    expect(result.current.acesso).toBe('livre')
    expect(mundo.contagens).toBe(0)
  })

  it('menor declarado segue livre; a faixa fica só no aparelho', async () => {
    mundo.flag = true
    mundo.sessoes = 1
    const { result } = await montar({ anonimo: true, activeView: 'hub' })
    expect(result.current.acesso).toBe('porta')
    act(() => result.current.declararFaixa('menor'))
    expect(result.current.acesso).toBe('livre')
    expect(lerFaixaSemConta()).toBe('menor')
  })
})

describe('useAcessoSemConta: ler um livro', () => {
  const lendo = { anonimo: true, activeView: 'livros', lendoLivro: true }

  it('flag desligada: ler segue livre, sem tocar no IndexedDB (o app de antes)', async () => {
    const { result } = await montar(lendo)
    expect(result.current.acesso).toBe('livre')
    expect(mundo.contagens).toBe(0)
  })

  it('flag ligada: o catálogo e a ficha são livres, mesmo depois do 1º uso de adulto', async () => {
    mundo.flag = true
    const { result } = await montar({ anonimo: true, activeView: 'livros', lendoLivro: false })
    expect(result.current.acesso).toBe('livre')
  })

  it('flag ligada, sem faixa: ler abre a porta já na 1ª visita (a pergunta vem primeiro)', async () => {
    mundo.flag = true
    const { result } = await montar(lendo)
    expect(result.current.acesso).toBe('porta')
  })

  it('flag ligada: adulto sem conta vai à porta; menor lê como hoje', async () => {
    mundo.flag = true
    const { result } = await montar(lendo)
    act(() => result.current.declararFaixa('adulto'))
    expect(result.current.acesso).toBe('porta')
    act(() => result.current.declararFaixa('menor'))
    expect(result.current.acesso).toBe('livre')
  })

  it('com conta, ler é livre', async () => {
    mundo.flag = true
    const { result } = await montar({ ...lendo, anonimo: false })
    expect(result.current.acesso).toBe('livre')
  })
})

describe('PortaDeEntrada', () => {
  it('pergunta a faixa; adulto vai ao Login sem "Continuar sem conta", com os termos e a volta', () => {
    const aoDeclarar = vi.fn()
    render(<PortaDeEntrada faixa={null} aoDeclarar={aoDeclarar} />)
    expect(screen.getByRole('heading', { level: 1, name: 'Você tem 18 anos ou mais?' })).toBeTruthy()
    fireEvent.click(screen.getByRole('button', { name: 'Sim, tenho 18 anos ou mais' }))
    expect(aoDeclarar).toHaveBeenCalledWith('adulto')
    expect(screen.getByRole('heading', { level: 1, name: 'Criar conta' })).toBeTruthy()
    expect(screen.queryByRole('button', { name: 'Continuar sem conta' })).toBeNull()
    expect(screen.getByText(/termos de uso/)).toBeTruthy()
    fireEvent.click(screen.getByRole('button', { name: 'Tenho menos de 18 anos' }))
    expect(screen.getByRole('heading', { level: 1, name: 'Você tem 18 anos ou mais?' })).toBeTruthy()
  })

  it('quem já se declarou adulto cai direto no Login', () => {
    render(<PortaDeEntrada faixa="adulto" aoDeclarar={vi.fn()} modoInicial="login" />)
    expect(screen.getByRole('heading', { level: 1, name: 'Entrar' })).toBeTruthy()
    expect(screen.queryByRole('button', { name: 'Continuar sem conta' })).toBeNull()
  })

  it('menor: segue local, com o convite neutro; a faixa só é gravada ao continuar', () => {
    const aoDeclarar = vi.fn()
    render(<PortaDeEntrada faixa={null} aoDeclarar={aoDeclarar} />)
    fireEvent.click(screen.getByRole('button', { name: 'Não, tenho menos de 18' }))
    expect(screen.getByTestId('convite-do-responsavel').textContent).toBe(
      'Com um responsável, você pode criar uma conta.',
    )
    expect(aoDeclarar).not.toHaveBeenCalled()
    fireEvent.click(screen.getByRole('button', { name: 'Continuar' }))
    expect(aoDeclarar).toHaveBeenCalledWith('menor')
  })

  /* Etapa 5: o funil anônimo (`funilDaPorta.ts`). */
  it('funil: uma exibição por montagem (mesmo no StrictMode); a faixa de menor só conta ao continuar', () => {
    render(
      <StrictMode>
        <PortaDeEntrada faixa={null} aoDeclarar={vi.fn()} />
      </StrictMode>,
    )
    expect(funil.eventos).toEqual(['porta_exibida'])
    fireEvent.click(screen.getByRole('button', { name: 'Não, tenho menos de 18' }))
    fireEvent.click(screen.getByRole('button', { name: 'Voltar' }))
    expect(funil.eventos).toEqual(['porta_exibida'])
    fireEvent.click(screen.getByRole('button', { name: 'Não, tenho menos de 18' }))
    fireEvent.click(screen.getByRole('button', { name: 'Continuar' }))
    expect(funil.eventos).toEqual(['porta_exibida', 'porta_faixa_menor'])
  })
})

describe('PortaDeEntrada na leitura de um livro', () => {
  it('diz por quê e oferece a volta à ficha, na pergunta e no Login', () => {
    const aoVoltarAoLivro = vi.fn()
    render(<PortaDeEntrada faixa={null} aoDeclarar={vi.fn()} aoVoltarAoLivro={aoVoltarAoLivro} />)
    fireEvent.click(screen.getByRole('button', { name: 'Voltar ao livro' }))
    expect(aoVoltarAoLivro).toHaveBeenCalledTimes(1)
    fireEvent.click(screen.getByRole('button', { name: 'Sim, tenho 18 anos ou mais' }))
    expect(screen.getByTestId('porta-do-livro').textContent).toBe(
      'Para ler, entre na sua conta ou crie uma. O catálogo e as fichas continuam abertos.',
    )
    expect(screen.queryByRole('button', { name: 'Continuar sem conta' })).toBeNull()
    fireEvent.click(screen.getByRole('button', { name: 'Voltar ao livro' }))
    expect(aoVoltarAoLivro).toHaveBeenCalledTimes(2)
  })

  it('guarda a rota da leitura: depois do login, o livro abre', () => {
    window.history.replaceState({}, '', '/livros/se-teste/ler')
    render(<PortaDeEntrada faixa="adulto" aoDeclarar={vi.fn()} aoVoltarAoLivro={vi.fn()} />)
    expect(lerIntencao()?.rota).toBe('/livros/se-teste/ler')
    window.history.replaceState({}, '', '/')
  })

  it('fora de um livro, nada de "Voltar ao livro"', () => {
    render(<PortaDeEntrada faixa="adulto" aoDeclarar={vi.fn()} />)
    expect(screen.queryByRole('button', { name: 'Voltar ao livro' })).toBeNull()
    expect(screen.queryByTestId('porta-do-livro')).toBeNull()
  })
})

describe('os marcos com o acesso sem conta v2', () => {
  it('flag desligada: a 1ª sessão continua sem aviso (o de antes)', () => {
    expect(avisoPendente({ sessoes: 1, palavras: 0, semConta: true, acessoRestrito: false })).toBeNull()
  })

  it('flag ligada: o fim da 1ª sessão convida a guardar, uma vez', () => {
    const a = avisoPendente({ sessoes: 1, palavras: 0, semConta: true, acessoRestrito: true, faixa: null })
    expect(a).toMatchObject({ marco: 'primeira-sessao', titulo: 'Guarde o que você capturou' })
    marcarVisto('primeira-sessao')
    expect(avisoPendente({ sessoes: 1, palavras: 0, semConta: true, acessoRestrito: true, faixa: null })).toBeNull()
  })

  it('menor: sem o cartão da 1ª sessão; os marcos de sempre no tom neutro', () => {
    expect(avisoPendente({ sessoes: 1, palavras: 0, semConta: true, acessoRestrito: true, faixa: 'menor' })).toBeNull()
    const a = avisoPendente({ sessoes: 2, palavras: 0, semConta: true, acessoRestrito: true, faixa: 'menor' })
    expect(a?.marco).toBe('segunda-sessao')
    expect(a?.texto).toBe('Com um responsável, você pode criar uma conta e guardar o que fez aqui.')
  })
})
