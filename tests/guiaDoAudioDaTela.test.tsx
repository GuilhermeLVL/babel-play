// @vitest-environment jsdom
/**
 * Correção E do diagnóstico do Safari (22/10/2026): o aviso "Este navegador não captura o som da tela"
 * tinha só "Entendi". Agora oferece "Usar o microfone", a saída que funciona no Safari e no Firefox; nos
 * outros casos o guia segue com "Escolher de novo" (e o loopback, quando existe).
 */
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import React from 'react'
import { afterEach, describe, expect, it, vi } from 'vitest'

import GuiaDoAudioDaTela from '../src/components/views/captura/GuiaDoAudioDaTela'

afterEach(() => cleanup())

function montar(codigo: string, podeUsarLoopback = false) {
  const acoes = {
    aoFechar: vi.fn(),
    aoUsarLoopback: vi.fn(),
    aoEscolherDeNovo: vi.fn(),
    aoUsarMicrofone: vi.fn(),
  }
  render(<GuiaDoAudioDaTela codigo={codigo} podeUsarLoopback={podeUsarLoopback} {...acoes} />)
  return acoes
}

describe('GuiaDoAudioDaTela', () => {
  it('navegador sem som da tela: "Usar o microfone" liga o microfone e começa; não oferece escolher de novo', () => {
    const acoes = montar('NAVEGADOR_SEM_AUDIO_DA_TELA')
    expect(screen.getByText('Este navegador não captura o som da tela')).toBeTruthy()
    expect(screen.queryByText('Escolher de novo')).toBeNull()
    fireEvent.click(screen.getByRole('button', { name: 'Usar o microfone' }))
    expect(acoes.aoUsarMicrofone).toHaveBeenCalledTimes(1)
    expect(acoes.aoEscolherDeNovo).not.toHaveBeenCalled()
  })

  it('"Entendi" só fecha', () => {
    const acoes = montar('NAVEGADOR_SEM_AUDIO_DA_TELA')
    fireEvent.click(screen.getByRole('button', { name: 'Entendi' }))
    expect(acoes.aoFechar).toHaveBeenCalledTimes(1)
    expect(acoes.aoUsarMicrofone).not.toHaveBeenCalled()
  })

  it('faltou marcar o áudio (Chrome): "Escolher de novo", sem o microfone', () => {
    const acoes = montar('SEM_AUDIO_COMPARTILHADO')
    expect(screen.queryByRole('button', { name: 'Usar o microfone' })).toBeNull()
    fireEvent.click(screen.getByRole('button', { name: 'Escolher de novo' }))
    expect(acoes.aoEscolherDeNovo).toHaveBeenCalledTimes(1)
  })

  it('Windows sem áudio da tela: "Escolher a aba" e, com loopback, "Usar o loopback"', () => {
    const acoes = montar('AUDIO_DA_TELA_INDISPONIVEL', true)
    fireEvent.click(screen.getByRole('button', { name: 'Usar o loopback' }))
    expect(acoes.aoUsarLoopback).toHaveBeenCalledTimes(1)
    expect(screen.getByRole('button', { name: 'Escolher a aba' })).toBeTruthy()
  })
})
