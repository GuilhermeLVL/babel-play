// @vitest-environment jsdom
/**
 * O hook do modo "Frase por frase": liga a máquina pura ao `<audio>` (repetir, esperar, seguir, parar) e à narração por
 * voz (ponte `aoFim`). Com a flag desligada não faz nada.
 */
import { act, cleanup, renderHook } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import type { FalaDaAnalise } from '../src/lib/analise/tiposDaAnalise'
import { type PontoDeFrasePorFrase, useFrasePorFrase } from '../src/lib/analise/usarFrasePorFrase'

const mundo = vi.hoisted(() => ({ flag: true }))
vi.mock('../src/lib/flags', () => ({ useFlag: () => mundo.flag }))

const fala = (index: number, startTime: number): FalaDaAnalise =>
  ({
    id: `u${index}`,
    original: `original ${index}`,
    translation: `tradução ${index}`,
    lang: 'en',
    speaker: 'Ana',
    time: '',
    words: [],
    startTime,
    index,
  }) as FalaDaAnalise

const FALAS = [fala(0, 0), fala(1, 3), fala(2, 6)]

function audioFalso() {
  const a = document.createElement('audio')
  const estado = { t: 0, paused: false }
  Object.defineProperty(a, 'currentTime', {
    get: () => estado.t,
    set: (v: number) => (estado.t = v),
    configurable: true,
  })
  Object.defineProperty(a, 'paused', { get: () => estado.paused, configurable: true })
  Object.defineProperty(a, 'duration', { get: () => 9, configurable: true })
  Object.defineProperty(a, 'playbackRate', { value: 1, writable: true, configurable: true })
  a.pause = vi.fn(() => {
    estado.paused = true
  })
  a.play = vi.fn(() => {
    estado.paused = false
    return Promise.resolve()
  })
  return { a, estado }
}

function montar(extra: { hasRealAudio?: boolean; permitido?: boolean; falas?: FalaDaAnalise[] } = {}) {
  const { a, estado } = audioFalso()
  const setIsPlaying = vi.fn()
  const ponte = { current: null as PontoDeFrasePorFrase | null }
  const audioRef = { current: a }
  const h = renderHook(() =>
    useFrasePorFrase({
      falas: extra.falas ?? FALAS,
      hasRealAudio: extra.hasRealAudio ?? true,
      audioRef,
      audioDuration: 9,
      isPlaying: true,
      setIsPlaying,
      permitido: extra.permitido ?? true,
      ponteDoPlayer: ponte,
    }),
  )
  return { h, a, estado, setIsPlaying, ponte }
}

const nosFinsDe = (a: HTMLAudioElement, estado: { t: number }, t: number) => {
  estado.t = t
  act(() => {
    a.dispatchEvent(new Event('timeupdate'))
  })
}

beforeEach(() => {
  mundo.flag = true
  localStorage.clear()
  vi.useFakeTimers()
})
afterEach(() => {
  cleanup()
  vi.useRealTimers()
})

describe('áudio gravado', () => {
  it('repete 2x, espera a duração da frase e segue para a próxima', () => {
    const { h, a, estado } = montar()
    act(() => {
      h.result.current.ligar(true)
      h.result.current.mudar({ repeticoes: 2 })
    })
    expect(h.result.current.ativo).toBe(true)

    nosFinsDe(a, estado, 2.98) // fim da frase 0 (1ª vez): repete
    expect(estado.t).toBe(0)
    expect(a.pause).not.toHaveBeenCalled()

    nosFinsDe(a, estado, 2.98) // 2ª vez: espera 3 s
    expect(a.pause).toHaveBeenCalledTimes(1)
    expect(h.result.current.esperando).toBe(true)
    expect(h.result.current.fraseDaPausa).toBe(0)

    act(() => {
      vi.advanceTimersByTime(2999)
    })
    expect(a.play).not.toHaveBeenCalled()
    act(() => {
      vi.advanceTimersByTime(2)
    })
    expect(estado.t).toBe(3)
    expect(a.play).toHaveBeenCalledTimes(1)
    expect(h.result.current.esperando).toBe(false)
  })

  it('a pausa acompanha o fator escolhido', () => {
    const { h, a, estado } = montar()
    act(() => {
      h.result.current.ligar(true)
      h.result.current.mudar({ pausa: 0.5 })
    })
    nosFinsDe(a, estado, 2.98)
    act(() => {
      vi.advanceTimersByTime(1499)
    })
    expect(a.play).not.toHaveBeenCalled()
    act(() => {
      vi.advanceTimersByTime(2)
    })
    expect(a.play).toHaveBeenCalled()
  })

  it('"parar no fim" pausa um fio antes da seguinte e para o player', () => {
    const { h, a, estado, setIsPlaying } = montar()
    act(() => {
      h.result.current.ligar(true)
      h.result.current.mudar({ pararNoFim: true })
    })
    nosFinsDe(a, estado, 3.01 - 0.05)
    expect(a.pause).toHaveBeenCalled()
    expect(setIsPlaying).toHaveBeenCalledWith(false)
    expect(estado.t).toBeCloseTo(2.95, 2)
  })

  it('na última frase, para', () => {
    const { h, a, estado, setIsPlaying } = montar()
    act(() => h.result.current.ligar(true))
    nosFinsDe(a, estado, 8.98)
    expect(setIsPlaying).toHaveBeenCalledWith(false)
    expect(a.play).not.toHaveBeenCalled()
  })

  it('"Já repeti, seguir" termina a pausa na hora', () => {
    const { h, a, estado } = montar()
    act(() => h.result.current.ligar(true))
    nosFinsDe(a, estado, 2.98)
    expect(h.result.current.esperando).toBe(true)
    act(() => h.result.current.seguirAgora())
    expect(estado.t).toBe(3)
    expect(a.play).toHaveBeenCalled()
  })

  it('buscar por conta própria durante a pausa desfaz a espera e toca de onde foi', () => {
    const { h, a, estado } = montar()
    act(() => h.result.current.ligar(true))
    nosFinsDe(a, estado, 2.98)
    expect(h.result.current.esperando).toBe(true)
    // o seek do próprio hook já disparou 'seeking' uma vez; o seguinte é da pessoa
    act(() => {
      a.dispatchEvent(new Event('seeking'))
      a.dispatchEvent(new Event('seeking'))
    })
    expect(h.result.current.esperando).toBe(false)
    expect(a.play).toHaveBeenCalledTimes(1)
    act(() => {
      vi.advanceTimersByTime(10000)
    })
    expect(a.play).toHaveBeenCalledTimes(1)
  })

  it('voltar o foco da aba termina a pausa que já venceu', () => {
    const { h, a, estado } = montar()
    act(() => h.result.current.ligar(true))
    nosFinsDe(a, estado, 2.98)
    vi.setSystemTime(Date.now() + 4000) // o relógio da aba foi estrangulado: o timer não correu
    act(() => {
      document.dispatchEvent(new Event('visibilitychange'))
    })
    expect(a.play).toHaveBeenCalledTimes(1)
    expect(estado.t).toBe(3)
  })

  it('tempos ruins: o modo não liga e diz o motivo', () => {
    const { h, a, estado } = montar({ falas: [fala(0, 0), fala(1, 40), fala(2, 42)] })
    act(() => h.result.current.ligar(true))
    expect(h.result.current.tempos.usavel).toBe(false)
    expect(h.result.current.ativo).toBe(false)
    nosFinsDe(a, estado, 39.98)
    expect(a.pause).not.toHaveBeenCalled()
  })
})

