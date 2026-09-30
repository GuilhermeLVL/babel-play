// @vitest-environment jsdom
/**
 * A OFERTA DA NUVEM DE ALÍVIO (A10): "Usar a nuvem grátis (restam X)", só quando o aparelho não
 * aguenta. O que se prende:
 *  - diz o que acontece (o áudio das falas vai para a transcrição no servidor) e quanto resta;
 *  - o toque registra o consentimento de nuvem PELO MECANISMO DE SEMPRE (com data) quando ele ainda
 *    não foi dado, e só então aceita o alívio — nada liga sozinho;
 *  - "Agora não" dispensa pela aba;
 *  - não empurra venda: nada de plano, assinatura ou preço no texto.
 */
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import React from 'react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const estado = vi.hoisted(() => ({ consentiu: false, autorizar: vi.fn(async () => true) }))
vi.mock('../src/lib/consentimentoDeNuvem', () => ({
  useConsentimentoDeNuvem: () => ({ consentiu: estado.consentiu, autorizar: estado.autorizar }),
}))
vi.mock('../src/components/Toast', () => ({ toast: { ok: vi.fn(), warn: vi.fn() } }))

import OfertaDaNuvemDeAlivio from '../src/components/views/captura/OfertaDaNuvemDeAlivio'
import { _reiniciarAlivio, alivioAceito, alivioDispensado } from '../src/lib/nuvemDeAlivio/estado'

beforeEach(() => {
  _reiniciarAlivio()
  estado.consentiu = false
  estado.autorizar.mockReset()
  estado.autorizar.mockResolvedValue(true)
})
afterEach(() => cleanup())

describe('OfertaDaNuvemDeAlivio', () => {
  it('diz que o aparelho não está dando conta, o que a nuvem faz e quanto resta', () => {
    render(
      <OfertaDaNuvemDeAlivio motivo="travamento" restanteSegundos={9_600} aoAceitar={vi.fn()} aoFechar={vi.fn()} />,
    )
    const faixa = screen.getByTestId('oferta-da-nuvem-de-alivio')
    expect(faixa.textContent).toMatch(/não está dando conta/)
    expect(faixa.textContent).toMatch(/servidor/)
    expect(screen.getByRole('button', { name: /Usar a nuvem grátis \(restam 2 h 40 min\)/ })).toBeTruthy()
  })

  it('sem consentimento: o toque registra a autorização (com data) e só então aceita', async () => {
    const aoAceitar = vi.fn()
    render(
      <OfertaDaNuvemDeAlivio motivo="aparelho" restanteSegundos={10_800} aoAceitar={aoAceitar} aoFechar={vi.fn()} />,
    )
    expect(alivioAceito()).toBe(false)
    fireEvent.click(screen.getByRole('button', { name: /Usar a nuvem grátis/ }))
    await vi.waitFor(() => expect(aoAceitar).toHaveBeenCalledTimes(1))
    expect(estado.autorizar).toHaveBeenCalledTimes(1)
    expect(alivioAceito()).toBe(true)
  })

  it('a autorização falhou: não aceita nada', async () => {
    estado.autorizar.mockResolvedValue(false)
    const aoAceitar = vi.fn()
    render(
      <OfertaDaNuvemDeAlivio motivo="aparelho" restanteSegundos={10_800} aoAceitar={aoAceitar} aoFechar={vi.fn()} />,
    )
    fireEvent.click(screen.getByRole('button', { name: /Usar a nuvem grátis/ }))
    await vi.waitFor(() => expect(estado.autorizar).toHaveBeenCalled())
    expect(aoAceitar).not.toHaveBeenCalled()
    expect(alivioAceito()).toBe(false)
  })

  it('com o consentimento já dado, aceita sem perguntar de novo', async () => {
    estado.consentiu = true
    const aoAceitar = vi.fn()
    render(
      <OfertaDaNuvemDeAlivio motivo="aparelho" restanteSegundos={10_800} aoAceitar={aoAceitar} aoFechar={vi.fn()} />,
    )
    fireEvent.click(screen.getByRole('button', { name: /Usar a nuvem grátis/ }))
    await vi.waitFor(() => expect(aoAceitar).toHaveBeenCalledTimes(1))
    expect(estado.autorizar).not.toHaveBeenCalled()
  })

  it('"Agora não" dispensa pela aba e fecha', () => {
    const aoFechar = vi.fn()
    render(
      <OfertaDaNuvemDeAlivio motivo="aparelho" restanteSegundos={10_800} aoAceitar={vi.fn()} aoFechar={aoFechar} />,
    )
    fireEvent.click(screen.getByRole('button', { name: /Agora não/ }))
    expect(aoFechar).toHaveBeenCalled()
    expect(alivioDispensado()).toBe(true)
  })

  it('não empurra venda nem usa emoji', () => {
    render(<OfertaDaNuvemDeAlivio motivo="travamento" restanteSegundos={600} aoAceitar={vi.fn()} aoFechar={vi.fn()} />)
    const texto = screen.getByTestId('oferta-da-nuvem-de-alivio').textContent ?? ''
    expect(texto).not.toMatch(/plano|assin|premium|R\$/i)
    expect(texto).not.toMatch(/\p{Extended_Pictographic}/u)
  })
})
