// @vitest-environment jsdom
/**
 * A NAVEGAÇÃO "O INÍCIO É O MENU" (flag `navegacao_simples`; openspec `navegacao-mais-simples`, opção 3).
 *
 * Desligada: o trilho e o "Mais" de sempre, e o Início de sempre (nada do cabeçalho nem da grade nova).
 * Ligada: sem trilho e sem "Mais"; o cabeçalho fino (‹ Início, nome, busca, sino, avatar), o sino abre os avisos direto, o
 * avatar abre a conta (interruptores `role=switch`), Esc devolve o foco, o Ao vivo troca de modo dentro da tela, e o Início
 * vira a grade de blocos (o Ao vivo abre no último modo; Planos é "Seja Premium" para quem não assina e "Seu plano" para
 * quem assina). O avatar abre "Configurações" (sem Progresso, Personalizar e Planos, que estão no Início).
 */
import { act, cleanup, fireEvent, render, screen, within } from '@testing-library/react'
import React from 'react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { definirEstadoDasFlags } from '../src/lib/flagsCache'

const plano = vi.hoisted(() => ({ atual: 'free' as string, teste: null as null | { terminaEm: number } }))
const admin = vi.hoisted(() => ({ eh: false }))
vi.mock('../src/lib/entitlements', async (original) => {
  const real = await original<typeof import('../src/lib/entitlements')>()
  return {
    ...real,
    getEntitlements: () => ({ ...real.getEntitlements(), plan: plano.atual, teste: plano.teste }) as never,
  }
})
vi.mock('../src/lib/admin', async (original) => ({
  ...(await original<typeof import('../src/lib/admin')>()),
  ehAdmin: () => admin.eh,
}))
vi.mock('../src/lib/flags', async (orig) => ({
  ...(await orig<typeof import('../src/lib/flags')>()),
  carregarFlags: async () => ({}),
  iniciarAtualizacaoDeFlags: () => () => {},
}))
vi.mock('../src/lib/protecaoDoMenor', async (original) => ({
  ...(await original<typeof import('../src/lib/protecaoDoMenor')>()),
  perfilProtegido: () => false,
}))
vi.mock('../src/data/rotas/settings', async (original) => ({
  ...(await original<typeof import('../src/data/rotas/settings')>()),
  fetchSettings: async () => null,
}))
vi.mock('../src/lib/comemoracao', () => ({ celebrar: vi.fn(), tocarPreviaDoEfeito: vi.fn() }))

const { default: TrilhoDoQuest } = await import('../src/components/shell/TrilhoDoQuest')
const { default: InicioDoQuest } = await import('../src/components/views/quest/InicioDoQuest')
const { notificar, _zerarNotificacoes } = await import('../src/lib/notificacoes')
const { CHAVE_ULTIMA_AO_VIVO } = await import('../src/components/shell/EscolhaAoVivo')
import type { ViewType } from '../src/types'

const ligar = (ligada: boolean) => definirEstadoDasFlags(ligada ? { navegacao_simples: { ligada: true } } : {})

beforeEach(() => {
  plano.atual = 'free'
  plano.teste = null
  admin.eh = false
  localStorage.clear()
  _zerarNotificacoes()
})
afterEach(() => {
  cleanup()
  definirEstadoDasFlags(null)
})

const casca = (activeView: ViewType = 'hub', extra: Partial<React.ComponentProps<typeof TrilhoDoQuest>> = {}) => {
  const ir = vi.fn()
  const buscar = vi.fn()
  render(
    <TrilhoDoQuest
      activeView={activeView}
      onChangeView={ir}
      aoBuscar={buscar}
      ageProfile="pro"
      darkMode={false}
      toggleDarkMode={() => {}}
      soundEnabled
      toggleSound={() => {}}
      performanceMode={false}
      togglePerformanceMode={() => {}}
      {...extra}
    />,
  )
  return { ir, buscar }
}

