// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import React from 'react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import AtalhoDoAvatarNoInicio from '../src/components/avatar/AtalhoDoAvatarNoInicio'
import { ATALHO_DO_INICIO } from '../src/lib/avatar/descoberta'

beforeEach(() => localStorage.clear())
afterEach(cleanup)

const monta = (flag = true) => {
  const p = { aoConversar: vi.fn(), aoEscolherAvatar: vi.fn() }
  render(<AtalhoDoAvatarNoInicio flag={flag} {...p} />)
  return p
}

describe('AtalhoDoAvatarNoInicio', () => {
  it('sem a flag não renderiza nada', () => {
    monta(false)
    expect(screen.queryByTestId('avatar-no-inicio')).toBeNull()
  })

  it('"Conversar com avatar" leva ao Intérprete e some para sempre', () => {
    const p = monta()
    fireEvent.click(screen.getByRole('button', { name: 'Conversar com avatar' }))
    expect(p.aoConversar).toHaveBeenCalledTimes(1)
    expect(localStorage.getItem(ATALHO_DO_INICIO)).toBe('1')
    expect(screen.queryByTestId('avatar-no-inicio')).toBeNull()
  })

  it('"Meu avatar" leva ao Perfil', () => {
    const p = monta()
    fireEvent.click(screen.getByRole('button', { name: 'Meu avatar' }))
    expect(p.aoEscolherAvatar).toHaveBeenCalledTimes(1)
  })

  it('dispensar lembra a escolha; já dispensado, nem aparece', () => {
    monta()
    fireEvent.click(screen.getByTestId('avatar-no-inicio-dispensar'))
    expect(screen.queryByTestId('avatar-no-inicio')).toBeNull()
    cleanup()
    monta()
    expect(screen.queryByTestId('avatar-no-inicio')).toBeNull()
  })

  it('sem armazenamento a tela funciona igual', () => {
    const g = vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => {
      throw new Error('bloqueado')
    })
    const s = vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw new Error('bloqueado')
    })
    monta()
    fireEvent.click(screen.getByTestId('avatar-no-inicio-dispensar'))
    expect(screen.queryByTestId('avatar-no-inicio')).toBeNull()
    g.mockRestore()
    s.mockRestore()
  })
})
