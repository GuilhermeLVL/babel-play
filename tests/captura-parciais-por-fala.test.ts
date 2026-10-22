// @vitest-environment jsdom
/**
 * TETO DE PARCIAIS POR FALA (dono, 22/10/2026: "só o necessário"). Cada parcial decodifica a fala
 * inteira até ali; antes, uma fala de 6 s rendia ~5 parciais (1,1 s) antes do final e a CPU ficava
 * cheia durante toda a fala. Agora: 2 s entre parciais e no máximo 2 por fala (1 quando o pipeline
 * pede, como sem isolamento). O VAD falso é o mesmo de `captura-final-especulativo.test.ts`.
 * Um parcial descartado pelo pipeline (devolve `false`) não gasta a cota.
 */
import { createRequire } from 'node:module'

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const exigir = createRequire(import.meta.url)
const { FrameProcessor } = exigir('@ricky0123/vad-web/dist/frame-processor.js')

const QUADRO = 1536
let alimentar: (probs: number[]) => Promise<void>

vi.mock('@ricky0123/vad-web', () => ({
  MicVAD: {
    new: vi.fn(async (o: Record<string, any>) => {
      let p = 0
      const fp = new FrameProcessor(
        async () => ({ isSpeech: p, notSpeech: 1 - p }),
        () => {},
        {
          positiveSpeechThreshold: o.positiveSpeechThreshold,
          negativeSpeechThreshold: o.negativeSpeechThreshold,
          redemptionMs: o.redemptionMs,
          preSpeechPadMs: o.preSpeechPadMs,
          minSpeechMs: o.minSpeechMs,
          submitUserSpeechOnPause: true,
        },
        QUADRO / 16,
      )
      fp.resume()
      let n = 0
      alimentar = async (probs) => {
        for (const prob of probs) {
          p = prob
          const frame = Float32Array.from({ length: QUADRO }, (_, k) => n + k / QUADRO)
          n++
          await fp.process(frame, (ev: any) => {
            if (ev.msg === 'FRAME_PROCESSED') o.onFrameProcessed(ev.probs, ev.frame)
            else if (ev.msg === 'SPEECH_START') o.onSpeechStart()
            else if (ev.msg === 'SPEECH_END') o.onSpeechEnd(ev.audio)
            else if (ev.msg === 'VAD_MISFIRE') o.onVADMisfire()
          })
        }
      }
      return { start: vi.fn(), pause: vi.fn(), destroy: vi.fn() }
    }),
  },
}))

import { startMicCapture } from '../src/gateway/capture/systemAudio'

beforeEach(() => {
  vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout', 'setInterval', 'clearInterval', 'Date', 'performance'] })
  ;(globalThis as unknown as { MediaRecorder: unknown }).MediaRecorder = class {
    static isTypeSupported = () => true
    state = 'inactive'
    start() {
      this.state = 'recording'
    }
    onstop: (() => void) | null = null
    stop() {
      this.state = 'inactive'
      this.onstop?.()
    }
  }
  const faixa = { enabled: true, stop: vi.fn(), addEventListener: vi.fn() }
  const stream = { getAudioTracks: () => [faixa], getTracks: () => [faixa] } as unknown as MediaStream
  Object.defineProperty(navigator, 'mediaDevices', {
    configurable: true,
    value: { getUserMedia: vi.fn(async () => stream) },
  })
})
afterEach(() => vi.useRealTimers())

const silencio = (n: number) => Array(n).fill(0.05)
const fala = (n: number) => Array(n).fill(0.9)

/** Uma fala de ~5,8 s (60 quadros de 96 ms) alimentada em três pedaços, com o relógio andando entre eles. */
async function falaLonga(maxParciaisPorFala?: () => number) {
  const parciais: number[] = []
  const finais: number[] = []
  const cap = await startMicCapture(undefined, {
    onPartialAudio: (pcm: Float32Array) => parciais.push(pcm.length),
    onUtterance: (pcm: Float32Array) => finais.push(pcm.length),
    ...(maxParciaisPorFala ? { maxParciaisPorFala } : {}),
  } as never)
  await alimentar(silencio(3))
  for (let pedaco = 0; pedaco < 3; pedaco++) {
    await alimentar(fala(20))
    await vi.advanceTimersByTimeAsync(2100) // tiques de 200 ms: cada pedaço (1,9 s) daria um parcial
  }
  await alimentar(silencio(12)) // redenção de 800 ms: fecha a fala
  await vi.advanceTimersByTimeAsync(300)
  await cap.stop()
  return { parciais, finais }
}

describe('parciais por fala', () => {
  it('no máximo 3 parciais numa fala longa (um por pedaço de 2 s), e o final sai do mesmo jeito', async () => {
    const { parciais, finais } = await falaLonga()
    expect(parciais).toHaveLength(3)
    expect(finais).toHaveLength(1)
    expect(parciais[1]).toBeGreaterThan(parciais[0]) // o segundo cobre mais fala que o primeiro
  })

  it('o pipeline pode pedir 1 só (sem isolamento, WASM numa thread)', async () => {
    const { parciais, finais } = await falaLonga(() => 1)
    expect(parciais).toHaveLength(1)
    expect(finais).toHaveLength(1)
  })
})
