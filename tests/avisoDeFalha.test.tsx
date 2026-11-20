// @vitest-environment jsdom
/**
 * O AVISO DA FALHA DO INÍCIO (DISP-04): pt-BR, com a ação, e NÃO some sozinho — só a próxima tentativa
 * (ou o "Fechar") o tira. Visto em +1,5 s, +5 s e +30 s, como o cenário `tela-negada` da auditoria.
 */
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react'
import React, { useState } from 'react'
import { afterEach, describe, expect, it, vi } from 'vitest'

import AvisoDeFalha from '../src/components/views/captura/AvisoDeFalha'
import { falhaParaATela } from '../src/core/falhas/mensagemDeFalha'

afterEach(() => {
  cleanup()
  vi.useRealTimers()
})

function Tela({ aoAgir }: { aoAgir: (a: string) => void }) {
  const [falha, setFalha] = useState(() => falhaParaATela(Object.assign(new Error('x'), { name: 'NotAllowedError' })))
  return falha ? <AvisoDeFalha falha={falha} aoAgir={aoAgir} aoFechar={() => setFalha(null as never)} /> : null
}

describe('AvisoDeFalha', () => {
  it('fica na tela em +1,5 s, +5 s e +30 s, com a ação', () => {
    vi.useFakeTimers()
    const aoAgir = vi.fn()
    render(<Tela aoAgir={aoAgir} />)
    for (const ms of [1500, 3500, 25_000]) {
      act(() => void vi.advanceTimersByTime(ms))
      expect(screen.getByTestId('aviso-de-falha').textContent).toMatch(/Compartilhar áudio/)
    }
    fireEvent.click(screen.getByRole('button', { name: 'Escolher de novo' }))
    expect(aoAgir).toHaveBeenCalledWith('escolher-de-novo')
  })

  it('o Fechar tira o aviso', () => {
    render(<Tela aoAgir={vi.fn()} />)
    fireEvent.click(screen.getByRole('button', { name: 'Fechar' }))
    expect(screen.queryByTestId('aviso-de-falha')).toBeNull()
  })
})
