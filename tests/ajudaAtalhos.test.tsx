// @vitest-environment jsdom
/**
 * OS ATALHOS DA AJUDA SÃO SÓ OS QUE O APP TEM. O protótipo lista `?` e `G I/J/V`, que o app não
 * implementa; anunciar tecla que não faz nada é pior do que não anunciar. "Ver todos" abre o
 * diálogo `dialogoAtalhos()` do protótipo com a lista inteira. No computador o menu é o trilho, que não
 * recolhe: o Ctrl+B do menu lateral de antes também não é prometido.
 */
import { cleanup, fireEvent, render, screen, within } from '@testing-library/react'
import React from 'react'
import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest'

import Ajuda from '../src/components/views/Ajuda'
import { prepararDialogoNoJsdom } from './_dialogoNoJsdom'

/* Um computador (o jsdom, sem captura de tela, seria lido como celular): é onde há teclado físico. */
vi.mock('../src/lib/dispositivo/perfil', async (original) => {
  const real = await original<typeof import('../src/lib/dispositivo/perfil')>()
  return { ...real, perfilDoDispositivo: () => ({ ...real.perfilDoDispositivo(), tipo: 'desktop-com-gpu' }) }
})

describe('Ajuda — atalhos de teclado', () => {
  beforeAll(() => {
    prepararDialogoNoJsdom()
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => new Response(JSON.stringify({ status: 'ok' }))),
    )
  })
  afterEach(cleanup)

  it('"Ver todos" abre o diálogo com os atalhos reais, e só eles', () => {
    render(<Ajuda />)
    fireEvent.click(screen.getByRole('button', { name: 'Ver todos' }))
    const dlg = screen.getByRole('dialog', { name: 'Atalhos de teclado' })
    const linhas = dlg.querySelectorAll('.atalho')
    expect([...linhas].map((l) => l.firstElementChild?.textContent)).toEqual([
      'Buscar gravação, palavra ou tela',
      'Mostrar a resposta (revisão)',
      'Responder a revisão',
      'Fechar painel ou diálogo',
    ])
    const teclas = within(dlg)
      .getAllByText((_, el) => el?.tagName === 'KBD')
      .map((k) => k.textContent)
    expect(teclas).not.toContain('?')
    expect(teclas).not.toContain('G')
  })
})
