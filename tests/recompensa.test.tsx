// @vitest-environment jsdom
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import RecompensaDesbloqueada, {
  chaveDaRecompensa,
  type Recompensa,
  recompensasVistas,
} from '../src/components/RecompensaDesbloqueada'
import { CATALOGO_DA_LOJA } from '../src/lib/loja'
import { prepararDialogoNoJsdom } from './_dialogoNoJsdom'

prepararDialogoNoJsdom()

vi.mock('../src/lib/juice', () => ({ explodirAleatorio: vi.fn(), pontosDoElemento: vi.fn(), movimentoReduzido: () => true }))
vi.mock('../src/lib/comemoracao', () => ({ celebrar: vi.fn(), tocarPreviaDoEfeito: vi.fn() }))

const nivel2: Recompensa = {
  tipo: 'nivel',
  nivel: 2,
  itens: CATALOGO_DA_LOJA.filter((i) => i.nivel === 2 && !i.exclusivoDe),
}

describe('RecompensaDesbloqueada — o modal de resgate', () => {
  beforeEach(() => {
    localStorage.clear()
    document.body.removeAttribute('data-jogo-ativo')
  })
  afterEach(() => cleanup())

  it('lista os itens do nível e "Equipar agora" chama equipar', () => {
    const onEquipar = vi.fn(() => true)
    render(
      <RecompensaDesbloqueada fila={[nivel2]} onEquipar={onEquipar} onFechar={vi.fn()} onVerPersonalizar={vi.fn()} />,
    )
    expect(screen.getByRole('dialog')).toBeTruthy()
    expect(screen.getByText('Nível 2!')).toBeTruthy()
    for (const i of nivel2.itens) expect(screen.getByText(i.nome)).toBeTruthy()
    const botoes = screen.getAllByText('Equipar agora')
    fireEvent.click(botoes[0])
    expect(onEquipar).toHaveBeenCalledTimes(1)
    expect(screen.getAllByText('Em uso').length).toBe(1)
  })

  it('resgatar marca como vista e fecha', () => {
    const onFechar = vi.fn()
    render(
      <RecompensaDesbloqueada fila={[nivel2]} onEquipar={() => true} onFechar={onFechar} onVerPersonalizar={vi.fn()} />,
    )
    fireEvent.click(screen.getByText('Resgatar e continuar'))
    expect(onFechar).toHaveBeenCalledWith(nivel2)
    expect(recompensasVistas().has(chaveDaRecompensa(nivel2))).toBe(true)
  })

  it('Esc (o close nativo do <dialog>) marca como vista e tira da fila uma vez só', () => {
    const onFechar = vi.fn()
    render(
      <RecompensaDesbloqueada fila={[nivel2]} onEquipar={() => true} onFechar={onFechar} onVerPersonalizar={vi.fn()} />,
    )
    const dlg = screen.getByRole('dialog') as HTMLDialogElement
    expect(dlg.open).toBe(true)
    fireEvent.click(screen.getByText('Resgatar e continuar'))
    dlg.close()
    expect(onFechar).toHaveBeenCalledTimes(1)
    expect(recompensasVistas().has(chaveDaRecompensa(nivel2))).toBe(true)
  })

  it('espera a rodada em curso fechar', () => {
    document.body.setAttribute('data-jogo-ativo', '1')
    render(
      <RecompensaDesbloqueada fila={[nivel2]} onEquipar={() => true} onFechar={vi.fn()} onVerPersonalizar={vi.fn()} />,
    )
    expect(screen.queryByRole('dialog')).toBeNull()
    act(() => {
      document.body.removeAttribute('data-jogo-ativo')
      window.dispatchEvent(new Event('babel:rodada-fechou'))
    })
    expect(screen.getByRole('dialog')).toBeTruthy()
  })

  it('conquista mostra Seeds/XP e o exclusivo', () => {
    const r: Recompensa = {
      tipo: 'conquista',
      id: 'constante',
      nome: 'Constante',
      seeds: 100,
      xp: 50,
      item: CATALOGO_DA_LOJA.find((i) => i.id === 'tema-aurora'),
    }
    render(<RecompensaDesbloqueada fila={[r]} onEquipar={() => true} onFechar={vi.fn()} onVerPersonalizar={vi.fn()} />)
    expect(screen.getByText('Constante')).toBeTruthy()
    expect(screen.getByText('+100 Seeds')).toBeTruthy()
    expect(screen.getByText('Tema Aurora')).toBeTruthy()
  })

  it('conquista mostra o ícone lucide da grade de Desafios, e não o emoji do core', () => {
    const r: Recompensa = { tipo: 'conquista', id: 'constante', nome: 'Constante', seeds: 100, xp: 50 }
    render(<RecompensaDesbloqueada fila={[r]} onEquipar={() => true} onFechar={vi.fn()} onVerPersonalizar={vi.fn()} />)
    const dialogo = screen.getByRole('dialog')
    expect(dialogo.textContent).not.toContain('🔥')
    expect(dialogo.querySelector('.emoji svg.lucide-flame')).toBeTruthy()
  })

  it('o modal é a ÚNICA festa da recompensa: comemora uma vez ao abrir', async () => {
    const { celebrar } = await import('../src/lib/comemoracao')
    vi.mocked(celebrar).mockClear()
    render(
      <RecompensaDesbloqueada fila={[nivel2]} onEquipar={() => true} onFechar={vi.fn()} onVerPersonalizar={vi.fn()} />,
    )
    expect(vi.mocked(celebrar).mock.calls.filter((c) => c[0].tipo === 'nivel')).toHaveLength(1)
  })
})

