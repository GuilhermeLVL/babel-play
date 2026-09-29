// @vitest-environment jsdom
/**
 * O TRADUTOR DO APARELHO NÃO CARREGOU (WASM, memória — relato do dono no celular, 2026-09-29): a tela
 * diz isso com clareza, UMA vez, e oferece o tradutor pela internet (MyMemory) só com o consentimento
 * de nuvem dado ali — pelo mecanismo de sempre, com data. Nada liga sozinho; perfil protegido (menor)
 * não vê a oferta.
 */
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import React from 'react'
import { afterEach, describe, expect, it, vi } from 'vitest'

const estado = vi.hoisted(() => ({ consentiu: false, protegido: false, autorizar: vi.fn(async () => true) }))
vi.mock('../src/lib/consentimentoDeNuvem', () => ({
  useConsentimentoDeNuvem: () => ({ consentiu: estado.consentiu, autorizar: estado.autorizar }),
}))
vi.mock('../src/lib/protecaoDoMenor', () => ({ perfilProtegido: () => estado.protegido }))
vi.mock('../src/components/Toast', () => ({ toast: { ok: vi.fn(), warn: vi.fn() } }))

import AvisoDoTradutorLocal from '../src/components/views/captura/AvisoDoTradutorLocal'

afterEach(() => {
  cleanup()
  estado.consentiu = false
  estado.protegido = false
  estado.autorizar.mockClear()
})

describe('AvisoDoTradutorLocal', () => {
  it('diz que o tradutor não carregou e oferece a tradução pela internet, que só liga no toque', async () => {
    const aoAutorizar = vi.fn()
    render(<AvisoDoTradutorLocal aoAutorizar={aoAutorizar} aoFechar={vi.fn()} />)
    expect(screen.getByTestId('aviso-do-tradutor-local').textContent).toMatch(/não carregou/)
    expect(screen.getByTestId('aviso-do-tradutor-local').textContent).toMatch(/MyMemory/)
    expect(estado.autorizar).not.toHaveBeenCalled()
    fireEvent.click(screen.getByRole('button', { name: /Traduzir pela internet/ }))
    await vi.waitFor(() => expect(aoAutorizar).toHaveBeenCalledTimes(1))
    expect(estado.autorizar).toHaveBeenCalledTimes(1)
  })

  it('perfil protegido: o aviso, sem a oferta', () => {
    estado.protegido = true
    render(<AvisoDoTradutorLocal aoAutorizar={vi.fn()} aoFechar={vi.fn()} />)
    expect(screen.getByTestId('aviso-do-tradutor-local')).toBeTruthy()
    expect(screen.queryByRole('button', { name: /Traduzir pela internet/ })).toBeNull()
  })

  it('"Agora não" fecha', () => {
    const aoFechar = vi.fn()
    render(<AvisoDoTradutorLocal aoAutorizar={vi.fn()} aoFechar={aoFechar} />)
    fireEvent.click(screen.getByRole('button', { name: /Agora não/ }))
    expect(aoFechar).toHaveBeenCalled()
  })
})
