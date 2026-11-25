// @vitest-environment jsdom
/**
 * A CONVERSA VIRTUAL NO TETO DE VOZ (`interprete-conversa-virtual`, tarefa 1.9): a voz da nuvem acaba no meio da
 * conversa (cota do mês ou uso justo do dia) e a conversa continua SÓ COM LEGENDA, com a tela dizendo por quê.
 * Falhas da vez (rede, prazo) não mudam o modo. A faixa também mostra os minutos de conversa.
 */
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { ehTetoDeVoz, minutosDaConversa, somarTempoAtivo } from '../src/core/conversaVirtual'

const nuvem = vi.hoisted(() => ({
  aoRecuar: undefined as ((motivo: string) => void) | undefined,
  falas: [] as string[],
}))
vi.mock('../src/lib/voz/vozDaNuvem', () => ({
  destravarVozDaNuvem: () => {},
  criarVozDaNuvem: (o: { aoRecuar?: (motivo: string) => void }) => {
    nuvem.aoRecuar = o.aoRecuar
    return {
      speak: (texto: string, opts: { onStart?: () => void; onEnd?: () => void }) => {
        nuvem.falas.push(texto)
        opts.onStart?.()
        opts.onEnd?.()
      },
      cancel: () => {},
      isSpeaking: () => false,
      motorDaUltimaFala: () => 'voz-da-nuvem',
    }
  },
}))
vi.mock('../src/lib/voz/motorPorPreferencia', () => ({
  criarMotorPorPreferencia: ({ nuvem: n }: { nuvem: unknown }) => n,
}))

import ConversaVirtual from '../src/components/views/captura/interprete/ConversaVirtual'
import type { PonteDoInterprete } from '../src/lib/captura/controleDoInterprete'
import { mudarEstadoDaTela } from '../src/lib/polimento/interprete'

beforeEach(() => {
  nuvem.aoRecuar = undefined
  nuvem.falas.length = 0
  localStorage.clear()
  mudarEstadoDaTela({ emCurso: false, trocados: false, folhaVirtual: false, depois: null })
})
afterEach(() => {
  cleanup()
  vi.useRealTimers()
})

function montar() {
  const ponte: { atual: PonteDoInterprete | null } = { atual: null }
  render(
    <ConversaVirtual
      idiomas={{ meu: 'pt-BR', outro: 'en-US' }}
      falas={[]}
      registrarPonte={(p) => {
        ponte.atual = p
      }}
      fontes={{ sistemaAtivo: () => true, microfoneAtivo: () => false }}
      abrirSistema={() => {}}
      alternarMicrofone={() => {}}
      vozNaturalDisponivel
      aoSair={() => {}}
    />,
  )
  return ponte
}

describe('regras puras da conversa virtual', () => {
  it('só a cota do mês e o uso justo do dia são teto', () => {
    expect(ehTetoDeVoz('cota')).toBe(true)
    expect(ehTetoDeVoz('uso-justo')).toBe(true)
    for (const m of ['rede', 'prazo', 'ocupada', 'servidor', 'plano', 'pausada']) expect(ehTetoDeVoz(m), m).toBe(false)
  })

  it('conta minutos inteiros, ignora pausa e valores inválidos', () => {
    expect(minutosDaConversa(59_999)).toBe(0)
    expect(minutosDaConversa(125_000)).toBe(2)
    expect(minutosDaConversa(-5)).toBe(0)
    expect(minutosDaConversa(Number.NaN)).toBe(0)
    expect(somarTempoAtivo(1000, 500, true)).toBe(1500)
    expect(somarTempoAtivo(1000, 500, false)).toBe(1000)
  })
})

describe('ConversaVirtual: teto de voz no meio da conversa', () => {
  it('mostra os minutos de conversa na faixa', () => {
    montar()
    expect(screen.getByTestId('aviso-do-interprete').textContent).toBe('0 min de conversa')
  })

  it('cota zerada com a leitura ligada: cai para só legenda, diz o motivo e não deixa religar', () => {
    montar()
    fireEvent.click(screen.getByTestId('ler-em-voz-alta'))
    expect(screen.getByTestId('ler-em-voz-alta').getAttribute('aria-pressed')).toBe('true')
    act(() => nuvem.aoRecuar!('cota'))
    expect(screen.getByTestId('ler-em-voz-alta').getAttribute('aria-pressed')).toBe('false')
    expect(screen.getByTestId('voz-em-uso').textContent).toBe('Só legenda')
    expect(screen.getByTestId('aviso-do-interprete').textContent).toBe(
      'A voz acabou por agora. A conversa segue só com legenda.',
    )
    fireEvent.click(screen.getByTestId('ler-em-voz-alta'))
    expect(screen.getByTestId('ler-em-voz-alta').getAttribute('aria-pressed')).toBe('false')
  })

  it('uma falha da vez (rede) não tira a voz', () => {
    montar()
    fireEvent.click(screen.getByTestId('ler-em-voz-alta'))
    act(() => nuvem.aoRecuar!('rede'))
    expect(screen.getByTestId('ler-em-voz-alta').getAttribute('aria-pressed')).toBe('true')
  })
})
