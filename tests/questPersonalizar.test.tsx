// @vitest-environment jsdom
/**
 * PERSONALIZAR NO QUEST (segunda rodada do desenho do headset, 01/10/2026), nas duas variantes da tela:
 * a das recompensas v2 (Coleção, Maestria, Temporada, Conquistas, Loja) e a clássica (Meu visual e
 * Desafios, que no headset vira Desafios, Temporada e Loja). A tela nova monta, e cada função da tela de
 * sempre continua alcançável.
 */
import { act, cleanup, fireEvent, render, screen, within } from '@testing-library/react'
import React from 'react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { prepararDialogoNoJsdom } from './_dialogoNoJsdom'

prepararDialogoNoJsdom()

const mocks = vi.hoisted(() => ({
  v2: true,
  carteira: { creditos: 500 as number | null, disponivel: true, recarregar: () => {} },
  /** O aparelho: o headset, salvo nos casos "no computador com o desenho novo". */
  aparelho: 'quest' as string,
}))

vi.mock('../src/lib/dispositivo/perfil', async (orig) => {
  const real = await orig<typeof import('../src/lib/dispositivo/perfil')>()
  return { ...real, perfilDoDispositivo: () => ({ ...real.perfilDoDispositivo(), tipo: mocks.aparelho }) }
})

vi.mock('../src/lib/dispositivo/telaNovaDoQuest', async (orig) => ({
  ...(await orig<typeof import('../src/lib/dispositivo/telaNovaDoQuest')>()),
  useQuestNovo: () => true,
}))
vi.mock('../src/lib/recompensasV2', async (orig) => ({
  ...(await orig<typeof import('../src/lib/recompensasV2')>()),
  recompensasV2Ligadas: () => mocks.v2,
}))
vi.mock('../src/lib/identidade', async (orig) => ({
  ...(await orig<typeof import('../src/lib/identidade')>()),
  estaAnonimo: () => false,
}))
vi.mock('../src/lib/carteira', () => ({ useCarteira: () => mocks.carteira }))
vi.mock('../src/lib/temporada', () => ({ useTemporada: () => null }))
vi.mock('../src/lib/maestria', async (orig) => ({
  ...(await orig<typeof import('../src/lib/maestria')>()),
  sincronizarMaestria: vi.fn(async () => null),
}))
vi.mock('../src/lib/galeria/comprarComCreditos', async (orig) => ({
  ...(await orig<typeof import('../src/lib/galeria/comprarComCreditos')>()),
  comprarPecaComCreditos: vi.fn(async () => ({ ok: true })),
}))
vi.mock('../src/components/views/loja/ComprarCreditos', () => ({ default: () => null }))
vi.mock('../src/lib/comemoracao', async (orig) => ({
  ...(await orig<typeof import('../src/lib/comemoracao')>()),
  celebrar: vi.fn(),
  celebrarEscolha: vi.fn(),
  tocarPreviaDoEfeito: vi.fn(),
}))

import Loja from '../src/components/views/Loja'
import { CONQUISTAS } from '../src/core'
import { FONTE_OPTIONS } from '../src/lib/appearance'
import { lerEstiloDeLegenda } from '../src/lib/estilosDeLegenda'
import { comprarPecaComCreditos } from '../src/lib/galeria/comprarComCreditos'
import { perfisSalvos } from '../src/lib/galeria/perfis'
import { CATALOGO_DA_LOJA } from '../src/lib/loja'
import { EMPTY_PROGRESS } from '../src/lib/progress'

afterEach(cleanup)

function montar(abaInicial?: string) {
  const acoes = {
    setTheme: vi.fn(),
    setFonte: vi.fn(),
    setMenuPosition: vi.fn(),
    setAgeProfile: vi.fn(),
    aoTrocarDeAba: vi.fn(),
  }
  const tela = render(
    <Loja
      progress={{ ...EMPTY_PROGRESS, available: true, seeds: 42 }}
      theme={'claro' as never}
      fonte={'padrao' as never}
      menuPosition={'top' as never}
      onOpenStudio={() => {}}
      ctxConquistas={null}
      ageProfile={'pro' as never}
      abaInicial={abaInicial}
      {...acoes}
    />,
  )
  const aba = (nome: RegExp) => screen.getByRole('tab', { name: nome })
  const secao = (nome: RegExp) =>
    within(screen.getByRole('group', { name: 'Seções da coleção' })).getByRole('button', { name: nome })
  return { ...tela, ...acoes, aba, secao }
}

