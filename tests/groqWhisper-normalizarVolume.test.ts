/**
 * O adaptador de nuvem e a flag `stt_nuvem_normalizar` (openspec `stt-ingles-volume-e-rota`, 3.2): desligada, o PCM que vai ao
 * encode é o MESMO de antes; ligada, é o normalizado; o PCM original não é tocado.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { normalizarVolume } from '../src/core/audio/normalizarVolume'
import { definirNormalizacaoDoStt } from '../src/gateway/normalizacaoDoStt'

const enviados: Float32Array[] = []
vi.mock('../src/data/api', () => ({
  apiFetch: vi.fn(async () => new Response(JSON.stringify({ text: 'ok' }))),
}))
vi.mock('../src/gateway/audio/opusDoStt', () => ({
  audioParaStt: vi.fn(async (pcm: Float32Array) => {
    enviados.push(pcm)
    return { corpo: new Blob([new Uint8Array(4)]), tipo: 'audio/wav' as const }
  }),
}))

import { GroqWhisperStt } from '../src/gateway/adapters/groqWhisper'

const fala = () => Float32Array.from({ length: 1600 }, (_, i) => 0.001 * Math.sin(i / 7)) // ~−60 dBFS

beforeEach(() => {
  enviados.length = 0
})
afterEach(() => definirNormalizacaoDoStt(false))

describe('GroqWhisperStt × stt_nuvem_normalizar', () => {
  it('desligada (padrão): o mesmo buffer de antes, sem cópia nem ganho', async () => {
    const pcm = fala()
    await new GroqWhisperStt({ model: 'whisper-large-v3-turbo' }).transcribePcm(pcm, 16_000)
    expect(enviados).toHaveLength(1)
    expect(enviados[0]).toBe(pcm)
  })

  it('ligada: envia o normalizado e deixa o PCM original intacto', async () => {
    definirNormalizacaoDoStt(true)
    const pcm = fala()
    const copia = Array.from(pcm)
    await new GroqWhisperStt({ model: 'whisper-large-v3-turbo' }).transcribePcm(pcm, 16_000)
    expect(enviados[0]).not.toBe(pcm)
    expect(Array.from(enviados[0])).toEqual(Array.from(normalizarVolume(pcm).pcm))
    expect(Math.max(...enviados[0].map(Math.abs))).toBeGreaterThan(0.05)
    expect(Array.from(pcm)).toEqual(copia)
  })
})