describe('flag desligada: a casca de hoje', () => {
  it('o trilho e o "Mais" continuam; nada do cabeçalho novo', () => {
    ligar(false)
    casca('cartoes')
    expect(document.querySelector('.q-trilho')).not.toBeNull()
    expect(screen.getByRole('button', { name: /^Mais/ })).toBeTruthy()
    expect(screen.queryByTestId('cabecalho-simples')).toBeNull()
  })

  it('o Início é o de sempre (os caminhos, a linha de Livros), sem a grade nova', () => {
    ligar(false)
    render(<InicioDoQuest onChangeView={() => {}} recordings={[]} progress={PROGRESSO} metrics={null} />)
    expect(screen.queryByTestId('inicio-menu')).toBeNull()
    expect(screen.getByTestId('cartoes-no-inicio')).toBeTruthy()
    expect(screen.getByTestId('livros-no-inicio')).toBeTruthy()
    expect(screen.getByTestId('plano-no-inicio')).toBeTruthy()
  })
})

describe('flag ligada: o cabeçalho', () => {
  beforeEach(() => ligar(true))

  it('sem trilho e sem "Mais"; no Início, a busca larga, o sino e o avatar', async () => {
    const { buscar } = casca('hub')
    const cab = await screen.findByTestId('cabecalho-simples')
    expect(document.querySelector('.q-trilho')).toBeNull()
    expect(screen.queryByRole('button', { name: /^Mais/ })).toBeNull()
    expect(screen.queryByTestId('voltar-ao-inicio')).toBeNull()
    const busca = within(cab).getByTestId('busca-no-cabecalho')
    expect(busca.textContent).toContain('Buscar ou ir para…')
    expect(busca.getAttribute('aria-keyshortcuts')).toBe('Control+K Meta+K')
    fireEvent.click(busca)
    expect(buscar).toHaveBeenCalled()
  })

  it('numa tela interna: "‹ Início", o nome da tela, e o Início volta', async () => {
    const { ir } = casca('cartoes')
    const cab = await screen.findByTestId('cabecalho-simples')
    expect(cab.textContent).toContain('Cartões')
    fireEvent.click(screen.getByTestId('voltar-ao-inicio'))
    expect(ir).toHaveBeenCalledWith('hub')
  })

  it('o nome segue o perfil (sênior)', async () => {
    casca('estatisticas', { ageProfile: 'senior' })
    expect((await screen.findByTestId('cabecalho-simples')).textContent).toContain('Meu progresso')
  })

  it('o sino diz os não lidos, abre a lista direto e Esc devolve o foco', async () => {
    notificar({
      chave: 'a',
      tipo: 'revisao',
      icone: 'target',
      titulo: 'Palavras para hoje',
      detalhe: '12',
      ir: 'cartoes',
    })
    const { ir } = casca('play')
    const sino = await screen.findByTestId('sino')
    expect(sino.getAttribute('aria-label')).toBe('Avisos, 1 não lidas')
    fireEvent.click(sino)
    const painel = screen.getByTestId('painel-de-avisos')
    expect(painel.getAttribute('role')).toBe('dialog')
    expect(sino.getAttribute('aria-expanded')).toBe('true')
    const aviso = within(painel).getByRole('button', { name: /Palavras para hoje/ })
    expect(document.activeElement).toBe(aviso)
    fireEvent.keyDown(aviso, { key: 'Escape' })
    expect(screen.queryByTestId('painel-de-avisos')).toBeNull()
    expect(document.activeElement).toBe(sino)
    fireEvent.click(sino)
    fireEvent.click(within(screen.getByTestId('painel-de-avisos')).getByRole('button', { name: /Palavras para hoje/ }))
    expect(ir).toHaveBeenCalledWith('cartoes')
  })

  it('o avatar abre "Configurações": destinos, interruptores role=switch; Esc devolve o foco', async () => {
    casca('play')
    const avatar = await screen.findByTestId('avatar-da-conta')
    expect(avatar.getAttribute('aria-label')).toBe('Configurações e conta')
    fireEvent.click(avatar)
    const painel = screen.getByTestId('painel-da-conta')
    expect(painel.getAttribute('aria-label')).toBe('Configurações')
    expect(within(painel).getByRole('heading', { name: 'Configurações' })).toBeTruthy()
    for (const nome of ['Ajustes', 'Seu perfil', 'Ajuda e suporte', 'Sobre'])
      expect(within(painel).getByRole('button', { name: new RegExp(`^${nome}`) })).toBeTruthy()
    for (const fora of [/^Progresso/, /^Personalizar/, /^Seu plano/, /Seja Premium/, /^Administração/])
      expect(within(painel).queryByRole('button', { name: fora })).toBeNull()
    const chaves = within(painel).getAllByRole('switch')
    expect(chaves.map((c) => c.getAttribute('aria-label'))).toEqual([
      'Tema escuro',
      'Som dos toques',
      'Modo desempenho',
    ])
    expect(chaves.map((c) => c.getAttribute('aria-checked'))).toEqual(['false', 'true', 'false'])
    expect(document.activeElement).toBe(within(painel).getByRole('button', { name: /^Ajustes/ }))
    fireEvent.keyDown(document.activeElement!, { key: 'Escape' })
    expect(screen.queryByTestId('painel-da-conta')).toBeNull()
    expect(document.activeElement).toBe(avatar)
  })

  it('admin vê Administração em Configurações (e nada de plano ali, mesmo assinando)', async () => {
    plano.atual = 'premium'
    admin.eh = true
    const { ir } = casca('play')
    fireEvent.click(await screen.findByTestId('avatar-da-conta'))
    const painel = screen.getByTestId('painel-da-conta')
    expect(within(painel).queryByRole('button', { name: /^Seu plano/ })).toBeNull()
    fireEvent.click(within(painel).getByRole('button', { name: /^Administração/ }))
    expect(ir).toHaveBeenCalledWith('admin')
  })

  it('no Ao vivo, Legendar | Conversar fica na tela e lembra o último modo', async () => {
    const { ir } = casca('capture')
    await screen.findByTestId('cabecalho-simples')
    expect(localStorage.getItem(CHAVE_ULTIMA_AO_VIVO)).toBe('capture')
    expect(screen.getByTestId('modo-legendar').getAttribute('aria-pressed')).toBe('true')
    fireEvent.click(screen.getByTestId('modo-conversar'))
    expect(ir).toHaveBeenCalledWith('interprete')
    expect(localStorage.getItem(CHAVE_ULTIMA_AO_VIVO)).toBe('interprete')
  })
})

