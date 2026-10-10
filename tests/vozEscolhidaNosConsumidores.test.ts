// @vitest-environment jsdom
/**
 * QUEM FALA PEDE A VOZ ESCOLHIDA — um teste por consumidor (o narrador da Leitura tem o dele em
 * `questLeitura.test.tsx`).
 *
 *   · O INTÉRPRETE sem a voz natural: a fila de fala (`filaDeFala.ts`) lê pelo `nativeTts`, e cada lado
 *     da conversa sai com a voz escolhida do idioma DELE;
 *   · O INTÉRPRETE com a voz natural: `motorPorPreferencia.ts` decide por fala — a voz do aparelho que a
 *     pessoa escolheu não vai à nuvem; a automática, a "voz natural" e a voz que sumiu vão;
 *   · O "OUVIR" de uma palavra (a folha da palavra, a Revisão, a captura): `speak()` com o idioma;
 *   · OS JOGOS: o falante do Ditado, do Qual foi? e do Karaokê (`falante.ts`) e o `falarNoJogo` dos demais.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest'

interface VozFalsa {
  name: string
  lang: string
  localService: boolean
}
interface Fala {
  text: string
  lang: string
  voice: VozFalsa | null
  rate: number
  onstart: (() => void) | null
  onend: (() => void) | null
}

const palco = vi.hoisted(() => {
  const vozes = [
    { name: 'Microsoft Aria Online (Natural) - English (United States)', lang: 'en-US', localService: false },
    { name: 'Microsoft David - English (United States)', lang: 'en-US', localService: true },
    { name: 'Microsoft Francisca Online (Natural) - Portuguese (Brazil)', lang: 'pt-BR', localService: false },
    { name: 'Microsoft Maria - Portuguese (Brazil)', lang: 'pt-BR', localService: true },
  ]
  const faladas: unknown[] = []
  class FalaFalsa {
    lang = ''
    voice: unknown = null
    rate = 1
    pitch = 1
    onstart: (() => void) | null = null
    onend: (() => void) | null = null
    onerror: (() => void) | null = null
    constructor(public text: string) {}
  }
  Object.defineProperty(window, 'speechSynthesis', {
    configurable: true,
    value: {
      getVoices: () => vozes,
      addEventListener: () => undefined,
      removeEventListener: () => undefined,
      speak: (u: unknown) => faladas.push(u),
      cancel: () => undefined,
      resume: () => undefined,
      paused: false,
      speaking: false,
    },
  })
  ;(globalThis as unknown as { SpeechSynthesisUtterance: unknown }).SpeechSynthesisUtterance = FalaFalsa
  return { faladas }
})

vi.mock('../src/data/api', () => ({ patchUiSettings: async () => ({ id: 'x' }), fetchSettings: async () => null }))
/* O aparelho do teste tem voz de leitura (um computador): o falante dos jogos usa a `speechSynthesis`. */
vi.mock('../src/lib/voz/haVoz', () => ({
  haAlgumaVoz: () => true,
  haVozPara: () => true,
  aparelhoTemVoz: () => true,
}))

import { falarNoJogo } from '../src/components/minigames/noQuest'
import { criarFalante } from '../src/lib/falante'
import { nativeTts, speak, type SpeakOptions, type TtsEngine } from '../src/lib/tts'
import { criarFilaDeFala } from '../src/lib/voz/filaDeFala'
import { criarMotorPorPreferencia } from '../src/lib/voz/motorPorPreferencia'
import { VOZ_DA_NUVEM } from '../src/lib/voz/preferenciaDeVoz'
import type { VozDaNuvem } from '../src/lib/voz/vozDaNuvem'

const DAVID = 'Microsoft David - English (United States)'
const ARIA = 'Microsoft Aria Online (Natural) - English (United States)'
const MARIA = 'Microsoft Maria - Portuguese (Brazil)'
const faladas = () => palco.faladas as Fala[]
const escolher = (vozes: Record<string, string>) => localStorage.setItem('babel_voice_prefs', JSON.stringify(vozes))

beforeEach(() => {
  localStorage.clear()
  palco.faladas.length = 0
})

