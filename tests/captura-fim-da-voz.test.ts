// @vitest-environment jsdom
/**
 * O ÚLTIMO QUADRO DE VOZ (`frasy:fala:fim`, `lab-medicao-legenda-traduzida`, tarefa 2.2, definição D1).
 *
 * A métrica de latência conta do último quadro que o VAD classificou como voz, e NÃO do instante em que ele decidiu que
 * a fala acabou: a redenção de 800 ms é tempo que a pessoa espera. O MicVAD falso usa o FrameProcessor REAL da biblioteca
 * (mesmos limiares e tempos da captura) e um relógio controlado: cada quadro avança 96 ms.
 */
import { createRequire } from 'node:module'

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const exigir = createRequire(import.meta.url)
const { FrameProcessor } = exigir('@ricky0123/vad-web/dist/frame-processor.js')

const QUADRO = 1536
const MS_POR_QUADRO = QUADRO / 16
let alimentar: (probs: number[]) => Promise<void>
/** O relógio da página nesta prova: avança 96 ms por quadro entregue ao VAD. */
let agora = 0

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
        MS_POR_QUADRO,
      )
      fp.resume()
      let n = 0
      alimentar = async (probs) => {
        for (const prob of probs) {
          p = prob
          agora += MS_POR_QUADRO
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
  agora = 1000
  vi.spyOn(performance, 'now').mockImplementation(() => agora)
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
afterEach(() => vi.restoreAllMocks())

const silencio = (n: number) => Array(n).fill(0.05)
const fala = (n: number) => Array(n).fill(0.9)

async function capturar() {
  const eventos: Array<{ tipo: 'fimDaVoz' | 'utterance'; seq: number; t?: number; decididoEm: number }> = []
  const cap = await startMicCapture(undefined, {
    onFimDaVoz: (seq: number, t: number) => eventos.push({ tipo: 'fimDaVoz', seq, t, decididoEm: agora }),
    onUtterance: (_pcm: Float32Array, _sr: number, seq: number) =>
      eventos.push({ tipo: 'utterance', seq, decididoEm: agora }),
  } as never)
  return { cap, eventos }
}

describe('frasy:fala:fim — o instante do último quadro de voz', () => {
  it('é o do último quadro de voz, não o da decisão do VAD (a redenção de 800 ms fica de fora)', async () => {
    const { cap, eventos } = await capturar()
    await alimentar(silencio(3))
    await alimentar(fala(20))
    const ultimaVoz = agora // o 20º quadro de voz acabou de ser entregue
    await alimentar(silencio(12)) // mais que os 800 ms de redenção: o VAD fecha
    expect(eventos.map((e) => e.tipo)).toEqual(['fimDaVoz', 'utterance']) // o aviso vem ANTES do final
    const [fim] = eventos
    expect(fim.t).toBe(ultimaVoz)
    // A decisão veio bem depois: a diferença é a espera da redenção, que a pessoa sente e a métrica conta.
    expect(fim.decididoEm - fim.t!).toBeGreaterThanOrEqual(700) // 8 quadros de silêncio ≈ 770 ms
    await cap.stop()
  })

  it('uma marca por fala, cada uma no último quadro de voz da SUA fala', async () => {
    const { cap, eventos } = await capturar()
    await alimentar([...silencio(2), ...fala(15)])
    const fim1 = agora
    await alimentar(silencio(12))
    await alimentar(fala(15))
    const fim2 = agora
    await alimentar(silencio(12))
    const marcas = eventos.filter((e) => e.tipo === 'fimDaVoz')
    expect(marcas.map((e) => e.t)).toEqual([fim1, fim2])
    expect(marcas[1].seq).toBe(marcas[0].seq + 1)
    await cap.stop()
  })

  it('ruído curto (misfire) não gera marca', async () => {
    const { cap, eventos } = await capturar()
    await alimentar([...silencio(2), ...fala(2), ...silencio(12)]) // < 400 ms de fala: o VAD descarta
    expect(eventos).toEqual([])
    await cap.stop()
  })
})