beforeEach(() => {
  localStorage.clear()
  mocks.aparelho = 'quest'
  mocks.v2 = true
  mocks.carteira = { creditos: 500, disponivel: true, recarregar: () => {} }
  vi.mocked(comprarPecaComCreditos).mockClear()
})

describe('Personalizar no Quest · recompensas v2', () => {
  it('a casca do headset: o título, o saldo de Seeds e as cinco abas com as contagens', () => {
    const { container, aba } = montar()
    expect(container.querySelector('.q-palco.qp')).toBeTruthy()
    expect(container.querySelector('.rolagem')).toBeNull()
    expect(screen.getByRole('heading', { level: 1, name: 'Personalizar' })).toBeTruthy()
    expect(screen.getByTestId('saldo-de-seeds').textContent).toContain('42')
    for (const nome of [/Coleção/, /Maestria/, /Temporada/, /Conquistas/, /Loja/]) expect(aba(nome)).toBeTruthy()
    expect(within(aba(/Conquistas/)).getByText(`0/${CONQUISTAS.length}`)).toBeTruthy()
    expect(aba(/Coleção/).getAttribute('aria-selected')).toBe('true')
    expect(aba(/Coleção/).classList.contains('q-aba')).toBe(true)
  })

  it('trocar de aba avisa o App (a URL acompanha) e mostra o miolo da aba', async () => {
    const { aba, aoTrocarDeAba } = montar()
    fireEvent.click(aba(/Maestria/))
    await act(async () => {})
    expect(aoTrocarDeAba).toHaveBeenLastCalledWith('maestria')
    expect(document.querySelectorAll('[data-maestria-jogo]')).toHaveLength(18)
    fireEvent.click(aba(/Temporada/))
    expect(screen.getByTestId('temporada').classList.contains('qp-passe')).toBe(true)
  })

  it('Coleção: o que está equipado, e uma seção de peças por vez', () => {
    const { container, secao } = montar()
    const equipados = [...container.querySelectorAll('.qp-equip')].map((e) => e.querySelector('small')?.textContent)
    expect(equipados).toEqual(['Tema', 'Partículas', 'Fonte', 'Menu'])
    // No headset o menu é o trilho: a vaga "Menu" diz isso, e não a posição escolhida no computador.
    expect(container.querySelectorAll('.qp-equip')[3].textContent).toContain('Trilho do headset')

    expect(secao(/Temas/).getAttribute('aria-pressed')).toBe('true')
    expect(container.querySelector('[data-secao-do-inventario="temas"]')).toBeTruthy()
    fireEvent.click(secao(/Perfis/))
    expect(container.querySelector('[data-secao-do-inventario="temas"]')).toBeNull()
    expect(container.querySelector('[data-secao-do-inventario="perfis"]')).toBeTruthy()
  })

  it('"Ver tudo que existe" liga o acervo inteiro; "Ver prévia" muda a legenda de exemplo sem equipar', () => {
    const { secao } = montar()
    fireEvent.click(screen.getByRole('button', { name: /Ver tudo que existe/ }))
    expect(screen.getByRole('button', { name: /Ver só o meu acervo/ })).toBeTruthy()
    fireEvent.click(secao(/Legendas/))
    const antes = lerEstiloDeLegenda()
    const legenda = CATALOGO_DA_LOJA.find((i) => i.tipo === 'legenda' && i.alvo !== antes)!
    const cartao = screen.getByText(legenda.nome).closest('article') as HTMLElement
    fireEvent.click(within(cartao).getByRole('button', { name: /Ver prévia/ }))
    expect(screen.getByTestId('legenda-de-exemplo').getAttribute('data-estilo')).toBe(legenda.alvo)
    expect(lerEstiloDeLegenda()).toBe(antes)
  })

  it('a prévia de um tema pinta o app só até "Parar prévia", na faixa de aviso do headset', () => {
    document.documentElement.setAttribute('data-theme', 'claro')
    const { setTheme } = montar()
    fireEvent.click(screen.getByRole('button', { name: /Ver tudo que existe/ }))
    const tema = CATALOGO_DA_LOJA.find((i) => i.tipo === 'tema' && i.alvo !== 'claro')!
    const cartao = screen.getByText(tema.nome).closest('article') as HTMLElement
    fireEvent.click(within(cartao).getByRole('button', { name: /Ver prévia/ }))
    expect(document.documentElement.getAttribute('data-theme')).toBe(tema.alvo)
    const faixa = screen.getByTestId('tema-em-previa')
    expect(faixa.classList.contains('q-aviso')).toBe(true)
    fireEvent.click(within(faixa).getByRole('button', { name: /Parar prévia/ }))
    expect(document.documentElement.getAttribute('data-theme')).toBe('claro')
    expect(setTheme).not.toHaveBeenCalled()
  })

  it('o editor da peça abre no centro com as quatro cores livres, os cantos e as paletas', () => {
    montar()
    fireEvent.click(screen.getAllByRole('button', { name: 'Personalizar' })[0])
    const editor = document.querySelector('dialog.qp-editor') as HTMLElement
    expect(editor).toBeTruthy()
    expect(editor.querySelectorAll('input[type="color"]')).toHaveLength(4)
    expect(within(editor).getByRole('radiogroup', { name: 'Cantos' })).toBeTruthy()
    expect(within(editor).getByRole('button', { name: 'Restaurar o padrão' })).toBeTruthy()
    expect(within(editor).getByPlaceholderText(/Buscar/)).toBeTruthy()
    fireEvent.click(within(editor).getByRole('button', { name: 'Cancelar' }))
    expect(document.querySelector('dialog.qp-editor')).toBeNull()
  })

  it('perfis: salvar com nome, renomear num diálogo com campo, apagar em dois toques, voltar ao original', () => {
    const { secao, setTheme, setFonte } = montar()
    fireEvent.click(secao(/Perfis/))
    fireEvent.change(screen.getByLabelText('Nome do perfil'), { target: { value: 'Noturno' } })
    fireEvent.click(screen.getByRole('button', { name: /Salvar este visual/ }))
    expect(perfisSalvos().map((p) => p.nome)).toEqual(['Noturno'])

    const cartao = () => screen.getByText(perfisSalvos()[0].nome).closest('article') as HTMLElement
    fireEvent.click(within(cartao()).getByRole('button', { name: /Renomear/ }))
    const dialogo = screen.getByRole('dialog')
    fireEvent.change(within(dialogo).getByLabelText('Novo nome'), { target: { value: 'Leitura' } })
    fireEvent.click(within(dialogo).getByRole('button', { name: /Salvar/ }))
    expect(perfisSalvos().map((p) => p.nome)).toEqual(['Leitura'])
    expect(screen.queryByRole('dialog')).toBeNull()

    fireEvent.click(within(cartao()).getByRole('button', { name: /Aplicar perfil/ }))
    expect(setFonte).toHaveBeenCalled()

    fireEvent.click(within(cartao()).getByRole('button', { name: 'Apagar' }))
    expect(perfisSalvos()).toHaveLength(1)
    fireEvent.click(within(cartao()).getByRole('button', { name: /Toque de novo para apagar/ }))
    expect(perfisSalvos()).toHaveLength(0)

    setTheme.mockClear()
    fireEvent.click(screen.getByRole('button', { name: /Voltar ao visual original/ }))
    expect(setTheme).toHaveBeenCalledTimes(1)
  })

  it('acessibilidade: a letra e o perfil de exibição se escolhem; a posição do menu vira um aviso, sem controle', () => {
    const { secao, setFonte, setAgeProfile, setMenuPosition } = montar()
    fireEvent.click(secao(/Acessibilidade/))
    const letra = document.querySelector('[data-bloco="acessibilidade-e-layout"]') as HTMLElement
    const fontes = within(letra).getAllByRole('button')
    expect(fontes).toHaveLength(FONTE_OPTIONS.length)
    fireEvent.click(fontes[fontes.length - 1])
    expect(setFonte).toHaveBeenCalledWith(FONTE_OPTIONS[FONTE_OPTIONS.length - 1].id)

    const aviso = screen.getByTestId('menu-no-quest')
    expect(aviso.textContent).toContain('trilho')
    expect(aviso.textContent).toContain('No headset')
    expect(aviso.textContent).toContain('No topo')
    expect(within(aviso).queryByRole('button')).toBeNull()
    expect(screen.queryByRole('button', { name: /À direita|Embaixo/ })).toBeNull()
    expect(setMenuPosition).not.toHaveBeenCalled()

    fireEvent.click(screen.getByRole('button', { name: /Leitura ampliada/ }))
    // A posição escolhida em outro aparelho ("No topo") não é apagada por abrir nem por mexer na tela.
    expect(setMenuPosition).not.toHaveBeenCalled()
    expect(setAgeProfile).toHaveBeenCalledWith('senior')
    expect(screen.getByRole('button', { name: /Produtividade/ }).getAttribute('aria-pressed')).toBe('true')
  })

  it('no computador com o desenho novo: nada fala em headset (o menu, o aviso da posição, apagar um perfil)', () => {
    mocks.aparelho = 'desktop-com-gpu'
    const { container, secao } = montar()
    expect(container.querySelector('.q-palco.qp')).toBeTruthy()
    expect(container.querySelectorAll('.qp-equip')[3].textContent).toContain('Trilho de ícones')

    fireEvent.click(secao(/Perfis/))
    fireEvent.change(screen.getByLabelText('Nome do perfil'), { target: { value: 'Noturno' } })
    fireEvent.click(screen.getByRole('button', { name: /Salvar este visual/ }))
    const cartao = () => screen.getByText('Noturno').closest('article') as HTMLElement
    fireEvent.click(within(cartao()).getByRole('button', { name: 'Apagar' }))
    expect(perfisSalvos()).toHaveLength(1)
    fireEvent.click(within(cartao()).getByRole('button', { name: /Clique de novo para apagar/ }))
    expect(perfisSalvos()).toHaveLength(0)

    fireEvent.click(secao(/Acessibilidade/))
    const aviso = screen.getByTestId('menu-no-quest')
    expect(aviso.textContent).toContain('Neste desenho o menu é o trilho de ícones')
    expect(aviso.textContent).toContain('No topo')
    expect(container.textContent).not.toMatch(/headset/i)
  })

  it('Conquistas: uma parte por vez, e as conquistas por pilar', () => {
    const { container } = montar('conquistas')
    const partes = screen.getByRole('group', { name: 'Partes dos desafios' })
    expect(container.querySelectorAll('.conq')).toHaveLength(CONQUISTAS.length)
    const pilares = within(screen.getByRole('group', { name: 'Pilares das conquistas' })).getAllByRole('button')
    expect(pilares.length).toBeGreaterThan(2)
    fireEvent.click(pilares[1])
    const noPilar = container.querySelectorAll('.conq').length
    expect(noPilar).toBeGreaterThan(0)
    expect(noPilar).toBeLessThan(CONQUISTAS.length)

    fireEvent.click(within(partes).getByRole('button', { name: /Como ganhar/ }))
    expect(screen.getByText('Como ganhar Seeds e XP')).toBeTruthy()
    expect(container.querySelector('.conq')).toBeNull()
    fireEvent.click(within(partes).getByRole('button', { name: /Como subir de nível/ }))
    expect(screen.getByText(/Cada nível custa 100 XP/)).toBeTruthy()
  })

  it('Loja: as duas carteiras, os seis filtros e a compra com Créditos em duas etapas', async () => {
    montar('loja')
    expect(screen.getByTestId('vitrine-v2')).toBeTruthy()
    expect(screen.getByTestId('carteira-de-creditos')).toBeTruthy()
    expect(within(screen.getByRole('group', { name: 'Filtrar a Loja' })).getAllByRole('button')).toHaveLength(6)
    expect(document.querySelector('[data-item-da-loja]')).toBeTruthy()

    const item = CATALOGO_DA_LOJA.find((i) => i.precoCreditos !== undefined)!
    const cartao = document.querySelector(`[data-item-de-credito="${item.id}"]`) as HTMLElement
    fireEvent.click(within(cartao).getByRole('button', { name: 'Comprar com Créditos' }))
    expect(comprarPecaComCreditos).not.toHaveBeenCalled()
    await act(async () => {
      fireEvent.click(within(screen.getByTestId('confirmar-compra')).getByRole('button', { name: 'Confirmar compra' }))
    })
    expect(comprarPecaComCreditos).toHaveBeenCalledWith(item)
  })

  it('o atalho "Ir à Loja" da coleção troca de aba', () => {
    const { aba } = montar()
    fireEvent.click(screen.getByRole('button', { name: /Ir à Loja/ }))
    expect(aba(/Loja/).getAttribute('aria-selected')).toBe('true')
  })
})