describe('flag, escuta guiada e armazenamento', () => {
  it('flag desligada: indisponível e o áudio segue como sempre', () => {
    mundo.flag = false
    const { h, a, estado } = montar()
    act(() => h.result.current.ligar(true))
    expect(h.result.current.disponivel).toBe(false)
    expect(h.result.current.ativo).toBe(false)
    nosFinsDe(a, estado, 2.98)
    expect(a.pause).not.toHaveBeenCalled()
    expect(estado.t).toBe(2.98)
  })

  it('com a escuta guiada ligada (permitido=false) o modo não vale', () => {
    const { h } = montar({ permitido: false })
    act(() => h.result.current.ligar(true))
    expect(h.result.current.disponivel).toBe(false)
  })

  it('a escolha fica no aparelho e volta na visita seguinte', () => {
    const a = montar()
    act(() => {
      a.h.result.current.ligar(true)
      a.h.result.current.mudar({ repeticoes: 3, pausa: 1.5 })
    })
    cleanup()
    const b = montar()
    expect(b.h.result.current.escolha).toMatchObject({ ligado: true, repeticoes: 3, pausa: 1.5 })
  })

  it('sem armazenamento: funciona com os valores padrão', () => {
    const real = Storage.prototype.getItem
    const grava = Storage.prototype.setItem
    Storage.prototype.getItem = () => {
      throw new Error('bloqueado')
    }
    Storage.prototype.setItem = () => {
      throw new Error('bloqueado')
    }
    try {
      const { h } = montar()
      expect(h.result.current.escolha).toMatchObject({ ligado: false, repeticoes: 1, pausa: 1 })
      act(() => h.result.current.ligar(true))
      expect(h.result.current.escolha.ligado).toBe(true)
    } finally {
      Storage.prototype.getItem = real
      Storage.prototype.setItem = grava
    }
  })
})

describe('narração por voz (sem áudio gravado)', () => {
  it('entrega a ponte: repete N vezes, espera e segue; última frase para', () => {
    const { h, ponte } = montar({ hasRealAudio: false })
    act(() => {
      h.result.current.ligar(true)
      h.result.current.mudar({ repeticoes: 2 })
    })
    expect(ponte.current?.ativo).toBe(true)
    expect(ponte.current!.aoFim(0, 2000)).toEqual({ tipo: 'repetir' })
    expect(ponte.current!.aoFim(0, 2000)).toEqual({ tipo: 'esperar', ms: 2000 })
    expect(ponte.current!.aoFim(1, 1000)).toEqual({ tipo: 'repetir' })
    expect(ponte.current!.aoFim(1, 1000)).toEqual({ tipo: 'esperar', ms: 1000 })
    expect(ponte.current!.aoFim(2, 1000)).toEqual({ tipo: 'repetir' })
    expect(ponte.current!.aoFim(2, 1000)).toEqual({ tipo: 'parar' })
  })

  it('desligado ou com flag desligada, a ponte fica vazia', () => {
    const { ponte, h } = montar({ hasRealAudio: false })
    expect(ponte.current).toBeNull()
    act(() => h.result.current.ligar(true))
    expect(ponte.current).not.toBeNull()
  })

  it('não exige tempos bons: a narração é fala a fala', () => {
    const { h } = montar({ hasRealAudio: false, falas: [fala(0, 0), fala(1, 40)] })
    act(() => h.result.current.ligar(true))
    expect(h.result.current.ativo).toBe(true)
  })
})
