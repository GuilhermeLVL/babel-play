// @vitest-environment jsdom
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react'
import React from 'react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { useAvatarDaLegenda } from '../src/components/views/captura/legendas/AvatarDaLegenda'
import { esquecerPreferenciasDoModo, guardarPreferenciasDoModo } from '../src/lib/avatar/avatarDoModo'
import { publicarAvatarDoPip, useAvatarDoPip } from '../src/lib/avatar/avatarDoPip'
import { cancelSpeech, setTtsEngine, speak, type TtsEngine } from '../src/lib/tts'

const flags = vi.hoisted(() => ({ avatar_3d: true }))
vi.mock('../src/lib/flags', () => ({ useFlag: (k: string) => (flags as Record<string, boolean>)[k] === true }))
vi.mock('../src/lib/avatar/detectarTier', () => ({ detectarTier: () => 'medio', temWebGL2: () => true }))
vi.mock('../src/components/avatar/modo/AvatarDoModo', () => ({
  default: (p: { estado: string; dono: string }) => (
    <div data-testid="rosto" data-estado={p.estado} data-dono={p.dono} />
  ),
}))

interface Entrada {
  gravando: boolean
  pausado: boolean
  pensando: boolean
  interpreteAberto: boolean
}
function Harness(e: Entrada) {
  const a = useAvatarDaLegenda(e)
  const pip = useAvatarDoPip()
  return (
    <div>
      <span data-testid="sem-avatar">{a ? 'com' : 'sem'}</span>
      {a?.botao}
      {a?.dica}
      {a?.presenca}
      <span data-testid="pip">{pip.ativo ? `${pip.estados.outro}` : 'nenhum'}</span>
    </div>
  )
}
const base: Entrada = { gravando: true, pausado: false, pensando: false, interpreteAberto: false }

beforeEach(() => {
  localStorage.clear()
  esquecerPreferenciasDoModo()
  publicarAvatarDoPip(null)
  flags.avatar_3d = true
})
afterEach(() => {
  cleanup()
  publicarAvatarDoPip(null)
})

describe('avatar do modo legendar', () => {
  it('sem a flag não existe nada (a captura é a de antes)', () => {
    flags.avatar_3d = false
    render(<Harness {...base} />)
    expect(screen.getByTestId('sem-avatar').textContent).toBe('sem')
    expect(screen.getByTestId('pip').textContent).toBe('nenhum')
  })

  it('desligado: só o botão e a dica; nada de presença nem de janela flutuante', () => {
    render(<Harness {...base} />)
    expect(screen.getByTestId('botao-avatar-legenda')).toBeTruthy()
    expect(screen.getByTestId('dica-avatar-legenda')).toBeTruthy()
    expect(screen.queryByTestId('presenca-da-legenda')).toBeNull()
    expect(screen.getByTestId('pip').textContent).toBe('nenhum')
  })

  it('ligado: o estado vem do áudio e da tradução, sempre em texto, e a janela flutuante recebe o mesmo estado', () => {
    guardarPreferenciasDoModo('legenda', { ligado: true })
    const { rerender } = render(<Harness {...base} />)
    const texto = () => screen.getByTestId('avatar-da-legenda-estado').textContent
    expect(texto()).toBe('Ouvindo')
    expect(screen.getByTestId('rosto').getAttribute('data-estado')).toBe('ouvindo')
    expect(screen.getByTestId('pip').textContent).toBe('ouvindo')
    rerender(<Harness {...base} pensando />)
    expect(texto()).toBe('Traduzindo')
    expect(screen.getByTestId('pip').textContent).toBe('pensando')
    rerender(<Harness {...base} pausado />)
    expect(texto()).toBe('Em repouso')
    rerender(<Harness {...base} gravando={false} />)
    expect(texto()).toBe('Em repouso')
  })

  it('"mostrar também na janela flutuante" desligado não publica nada para ela', () => {
    guardarPreferenciasDoModo('legenda', { ligado: true, noPip: false })
    render(<Harness {...base} />)
    expect(screen.getByTestId('presenca-da-legenda')).toBeTruthy()
    expect(screen.getByTestId('pip').textContent).toBe('nenhum')
  })

  it('com o Intérprete aberto este avatar se cala e não toma a janela flutuante dele', () => {
    guardarPreferenciasDoModo('legenda', { ligado: true })
    const { rerender } = render(<Harness {...base} />)
    expect(screen.getByTestId('pip').textContent).toBe('ouvindo')
    rerender(<Harness {...base} interpreteAberto />)
    expect(screen.queryByTestId('presenca-da-legenda')).toBeNull()
    expect(screen.getByTestId('pip').textContent).toBe('nenhum')
  })

  it('desligar em um toque tira a presença e limpa a janela flutuante', () => {
    guardarPreferenciasDoModo('legenda', { ligado: true })
    render(<Harness {...base} />)
    fireEvent.click(screen.getByTestId('botao-avatar-legenda'))
    expect(screen.queryByTestId('presenca-da-legenda')).toBeNull()
    expect(screen.getByTestId('pip').textContent).toBe('nenhum')
  })

  it('a fala pelo ponto único deixa o avatar "falando" e some a envoltura ao desligar', () => {
    guardarPreferenciasDoModo('legenda', { ligado: true })
    let aoComecar: (() => void) | undefined
    let aoTerminar: (() => void) | undefined
    const motor: TtsEngine = {
      speak: (_t, o) => {
        aoComecar = o?.onStart
        aoTerminar = o?.onEnd
      },
      cancel: vi.fn(),
    }
    setTtsEngine(motor)
    render(<Harness {...base} />)
    act(() => speak('hello', { lang: 'en-US' }))
    act(() => aoComecar?.())
    expect(screen.getByTestId('avatar-da-legenda-estado').textContent).toBe('Lendo em voz alta')
    act(() => aoTerminar?.())
    expect(screen.getByTestId('avatar-da-legenda-estado').textContent).toBe('Ouvindo')
    fireEvent.click(screen.getByTestId('botao-avatar-legenda')) // desliga
    const direto = vi.fn()
    setTtsEngine({ speak: direto, cancel: vi.fn() })
    speak('x', { lang: 'en-US' })
    cancelSpeech()
    expect(direto).toHaveBeenCalledOnce()
  })
})
