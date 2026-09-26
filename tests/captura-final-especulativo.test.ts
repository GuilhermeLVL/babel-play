// @vitest-environment jsdom
/**
 * FINAL ESPECULATIVO NA CAPTURA (auditoria de latência 2026-09-26, item 4).
 *
 * O MicVAD falso aqui usa o FrameProcessor REAL da biblioteca (mesmos limiares e tempos que a
 * captura configura) e entrega os eventos aos callbacks da captura. Provas:
 *  - com ~450 ms de silêncio a captura pede o decode especulativo, com a janela que o VAD vai fechar;
 *  - no fim, o `onUtterance` recebe EXATAMENTE essa janela e o handle especulativo (o mesmo texto,
 *    porque é a mesma entrada);
 *  - se a fala volta, o especulativo é cancelado e nada dele vira final.
 */
import { createRequire } from 'node:module'

import { beforeEach, describe, expect, it, vi } from 'vitest'

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

const silencio = (n: number) => Array(n).fill(0.05)
const fala = (n: number) => Array(n).fill(0.9)

async function capturar() {
  const handles: Array<{ cancelar: ReturnType<typeof vi.fn>; pcm: Float32Array }> = []
  const finais: Array<{ pcm: Float32Array; especulacao: unknown }> = []
  const cap = await startMicCapture(undefined, {
    onUtterance: (pcm: Float32Array, _sr: number, _seq: number, especulacao?: unknown) =>
      finais.push({ pcm, especulacao }),
    onFinalEspeculativo: (pcm: Float32Array) => {
      const h = { cancelar: vi.fn(), pcm }
      handles.push(h)
      return h
    },
  } as never)
  return { cap, handles, finais }
}

describe('captura com final especulativo', () => {
  it('especula com ~450 ms de silêncio e o final É a janela especulativa (mesma entrada, mesmo texto)', async () => {
    const { cap, handles, finais } = await capturar()
    await alimentar([...silencio(5), ...fala(20), ...silencio(4)])
    expect(handles).toHaveLength(1) // 4 quadros de 96 ms de silêncio: especulou, VAD ainda aberto
    expect(finais).toHaveLength(0)
    await alimentar(silencio(6))
    expect(finais).toHaveLength(1)
    expect(finais[0].especulacao).toBe(handles[0])
    expect(Array.from(finais[0].pcm)).toEqual(Array.from(handles[0].pcm))
    expect(handles[0].cancelar).not.toHaveBeenCalled()
    await cap.stop()
  })

  it('a fala volta depois da especulação: cancela; o final usa a especulação da pausa seguinte', async () => {
    const { cap, handles, finais } = await capturar()
    await alimentar([...silencio(5), ...fala(10), ...silencio(5), ...fala(10), ...silencio(10)])
    expect(handles).toHaveLength(2)
    expect(handles[0].cancelar).toHaveBeenCalled()
    expect(finais).toHaveLength(1)
    expect(finais[0].especulacao).toBe(handles[1])
    await cap.stop()
  })

  it('sem quem especule (nuvem, modelo carregando): o final é o áudio inteiro do VAD, como antes', async () => {
    const finais: Array<{ pcm: Float32Array; especulacao: unknown }> = []
    const cap = await startMicCapture(undefined, {
      onUtterance: (pcm: Float32Array, _sr: number, _seq: number, especulacao?: unknown) =>
        finais.push({ pcm, especulacao }),
      onFinalEspeculativo: () => null,
    } as never)
    await alimentar([...silencio(5), ...fala(20), ...silencio(10)])
    expect(finais).toHaveLength(1)
    expect(finais[0].especulacao).toBeUndefined()
    expect(finais[0].pcm.length).toBe((3 + 20 + 8) * QUADRO) // pré-fala + fala + redenção inteira
    await cap.stop()
  })
})

describe('parciais mais cedo', () => {
  it('o 1º parcial sai no 1º tique com 0,6 s de fala; os seguintes respeitam 1,1 s entre si', async () => {
    vi.useFakeTimers({ toFake: ['setInterval', 'clearInterval', 'setTimeout', 'clearTimeout', 'performance'] })
    try {
      const parciais: number[] = []
      const cap = await startMicCapture(undefined, {
        onUtterance: vi.fn(),
        onPartialAudio: (pcm: Float32Array) => parciais.push(pcm.length),
      } as never)
      await alimentar([...silencio(3), ...fala(8)]) // 7 quadros depois do início: 0,67 s
      await vi.advanceTimersByTimeAsync(200)
      expect(parciais).toHaveLength(1) // antes: só no tique de 1,1 s
      await alimentar(fala(8))
      await vi.advanceTimersByTimeAsync(400)
      expect(parciais).toHaveLength(1) // 0,6 s de áudio novo, mas só 0,6 s desde o último
      await vi.advanceTimersByTimeAsync(800) // 1,2 s desde o 1º
      expect(parciais).toHaveLength(2)
      await cap.stop()
    } finally {
      vi.useRealTimers()
    }
  })
})
