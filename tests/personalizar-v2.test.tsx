// @vitest-environment jsdom
/**
 * PERSONALIZAR EM CINCO ABAS (recompensas v2, Task 5.4 — spec 10.3), com a flag ligada:
 *
 *  · as cinco abas, com a contagem real das conquistas ("x/40");
 *  · Maestria com os 18 jogos no zero, sem "Disponível na versão completa" na edição estática;
 *  · Loja sem Créditos na edição estática e para o perfil protegido; com carteira, a compra tem duas
 *    etapas (prévia → confirmar) e o 403 do perfil protegido vira uma frase clara;
 *  · prévia ao vivo: "Ver prévia" numa legenda muda a legenda de exemplo SEM equipar, e o tema pinta
 *    o app só até "Parar prévia".
 */
import { act, cleanup, fireEvent, render, screen, within } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { prepararDialogoNoJsdom } from './_dialogoNoJsdom'

prepararDialogoNoJsdom()

const mocks = vi.hoisted(() => ({
  estatica: false,
  protegido: false,
  carteira: { creditos: 500 as number | null, disponivel: true, recarregar: () => {} },
  comprar: null as unknown as ReturnType<typeof import('vitest')['vi']['fn']>,
}))

vi.mock('../src/lib/recompensasV2', async (orig) => ({
  ...(await orig<typeof import('../src/lib/recompensasV2')>()),
  recompensasV2Ligadas: () => true,
}))
vi.mock('../src/lib/edicaoEstatica', async (orig) => ({
  ...(await orig<typeof import('../src/lib/edicaoEstatica')>()),
  edicaoEstatica: () => mocks.estatica,
}))
vi.mock('../src/lib/protecaoDoMenor', async (orig) => ({
  ...(await orig<typeof import('../src/lib/protecaoDoMenor')>()),
  perfilProtegido: () => mocks.protegido,
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

import { toast } from '../src/components/Toast'
import Loja from '../src/components/views/Loja'
import { CONQUISTAS } from '../src/core'
import { lerEstiloDeLegenda } from '../src/lib/estilosDeLegenda'
import { comprarPecaComCreditos } from '../src/lib/galeria/comprarComCreditos'
import { CATALOGO_DA_LOJA } from '../src/lib/loja'
import { EMPTY_PROGRESS } from '../src/lib/progress'

afterEach(cleanup)

const setTheme = vi.fn()
function renderizar(abaInicial?: string) {
  return render(
    <Loja
      progress={{ ...EMPTY_PROGRESS, available: true }}
      theme={'claro' as never}
      setTheme={setTheme}
      fonte={'padrao' as never}
      setFonte={() => {}}
      menuPosition={'left' as never}
      setMenuPosition={() => {}}
      onOpenStudio={() => {}}
      ctxConquistas={null}
      ageProfile={'adult' as never}
      setAgeProfile={() => {}}
      abaInicial={abaInicial}
    />,
  )
}
const aba = (nome: RegExp) => screen.getByRole('tab', { name: nome })

beforeEach(() => {
  localStorage.clear()
  mocks.estatica = false
  mocks.protegido = false
  mocks.carteira = { creditos: 500, disponivel: true, recarregar: () => {} }
  vi.mocked(comprarPecaComCreditos).mockClear()
  setTheme.mockClear()
})

describe('as cinco abas', () => {
  it('Coleção, Maestria, Temporada, Conquistas e Loja, com as conquistas em "x/N"', () => {
    renderizar()
    for (const nome of [/Coleção/, /Maestria/, /Temporada/, /Conquistas/, /Loja/]) expect(aba(nome)).toBeTruthy()
    expect(within(aba(/Conquistas/)).getByText(`0/${CONQUISTAS.length}`)).toBeTruthy()
    expect(aba(/Coleção/).getAttribute('aria-selected')).toBe('true')
  })

  it('os nomes antigos abrem a aba nova certa', () => {
    renderizar('passe')
    expect(aba(/Temporada/).getAttribute('aria-selected')).toBe('true')
  })

  it('na edição estática, primeira visita: Maestria no zero e nenhum convite de versão completa', async () => {
    mocks.estatica = true
    renderizar('maestria')
    await act(async () => {})
    expect(screen.queryByTestId('cartao-de-convite')).toBeNull()
    expect(document.querySelectorAll('[data-maestria-jogo]')).toHaveLength(18)
    expect(screen.getAllByText('Rumo ao Bronze · 0/30')).toHaveLength(18)
    for (const nome of [/Temporada/, /Conquistas/, /Loja/]) {
      fireEvent.click(aba(nome))
      expect(screen.queryByTestId('cartao-de-convite')).toBeNull()
    }
  })
})

describe('a Loja', () => {
  const temCreditos = () => !!document.querySelector('[data-item-de-credito]')

  it('sem Créditos na edição estática', () => {
    mocks.estatica = true
    renderizar('loja')
    expect(screen.getByTestId('vitrine-v2')).toBeTruthy()
    expect(document.querySelector('[data-item-da-loja]')).toBeTruthy()
    expect(temCreditos()).toBe(false)
    expect(screen.queryByTestId('carteira-de-creditos')).toBeNull()
  })

  it('sem Créditos para o perfil protegido', () => {
    mocks.protegido = true
    renderizar('loja')
    expect(temCreditos()).toBe(false)
  })

  it('com carteira: prévia → confirmar, nunca num clique', async () => {
    renderizar('loja')
    const item = CATALOGO_DA_LOJA.find((i) => i.precoCreditos !== undefined)!
    const cartao = document.querySelector(`[data-item-de-credito="${item.id}"]`) as HTMLElement
    fireEvent.click(within(cartao).getByRole('button', { name: 'Comprar com Créditos' }))
    expect(comprarPecaComCreditos).not.toHaveBeenCalled()
    const confirmacao = screen.getByTestId('confirmar-compra')
    expect(within(confirmacao).getByText(item.nome)).toBeTruthy()
    expect(within(confirmacao).getByText(`${item.precoCreditos} Créditos`)).toBeTruthy()
    await act(async () => {
      fireEvent.click(within(confirmacao).getByRole('button', { name: 'Confirmar compra' }))
    })
    expect(comprarPecaComCreditos).toHaveBeenCalledWith(item)
  })

  it('o 403 do perfil protegido vira uma frase clara, sem "tente de novo"', async () => {
    vi.mocked(comprarPecaComCreditos).mockResolvedValueOnce({ ok: false, motivo: 'menor' })
    const aviso = vi.spyOn(toast, 'warn')
    renderizar('loja')
    const item = CATALOGO_DA_LOJA.find((i) => i.precoCreditos !== undefined)!
    const cartao = document.querySelector(`[data-item-de-credito="${item.id}"]`) as HTMLElement
    fireEvent.click(within(cartao).getByRole('button', { name: 'Comprar com Créditos' }))
    await act(async () => {
      fireEvent.click(within(screen.getByTestId('confirmar-compra')).getByRole('button', { name: 'Confirmar compra' }))
    })
    expect(aviso).toHaveBeenCalledWith(expect.stringContaining('responsável'))
    aviso.mockRestore()
  })
})

describe('prévia ao vivo na Coleção', () => {
  it('"Ver prévia" numa legenda muda a legenda de exemplo sem equipar', () => {
    renderizar()
    fireEvent.click(screen.getByRole('button', { name: /Ver tudo que existe/ }))
    const legenda = CATALOGO_DA_LOJA.find((i) => i.tipo === 'legenda' && i.alvo !== lerEstiloDeLegenda())!
    const antes = lerEstiloDeLegenda()
    const cartao = screen.getByText(legenda.nome).closest('article') as HTMLElement
    fireEvent.click(within(cartao).getByRole('button', { name: /Ver prévia/ }))
    expect(screen.getByTestId('legenda-de-exemplo').getAttribute('data-estilo')).toBe(legenda.alvo)
    expect(lerEstiloDeLegenda()).toBe(antes)
  })

  it('o tema pinta o app só até "Parar prévia", sem equipar', () => {
    document.documentElement.setAttribute('data-theme', 'claro')
    renderizar()
    fireEvent.click(screen.getByRole('button', { name: /Ver tudo que existe/ }))
    const tema = CATALOGO_DA_LOJA.find((i) => i.tipo === 'tema' && i.alvo !== 'claro')!
    const cartao = screen.getByText(tema.nome).closest('article') as HTMLElement
    fireEvent.click(within(cartao).getByRole('button', { name: /Ver prévia/ }))
    expect(document.documentElement.getAttribute('data-theme')).toBe(tema.alvo)
    expect(screen.getByTestId('tema-em-previa')).toBeTruthy()
    fireEvent.click(screen.getByRole('button', { name: /Parar prévia/ }))
    expect(document.documentElement.getAttribute('data-theme')).toBe('claro')
    expect(setTheme).not.toHaveBeenCalled()
  })
})

describe('a próxima recompensa da maestria', () => {
  it('sai do catálogo e da regra de Seeds; o Bronze entrega o emblema', async () => {
    const { proximaRecompensaDaMaestria } = await import('../src/components/views/maestria/PainelDeMaestria')
    expect(proximaRecompensaDaMaestria('memory', 0)).toEqual({ nivel: 1, nome: 'Bronze', itens: [], seeds: 20 })
    const prata = proximaRecompensaDaMaestria('memory', 30)!
    expect(prata.nivel).toBe(2)
    expect(prata.itens).toEqual(CATALOGO_DA_LOJA.filter((i) => i.origemMaestria?.jogo === 'memory' && i.origemMaestria.nivel === 2).map((i) => i.nome))
    expect(prata.seeds).toBe(40)
    expect(proximaRecompensaDaMaestria('memory', 600)).toBeNull()
  })
})
