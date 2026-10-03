// @vitest-environment jsdom
/**
 * O Smart Slow-Mo desacelera POR CIMA da velocidade escolhida (0,75× / 1× / 1,25×), sem sobrescrevê-la.
 * Antes ele gravava 0,8 ou 1,0 direto na velocidade, e com o Slow-Mo ligado o seletor parecia quebrado.
 */
import { renderHook } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'

import { type DepsDoPlayerDaSessao, usePlayerDaSessao } from '../src/lib/analise/playerDaSessao'
import type { FalaDaAnalise } from '../src/lib/analise/tiposDaAnalise'

const fala = (index: number, original: string): FalaDaAnalise => ({
  id: String(index),
  original,
  translation: '',
  lang: 'en',
  speaker: 'Sarah',
  time: '0:00',
  words: [],
  startTime: index * 5,
  index,
})

function montar(extra: Partial<DepsDoPlayerDaSessao>) {
  const falar = vi.fn()
  const deps = {
    parsedSentences: [
      fala(0, 'We cook dinner'),
      fala(1, 'Incomprehensibility characterizes extraordinarily complicated organizations'),
    ],
    hasRealAudio: false,
    audioSrc: null,
    audioRef: { current: null },
    activeSentenceIndexRef: { current: 0 },
    activeSentenceIndex: 0,
    currentTime: 0,
    isPlaying: true,
    playbackSpeed: 1.25,
    loopMode: false,
    autoSlowEnabled: true,
    ttsLang: 'en',
    seekNonce: 0,
    recordingId: 'r1',
    setCurrentTime: vi.fn(),
    setActiveSentenceIndex: vi.fn(),
    setSeekNonce: vi.fn(),
    setIsPlaying: vi.fn(),
    setPlaybackSpeed: vi.fn(),
    setAudioDuration: vi.fn(),
    setPeaks: vi.fn(),
    setShadowingSentenceIndex: vi.fn(),
    narrador: { falar, calar: vi.fn(), podeFalar: () => true },
    ...extra,
  } as unknown as DepsDoPlayerDaSessao
  renderHook(() => usePlayerDaSessao(deps))
  return { falar, deps }
}

describe('Smart Slow-Mo por cima da velocidade escolhida', () => {
  it('fala simples: a velocidade escolhida vale inteira', () => {
    const { falar, deps } = montar({ activeSentenceIndex: 0, activeSentenceIndexRef: { current: 0 } })
    expect(falar.mock.calls[0][1].rate).toBe(1.25)
    expect(deps.setPlaybackSpeed).not.toHaveBeenCalled()
  })

  it('fala com palavra difícil: desacelera a partir da escolhida, sem gravar nada no seletor', () => {
    const { falar, deps } = montar({ activeSentenceIndex: 1, activeSentenceIndexRef: { current: 1 } })
    expect(falar.mock.calls[0][1].rate).toBeCloseTo(1.0, 5)
    expect(deps.setPlaybackSpeed).not.toHaveBeenCalled()
  })

  it('com o Slow-Mo desligado, a palavra difícil não muda a velocidade', () => {
    const { falar } = montar({ activeSentenceIndex: 1, activeSentenceIndexRef: { current: 1 }, autoSlowEnabled: false })
    expect(falar.mock.calls[0][1].rate).toBe(1.25)
  })
})
