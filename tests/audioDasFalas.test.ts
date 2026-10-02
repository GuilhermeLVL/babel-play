/**
 * O ÁUDIO REAL DAS FALAS (`lib/captura/audioDasFalas`): o que "Ouvir" toca no Quest, onde não há voz
 * de leitura. Só guarda quando ligado, e tem teto: as falas mais antigas saem primeiro.
 */
import { afterEach, describe, expect, it } from 'vitest'

import {
  estadoDoAudioDasFalas,
  guardarAudioDaFala,
  ligarAudioDasFalas,
  limparAudioDasFalas,
  MAXIMO_DE_BYTES,
  MAXIMO_DE_FALAS,
  temAudioDaFala,
  tocarAudioDaFala,
} from '../src/lib/captura/audioDasFalas'

const pcm = (segundos: number) => new Float32Array(Math.round(segundos * 16000)).fill(0.25)

afterEach(() => ligarAudioDasFalas(false))

describe('audioDasFalas', () => {
  it('desligado (computador, celular), não guarda nada', () => {
    guardarAudioDaFala('a', pcm(1), 16000)
    expect(temAudioDaFala('a')).toBe(false)
    expect(estadoDoAudioDasFalas()).toEqual({ falas: 0, bytes: 0 })
  })

  it('ligado, guarda em 16 bits por id; regravar a mesma fala não soma duas vezes', () => {
    ligarAudioDasFalas(true)
    guardarAudioDaFala('a', pcm(1), 16000)
    guardarAudioDaFala('a', pcm(2), 16000)
    expect(temAudioDaFala('a')).toBe(true)
    expect(estadoDoAudioDasFalas()).toEqual({ falas: 1, bytes: 2 * 16000 * 2 })
  })

  it('passou do número de falas, as mais antigas saem', () => {
    ligarAudioDasFalas(true)
    for (let i = 0; i < MAXIMO_DE_FALAS + 5; i++) guardarAudioDaFala(`f${i}`, pcm(0.1), 16000)
    expect(estadoDoAudioDasFalas().falas).toBe(MAXIMO_DE_FALAS)
    expect(temAudioDaFala('f0')).toBe(false)
    expect(temAudioDaFala('f4')).toBe(false)
    expect(temAudioDaFala('f5')).toBe(true)
    expect(temAudioDaFala(`f${MAXIMO_DE_FALAS + 4}`)).toBe(true)
  })

  it('passou do teto de bytes, descarta até caber (a fala nova sempre fica)', () => {
    ligarAudioDasFalas(true)
    const umMinuto = pcm(60) // ~1,9 MB em 16 bits
    for (let i = 0; i < 14; i++) guardarAudioDaFala(`m${i}`, umMinuto, 16000)
    expect(estadoDoAudioDasFalas().bytes).toBeLessThanOrEqual(MAXIMO_DE_BYTES)
    expect(temAudioDaFala('m0')).toBe(false)
    expect(temAudioDaFala('m13')).toBe(true)
  })

  it('limpar e desligar esvaziam; tocar o que não existe devolve false', () => {
    ligarAudioDasFalas(true)
    guardarAudioDaFala('a', pcm(1), 16000)
    limparAudioDasFalas()
    expect(temAudioDaFala('a')).toBe(false)
    expect(tocarAudioDaFala('a')).toBe(false)
    guardarAudioDaFala('b', pcm(1), 16000)
    ligarAudioDasFalas(false)
    expect(estadoDoAudioDasFalas()).toEqual({ falas: 0, bytes: 0 })
  })
})
