// @vitest-environment jsdom
/**
 * A FOLHA DO INÍCIO E A AJUDA DO MICROFONE (relato do dono no celular, 2026-09-28).
 *   · a pergunta "Rápido ou Privado?" antes de a sessão existir diz o que a opção marcada baixa AGORA
 *     (Rápido: nada para a sua voz; Privado: o nosso modelo), e o botão vira "Iniciar" ou "Baixar e
 *     iniciar"; o "Privado" avisa quando a legenda pode atrasar neste aparelho;
 *   · a ajuda do microfone mostra os passos daquele aparelho e só oferece "Trocar para Privado"
 *     quando quem falhou foi o Rápido.
 */
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import React from 'react'
import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest'

import AjudaDoMicrofone from '../src/components/views/captura/AjudaDoMicrofone'
import EscolhaDoMicrofone from '../src/components/views/captura/EscolhaDoMicrofone'
import { ajudaDoMic } from '../src/lib/captura/ajudaDoMicrofone'
import { prepararDialogoNoJsdom } from './_dialogoNoJsdom'

beforeAll(prepararDialogoNoJsdom)
afterEach(cleanup)

describe('folha do início (a pergunta do mic com o download real)', () => {
  function montar(inicio = { mbSePrivado: 80, mbSeRapido: 0, aparelhoLento: true }) {
    const props = { mb: 80, aoEscolher: vi.fn(), aoFechar: vi.fn(), inicio }
    render(<EscolhaDoMicrofone {...props} />)
    return props
  }

  it('Rápido: "Nada a baixar para começar" e o botão "Iniciar"', () => {
    const p = montar()
    fireEvent.click(screen.getByRole('button', { name: /Rápido/ }))
    expect(screen.getByTestId('download-da-escolha').textContent).toMatch(/Nada a baixar/)
    fireEvent.click(screen.getByRole('button', { name: 'Iniciar' }))
    expect(p.aoEscolher).toHaveBeenCalledWith('rapido')
  })

  it('Privado: o tamanho do nosso modelo e "Baixar e iniciar"', () => {
    const p = montar()
    fireEvent.click(screen.getByRole('button', { name: /Privado/ }))
    expect(screen.getByTestId('download-da-escolha').textContent).toMatch(/cerca de 80 MB/)
    fireEvent.click(screen.getByRole('button', { name: /Baixar e iniciar/ }))
    expect(p.aoEscolher).toHaveBeenCalledWith('privado')
  })

  it('aparelho lento: o Privado avisa que a legenda pode atrasar', () => {
    montar()
    expect(screen.getByRole('button', { name: /Privado/ }).textContent).toMatch(/pode atrasar/)
  })

  it('nenhuma opção marcada: sem linha de download e o botão desligado', () => {
    montar()
    expect(screen.queryByTestId('download-da-escolha')).toBeNull()
    expect((screen.getByRole('button', { name: 'Iniciar' }) as HTMLButtonElement).disabled).toBe(true)
  })
})

describe('ajuda do microfone', () => {
  it('permissão no Android: os passos numerados e "Tentar de novo" (sem trocar de motor)', () => {
    const aoTentarDeNovo = vi.fn()
    render(
      <AjudaDoMicrofone
        ajuda={ajudaDoMic('permissao', 'android', { motorRapido: false })}
        aoTentarDeNovo={aoTentarDeNovo}
        aoTrocarParaPrivado={vi.fn()}
        aoFechar={vi.fn()}
      />,
    )
    const d = screen.getByTestId('ajuda-do-microfone')
    expect(d.querySelectorAll('li').length).toBeGreaterThanOrEqual(2)
    expect(d.textContent).toMatch(/Configurações do site/)
    expect(screen.queryByRole('button', { name: /Trocar para Privado/ })).toBeNull()
    fireEvent.click(screen.getByRole('button', { name: /Tentar de novo/ }))
    expect(aoTentarDeNovo).toHaveBeenCalled()
  })

  it('o Rápido falhou (rede): "Trocar para Privado" em um toque', () => {
    const aoTrocarParaPrivado = vi.fn()
    render(
      <AjudaDoMicrofone
        ajuda={ajudaDoMic('rede', 'android', { motorRapido: true })}
        aoTentarDeNovo={vi.fn()}
        aoTrocarParaPrivado={aoTrocarParaPrivado}
        aoFechar={vi.fn()}
      />,
    )
    fireEvent.click(screen.getByRole('button', { name: /Trocar para Privado/ }))
    expect(aoTrocarParaPrivado).toHaveBeenCalled()
  })
})
