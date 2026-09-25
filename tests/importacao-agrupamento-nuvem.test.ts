/**
 * A IMPORTAÇÃO JUNTA AS FALAS ANTES DE MANDAR À NUVEM.
 *
 * A Groq cobra no mínimo 10 s por pedido: um trecho de 2 s custa 10 s. A bancada de 2026-09
 * (docs/auditoria/eval/bancada-2026-09.md) mediu 2,06× o tempo real faturado com os pedaços do VAD
 * de 450 ms. Na importação o arquivo está inteiro na mão, então dá para juntar as falas seguidas em
 * pacotes de até 28 s (a Groq aceita até 30 s por trecho sem perder qualidade) — sempre na fronteira
 * de uma fala, nunca no meio dela.
 */
import { describe, expect, it } from 'vitest'

import { agruparParaNuvem, juntarAudioDoPacote, TETO_DO_PACOTE_MS } from '../src/gateway/offlineTranscribe'

const SR = 16000
/** Uma fala de `dur` segundos começando em `inicio` segundos. */
function fala(inicio: number, dur: number, marca = 0) {
  return { audio: new Float32Array(Math.round(dur * SR)).fill(marca), start: inicio * 1000, end: (inicio + dur) * 1000 }
}

/** Falas de 2/3/5 s em sequência, com meio segundo de silêncio entre elas. */
function sequencia(duracoes: number[]) {
  let t = 0
  return duracoes.map((d, i) => {
    const s = fala(t, d, i + 1)
    t += d + 0.5
    return s
  })
}

describe('agruparParaNuvem', () => {
  it('junta falas curtas em pacotes de no máximo 28 s', () => {
    const segs = sequencia([2, 3, 5, 2, 3, 5, 2, 3, 5, 2, 3, 5])
    const pacotes = agruparParaNuvem(segs)
    expect(pacotes.length).toBeLessThan(segs.length)
    expect(pacotes.length).toBe(2)
    for (const p of pacotes) {
      expect(p.end - p.start).toBeLessThanOrEqual(TETO_DO_PACOTE_MS)
      expect(juntarAudioDoPacote(p).length / SR).toBeLessThanOrEqual(TETO_DO_PACOTE_MS / 1000)
    }
    // Enche o pacote o quanto cabe: o primeiro passa de 20 s.
    expect(pacotes[0].end - pacotes[0].start).toBeGreaterThanOrEqual(20_000)
  })

  it('preserva a ordem e não perde nem duplica fala', () => {
    const segs = sequencia([2, 3, 5, 2, 3, 5, 2, 3, 5, 2, 3, 5])
    const pacotes = agruparParaNuvem(segs)
    expect(pacotes.flatMap((p) => p.segmentos)).toEqual(segs)
  })

  it('o pacote vai do início da primeira fala ao fim da última', () => {
    const segs = sequencia([2, 3, 5])
    const [p] = agruparParaNuvem(segs)
    expect(p.start).toBe(segs[0].start)
    expect(p.end).toBe(segs[2].end)
  })

  it('uma fala de 35 s vai sozinha, como antes (não se corta fala no meio)', () => {
    const segs = [fala(0, 2), fala(3, 35), fala(39, 2)]
    const pacotes = agruparParaNuvem(segs)
    expect(pacotes.map((p) => p.segmentos.length)).toEqual([1, 1, 1])
    expect(pacotes[1].segmentos[0]).toBe(segs[1])
  })

  it('falas distantes (mais de 28 s entre o início de uma e o fim da outra) não se juntam', () => {
    const segs = [fala(0, 2), fala(40, 2)]
    expect(agruparParaNuvem(segs).map((p) => p.segmentos.length)).toEqual([1, 1])
  })

  it('sem falas, sem pacotes', () => {
    expect(agruparParaNuvem([])).toEqual([])
  })
})

describe('juntarAudioDoPacote', () => {
  it('concatena as falas na ordem, com um respiro de silêncio entre elas', () => {
    const segs = [fala(0, 1, 1), fala(2, 1, 2)]
    const [p] = agruparParaNuvem(segs)
    const audio = juntarAudioDoPacote(p)
    expect(audio.length).toBeGreaterThan(2 * SR)
    expect(audio[0]).toBe(1)
    expect(audio[SR]).toBe(0) // o respiro
    expect(audio[audio.length - 1]).toBe(2)
  })

  it('pacote de uma fala só devolve o próprio áudio', () => {
    const s = fala(0, 1, 3)
    expect(juntarAudioDoPacote({ segmentos: [s], start: s.start, end: s.end })).toBe(s.audio)
  })
})