describe('Personalizar no Quest · tela clássica', () => {
  beforeEach(() => {
    mocks.v2 = false
  })

  it('quatro abas no lugar de duas: Meu visual, Desafios, Temporada e Loja', () => {
    const { aba, aoTrocarDeAba, container } = montar()
    expect(screen.getAllByRole('tab').map((a) => a.textContent)).toEqual([
      expect.stringContaining('Meu visual'),
      expect.stringContaining('Desafios'),
      'Temporada',
      'Loja',
    ])
    expect(aba(/Meu visual/).getAttribute('aria-selected')).toBe('true')
    expect(container.querySelectorAll('.qp-equip')).toHaveLength(4)

    fireEvent.click(aba(/Desafios/))
    expect(aoTrocarDeAba).toHaveBeenLastCalledWith('conquistas')
    expect(screen.getByTestId('conquistas-no-quest')).toBeTruthy()
    expect(document.getElementById('secao-loja')).toBeNull()

    fireEvent.click(aba(/Temporada/))
    expect(screen.getByTestId('temporada')).toBeTruthy()
    expect(screen.queryByTestId('conquistas-no-quest')).toBeNull()

    fireEvent.click(aba(/Loja/))
    const loja = document.getElementById('secao-loja') as HTMLElement
    expect(loja.textContent).toContain('Em destaque')
    expect(within(screen.getByRole('group', { name: 'Filtrar a Loja' })).getAllByRole('button')).toHaveLength(6)
    expect(loja.querySelector('[data-preco-seeds]')).toBeTruthy()
  })

  it('os atalhos internos trocam de aba em vez de rolar a página', () => {
    const { aba } = montar()
    fireEvent.click(screen.getByRole('button', { name: /Ir à Loja/ }))
    expect(aba(/Loja/).getAttribute('aria-selected')).toBe('true')
    fireEvent.click(screen.getByRole('button', { name: 'Ver todas as regras' }))
    expect(aba(/Desafios/).getAttribute('aria-selected')).toBe('true')
  })

  it('"Ver todas as regras" abre Desafios na parte "Como ganhar", que é onde as regras estão', () => {
    const { aba } = montar('loja')
    fireEvent.click(screen.getByRole('button', { name: 'Ver todas as regras' }))
    const partes = screen.getByRole('group', { name: 'Partes dos desafios' })
    expect(
      within(partes)
        .getByRole('button', { name: /Como ganhar/ })
        .getAttribute('aria-pressed'),
    ).toBe('true')
    expect(screen.getByText('Como ganhar Seeds e XP')).toBeTruthy()

    // Voltar à aba pelo toque abre nas conquistas, como sempre.
    fireEvent.click(aba(/Meu visual/))
    fireEvent.click(aba(/Desafios/))
    expect(
      within(screen.getByRole('group', { name: 'Partes dos desafios' }))
        .getByRole('button', { name: /Conquistas/ })
        .getAttribute('aria-pressed'),
    ).toBe('true')
  })

  it('cada aba tem endereço: Temporada e Loja não gravam o mesmo nome, e recarregar volta à mesma aba', () => {
    const { aba, aoTrocarDeAba } = montar()
    fireEvent.click(aba(/Temporada/))
    expect(aoTrocarDeAba).toHaveBeenLastCalledWith('temporada')
    fireEvent.click(aba(/Loja/))
    expect(aoTrocarDeAba).toHaveBeenLastCalledWith('loja')
    fireEvent.click(aba(/Desafios/))
    expect(aoTrocarDeAba).toHaveBeenLastCalledWith('conquistas')
    // Os atalhos internos gravam o mesmo endereço da aba.
    fireEvent.click(aba(/Meu visual/))
    fireEvent.click(screen.getByRole('button', { name: /Ir à Loja/ }))
    expect(aoTrocarDeAba).toHaveBeenLastCalledWith('loja')

    // O que o App devolve depois de recarregar (`/loja/temporada`, `/loja/loja`).
    cleanup()
    expect(
      montar('temporada')
        .aba(/Temporada/)
        .getAttribute('aria-selected'),
    ).toBe('true')
    cleanup()
    expect(montar('loja').aba(/Loja/).getAttribute('aria-selected')).toBe('true')
    expect(document.getElementById('secao-loja')).toBeTruthy()
  })

  it('o endereço antigo `/loja/passe` abre direto na Temporada', () => {
    const { aba } = montar('passe')
    expect(aba(/Temporada/).getAttribute('aria-selected')).toBe('true')
    expect(screen.getByTestId('temporada')).toBeTruthy()
  })
})