describe('o intérprete, com a voz do aparelho', () => {
  it('cada lado da conversa é lido com a voz escolhida do idioma dele', () => {
    escolher({ en: DAVID, pt: MARIA })
    const fila = criarFilaDeFala({ motor: () => nativeTts })
    fila.enfileirar({ id: 'a', texto: 'good morning everyone', lang: 'en-US', lado: 'meu' })
    expect(faladas().at(-1)).toMatchObject({ text: 'good morning everyone', voice: { name: DAVID } })
    // A primeira termina; a fala do outro lado (para o português) sai com a voz do português.
    faladas().at(-1)?.onstart?.()
    faladas().at(-1)?.onend?.()
    fila.enfileirar({ id: 'b', texto: 'bom dia a todos', lang: 'pt-BR', lado: 'outro' })
    expect(faladas().at(-1)).toMatchObject({ text: 'bom dia a todos', voice: { name: MARIA } })
    fila.destruir()
  })

  it('trocar a voz no meio da conversa vale para a próxima fala', () => {
    const fila = criarFilaDeFala({ motor: () => nativeTts })
    fila.enfileirar({ id: 'a', texto: 'one', lang: 'en-US' })
    expect(faladas().at(-1)?.voice?.name).toBe(ARIA) // a automática: a natural do idioma
    faladas().at(-1)?.onstart?.()
    faladas().at(-1)?.onend?.()
    escolher({ en: DAVID })
    fila.enfileirar({ id: 'b', texto: 'two', lang: 'en-US' })
    expect(faladas().at(-1)?.voice?.name).toBe(DAVID)
    fila.destruir()
  })
})

describe('o intérprete, com a voz natural no plano', () => {
  function nuvemFalsa() {
    const falas: Array<{ texto: string; lang: string }> = []
    const cancel = vi.fn()
    const nuvem: VozDaNuvem = {
      speak: (texto: string, opts?: SpeakOptions) => void falas.push({ texto, lang: opts!.lang }),
      cancel,
      isSpeaking: () => false,
      motorDaUltimaFala: () => 'voz-da-nuvem',
    }
    return { nuvem, falas, cancel }
  }

  it('a voz do aparelho escolhida para um idioma lê sem ir à nuvem; o outro lado segue na nuvem', () => {
    escolher({ en: DAVID })
    const { nuvem, falas } = nuvemFalsa()
    const motor = criarMotorPorPreferencia({ nuvem })
    const fila = criarFilaDeFala({ motor: () => motor })

    fila.enfileirar({ id: 'a', texto: 'good morning', lang: 'en-US' })
    expect(falas).toHaveLength(0)
    expect(faladas().at(-1)).toMatchObject({ text: 'good morning', voice: { name: DAVID } })
    expect(motor.motorDaUltimaFala()).toBe('voz-do-aparelho')
    faladas().at(-1)?.onstart?.()
    faladas().at(-1)?.onend?.()

    fila.enfileirar({ id: 'b', texto: 'bom dia', lang: 'pt-BR' })
    expect(falas).toEqual([{ texto: 'bom dia', lang: 'pt-BR' }])
    expect(faladas()).toHaveLength(1)
    expect(motor.motorDaUltimaFala()).toBe('voz-da-nuvem')
    fila.destruir()
  })

  it('automática, "voz natural" e a voz que sumiu continuam na nuvem', () => {
    const { nuvem, falas } = nuvemFalsa()
    const motor = criarMotorPorPreferencia({ nuvem })
    motor.speak('one', { lang: 'en-US' })
    escolher({ en: VOZ_DA_NUVEM })
    motor.speak('two', { lang: 'en-US' })
    escolher({ en: 'Samantha' }) // uma voz de outro aparelho
    motor.speak('three', { lang: 'en-US' })
    expect(falas.map((f) => f.texto)).toEqual(['one', 'two', 'three'])
    expect(faladas()).toHaveLength(0)
  })

  it('parar cala os dois motores', () => {
    const { nuvem, cancel } = nuvemFalsa()
    const aparelho: TtsEngine = { speak: vi.fn(), cancel: vi.fn() }
    criarMotorPorPreferencia({ nuvem, aparelho }).cancel()
    expect(cancel).toHaveBeenCalled()
    expect(aparelho.cancel).toHaveBeenCalled()
  })
})

describe('"Ouvir" uma palavra', () => {
  it('a folha da palavra e a Revisão (`speak` com o idioma e a velocidade) saem com a voz escolhida', () => {
    escolher({ en: DAVID })
    speak('river', { lang: 'en-US', rate: 0.9 })
    expect(faladas().at(-1)).toMatchObject({ text: 'river', rate: 0.9, voice: { name: DAVID } })
  })
})

describe('os jogos', () => {
  it('Ditado, Qual foi? e Karaokê (o falante por voz) leem com a voz escolhida do idioma do item', () => {
    escolher({ pt: MARIA })
    const falante = criarFalante({ current: null }, undefined)
    expect(falante.modo).toBe('voz')
    falante.ouvir({ texto: 'a ponte de pedra', lang: 'pt' })
    expect(faladas().at(-1)).toMatchObject({ text: 'a ponte de pedra', voice: { name: MARIA } })
  })

  it('Karuta e os demais (`falarNoJogo`) também', () => {
    escolher({ en: DAVID })
    expect(falarNoJogo('stone', 'en')).toBe(true)
    expect(faladas().at(-1)).toMatchObject({ text: 'stone', voice: { name: DAVID } })
  })
})
