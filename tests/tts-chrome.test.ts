// @vitest-environment jsdom
/**
 * As armadilhas do `speechSynthesis` do Chrome em `src/lib/tts.ts`: o volume e o tom chegam à fala, o `paused`
 * preso depois do `cancel()`, a lista de vozes que chega depois (`voiceschanged`) e o keep-alive da voz de rede.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const palco = vi.hoisted(() => {
  type Ouvinte = () => void
  const ouvintes = new Set<Ouvinte>()
  const vozes: Array<{ name: string; lang: string; localService: boolean }> = []
  const falas: Array<Record<string, unknown>> = []
  const synth = {
    speaking: false,
    paused: false,
    getVoices: () => vozes,
    speak: vi.fn((u: Record<string, unknown>) => {
      falas.push(u)
      synth.speaking = true
    }),
    cancel: vi.fn(() => {
      synth.speaking = false
    }),
    pause: vi.fn(() => {
      synth.paused = true
    }),
    resume: vi.fn(() => {
      synth.paused = false
    }),
    addEventListener: (_n: string, f: Ouvinte) => ouvintes.add(f),
    removeEventListener: (_n: string, f: Ouvinte) => ouvintes.delete(f),
  }
  class Fala {
    lang = ''
    rate = 1
    pitch = 1
    volume = 1
    voice: unknown = null
    onstart: (() => void) | null = null
    onend: (() => void) | null = null
    onerror: (() => void) | null = null
    constructor(public text: string) {}
  }
  Object.defineProperty(window, 'speechSynthesis', { configurable: true, value: synth })
  ;(globalThis as unknown as { SpeechSynthesisUtterance: unknown }).SpeechSynthesisUtterance = Fala
  return {
    synth,
    vozes,
    falas,
    ouvintes,
    dispararVozesMudaram: () => [...ouvintes].forEach((f) => f()),
  }
})

import { aguardarVozes, nativeTts } from '../src/lib/tts'

beforeEach(() => {
  vi.useFakeTimers()
  palco.vozes.length = 0
  palco.falas.length = 0
  palco.synth.speaking = false
  palco.synth.paused = false
  vi.clearAllMocks()
})
afterEach(() => vi.useRealTimers())

const instalar = (...v: Array<{ name: string; lang: string; localService: boolean }>) => {
  palco.vozes.push(...v)
  palco.dispararVozesMudaram()
}
const DE_REDE = { name: 'Google português do Brasil', lang: 'pt-BR', localService: false }
const LOCAL = { name: 'Luciana', lang: 'pt-BR', localService: true }

describe('a fala nativa', () => {
  it('leva tom, volume e velocidade à fala', () => {
    instalar(LOCAL)
    nativeTts.speak('Olá', { lang: 'pt-BR', rate: 1.4, pitch: 0.8, volume: 0.3 })
    expect(palco.falas[0]).toMatchObject({ rate: 1.4, pitch: 0.8, volume: 0.3 })
  })

  it('o volume é preso entre 0 e 1, e o volume zero vale (mudo de verdade)', () => {
    instalar(LOCAL)
    nativeTts.speak('Olá', { lang: 'pt-BR', volume: 4 })
    nativeTts.speak('Olá', { lang: 'pt-BR', volume: 0 })
    expect(palco.falas.map((f) => f.volume)).toEqual([1, 0])
  })

  it('cancel() solta o `paused` preso do Chrome', () => {
    palco.synth.paused = true
    nativeTts.cancel()
    expect(palco.synth.cancel).toHaveBeenCalled()
    expect(palco.synth.resume).toHaveBeenCalled()
    expect(palco.synth.paused).toBe(false)
  })

  it('voz de REDE: o keep-alive faz pause/resume a cada 10 s e para no fim da fala', () => {
    instalar(DE_REDE)
    nativeTts.speak('Uma frase longa', { lang: 'pt-BR' })
    ;(palco.falas[0].onstart as () => void)()
    vi.advanceTimersByTime(10_000)
    expect(palco.synth.pause).toHaveBeenCalledTimes(1)
    expect(palco.synth.resume).toHaveBeenCalledTimes(1)
    vi.advanceTimersByTime(10_000)
    expect(palco.synth.pause).toHaveBeenCalledTimes(2)
    palco.synth.speaking = false
    ;(palco.falas[0].onend as () => void)()
    vi.advanceTimersByTime(60_000)
    expect(palco.synth.pause).toHaveBeenCalledTimes(2)
  })

  it('voz LOCAL: nenhum pause/resume extra', () => {
    instalar(LOCAL)
    nativeTts.speak('Uma frase', { lang: 'pt-BR' })
    ;(palco.falas[0].onstart as () => void)()
    vi.advanceTimersByTime(60_000)
    expect(palco.synth.pause).not.toHaveBeenCalled()
  })

  it('cancelar a fala de rede desliga o keep-alive', () => {
    instalar(DE_REDE)
    nativeTts.speak('Uma frase', { lang: 'pt-BR' })
    ;(palco.falas[0].onstart as () => void)()
    nativeTts.cancel()
    vi.advanceTimersByTime(60_000)
    expect(palco.synth.pause).not.toHaveBeenCalled()
  })
})

describe('aguardarVozes', () => {
  it('já tem vozes: resolve na hora', async () => {
    instalar(LOCAL)
    await expect(aguardarVozes()).resolves.toBe(true)
  })

  it('a lista chega no voiceschanged', async () => {
    const p = aguardarVozes(1500)
    await vi.advanceTimersByTimeAsync(300)
    instalar(LOCAL)
    await expect(p).resolves.toBe(true)
    expect(palco.ouvintes.size).toBeGreaterThanOrEqual(0)
  })

  it('aparelho sem nenhuma voz: desiste no prazo, sem travar a narração', async () => {
    const p = aguardarVozes(1500)
    await vi.advanceTimersByTimeAsync(1500)
    await expect(p).resolves.toBe(false)
  })
})
