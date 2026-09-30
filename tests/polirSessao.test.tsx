// @vitest-environment jsdom
/**
 * D5 (Fase D, 30/09/2026) — O "POLIR A TRADUÇÃO DA SESSÃO" NA ANÁLISE.
 *
 *   · com a Nuance: o botão polir percorre os blocos com o progresso ("bloco 1 de 2"), aplica as
 *     polidas assim que chegam e passa a mostrar a polida; no fim, "Original | Polida" alterna;
 *   · cancelar para depois do bloco em curso e oferece retomar, que continua de onde parou;
 *   · sessão já polida: só o alternar, sem pedido nenhum;
 *   · sem a IA de nuvem autorizada: nenhum pedido sai, e o botão é o de autorizar;
 *   · sem a Nuance (o Grátis): o MESMO botão, com cadeado, abre o texto positivo e — fora do perfil
 *     protegido — o convite; nenhum pedido sai, e nada vende "qualidade" nem porcentagem.
 */
import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import React from 'react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import PolirSessao from '../src/components/views/analise/PolirSessao'
import type { FalaParaPolir } from '../src/lib/analise/polimentoDaSessao'

const api = vi.hoisted(() => ({ polirBloco: vi.fn() }))
vi.mock('../src/data/apiDaNuance', () => api)
const nuvem = vi.hoisted(() => ({ consentiu: true, autorizar: vi.fn() }))
vi.mock('../src/lib/consentimentoDeNuvem', () => ({ useConsentimentoDeNuvem: () => nuvem }))

afterEach(cleanup)
beforeEach(() => {
  api.polirBloco.mockReset()
  nuvem.consentiu = true
  nuvem.autorizar.mockReset()
})

const falas = (n: number, polidas = 0): FalaParaPolir[] =>
  Array.from({ length: n }, (_, i) => ({
    id: `u${i}`,
    idx: i,
    sourceText: `line ${i}`,
    translatedText: `linha ${i}`,
    traducaoPolida: i < polidas ? `polida ${i}` : null,
  }))

/** O servidor falso: polia o bloco pedido (blocos de 40). */
const responder = (lista: FalaParaPolir[]) => (p: { bloco: number }) =>
  Promise.resolve({
    ok: true,
    valor: {
      bloco: p.bloco,
      blocos: Math.ceil(lista.length / 40),
      polidas: lista
        .slice(p.bloco * 40, p.bloco * 40 + 40)
        .map((u) => ({ id: u.id, traducaoPolida: `polida ${u.id}` })),
      pendentes: 0,
      jaPolido: false,
    },
  })

/** A Análise em miniatura: guarda as falas e a versão, como a tela de verdade. */
function Tela({
  inicial,
  disponivel = true,
  aoConhecer,
}: {
  inicial: FalaParaPolir[]
  disponivel?: boolean
  aoConhecer?: () => void
}) {
  const [lista, setLista] = React.useState(inicial)
  const [versao, setVersao] = React.useState<'original' | 'polida'>('original')
  return (
    <>
      <PolirSessao
        sessionId="s1"
        utterances={lista}
        disponivel={disponivel}
        versao={versao}
        aoTrocarVersao={setVersao}
        aoPolir={(polidas) => {
          const mapa = new Map(polidas.map((p) => [p.id, p.traducaoPolida]))
          setLista((l) => l.map((u) => (mapa.has(u.id) ? { ...u, traducaoPolida: mapa.get(u.id) } : u)))
        }}
        aoConhecer={aoConhecer}
      />
      <span data-testid="versao">{versao}</span>
    </>
  )
}

function semVendaDeQualidade(el: HTMLElement) {
  expect(el.textContent ?? '').not.toMatch(/%|qualidade/i)
}

