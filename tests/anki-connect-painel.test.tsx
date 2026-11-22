// @vitest-environment jsdom
/** O painel "Anki no computador": conectar, escolher e enviar, e o erro de origem com a linha exata do config. */
import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import React from 'react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import EnviarParaOAnki from '../src/components/views/vocab/EnviarParaOAnki'
import { CHAVE_DAS_PREFS_DO_ANKI } from '../src/lib/anki/ankiConnectPrefs'
import type { VocabCard } from '../src/types'

const cartao = (n: number): VocabCard =>
  ({
    id: `c${n}`,
    word: `w${n}`,
    translation: `t${n}`,
    sentence: `say w${n}`,
    cefrLevel: 'B1',
    inDeck: true,
  }) as VocabCard

function anki(rotas: Record<string, (p: Record<string, unknown> | undefined) => unknown>) {
  const acoes: string[] = []
  vi.stubGlobal(
    'fetch',
    vi.fn(async (_url: string, init?: RequestInit) => {
      const { action, params } = JSON.parse(String(init?.body))
      acoes.push(action)
      return new Response(JSON.stringify({ result: rotas[action]!(params), error: null }))
    }),
  )
  return acoes
}

beforeEach(() => {
  localStorage.clear()
  vi.stubGlobal('location', { origin: 'https://app.frasy.test' })
})
afterEach(() => {
  cleanup()
  vi.unstubAllGlobals()
})

describe('EnviarParaOAnki', () => {
  it('testa a conexão, escolhe o Basic, envia e mostra o resumo; guarda as escolhas no aparelho', async () => {
    const acoes = anki({
      requestPermission: () => ({ permission: 'granted', version: 6 }),
      version: () => 6,
      deckNames: () => ['Default'],
      modelNames: () => ['Cloze', 'Basic'],
      modelFieldNames: () => ['Front', 'Back'],
      createDeck: () => 1,
      canAddNotes: (p) => (p!.notes as unknown[]).map((_n, i) => i !== 0),
      addNotes: (p) => (p!.notes as unknown[]).map((_n, i) => i + 1),
    })
    render(<EnviarParaOAnki cartoes={[cartao(1), cartao(2), cartao(3)]} />)
    fireEvent.click(screen.getByRole('button', { name: /Testar conexão/ }))
    await screen.findByText('Conectado ao Anki.')
    expect((screen.getByLabelText('Modelo de cartão') as HTMLSelectElement).value).toBe('Basic')
    expect((screen.getByLabelText('O que vai no campo Front') as HTMLSelectElement).value).toBe('palavra')
    expect((screen.getByLabelText('O que vai no campo Back') as HTMLSelectElement).value).toBe('verso')

    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: /Enviar 3 para o Anki/ }))
    })
    const resumo = await screen.findByTestId('resumo-anki')
    await waitFor(() => expect(resumo.textContent).toContain('Adicionados: 2'))
    expect(resumo.textContent).toContain('Já estavam no baralho: 1')
    expect(resumo.textContent).toContain('Com erro: 0')
    expect(acoes).toEqual([
      'requestPermission',
      'version',
      'deckNames',
      'modelNames',
      'modelFieldNames',
      'createDeck',
      'canAddNotes',
      'addNotes',
    ])
    expect(JSON.parse(localStorage.getItem(CHAVE_DAS_PREFS_DO_ANKI)!)).toMatchObject({
      baralho: 'Frasy',
      modelo: 'Basic',
    })
  })

  it('origem não liberada: alerta com a linha exata de webCorsOriginList e nada de envio', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async (_u: string, init?: RequestInit) => {
        if (init?.mode === 'no-cors') return new Response(null)
        throw new TypeError('Failed to fetch')
      }),
    )
    render(<EnviarParaOAnki cartoes={[cartao(1)]} />)
    fireEvent.click(screen.getByRole('button', { name: /Testar conexão/ }))
    const alerta = await screen.findByRole('alert')
    expect(alerta.textContent).toContain('"webCorsOriginList": ["http://localhost", "https://app.frasy.test"]')
    expect(screen.queryByRole('button', { name: /Enviar/ })).toBeNull()
  })
})
