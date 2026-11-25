// @vitest-environment jsdom
/**
 * O modo "Frase por frase" no reprodutor do audiolivro (openspec `repetir-e-pausar-por-frase`, 5.1): ao `t1` da frase
 * repete, espera a pessoa repetir em voz alta e segue (ou para). `criarAudio` e `agendar` falsos.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { temposDasFrases } from '../src/core/leitura/audiolivro'
import { criarReprodutor } from '../src/lib/leitor/audiolivro/reprodutor'

class AudioFalso extends EventTarget {
  src = ''
  preload = ''
  currentTime = 0
  paused = true
  readyState = 4
  playbackRate = 1
  preservesPitch = false
  error = null
  play = vi.fn(async () => {
    this.paused = false
  })
  pause = vi.fn(() => {
    this.paused = true
  })
  load = vi.fn()
  removeAttribute() {}
}

/* clipes [2, 3, 1] s, pausas {frase 0,2; parágrafo 0,4}: {0,2.0} {2.2,5.2} {5.6,6.6}. */
const TEMPOS = temposDasFrases(
  [
    { duracaoS: 2, fimDeParagrafo: false },
    { duracaoS: 3, fimDeParagrafo: true },
    { duracaoS: 1, fimDeParagrafo: false },
  ],
  { frase: 0.2, paragrafo: 0.4 },
)

beforeEach(() => vi.useFakeTimers())
afterEach(() => vi.useRealTimers())

async function montar() {
  const audios: AudioFalso[] = []
  const r = criarReprodutor({
    criarAudio: () => {
      const a = new AudioFalso()
      audios.push(a)
      return a as unknown as HTMLAudioElement
    },
    agendar: (cb) => {
      const id = setTimeout(cb, 16)
      return () => clearTimeout(id)
    },
    canal: null,
  })
  const paradas: number[] = []
  r.aoPararNoFim = (i) => paradas.push(i)
  await r.carregar('u', TEMPOS)
  await r.tocarDe(0)
  return { r, a: audios[0], paradas }
}

const andar = async (a: AudioFalso, t: number) => {
  a.currentTime = t
  await vi.advanceTimersByTimeAsync(20)
}

describe('reprodutor com frase por frase', () => {
  it('repete 2x, espera a duração da frase e segue para a próxima', async () => {
    const { r, a } = await montar()
    r.definirFrasePorFrase({ repeticoes: 2, pausa: 1, pararNoFim: false })
    await andar(a, 1.99) // t1 = 2: 1ª vez, repete
    expect(a.currentTime).toBe(0)
    expect(a.pause).not.toHaveBeenCalled()
    await andar(a, 1.99) // 2ª vez: pausa de 2 s
    expect(a.pause).toHaveBeenCalledTimes(1)
    expect(a.paused).toBe(true)
    await vi.advanceTimersByTimeAsync(1900)
    expect(a.paused).toBe(true)
    await vi.advanceTimersByTimeAsync(200)
    expect(a.currentTime).toBe(2.2)
    expect(a.paused).toBe(false)
  })

  it('"parar no fim" pausa e avisa; a última frase também para', async () => {
    const { r, a, paradas } = await montar()
    r.definirFrasePorFrase({ repeticoes: 1, pausa: 1, pararNoFim: true })
    await andar(a, 1.99)
    expect(a.paused).toBe(true)
    expect(paradas).toEqual([0])
    r.definirFrasePorFrase({ repeticoes: 1, pausa: 1, pararNoFim: false })
    await r.retomar()
    await andar(a, 6.59) // t1 da última (6,6)
    expect(paradas).toEqual([0, 2])
  })

  it('tocarDe durante a pausa desfaz a espera', async () => {
    const { r, a } = await montar()
    r.definirFrasePorFrase({ repeticoes: 1, pausa: 1, pararNoFim: false })
    await andar(a, 1.99)
    expect(a.paused).toBe(true)
    await r.tocarDe(2)
    expect(a.currentTime).toBe(5.6)
    await vi.advanceTimersByTimeAsync(5000)
    expect(a.currentTime).toBeGreaterThanOrEqual(5.6)
  })

  it('desligado (null) o reprodutor é o de sempre: segue para a próxima sem pausar', async () => {
    const { r, a } = await montar()
    r.definirFrasePorFrase({ repeticoes: 3, pausa: 1, pararNoFim: false })
    r.definirFrasePorFrase(null)
    await andar(a, 1.99)
    await andar(a, 2.3)
    expect(a.pause).not.toHaveBeenCalled()
    expect(a.currentTime).toBe(2.3)
  })
})
