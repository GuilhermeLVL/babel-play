// @vitest-environment jsdom
/**
 * A TRADUÇÃO NUANCE NAS FOLHAS DA CAPTURA (Fase D, 30/09/2026).
 *
 *   · D3 — "Sempre traduzir assim" na folha da palavra: com a Nuance, confirma (ou corrige) a glosa e
 *     grava no glossário; sem ela, o MESMO botão, com cadeado, abre o texto positivo e o convite;
 *   · o perfil protegido (menor) nunca recebe o convite promocional — vê o cadeado e o texto;
 *   · o texto do Grátis é positivo ("Tradução rápida ao vivo") e não vende "% de qualidade".
 */
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import React from 'react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import NuanceDaPalavra from '../src/components/views/captura/nuance/NuanceDaPalavra'

const api = vi.hoisted(() => ({
  fixarNoGlossario: vi.fn(),
  traduzirComNuance: vi.fn(),
  pedirAlternativas: vi.fn(),
  listarGlossario: vi.fn(),
  apagarDoGlossario: vi.fn(),
}))
vi.mock('../src/data/apiDaNuance', () => api)

afterEach(cleanup)
beforeEach(() => {
  for (const f of Object.values(api)) f.mockReset()
})

/** O que o Grátis lê não pode vender "qualidade" nem porcentagem (decisão do dono, C7). */
function semVendaDeQualidade(el: HTMLElement) {
  expect(el.textContent ?? '').not.toMatch(/%|qualidade/i)
}

describe('D3 — "Sempre traduzir assim" na folha da palavra', () => {
  it('com a Nuance: o campo vem com a glosa, e fixar grava no glossário com os idiomas', async () => {
    api.fixarNoGlossario.mockResolvedValue({
      ok: true,
      valor: { id: 'g1', termo: 'deadline', traducao: 'data-limite', origem: 'en', destino: 'pt', atualizadoEm: 1 },
    })
    render(<NuanceDaPalavra palavra="deadline" lang="en-US" glosa="prazo" destino="pt-BR" disponivel />)
    fireEvent.click(screen.getByRole('button', { name: /Sempre traduzir assim/ }))
    const campo = screen.getByLabelText('Traduzir sempre como') as HTMLInputElement
    expect(campo.value).toBe('prazo')
    fireEvent.change(campo, { target: { value: 'data-limite' } })
    fireEvent.click(screen.getByRole('button', { name: /Fixar no glossário/ }))
    await waitFor(() => expect(screen.getByRole('status').textContent).toMatch(/data-limite/))
    expect(api.fixarNoGlossario).toHaveBeenCalledWith({
      termo: 'deadline',
      traducao: 'data-limite',
      origem: 'en-US',
      destino: 'pt-BR',
    })
  })

  it('o glossário cheio diz o que fazer', async () => {
    api.fixarNoGlossario.mockResolvedValue({ ok: false, motivo: 'glossario_cheio', status: 409 })
    render(<NuanceDaPalavra palavra="deadline" lang="en" glosa="prazo" destino="pt" disponivel />)
    fireEvent.click(screen.getByRole('button', { name: /Sempre traduzir assim/ }))
    fireEvent.click(screen.getByRole('button', { name: /Fixar no glossário/ }))
    await waitFor(() => expect(screen.getByRole('status').textContent).toMatch(/500 entradas/))
  })

  it('sem a Nuance: o botão com cadeado abre o texto positivo e o convite, sem gravar nada', () => {
    const aoConhecer = vi.fn()
    render(
      <NuanceDaPalavra
        palavra="deadline"
        lang="en"
        glosa="prazo"
        destino="pt"
        disponivel={false}
        aoConhecer={aoConhecer}
      />,
    )
    fireEvent.click(screen.getByRole('button', { name: /Sempre traduzir assim/ }))
    const convite = screen.getByTestId('convite-da-nuance')
    expect(convite.textContent).toMatch(/Tradução rápida ao vivo/)
    semVendaDeQualidade(convite)
    fireEvent.click(screen.getByRole('button', { name: /Conhecer o Premium/ }))
    expect(aoConhecer).toHaveBeenCalledTimes(1)
    expect(screen.queryByLabelText('Traduzir sempre como')).toBeNull()
    expect(api.fixarNoGlossario).not.toHaveBeenCalled()
  })

  it('perfil protegido (sem `aoConhecer`): o cadeado e o texto, nunca o convite promocional', () => {
    render(<NuanceDaPalavra palavra="deadline" lang="en" glosa="prazo" destino="pt" disponivel={false} />)
    fireEvent.click(screen.getByRole('button', { name: /Sempre traduzir assim/ }))
    expect(screen.getByTestId('convite-da-nuance')).toBeTruthy()
    expect(screen.queryByRole('button', { name: /Premium/ })).toBeNull()
  })

  it('termo que não cabe no glossário (mais de 80 caracteres): sem o botão', () => {
    render(<NuanceDaPalavra palavra={'a'.repeat(81)} lang="en" glosa="x" destino="pt" disponivel />)
    expect(screen.queryByRole('button', { name: /Sempre traduzir assim/ })).toBeNull()
  })
})