/* RECOMPENSAS v2 (Task 5.4, spec 10.2 e 10.3): a fila agrupa o que chega junto e mostra a peça como
   ela aparece de verdade. */
describe('RecompensaDesbloqueada — lote de novidades e prévia real', () => {
  beforeEach(() => {
    localStorage.clear()
    document.body.removeAttribute('data-jogo-ativo')
  })
  afterEach(() => cleanup())

  const conquista = (id: string): Recompensa => ({ tipo: 'conquista', id, nome: id, seeds: 10, xp: 5 })
  const tres = [nivel2, conquista('constante'), conquista('primeira-rodada')]

  it('três juntas: "3 novidades", uma por vez, com a posição', () => {
    const { rerender } = render(
      <RecompensaDesbloqueada fila={tres} onEquipar={() => true} onFechar={vi.fn()} onVerPersonalizar={vi.fn()} />,
    )
    expect(screen.getAllByRole('dialog')).toHaveLength(1)
    expect(screen.getByText(/3 novidades · 1 de 3/)).toBeTruthy()
    rerender(
      <RecompensaDesbloqueada fila={tres.slice(1)} onEquipar={() => true} onFechar={vi.fn()} onVerPersonalizar={vi.fn()} />,
    )
    expect(screen.getByText(/3 novidades · 2 de 3/)).toBeTruthy()
  })

  it('uma só não fala em lote', () => {
    render(<RecompensaDesbloqueada fila={[nivel2]} onEquipar={() => true} onFechar={vi.fn()} onVerPersonalizar={vi.fn()} />)
    expect(screen.queryByText(/novidades/)).toBeNull()
  })

  it('nunca abre durante a rodada, nem com o lote cheio', () => {
    document.body.setAttribute('data-jogo-ativo', '1')
    render(<RecompensaDesbloqueada fila={tres} onEquipar={() => true} onFechar={vi.fn()} onVerPersonalizar={vi.fn()} />)
    expect(screen.queryByRole('dialog')).toBeNull()
    act(() => {
      document.body.removeAttribute('data-jogo-ativo')
      window.dispatchEvent(new Event('babel:rodada-fechou'))
    })
    expect(screen.getByText(/3 novidades · 1 de 3/)).toBeTruthy()
  })

  it('a legenda chega estilizada, e o efeito toca ao abrir', async () => {
    vi.useFakeTimers()
    const { tocarPreviaDoEfeito } = await import('../src/lib/comemoracao')
    const legenda = CATALOGO_DA_LOJA.find((i) => i.tipo === 'legenda' && i.precoSeeds)!
    const efeito = CATALOGO_DA_LOJA.find((i) => i.tipo === 'efeito-acerto')!
    const r: Recompensa = { tipo: 'drop', roundId: 'r1', seeds: 0, item: legenda }
    const r2: Recompensa = { tipo: 'drop', roundId: 'r2', seeds: 0, item: efeito }
    const { unmount } = render(
      <RecompensaDesbloqueada fila={[r]} onEquipar={() => true} onFechar={vi.fn()} onVerPersonalizar={vi.fn()} />,
    )
    expect(document.querySelector('[data-previa-da-peca="legenda"] .previa-leg-estilo')).toBeTruthy()
    unmount()
    render(<RecompensaDesbloqueada fila={[r2]} onEquipar={() => true} onFechar={vi.fn()} onVerPersonalizar={vi.fn()} />)
    act(() => {
      vi.advanceTimersByTime(600)
    })
    expect(vi.mocked(tocarPreviaDoEfeito)).toHaveBeenCalledWith('efeito-acerto', efeito.alvo, expect.anything())
    vi.useRealTimers()
  })
})
