// @vitest-environment jsdom
/**
 * A LEGENDA DO CELULAR SEM TRADUÇÃO (CEL-01, auditoria de 17/11/2026): o espanhol aparecia entre parênteses, em letra
 * grande, no lugar da tradução, e a pessoa achava que tinha traduzido. Agora o original fica como original e, embaixo,
 * o motivo ("Tradução indisponível agora", com o botão "Tentar de novo"; ou "Sem tradução neste aparelho").
 */
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import React from 'react'
import { afterEach, describe, expect, it, vi } from 'vitest'

vi.mock('../src/lib/dictionary', () => ({ lookup: async () => ({ status: 'missing' }) }))

import HistoricoDoPrototipo from '../src/components/views/captura/quest/HistoricoDoPrototipo'
import type { SpeechSegment } from '../src/lib/captura/tiposDaFala'

const ORIGINAL = 'Perdón, ¿dónde está la salida?'
const fala = (extra: Partial<SpeechSegment>): SpeechSegment => ({
  id: 'a',
  speakerId: 'system',
  source: 'system',
  timestamp: '00:03',
  originalText: ORIGINAL,
  translatedText: '',
  words: [],
  lang: 'es',
  ...extra,
})

afterEach(() => cleanup())

describe('HistoricoDoPrototipo: fala sem tradução', () => {
  it('falhou: o motivo embaixo do original e o botão "Tentar de novo"; nada de "(original)"', () => {
    const aoTentar = vi.fn()
    const { container } = render(
      <HistoricoDoPrototipo
        falas={[fala({ semTraducao: 'falhou' })]}
        escala={1}
        idiomaPadrao="es"
        aoTocar={() => {}}
        aoTentarTraducaoDeNovo={aoTentar}
      />,
    )
    expect(screen.getByTestId('sem-traducao').textContent).toBe('Tradução indisponível agora')
    expect(container.textContent).not.toContain(`(${ORIGINAL})`)
    fireEvent.click(screen.getByRole('button', { name: 'Tentar de novo' }))
    expect(aoTentar).toHaveBeenCalledWith('a')
  })

  it('sem rota: "Sem tradução neste aparelho", sem botão de tentar', () => {
    render(
      <HistoricoDoPrototipo
        falas={[fala({ semTraducao: 'sem-rota' })]}
        escala={1}
        idiomaPadrao="es"
        aoTocar={() => {}}
        aoTentarTraducaoDeNovo={() => {}}
      />,
    )
    expect(screen.getByTestId('sem-traducao').textContent).toBe('Sem tradução neste aparelho')
    expect(screen.queryByRole('button', { name: 'Tentar de novo' })).toBeNull()
  })

  it('a tradução chegou depois (retradução): o motivo some', () => {
    render(
      <HistoricoDoPrototipo
        falas={[fala({ translatedText: 'Desculpe, onde fica a saída?' })]}
        escala={1}
        idiomaPadrao="es"
        aoTocar={() => {}}
      />,
    )
    expect(screen.queryByTestId('sem-traducao')).toBeNull()
  })
})
