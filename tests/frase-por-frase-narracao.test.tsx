// @vitest-environment jsdom
/**
 * O modo "Frase por frase" na NARRAÇÃO por voz (sessão sem áudio gravado): `motor.falar` simulado repete N vezes, espera e
 * segue; com o modo desligado a narração é a de sempre.
 */
import { cleanup, renderHook } from '@testing-library/react'
import { act } from 'react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { aoFimDaFrase, type ConfigDeFrase } from '../src/core/learning/frasePorFrase'
import { usePlayerDaSessao } from '../src/lib/analise/playerDaSessao'
import type { FalaDaAnalise } from '../src/lib/analise/tiposDaAnalise'
import type { PontoDeFrasePorFrase } from '../src/lib/analise/usarFrasePorFrase'

const fala = (index: number, startTime: number): FalaDaAnalise =>
  ({
    id: `u${index}`,
    original: `original ${index}`,
    translation: '',
    lang: 'en',
    speaker: 'Ana',
    time: '',
    words: [],
    startTime,
    index,
  }) as FalaDaAnalise

const FALAS = [fala(0, 0), fala(1, 3), fala(2, 6)]

const onEnds: Array<() => void> = []
const motor = {
  falar: vi.fn((_t: string, o: { onEnd?: () => void }) => {
    if (o.onEnd) onEnds.push(o.onEnd)
  }),
  calar: vi.fn(),
  podeFalar: () => true,
}

function ponteCom(config: ConfigDeFrase): PontoDeFrasePorFrase {
  let feita = 0
  return {
    ativo: true,
    aoFim: (i, ms) => {
      const r = aoFimDaFrase(config, i, FALAS.length, feita, ms)
      feita = r.feita
      return r.acao
    },
  }
}

function montar(ponte: PontoDeFrasePorFrase | null) {
  const setIsPlaying = vi.fn()
  const ativo = { current: 0 }
  const hook = renderHook(() =>
    usePlayerDaSessao({
      parsedSentences: FALAS,
      hasRealAudio: false,
      audioSrc: null,
      audioRef: { current: null },
      activeSentenceIndexRef: ativo,
      activeSentenceIndex: 0,
      currentTime: 0,
      isPlaying: true,
      playbackSpeed: 1,
      frasePorFraseRef: { current: ponte },
      pararNoFimRef: { current: false },
      autoSlowEnabled: false,
      ttsLang: 'en',
      seekNonce: 0,
      recordingId: 'r1',
      setCurrentTime: vi.fn(),
      setActiveSentenceIndex: vi.fn(),
      setSeekNonce: vi.fn(),
      setAudioDuration: vi.fn(),
      setPeaks: vi.fn(),
      setShadowingSentenceIndex: vi.fn(),
      setIsPlaying,
      narrador: motor,
    } as never),
  )
  return { ...hook, setIsPlaying }
}

const textos = () => motor.falar.mock.calls.map((c) => c[0])

beforeEach(() => {
  onEnds.length = 0
  motor.falar.mockClear()
  vi.useFakeTimers()
})
afterEach(() => {
  cleanup()
  vi.useRealTimers()
})

describe('narração por voz com o modo ligado', () => {
  it('repete 2x, espera e segue para a fala seguinte', () => {
    montar(ponteCom({ repeticoes: 2, pausa: 1, pararNoFim: false }))
    expect(textos()).toEqual(['original 0'])
    act(() => onEnds[0]())
    expect(textos()).toEqual(['original 0', 'original 0']) // repetiu
    vi.setSystemTime(Date.now() + 1000)
    act(() => onEnds[1]()) // 2ª vez termina: espera ~1 s (duração medida)
    expect(textos()).toHaveLength(2)
    act(() => {
      vi.advanceTimersByTime(1500)
    })
    expect(textos()).toEqual(['original 0', 'original 0', 'original 1'])
  })

  it('"parar no fim" para o player e não fala a seguinte', () => {
    const { setIsPlaying } = montar(ponteCom({ repeticoes: 1, pausa: 1, pararNoFim: true }))
    act(() => onEnds[0]())
    expect(setIsPlaying).toHaveBeenCalledWith(false)
    expect(textos()).toEqual(['original 0'])
  })

  it('desmontar durante a pausa cancela a espera', () => {
    const { unmount } = montar(ponteCom({ repeticoes: 1, pausa: 1, pararNoFim: false }))
    act(() => onEnds[0]())
    unmount()
    act(() => {
      vi.advanceTimersByTime(10000)
    })
    expect(textos()).toEqual(['original 0'])
  })
})

describe('narração por voz com o modo desligado', () => {
  it('sem ponte, segue para a próxima fala como sempre', () => {
    montar(null)
    act(() => onEnds[0]())
    expect(textos()).toEqual(['original 0', 'original 1'])
  })

  it('ponte inativa também é a narração de sempre', () => {
    montar({ ativo: false, aoFim: () => ({ tipo: 'repetir' }) })
    act(() => onEnds[0]())
    expect(textos()).toEqual(['original 0', 'original 1'])
  })
})
