// @vitest-environment jsdom
/**
 * A resposta atrasada de `fetchSettings` (hidratação da Captura) não desfaz a escolha Aparelho | Nuvem
 * feita no painel antes dela chegar (revisão final, item 6).
 */
import { act, cleanup, render, waitFor } from '@testing-library/react'
import React from 'react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const resposta = vi.hoisted(() => ({
  pendentes: [] as Array<() => void>,
  ui: JSON.stringify({ sttQuality: 'cloud' }),
}))
const servidor = vi.hoisted(() => ({ patch: vi.fn(async (_p: Record<string, unknown>) => ({ ui: '{}' })) }))
vi.mock('../src/data/api', async (orig) => {
  const real = await orig<typeof import('../src/data/api')>()
  return {
    ...real,
    patchUiSettings: servidor.patch,
    fetchSettings: () =>
      new Promise((resolver) => {
        resposta.pendentes.push(() => resolver({ ui: resposta.ui }))
      }),
  }
})

import LiveCapture from '../src/components/views/LiveCapture'
import { getSttQuality } from '../src/gateway/sttRouter'
import { escolherProcessamento } from '../src/lib/escolhaDoProcessamento'

beforeEach(() => {
  localStorage.clear()
  resposta.pendentes = []
})
afterEach(cleanup)

/** Espera a Captura pedir os ajustes (a resposta fica pendente até o teste liberá-la). */
const esperarPedido = () => waitFor(() => expect(resposta.pendentes.length).toBeGreaterThan(0))
/** Responde todos os pedidos, inclusive os que nascem da resposta anterior (o idioma também lê os ajustes). */
const responder = async () => {
  for (let i = 0; i < 5; i++) {
    const fila = resposta.pendentes.splice(0)
    await act(async () => fila.forEach((f) => f()))
    await act(async () => new Promise((r) => setTimeout(r, 10)))
  }
}

describe('hidratação da qualidade da transcrição na Captura', () => {
  it('sem escolha antes da resposta, a resposta vale', async () => {
    localStorage.setItem('babel.sttQuality', 'accurate')
    render(<LiveCapture onSave={() => undefined} />)
    await esperarPedido()
    await responder()
    expect(getSttQuality()).toBe('cloud')
  })

  it('escolher Aparelho antes da resposta: a resposta não sobrescreve', async () => {
    localStorage.setItem('babel.sttQuality', 'cloud')
    render(<LiveCapture onSave={() => undefined} />)
    await act(async () => {
      await escolherProcessamento('aparelho')
    })
    expect(getSttQuality()).toBe('accurate')
    await esperarPedido()
    await responder()
    expect(getSttQuality()).toBe('accurate')
  })
})
