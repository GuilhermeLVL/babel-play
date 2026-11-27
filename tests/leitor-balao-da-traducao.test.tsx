// @vitest-environment jsdom
/**
 * O BALÃO DA TRADUÇÃO (openspec `leitura-assistida`, fatia B): traduz sozinho no modo tradução, respeita plano/idade,
 * lê em voz alta e PARA ao sair, copia, e só mostra "Ajustar nível" quando a fatia de IA o entrega.
 */
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import BalaoDaTraducao from '../src/components/views/leitor/BalaoDaTraducao'
import BarraDaSelecao from '../src/components/views/leitor/BarraDaSelecao'

const voz = vi.hoisted(() => ({ ler: vi.fn(), parar: vi.fn() }))
vi.mock('../src/lib/leitor/lerEmVoz', () => ({ lerEmVozAlta: voz.ler, pararLeitura: voz.parar }))

const TRECHO = {
  texto: 'the quick fox',
  frase: 'The quick fox jumps.',
  paragrafo: 'The quick fox jumps. It is fast.',
  idioma: 'en',
}
const base = {
  trecho: TRECHO,
  rect: { x: 300, y: 200, w: 120, h: 20 },
  area: { x0: 0, y0: 56, x1: 1280, y1: 700 },
  colunas: 1 as const,
  destino: 'pt-BR',
  estado: { disponivel: true } as const,
  modoAuto: true,
  aoFechar: () => {},
}

beforeEach(() => vi.useFakeTimers())
afterEach(() => {
  cleanup()
  vi.useRealTimers()
  vi.clearAllMocks()
})

