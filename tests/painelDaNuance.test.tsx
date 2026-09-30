// @vitest-environment jsdom
/**
 * D6 (Fase D, 30/09/2026) — O PAINEL "TRADUÇÃO NUANCE" NOS AJUSTES.
 *
 *   · com a Nuance: registro padrão e variantes gravam nas preferências; o glossário lista e apaga;
 *   · sem a Nuance: as escolhas desligadas, o cadeado e o texto positivo, e o convite — nunca ao
 *     perfil protegido; o glossário continua listado e apagável (é dado da pessoa).
 */
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import React from 'react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import PainelDaNuance from '../src/components/views/ajustes/PainelDaNuance'
import { PADRAO, type Preferencias } from '../src/lib/preferencias'

const api = vi.hoisted(() => ({
  listarGlossario: vi.fn(),
  apagarDoGlossario: vi.fn(),
  fixarNoGlossario: vi.fn(),
  traduzirComNuance: vi.fn(),
  pedirAlternativas: vi.fn(),
}))
vi.mock('../src/data/apiDaNuance', () => api)

const plano = vi.hoisted(() => ({ traducaoNuance: true }))
vi.mock('../src/lib/entitlements', () => ({ getEntitlements: () => plano }))

const prefs = vi.hoisted(() => ({ atual: null as unknown, salvar: vi.fn() }))
vi.mock('../src/lib/preferencias', async (original) => {
  const real = await original<typeof import('../src/lib/preferencias')>()
  return {
    ...real,
    usePreferencias: () => prefs.atual,
    salvarPreferencias: (fn: (p: Preferencias) => Preferencias) => {
      prefs.atual = fn(prefs.atual as Preferencias)
      prefs.salvar(prefs.atual)
      return Promise.resolve(true)
    },
  }
})

const ENTRADAS = [
  { id: 'g1', termo: 'deadline', traducao: 'prazo', origem: 'en', destino: 'pt', atualizadoEm: 2 },
  { id: 'g2', termo: 'meetup', traducao: 'encontro', origem: 'en', destino: 'pt', atualizadoEm: 1 },
]

afterEach(cleanup)
beforeEach(() => {
  for (const f of Object.values(api)) f.mockReset()
  prefs.salvar.mockReset()
  prefs.atual = JSON.parse(JSON.stringify(PADRAO))
  plano.traducaoNuance = true
  api.listarGlossario.mockResolvedValue({ ok: true, valor: { entradas: ENTRADAS, limite: 500 } })
  api.apagarDoGlossario.mockResolvedValue({ ok: true, valor: true })
})

describe('com a Tradução Nuance', () => {
  it('registro padrão e variante gravam nas preferências', () => {
    render(<PainelDaNuance />)
    fireEvent.click(screen.getByRole('button', { name: 'Formal' }))
    fireEvent.click(screen.getByRole('button', { name: 'Portugal' }))
    expect(prefs.salvar).toHaveBeenCalledTimes(2)
    expect((prefs.atual as Preferencias).nuance).toEqual({
      registro: 'formal',
      variantes: { pt: 'pt-PT', es: 'es-419' },
    })
  })

  it('o glossário: lista com a contagem, e apagar tira a linha', async () => {
    render(<PainelDaNuance />)
    expect(await screen.findByText(/2 de 500/)).toBeTruthy()
    fireEvent.click(screen.getByRole('button', { name: 'Apagar "deadline" do glossário' }))
    await waitFor(() => expect(screen.queryByText('deadline')).toBeNull())
    expect(api.apagarDoGlossario).toHaveBeenCalledWith('g1')
    expect(screen.getByText('meetup')).toBeTruthy()
  })

  it('glossário vazio ensina onde fixar', async () => {
    api.listarGlossario.mockResolvedValue({ ok: true, valor: { entradas: [], limite: 500 } })
    render(<PainelDaNuance />)
    expect(await screen.findByText(/Nenhuma tradução fixada ainda/)).toBeTruthy()
  })
})

describe('sem a Tradução Nuance', () => {
  beforeEach(() => {
    plano.traducaoNuance = false
  })

  it('escolhas desligadas, texto positivo e o convite; o glossário continua apagável', async () => {
    const aoConhecer = vi.fn()
    render(<PainelDaNuance aoConhecer={aoConhecer} />)
    expect((screen.getByRole('button', { name: 'Formal' }) as HTMLButtonElement).disabled).toBe(true)
    const convite = screen.getByTestId('convite-da-nuance')
    expect(convite.textContent).toMatch(/Tradução rápida ao vivo/)
    expect(convite.textContent).not.toMatch(/%|qualidade/i)
    fireEvent.click(screen.getByRole('button', { name: /Conhecer o Premium/ }))
    expect(aoConhecer).toHaveBeenCalled()
    fireEvent.click(await screen.findByRole('button', { name: 'Apagar "meetup" do glossário' }))
    await waitFor(() => expect(api.apagarDoGlossario).toHaveBeenCalledWith('g2'))
  })

  it('perfil protegido (sem `aoConhecer`): sem o convite promocional', () => {
    render(<PainelDaNuance />)
    expect(screen.getByTestId('convite-da-nuance')).toBeTruthy()
    expect(screen.queryByRole('button', { name: /Premium/ })).toBeNull()
  })
})
