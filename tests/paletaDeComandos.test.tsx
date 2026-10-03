// @vitest-environment jsdom
/**
 * A PALETA (Ctrl+K) NO DESENHO DO PROTÓTIPO — `paletaCmd()` de `docs/prototipos/consistencia-telas.html`.
 *
 * Trava o comportamento que o desenho novo trouxe: sugestões antes de digitar, busca sem acento,
 * grupos, UM destaque que anda pelas setas e dá a volta, e o vazio com o termo digitado.
 */
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import React from 'react'
import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest'

import CommandPalette, { type Command } from '../src/components/CommandPalette'
import { prepararDialogoNoJsdom } from './_dialogoNoJsdom'

const cmd = (id: string, label: string, grupo: string, extra: Partial<Command> = {}): Command => ({
  id,
  label,
  grupo,
  run: vi.fn(),
  ...extra,
})

const comandos = [
  cmd('ir:metrics', 'Vocabulário', 'Ir para'),
  cmd('ir:play', 'Jogar', 'Ir para'),
  cmd('palavra:1', 'deadline', 'Palavras', { hint: 'prazo' }),
]
const sugestoes = [cmd('sug:capturar', 'Iniciar captura', 'Sugestões')]

function abrir(extra: Partial<React.ComponentProps<typeof CommandPalette>> = {}) {
  const onClose = vi.fn()
  render(<CommandPalette open onClose={onClose} commands={comandos} sugestoes={sugestoes} {...extra} />)
  return { onClose, campo: screen.getByLabelText('Buscar') }
}

describe('paleta de comandos', () => {
  beforeAll(prepararDialogoNoJsdom)
  afterEach(cleanup)

  it('sem digitar, mostra as sugestões', () => {
    abrir()
    expect(screen.getByText('Sugestões')).toBeTruthy()
    expect(screen.getByRole('option', { name: /Iniciar captura/ })).toBeTruthy()
    expect(screen.queryByRole('option', { name: /Jogar/ })).toBeNull()
  })

  it('busca sem acento e agrupa pelo grupo do comando', () => {
    const { campo } = abrir()
    fireEvent.change(campo, { target: { value: 'vocabulario' } })
    expect(screen.getByText('Ir para')).toBeTruthy()
    const op = screen.getByRole('option', { name: /Vocabulário/ })
    expect(op.querySelector('mark')?.textContent).toBe('Vocabulário')
    // A dica também encontra: "prazo" acha "deadline".
    fireEvent.change(campo, { target: { value: 'prazo' } })
    expect(screen.getByRole('option', { name: /deadline/ })).toBeTruthy()
  })

  it('as setas andam com um destaque só e dão a volta; Enter executa e fecha', () => {
    const { campo, onClose } = abrir()
    fireEvent.change(campo, { target: { value: 'a' } }) // Vocabulário, Jogar, deadline
    const selecionado = () => screen.getAllByRole('option').filter((o) => o.getAttribute('aria-selected') === 'true')
    expect(selecionado()).toHaveLength(1)
    expect(selecionado()[0].textContent).toContain('Vocabulário')
    fireEvent.keyDown(campo, { key: 'ArrowUp' })
    expect(selecionado()[0].textContent).toContain('deadline')
    fireEvent.keyDown(campo, { key: 'ArrowDown' })
    expect(selecionado()[0].textContent).toContain('Vocabulário')
    fireEvent.keyDown(campo, { key: 'Enter' })
    expect(comandos[0].run).toHaveBeenCalledOnce()
    expect(onClose).toHaveBeenCalled()
  })

  it('sem resultado, diz o termo e o que tentar', () => {
    const { campo } = abrir()
    fireEvent.change(campo, { target: { value: 'zzzz' } })
    expect(screen.getByText('Nada encontrado para “zzzz”')).toBeTruthy()
  })

  it('comando desabilitado aparece com o motivo e não executa', () => {
    const bloqueado = cmd('x', 'Exercício Pro', 'Ir para', { disabledReason: 'precisa do plano Pro' })
    const { campo } = abrir({ commands: [bloqueado] })
    fireEvent.change(campo, { target: { value: 'pro' } })
    fireEvent.keyDown(campo, { key: 'Enter' })
    expect(bloqueado.run).not.toHaveBeenCalled()
    expect(screen.getByText('precisa do plano Pro')).toBeTruthy()
  })

  it('Esc no campo fecha, sem depender do cancel nativo do <dialog>', () => {
    const { onClose, campo } = abrir()
    fireEvent.keyDown(campo, { key: 'Escape' })
    expect(onClose).toHaveBeenCalledTimes(1)
  })

  it('clicar fora da caixa (no fundo do <dialog>) fecha', () => {
    const { onClose } = abrir()
    const dlg = screen.getByRole('dialog') as HTMLDialogElement
    fireEvent.click(dlg)
    expect(onClose).toHaveBeenCalled()
  })
})
