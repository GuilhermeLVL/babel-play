// @vitest-environment jsdom
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react'
import React from 'react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { BotaoDoAvatar, DicaDoAvatar } from '../src/components/avatar/modo/BotaoDoAvatar'
import { useAvatarDoModo } from '../src/components/avatar/modo/useAvatarDoModo'
import { PREFERENCIAS_DO_MODO_PADRAO } from '../src/core/avatar/modos'
import {
  esquecerPreferenciasDoModo,
  guardarPreferenciasDoModo,
  lerPreferenciasDoModo,
  reservarContexto,
} from '../src/lib/avatar/avatarDoModo'

const flags = vi.hoisted(() => ({ avatar_3d: true }))
vi.mock('../src/lib/flags', () => ({ useFlag: (k: string) => (flags as Record<string, boolean>)[k] === true }))
vi.mock('../src/lib/avatar/detectarTier', () => ({ detectarTier: () => 'medio', temWebGL2: () => true }))

function Harness({ modo }: { modo: 'livro' | 'legenda' }) {
  const c = useAvatarDoModo(modo, { aoEscolherMeuAvatar: () => {}, comPip: modo === 'legenda' })
  return (
    <div>
      <span data-testid="estado">{c.disponivel ? (c.ativo ? 'ativo' : 'inativo') : 'sem-flag'}</span>
      <BotaoDoAvatar modo={modo} ligado={c.ligado} aoAlternar={c.alternar} />
      <button onClick={c.alternarPainel}>abrir-painel</button>
      {c.dica.visivel && <DicaDoAvatar modo={modo} aoLigar={c.alternar} aoDispensar={c.dica.dispensar} />}
      {c.painel}
    </div>
  )
}

beforeEach(() => {
  localStorage.clear()
  esquecerPreferenciasDoModo()
  flags.avatar_3d = true
})
afterEach(cleanup)

describe('avatar nos modos: preferências guardadas', () => {
  it('cada modo guarda o seu e o padrão é desligado', () => {
    expect(lerPreferenciasDoModo('livro')).toEqual(PREFERENCIAS_DO_MODO_PADRAO)
    guardarPreferenciasDoModo('livro', { ligado: true, dono: 'outro' })
    expect(lerPreferenciasDoModo('livro')).toMatchObject({ ligado: true, dono: 'outro' })
    expect(lerPreferenciasDoModo('legenda').ligado).toBe(false)
    esquecerPreferenciasDoModo()
    expect(lerPreferenciasDoModo('livro')).toMatchObject({ ligado: true, dono: 'outro' })
  })

  it('sem armazenamento (lança) tudo continua funcionando até recarregar', () => {
    const lanca = vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw new Error('cheio')
    })
    const le = vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => {
      throw new Error('bloqueado')
    })
    esquecerPreferenciasDoModo()
    expect(lerPreferenciasDoModo('legenda')).toEqual(PREFERENCIAS_DO_MODO_PADRAO)
    expect(() => guardarPreferenciasDoModo('legenda', { ligado: true })).not.toThrow()
    expect(lerPreferenciasDoModo('legenda').ligado).toBe(true)
    lanca.mockRestore()
    le.mockRestore()
  })

  it('no máximo 2 contextos 3D de página: o terceiro pede 2D', () => {
    const a = reservarContexto()
    const b = reservarContexto()
    const c = reservarContexto()
    expect([a.ok, b.ok, c.ok]).toEqual([true, true, false])
    a.soltar()
    expect(reservarContexto().ok).toBe(true)
    b.soltar()
  })
})

describe('avatar nos modos: botão, painel e dica', () => {
  it('o botão tem rótulo, aria-pressed e liga/desliga em um toque, lembrando', () => {
    render(<Harness modo="livro" />)
    const b = screen.getByTestId('botao-avatar-livro')
    expect(b.textContent).toContain('Avatar')
    expect(b.getAttribute('aria-pressed')).toBe('false')
    expect(screen.getByTestId('estado').textContent).toBe('inativo')
    fireEvent.click(b)
    expect(b.getAttribute('aria-pressed')).toBe('true')
    expect(screen.getByTestId('estado').textContent).toBe('ativo')
    expect(localStorage.getItem('frasy.avatar.modo.livro.ligado')).toBe('1')
    fireEvent.click(b)
    expect(b.getAttribute('aria-pressed')).toBe('false')
  })

  it('com o modo economia, um toque no botão tira o avatar da economia e liga', () => {
    localStorage.setItem('frasy.avatar.interprete.economia', '1')
    render(<Harness modo="legenda" />)
    fireEvent.click(screen.getByTestId('botao-avatar-legenda'))
    expect(screen.getByTestId('estado').textContent).toBe('ativo')
  })

  it('sem a flag nada existe para a hospedeira mostrar', () => {
    flags.avatar_3d = false
    render(<Harness modo="livro" />)
    expect(screen.getByTestId('estado').textContent).toBe('sem-flag')
    expect(screen.queryByTestId('dica-avatar-livro')).toBeNull()
  })

  it('o painel é o mesmo nos dois modos, fecha com Esc e desliga', () => {
    for (const modo of ['livro', 'legenda'] as const) {
      render(<Harness modo={modo} />)
      fireEvent.click(screen.getByTestId(`botao-avatar-${modo}`))
      fireEvent.click(screen.getByText('abrir-painel'))
      const painel = screen.getByTestId('painel-do-avatar')
      expect(painel.querySelector('[data-testid=avm-tamanho-g]')).not.toBeNull()
      expect(painel.querySelector('[data-testid=avm-economia]')).not.toBeNull()
      expect(painel.querySelector('[data-testid=avm-quem-outro]')).not.toBeNull()
      expect(!!painel.querySelector('[data-testid=avm-no-pip]')).toBe(modo === 'legenda')
      fireEvent.click(screen.getByTestId('avm-quem-outro'))
      expect(lerPreferenciasDoModo(modo).dono).toBe('outro')
      fireEvent.keyDown(painel, { key: 'Escape' })
      expect(screen.queryByTestId('painel-do-avatar')).toBeNull()
      fireEvent.click(screen.getByText('abrir-painel'))
      fireEvent.click(screen.getByTestId('avm-desligar'))
      expect(lerPreferenciasDoModo(modo).ligado).toBe(false)
      expect(screen.queryByTestId('painel-do-avatar')).toBeNull()
      cleanup()
    }
  })

  it('a dica aparece uma vez, é dispensável e fica lembrada', () => {
    const { unmount } = render(<Harness modo="legenda" />)
    expect(screen.getByTestId('dica-avatar-legenda')).toBeTruthy()
    fireEvent.click(screen.getByTestId('dica-avatar-legenda-dispensar'))
    expect(screen.queryByTestId('dica-avatar-legenda')).toBeNull()
    unmount()
    render(<Harness modo="legenda" />)
    expect(screen.queryByTestId('dica-avatar-legenda')).toBeNull()
    expect(localStorage.getItem('frasy.avatar.dica.legenda')).toBe('1')
  })

  it('ligar pela dica liga o avatar e some com a dica', () => {
    render(<Harness modo="livro" />)
    act(() => {
      fireEvent.click(screen.getByTestId('dica-avatar-livro-ligar'))
    })
    expect(screen.queryByTestId('dica-avatar-livro')).toBeNull()
    expect(screen.getByTestId('botao-avatar-livro').getAttribute('aria-pressed')).toBe('true')
  })
})
