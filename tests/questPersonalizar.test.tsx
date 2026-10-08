// @vitest-environment jsdom
/**
 * PERSONALIZAR NO QUEST (segunda rodada do desenho do headset, 01/10/2026), nas duas variantes da tela:
 * a das recompensas v2 (Coleção, Maestria, Temporada, Conquistas, Loja) e a clássica (Meu visual e
 * Desafios, que no headset vira Desafios, Temporada e Loja). A tela nova monta, e cada função da tela de
 * sempre continua alcançável.
 */
import { cleanup, fireEvent, render, screen, within } from '@testing-library/react'
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
import { comprarPecaComCreditos } from '../src/lib/galeria/comprarComCreditos'
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
})

describe('Personalizar no Quest · tela clássica', () => {
  beforeEach(() => {
    mocks.v2 = false
  })

  it('o endereço antigo `/loja/passe` abre direto na Temporada', () => {
    const { aba } = montar('passe')
    expect(aba(/Temporada/).getAttribute('aria-selected')).toBe('true')
    expect(screen.getByTestId('temporada')).toBeTruthy()
  })
})
