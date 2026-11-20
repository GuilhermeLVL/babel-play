// @vitest-environment jsdom
/**
 * `useJanelaFlutuante`: a ordem do gesto (o pedido da janela sai ANTES de qualquer estado), a corrida
 * abrir/fechar (a janela que chega depois de fechar é fechada, nunca fica), a recusa do navegador
 * (cai no painel com aviso; recusa atrasada não cai em nada) e sair da tela com o pedido no ar.
 */
import { act, cleanup, renderHook } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('../src/data/api', () => ({
  fetchSettings: vi.fn(async () => null),
  patchUiSettings: vi.fn(async () => {}),
}))
const avisos = vi.hoisted(() => ({ info: vi.fn() }))
vi.mock('../src/components/Toast', () => ({ toast: { info: avisos.info, error: vi.fn(), ok: vi.fn(), warn: vi.fn() } }))

import { useJanelaFlutuante } from '../src/components/views/captura/legendas/useJanelaFlutuante'

type Adiado = { resolver: (w: Window) => void; rejeitar: (e: unknown) => void }
let pedidos: Adiado[] = []
const requestWindow = vi.fn(
  () =>
    new Promise<Window>((resolver, rejeitar) => {
      pedidos.push({ resolver, rejeitar })
    }),
)
const janelaFalsa = () => ({ close: vi.fn(), closed: false }) as unknown as Window & { close: ReturnType<typeof vi.fn> }

const opcoes = { ativo: true, falas: [], contexto: () => ({ interprete: false, cenario: 'media' as const }) }

beforeEach(() => {
  pedidos = []
  requestWindow.mockClear()
  avisos.info.mockClear()
  Object.defineProperty(window, 'documentPictureInPicture', { configurable: true, value: { requestWindow } })
})
afterEach(() => {
  cleanup()
  delete (window as unknown as { documentPictureInPicture?: unknown }).documentPictureInPicture
})

describe('useJanelaFlutuante', () => {
  it('o pedido da janela sai no gesto, antes de qualquer mudança de estado, no tamanho do formato', () => {
    const { result } = renderHook(() => useJanelaFlutuante(opcoes))
    expect(result.current.caminho).toBe('documento')
    let estadoNoPedido: unknown = 'nao-chamado'
    requestWindow.mockImplementationOnce(() => {
      estadoNoPedido = result.current.ativo
      return new Promise<Window>((resolver, rejeitar) => void pedidos.push({ resolver, rejeitar }))
    })
    act(() => result.current.abrir())
    expect(estadoNoPedido, 'ainda nenhum estado mudou quando a janela foi pedida').toBeNull()
    expect(requestWindow).toHaveBeenCalledWith({ width: 600, height: 170 })
    expect(result.current.ativo).toBe('documento')
  })

  it('abriu e fechou antes de o navegador responder: a janela que chega é fechada, e nada fica aberto', async () => {
    const { result } = renderHook(() => useJanelaFlutuante(opcoes))
    act(() => result.current.abrir())
    act(() => result.current.fechar())
    const win = janelaFalsa()
    await act(async () => pedidos[0].resolver(win))
    expect(win.close).toHaveBeenCalledTimes(1)
    expect(result.current.aberta).toBe(false)
    expect(avisos.info).not.toHaveBeenCalled()
  })

  it('o navegador recusou: cai no painel, dizendo por quê', async () => {
    const { result } = renderHook(() => useJanelaFlutuante(opcoes))
    act(() => result.current.abrir())
    await act(async () => pedidos[0].rejeitar(new DOMException('no', 'NotAllowedError')))
    expect(result.current.ativo).toBe('painel')
    expect(avisos.info).toHaveBeenCalledWith(
      'A janela por cima de tudo não abriu. A legenda ficou flutuando nesta tela.',
    )
  })

  it('recusa que chega depois de fechar não abre o painel', async () => {
    const { result } = renderHook(() => useJanelaFlutuante(opcoes))
    act(() => result.current.abrir())
    act(() => result.current.fechar())
    await act(async () => pedidos[0].rejeitar(new Error('tarde')))
    expect(result.current.aberta).toBe(false)
    expect(avisos.info).not.toHaveBeenCalled()
  })

  it('com aoFalhar (a abertura automática), a recusa chama ele em vez de cair no painel', async () => {
    const aoFalhar = vi.fn()
    const { result } = renderHook(() => useJanelaFlutuante(opcoes))
    act(() => result.current.abrir({ silencioso: true, aoFalhar }))
    await act(async () => pedidos[0].rejeitar(new Error('sem gesto')))
    expect(aoFalhar).toHaveBeenCalledTimes(1)
    expect(result.current.aberta).toBe(false)
  })

  it('saiu da tela com o pedido no ar: a janela que chega depois é fechada', async () => {
    const { result, unmount } = renderHook(() => useJanelaFlutuante(opcoes))
    act(() => result.current.abrir())
    unmount()
    const win = janelaFalsa()
    await act(async () => pedidos[0].resolver(win))
    expect(win.close).toHaveBeenCalledTimes(1)
  })

  it('no celular, o painel (sem pedir janela)', () => {
    const { result } = renderHook(() => useJanelaFlutuante({ ...opcoes, celular: true }))
    expect(result.current.caminho).toBe('painel')
    act(() => result.current.abrir({ silencioso: true }))
    expect(requestWindow).not.toHaveBeenCalled()
    expect(result.current.ativo).toBe('painel')
  })
})