describe('BalaoDaTraducao', () => {
  it('traduz sozinho depois da pausa de 250 ms, uma única vez', async () => {
    const traduzir = vi.fn(async (x: string) => `PT(${x})`)
    const aoTraduzir = vi.fn()
    render(<BalaoDaTraducao {...base} traduzir={traduzir} aoTraduzir={aoTraduzir} />)
    expect(screen.getByText('Traduzindo…')).toBeTruthy()
    await act(async () => {
      await vi.advanceTimersByTimeAsync(249)
    })
    expect(traduzir).not.toHaveBeenCalled()
    await act(async () => {
      await vi.advanceTimersByTimeAsync(1)
    })
    expect(traduzir).toHaveBeenCalledTimes(1)
    expect(screen.getByTestId('balao-traducao-texto').textContent).toBe('PT(the quick fox)')
    expect(aoTraduzir).toHaveBeenCalledWith('the quick fox', 'PT(the quick fox)')
  })

  it('perfil protegido sem nuvem: mostra o motivo e NÃO chama a tradução', async () => {
    const traduzir = vi.fn(async () => 'x')
    render(<BalaoDaTraducao {...base} traduzir={traduzir} estado={{ disponivel: false, motivo: 'idade' }} />)
    await act(async () => {
      await vi.advanceTimersByTimeAsync(1000)
    })
    expect(traduzir).not.toHaveBeenCalled()
    expect(screen.getByRole('status').textContent).not.toBe('')
  })

  it('o escopo "Frase" traduz a frase sob o trecho; "Parágrafo" o parágrafo', async () => {
    const traduzir = vi.fn(async (x: string) => `PT(${x})`)
    render(<BalaoDaTraducao {...base} traduzir={traduzir} />)
    await act(async () => {
      await vi.advanceTimersByTimeAsync(300)
    })
    fireEvent.click(screen.getByRole('button', { name: 'Frase' }))
    await act(async () => {
      await vi.advanceTimersByTimeAsync(5)
    })
    expect(traduzir).toHaveBeenLastCalledWith('The quick fox jumps.')
    fireEvent.click(screen.getByRole('button', { name: 'Parágrafo' }))
    await act(async () => {
      await vi.advanceTimersByTimeAsync(5)
    })
    expect(traduzir).toHaveBeenLastCalledWith(TRECHO.paragrafo)
  })

  it('ler em voz alta usa o idioma do livro e a leitura para ao fechar o balão', () => {
    const { unmount } = render(<BalaoDaTraducao {...base} traduzir={async () => null} />)
    fireEvent.click(screen.getByRole('button', { name: /Ler em voz alta/ }))
    expect(voz.ler).toHaveBeenCalledWith('the quick fox', 'en', expect.any(Function))
    unmount()
    expect(voz.parar).toHaveBeenCalled()
  })

  it('copiar leva o trecho e a tradução pronta', async () => {
    const escrever = vi.fn(async () => {})
    Object.defineProperty(navigator, 'clipboard', { value: { writeText: escrever }, configurable: true })
    render(<BalaoDaTraducao {...base} traduzir={async () => 'tradução'} />)
    await act(async () => {
      await vi.advanceTimersByTimeAsync(300)
    })
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: /Copiar/ }))
    })
    expect(escrever).toHaveBeenCalledWith('the quick fox\n\ntradução')
  })

  it('"Ajustar nível" só aparece com a fatia de IA ligada, e chama o painel', () => {
    const { rerender } = render(<BalaoDaTraducao {...base} traduzir={async () => null} />)
    expect(screen.queryByTestId('balao-ajustar-nivel')).toBeNull()
    const abrir = vi.fn()
    rerender(<BalaoDaTraducao {...base} traduzir={async () => null} aoAjustarNivel={abrir} />)
    fireEvent.click(screen.getByTestId('balao-ajustar-nivel'))
    expect(abrir).toHaveBeenCalled()
  })

  it('o ditado só aparece com uma frase diferente do trecho', async () => {
    vi.useRealTimers() // o componente do ditado é carregado sob demanda (import dinâmico)
    render(<BalaoDaTraducao {...base} traduzir={async () => null} />)
    fireEvent.click(screen.getByRole('button', { name: /Ditado/ }))
    expect(await screen.findByTestId('ditado-da-frase')).toBeTruthy()
    cleanup()
    render(<BalaoDaTraducao {...base} trecho={{ ...TRECHO, frase: TRECHO.texto }} traduzir={async () => null} />)
    expect(screen.queryByRole('button', { name: /Ditado/ })).toBeNull()
  })

  it('atalho T repete o pedido; atalho V lê', async () => {
    const traduzir = vi.fn(async (x: string) => `PT(${x})`)
    const { rerender } = render(<BalaoDaTraducao {...base} traduzir={traduzir} />)
    await act(async () => {
      await vi.advanceTimersByTimeAsync(300)
    })
    rerender(<BalaoDaTraducao {...base} traduzir={traduzir} comando={{ acao: 'traduzir', n: 1 }} />)
    await act(async () => {
      await vi.advanceTimersByTimeAsync(5)
    })
    expect(traduzir).toHaveBeenCalledTimes(2)
    rerender(<BalaoDaTraducao {...base} traduzir={traduzir} comando={{ acao: 'ler', n: 2 }} />)
    expect(voz.ler).toHaveBeenCalledTimes(1)
  })
})

describe('BarraDaSelecao com o modo tradução', () => {
  const props = {
    trecho: TRECHO,
    destino: 'pt-BR',
    traduzir: async () => 'x',
    aoGrifar: () => {},
    aoAnotar: () => {},
    aoFechar: () => {},
    explicar: { disponivel: true } as const,
    parceiro: { disponivel: true } as const,
    aoPerguntar: () => {},
  }
  it('sem a flag: nenhum interruptor, e "Traduzir" traduz na própria barra (como sempre)', async () => {
    vi.useRealTimers()
    render(<BarraDaSelecao {...props} />)
    expect(screen.queryByTestId('selecao-modo-traducao')).toBeNull()
    fireEvent.click(screen.getByRole('button', { name: /Traduzir/ }))
    expect(await screen.findByText('x')).toBeTruthy()
  })
  it('com a flag: o interruptor alterna e "Traduzir" abre o balão', () => {
    const aoAlternar = vi.fn()
    const aoTraduzir = vi.fn()
    render(<BarraDaSelecao {...props} modoTraducao={{ ligado: true, aoAlternar, aoTraduzir }} />)
    const chave = screen.getByTestId('selecao-modo-traducao')
    expect(chave.getAttribute('aria-checked')).toBe('true')
    fireEvent.click(chave)
    expect(aoAlternar).toHaveBeenCalled()
    fireEvent.click(screen.getByRole('button', { name: /^Traduzir$/ }))
    expect(aoTraduzir).toHaveBeenCalled()
  })
})
