// @vitest-environment jsdom
/**
 * O motor de fala nunca usa voz recusada (`core/voz/melhorVoz.ts`): nem pela escolha automática, nem por uma preferência
 * gravada, nem pelo padrão do navegador. Sem voz aceita no idioma, não fala e avisa "sem voz".
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const palco = vi.hoisted(() => {
  type Ouvinte = () => void
  const ouvintes = new Set<Ouvinte>()
  const vozes: Array<{ name: string; lang: string; localService: boolean; voiceURI?: string }> = []
  const falas: Array<Record<string, unknown>> = []
  const synth = {
    speaking: false,
    paused: false,
    getVoices: () => vozes,
    speak: vi.fn((u: Record<string, unknown>) => {
      falas.push(u)
    }),
    cancel: vi.fn(),
    pause: vi.fn(),
    resume: vi.fn(),
    addEventListener: (_n: string, f: Ouvinte) => ouvintes.add(f),
    removeEventListener: (_n: string, f: Ouvinte) => ouvintes.delete(f),
  }
  class Fala {
    lang = ''
    voice: unknown = null
    onstart: (() => void) | null = null
    onend: (() => void) | null = null
    onerror: (() => void) | null = null
    constructor(public text: string) {}
  }
  Object.defineProperty(window, 'speechSynthesis', { configurable: true, value: synth })
  ;(globalThis as unknown as { SpeechSynthesisUtterance: unknown }).SpeechSynthesisUtterance = Fala
  return { synth, vozes, falas, dispararVozesMudaram: () => [...ouvintes].forEach((f) => f()) }
})

import { aoFaltarVoz, hasVoiceFor, nativeTts, pickVoice, setVoicePref, voicesFor } from '../src/lib/tts'
import { vozDoAparelhoExiste } from '../src/lib/voz/preferenciaDeVoz'

const EDDY = { name: 'Eddy (Português (Brasil))', lang: 'pt-BR', localService: true }
const LUCIANA = { name: 'Luciana', lang: 'pt-BR', localService: true }
const ALBERT = { name: 'Albert', lang: 'en-US', localService: true }
const SAMANTHA = { name: 'Samantha', lang: 'en-US', localService: true }

const instalar = (...v: typeof palco.vozes) => {
  palco.vozes.length = 0
  palco.vozes.push(...v)
  palco.dispararVozesMudaram()
}

beforeEach(() => {
  vi.useFakeTimers()
  palco.falas.length = 0
  vi.clearAllMocks()
  localStorage.clear()
})
afterEach(() => vi.useRealTimers())

describe('pickVoice e o catálogo só com vozes aceitas', () => {
  it('Eddy nunca vence a Luciana; Albert nunca vence a Samantha', () => {
    instalar(EDDY, LUCIANA, ALBERT, SAMANTHA)
    expect(pickVoice('pt-BR')?.name).toBe('Luciana')
    expect(pickVoice('en-US')?.name).toBe('Samantha')
  })

  it('a preferência gravada que aponta para uma voz recusada é ignorada', () => {
    instalar(EDDY, LUCIANA)
    expect(pickVoice('pt-BR', EDDY.name)?.name).toBe('Luciana')
    expect(vozDoAparelhoExiste(EDDY.name)).toBe(false)
  })

  it('o seletor não mostra voz recusada', () => {
    instalar(EDDY, LUCIANA, ALBERT)
    expect(voicesFor('pt').map((x) => x.name)).toEqual(['Luciana'])
    expect(voicesFor('en')).toEqual([])
    expect(hasVoiceFor('en')).toBe(false)
  })
})

describe('a fala sem voz aceita', () => {
  it('idioma só com vozes recusadas: não chama speak, avisa "sem voz" e devolve erro a quem pediu', () => {
    instalar(EDDY, ALBERT)
    const aviso = vi.fn()
    const sair = aoFaltarVoz(aviso)
    const onError = vi.fn()
    nativeTts.speak('Olá', { lang: 'pt-BR', onError })
    nativeTts.speak('Hello', { lang: 'en-US', voiceName: 'Albert', onError })
    sair()
    expect(palco.synth.speak).not.toHaveBeenCalled()
    expect(onError).toHaveBeenCalledTimes(2)
    expect(aviso).toHaveBeenCalled()
  })

  it('com preferência gravada para a Eddy, a fala sai com a Luciana', () => {
    instalar(EDDY, LUCIANA)
    setVoicePref('pt', EDDY.name)
    nativeTts.speak('Olá', { lang: 'pt-BR' })
    expect((palco.falas[0].voice as { name: string }).name).toBe('Luciana')
  })

  it('a lista ainda não chegou: espera por ela e fala com a voz aceita, nunca com a padrão do navegador', async () => {
    palco.vozes.length = 0
    nativeTts.speak('Olá', { lang: 'pt-BR' })
    expect(palco.synth.speak).not.toHaveBeenCalled()
    instalar(EDDY, LUCIANA)
    await vi.advanceTimersByTimeAsync(10)
    expect(palco.synth.speak).toHaveBeenCalledTimes(1)
    expect((palco.falas[0].voice as { name: string }).name).toBe('Luciana')
  })

  it('cancelar enquanto espera a lista: a fala não sai depois', async () => {
    palco.vozes.length = 0
    nativeTts.speak('Olá', { lang: 'pt-BR' })
    nativeTts.cancel()
    instalar(LUCIANA)
    await vi.advanceTimersByTimeAsync(10)
    expect(palco.synth.speak).not.toHaveBeenCalled()
  })
})
