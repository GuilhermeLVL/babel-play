// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import React from 'react'
import { afterEach, describe, expect, it, vi } from 'vitest'

import LinhaDosAvatares from '../src/components/views/captura/interprete/LinhaDosAvatares'
import type { AtalhoDeSoletrar } from '../src/core/avatar/descoberta'

afterEach(cleanup)

const monta = (atalho: AtalhoDeSoletrar, extra: Partial<React.ComponentProps<typeof LinhaDosAvatares>> = {}) => {
  const props = {
    atalho,
    aoAlternar: vi.fn(),
    dica: false,
    aoDispensarDica: vi.fn(),
    motivoEmTexto: 'As mãos deste avatar são pequenas demais para soletrar.',
    aoEscolherOutroAvatar: vi.fn(),
    aoMostrarInterprete: vi.fn(),
    ...extra,
  }
  render(<LinhaDosAvatares {...props} />)
  return props
}

describe('LinhaDosAvatares', () => {
  it('sem atalho e sem dica não renderiza nada', () => {
    monta({ tipo: 'oculto' })
    expect(screen.queryByTestId('linha-dos-avatares')).toBeNull()
  })

  it('atalho pronto: aria-pressed reflete o estado e o toque alterna sem mais nada', () => {
    const p = monta({ tipo: 'pronto', ligado: false })
    const b = screen.getByRole('button', { name: /Soletrar nomes \(Libras\/ASL\)/ })
    expect(b.getAttribute('aria-pressed')).toBe('false')
    fireEvent.click(b)
    expect(p.aoAlternar).toHaveBeenCalledTimes(1)
  })

  it('atalho ligado aparece pressionado', () => {
    monta({ tipo: 'pronto', ligado: true })
    expect(screen.getByTestId('atalho-soletrar').getAttribute('aria-pressed')).toBe('true')
  })

  it('indisponível: toque explica e oferece escolher outro avatar (sem alternar a soletração)', () => {
    const p = monta({ tipo: 'indisponivel', motivo: 'maos_minusculas', saida: 'outro_avatar' })
    fireEvent.click(screen.getByTestId('atalho-soletrar'))
    expect(screen.getByRole('status').textContent).toContain('pequenas demais')
    fireEvent.click(screen.getByRole('button', { name: 'Escolher outro avatar' }))
    expect(p.aoEscolherOutroAvatar).toHaveBeenCalledTimes(1)
    expect(p.aoAlternar).not.toHaveBeenCalled()
  })

  it('sem como ir ao Perfil, a explicação não promete o botão', () => {
    monta(
      { tipo: 'indisponivel', motivo: 'maos_minusculas', saida: 'outro_avatar' },
      { aoEscolherOutroAvatar: undefined },
    )
    fireEvent.click(screen.getByTestId('atalho-soletrar'))
    expect(screen.queryByRole('button', { name: 'Escolher outro avatar' })).toBeNull()
  })

  it('a dica é um aviso educado (role status), dispensável e não é diálogo', () => {
    const p = monta({ tipo: 'oculto' }, { dica: true })
    expect(screen.getByRole('status').textContent).toContain('Avatares')
    expect(screen.queryByRole('dialog')).toBeNull()
    fireEvent.click(screen.getByRole('button', { name: 'Dispensar a dica' }))
    expect(p.aoDispensarDica).toHaveBeenCalledTimes(1)
  })

  it('o atalho nunca se chama de tradução nem de intérprete de Libras', () => {
    monta({ tipo: 'pronto', ligado: true }, { dica: true })
    const texto = screen.getByTestId('linha-dos-avatares').textContent ?? ''
    expect(texto).not.toMatch(/tradu[çc][ãa]o|intérprete de libras/i)
  })
})
