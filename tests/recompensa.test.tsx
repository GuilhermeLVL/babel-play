// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, screen, fireEvent, act, cleanup } from '@testing-library/react'
import RecompensaDesbloqueada, { recompensasVistas, chaveDaRecompensa, type Recompensa } from '../src/components/RecompensaDesbloqueada'
import { CATALOGO_DA_LOJA } from '../src/lib/loja'

vi.mock('../src/lib/juice', () => ({ comemorar: vi.fn(), explodirAleatorio: vi.fn() }))

const nivel2: Recompensa = { tipo: 'nivel', nivel: 2, itens: CATALOGO_DA_LOJA.filter((i) => i.nivel === 2 && !i.exclusivoDe) }

describe('RecompensaDesbloqueada — o modal de resgate', () => {
  beforeEach(() => { localStorage.clear(); document.body.removeAttribute('data-jogo-ativo') })
  afterEach(() => cleanup())

  it('lista os itens do nível e "Equipar agora" chama equipar', () => {
    const onEquipar = vi.fn(() => true)
    render(<RecompensaDesbloqueada fila={[nivel2]} onEquipar={onEquipar} onFechar={vi.fn()} onVerPersonalizar={vi.fn()} />)
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
    render(<RecompensaDesbloqueada fila={[nivel2]} onEquipar={() => true} onFechar={onFechar} onVerPersonalizar={vi.fn()} />)
    fireEvent.click(screen.getByText('Resgatar tudo e continuar'))
    expect(onFechar).toHaveBeenCalledWith(nivel2)
    expect(recompensasVistas().has(chaveDaRecompensa(nivel2))).toBe(true)
  })

  it('espera a rodada em curso fechar', () => {
    document.body.setAttribute('data-jogo-ativo', '1')
    render(<RecompensaDesbloqueada fila={[nivel2]} onEquipar={() => true} onFechar={vi.fn()} onVerPersonalizar={vi.fn()} />)
    expect(screen.queryByRole('dialog')).toBeNull()
    act(() => { document.body.removeAttribute('data-jogo-ativo'); window.dispatchEvent(new Event('babel:rodada-fechou')) })
    expect(screen.getByRole('dialog')).toBeTruthy()
  })

  it('conquista mostra Seeds/XP e o exclusivo', () => {
    const r: Recompensa = { tipo: 'conquista', id: 'constante', nome: 'Constante', emoji: '🔥', seeds: 100, xp: 50, item: CATALOGO_DA_LOJA.find((i) => i.id === 'tema-aurora') }
    render(<RecompensaDesbloqueada fila={[r]} onEquipar={() => true} onFechar={vi.fn()} onVerPersonalizar={vi.fn()} />)
    expect(screen.getByText('Constante')).toBeTruthy()
    expect(screen.getByText('+100 Seeds')).toBeTruthy()
    expect(screen.getByText('Tema Aurora')).toBeTruthy()
  })
})