type Progresso = Parameters<typeof InicioDoQuest>[0]['progress']
const PROGRESSO = {
  available: true,
  level: 3,
  xp: 420,
  xpIntoLevel: 20,
  xpForLevel: 200,
  levelPct: 10,
  seeds: 37,
  streakDays: 2,
  practicedToday: false,
} as unknown as Progresso
const METRICAS = { dueToday: 42, deckSize: 120, reviews: 9 } as never

describe('flag ligada: o Início é o menu', () => {
  beforeEach(() => ligar(true))
  const inicio = (ir = vi.fn(), perfil: 'pro' | 'kids' = 'pro') => {
    render(
      <InicioDoQuest onChangeView={ir} recordings={[]} progress={PROGRESSO} metrics={METRICAS} ageProfile={perfil} />,
    )
    return ir
  }

  it('a grade com os seis destinos, o número de hoje e o convite do Grátis; sem os caminhos antigos', async () => {
    inicio()
    const menu = await screen.findByTestId('inicio-menu')
    for (const id of ['ao-vivo', 'cartoes', 'jogar', 'livros', 'biblioteca', 'progresso', 'personalizar', 'planos'])
      expect(within(menu).getByTestId(`bloco-${id}`)).toBeTruthy()
    expect(within(menu).getByTestId('bloco-cartoes').getAttribute('aria-label')).toBe('Cartões, 42 cartões para hoje')
    expect(screen.queryByTestId('cartoes-no-inicio')).toBeNull()
    expect(screen.queryByTestId('livros-no-inicio')).toBeNull()
    expect(screen.queryByTestId('plano-no-inicio')).toBeNull()
  })

  it('o Ao vivo abre direto no último modo (um toque)', async () => {
    localStorage.setItem(CHAVE_ULTIMA_AO_VIVO, 'interprete')
    const ir = inicio()
    const bloco = await screen.findByTestId('bloco-ao-vivo')
    expect(bloco.textContent).toContain('Conversar')
    fireEvent.click(bloco)
    expect(ir).toHaveBeenCalledWith('interprete')
  })

  it('sem histórico, o Ao vivo abre em Legendar', async () => {
    const ir = inicio()
    fireEvent.click(await screen.findByTestId('bloco-ao-vivo'))
    expect(ir).toHaveBeenCalledWith('capture')
  })

  it('Planos para todos: "Seja Premium" em destaque no Grátis e no teste; "Seu plano" para quem assina', async () => {
    const ir = inicio()
    let bloco = await screen.findByTestId('bloco-planos')
    expect(bloco.getAttribute('data-convite')).toBe('true')
    expect(bloco.textContent).toContain('Seja Premium')
    fireEvent.click(bloco)
    expect(ir).toHaveBeenCalledWith('planos')
    cleanup()
    plano.atual = 'premium'
    inicio()
    bloco = await screen.findByTestId('bloco-planos')
    expect(bloco.getAttribute('data-convite')).toBeNull()
    expect(bloco.textContent).toContain('Seu plano')
    expect(bloco.textContent).toContain('Você está no Premium')
    cleanup()
    plano.teste = { terminaEm: Date.now() + 2 * 86_400_000 }
    inicio()
    expect((await screen.findByTestId('bloco-planos')).textContent).toContain('Seja Premium')
  })

  it('Personalizar abre a tela de hoje (loja)', async () => {
    const ir = inicio()
    fireEvent.click(await screen.findByTestId('bloco-personalizar'))
    expect(ir).toHaveBeenCalledWith('loja')
  })

  it('o rótulo segue o perfil (kids: "Meu progresso")', async () => {
    inicio(vi.fn(), 'kids')
    expect((await screen.findByTestId('bloco-progresso')).textContent).toContain('Meu progresso')
  })

  it('Livros mostra o progresso do livro atual', async () => {
    const { guardarMeuLivro, marcarAberto } = await import('../src/lib/livros/meusLivros')
    const { posicoes } = await import('../src/lib/livros/posicoesDoAparelho')
    await act(async () => {
      guardarMeuLivro({ id: 'meu-1', titulo: 'Meu Livro', origem: 'arquivo' })
      marcarAberto('meu-1')
      posicoes.gravar({ livroId: 'meu-1', cfi: '', secao: 2, fracao: 0.34, atualizadaEm: 1 })
    })
    inicio()
    const bloco = await screen.findByTestId('bloco-livros')
    expect(bloco.textContent).toMatch(/Meu Livro · \d+% lido/)
  })

  it('livro do catálogo: só o progresso, sem o título (o filtro do perfil mora na tela de Livros)', async () => {
    const { guardarMeuLivro, marcarAberto } = await import('../src/lib/livros/meusLivros')
    const { posicoes } = await import('../src/lib/livros/posicoesDoAparelho')
    await act(async () => {
      guardarMeuLivro({ id: 'pg-123', titulo: 'Título do Catálogo', origem: 'catalogo' })
      marcarAberto('pg-123')
      posicoes.gravar({ livroId: 'cat:pg-123', cfi: '', secao: 3, fracao: 0.5, atualizadaEm: 3 })
    })
    inicio()
    const bloco = await screen.findByTestId('bloco-livros')
    expect(bloco.textContent).not.toContain('Título do Catálogo')
    expect(bloco.textContent).toMatch(/\d+% lido/)
  })
})