describe('com a Tradução Nuance', () => {
  it('polir percorre os blocos com o progresso, aplica as polidas e mostra a polida; no fim, alterna', async () => {
    const lista = falas(45)
    let soltar!: () => void
    api.polirBloco.mockImplementation(async (p: { bloco: number }) => {
      if (p.bloco === 1) await new Promise<void>((r) => (soltar = r))
      return responder(lista)(p)
    })
    render(<Tela inicial={lista} />)
    fireEvent.click(screen.getByRole('button', { name: /Polir a tradução da sessão/ }))
    await waitFor(() => expect(screen.getByRole('status').textContent).toMatch(/bloco 2 de 2/))
    expect(screen.getByRole('progressbar').getAttribute('aria-valuenow')).toBe('1')
    expect(screen.getByTestId('versao').textContent).toBe('polida')
    await act(async () => soltar())
    await waitFor(() => expect(screen.getByRole('group', { name: 'Tradução exibida' })).toBeTruthy())
    expect(api.polirBloco.mock.calls.map(([p]) => p.bloco)).toEqual([0, 1])
    expect(api.polirBloco.mock.calls[0][0]).toMatchObject({ sessionId: 's1', bloco: 0 })
    expect(screen.queryByRole('button', { name: /Polir a tradução/ })).toBeNull()

    fireEvent.click(screen.getByRole('button', { name: 'Original' }))
    expect(screen.getByTestId('versao').textContent).toBe('original')
    fireEvent.click(screen.getByRole('button', { name: 'Polida' }))
    expect(screen.getByTestId('versao').textContent).toBe('polida')
  })

  it('cancelar para depois do bloco em curso; retomar continua do próximo', async () => {
    const lista = falas(95)
    let soltar!: () => void
    api.polirBloco.mockImplementation(async (p: { bloco: number }) => {
      if (p.bloco === 0) await new Promise<void>((r) => (soltar = r))
      return responder(lista)(p)
    })
    render(<Tela inicial={lista} />)
    fireEvent.click(screen.getByRole('button', { name: /Polir a tradução da sessão/ }))
    await waitFor(() => expect(screen.getByRole('button', { name: /Cancelar/ })).toBeTruthy())
    fireEvent.click(screen.getByRole('button', { name: /Cancelar/ }))
    await act(async () => soltar())
    await waitFor(() => expect(screen.getByRole('button', { name: /Retomar o polimento/ })).toBeTruthy())
    expect(screen.getByRole('status').textContent).toMatch(/1 de 3/)
    expect(api.polirBloco).toHaveBeenCalledTimes(1)

    fireEvent.click(screen.getByRole('button', { name: /Retomar o polimento/ }))
    await waitFor(() => expect(screen.getByRole('group', { name: 'Tradução exibida' })).toBeTruthy())
    await waitFor(() => expect(screen.queryByRole('button', { name: /Retomar/ })).toBeNull())
    expect(api.polirBloco.mock.calls.map(([p]) => p.bloco)).toEqual([0, 1, 2])
  })

  it('uma falha diz o motivo e oferece tentar de novo', async () => {
    api.polirBloco.mockResolvedValue({ ok: false, motivo: 'nuvem_ocupada', status: 429 })
    render(<Tela inicial={falas(5)} />)
    fireEvent.click(screen.getByRole('button', { name: /Polir a tradução da sessão/ }))
    await waitFor(() => expect(screen.getByRole('status').textContent).toMatch(/ocupada/))
    expect(screen.getByRole('button', { name: /Polir a tradução da sessão/ })).toBeTruthy()
  })

  it('sessão já polida: só o alternar, sem pedido nenhum', () => {
    render(<Tela inicial={falas(5, 5)} />)
    expect(screen.getByRole('group', { name: 'Tradução exibida' })).toBeTruthy()
    expect(screen.queryByRole('button', { name: /Polir a tradução/ })).toBeNull()
    expect(api.polirBloco).not.toHaveBeenCalled()
  })

  it('sessão sem nada para polir: não aparece', () => {
    const { container } = render(<Tela inicial={[{ id: 'x', sourceText: 'oi', translatedText: '' }]} />)
    expect(container.querySelector('[data-testid="polir-sessao"]')).toBeNull()
  })

  it('sem a IA de nuvem autorizada: nenhum pedido sai, e o botão é o de autorizar', () => {
    nuvem.consentiu = false
    render(<Tela inicial={falas(5)} />)
    fireEvent.click(screen.getByRole('button', { name: /Autorizar IA de nuvem/ }))
    expect(nuvem.autorizar).toHaveBeenCalled()
    expect(api.polirBloco).not.toHaveBeenCalled()
  })
})

describe('sem a Tradução Nuance (o Grátis)', () => {
  it('o mesmo botão, com cadeado, abre o texto positivo e o convite; nenhum pedido sai', () => {
    const aoConhecer = vi.fn()
    render(<Tela inicial={falas(5)} disponivel={false} aoConhecer={aoConhecer} />)
    const botao = screen.getByRole('button', { name: /Polir a tradução da sessão/ })
    expect(botao.getAttribute('aria-expanded')).toBe('false')
    fireEvent.click(botao)
    const convite = screen.getByTestId('convite-do-polimento')
    expect(convite.textContent).toMatch(/Tradução Nuance do Premium/)
    expect(convite.textContent).toMatch(/Tradução rápida ao vivo/)
    semVendaDeQualidade(convite)
    fireEvent.click(screen.getByRole('button', { name: /Conhecer o Premium/ }))
    expect(aoConhecer).toHaveBeenCalled()
    expect(api.polirBloco).not.toHaveBeenCalled()
  })

  it('perfil protegido: o cadeado e o texto, sem o botão de venda', () => {
    render(<Tela inicial={falas(5)} disponivel={false} />)
    fireEvent.click(screen.getByRole('button', { name: /Polir a tradução da sessão/ }))
    expect(screen.getByTestId('convite-do-polimento')).toBeTruthy()
    expect(screen.queryByRole('button', { name: /Premium/ })).toBeNull()
  })
})
