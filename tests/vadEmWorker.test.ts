// @vitest-environment jsdom
/**
 * O VAD COM A INFERÊNCIA NUM WORKER (`vadEmWorker.ts`): o protocolo de mensagens com um worker FALSO, a
 * segmentação de ponta a ponta com o `FrameProcessor` de verdade da biblioteca, e o fallback para o
 * `MicVAD` da thread principal quando o worker não sobe.
 */
import { FrameProcessor, Message } from '@ricky0123/vad-web'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import {
  criarModeloDoVad,
  type MensagemDoVad,
  type MensagemParaOVad,
  VadEmWorker,
  type WorkerDoVad,
} from '../src/gateway/capture/vadEmWorker'

/** Um worker falso: guarda o que recebeu e responde como o de verdade (fila, na ordem). */
class WorkerFalso implements WorkerDoVad {
  onmessage: ((e: MessageEvent<MensagemDoVad>) => void) | null = null
  onerror: ((e: ErrorEvent) => void) | null = null
  recebidas: MensagemParaOVad[] = []
  encerrado = false
  /** Quando definido, decide a probabilidade de cada quadro; sem ele, 0. */
  probabilidade: (pcm: Float32Array, n: number) => number = () => 0
  /** Resposta ao `carregar`: 'pronto' (padrão) ou o texto do erro. */
  aoCarregar: 'pronto' | string = 'pronto'
  /** Se verdadeiro, não responde aos quadros (para testar quadros pendentes). */
  mudo = false
  private quadros = 0

  postMessage(msg: MensagemParaOVad): void {
    this.recebidas.push(msg)
    if (msg.tipo === 'carregar') {
      queueMicrotask(() =>
        this.responder(this.aoCarregar === 'pronto' ? { tipo: 'pronto' } : { tipo: 'erro', mensagem: this.aoCarregar }),
      )
    } else if (msg.tipo === 'quadro' && !this.mudo) {
      const n = this.quadros++
      queueMicrotask(() =>
        this.responder({ tipo: 'probabilidade', id: msg.id, isSpeech: this.probabilidade(msg.pcm, n) }),
      )
    } else if (msg.tipo === 'reiniciar') {
      this.quadros = 0
    }
  }
  terminate(): void {
    this.encerrado = true
  }
  responder(m: MensagemDoVad): void {
    this.onmessage?.({ data: m } as MessageEvent<MensagemDoVad>)
  }
}

const URL_DO_MODELO = '/silero_vad_legacy.onnx'

describe('criarModeloDoVad: o protocolo com o worker', () => {
  it('pede o modelo pela URL e resolve quando o worker diz "pronto"', async () => {
    const w = new WorkerFalso()
    await criarModeloDoVad(URL_DO_MODELO, () => w)
    expect(w.recebidas).toEqual([{ tipo: 'carregar', url: URL_DO_MODELO }])
    expect(w.encerrado).toBe(false)
  })

  it('cada quadro volta com a probabilidade DELE (por id), mesmo se as respostas vierem fora de ordem', async () => {
    const w = new WorkerFalso()
    w.mudo = true
    const modelo = await criarModeloDoVad(URL_DO_MODELO, () => w)
    const a = modelo.process(new Float32Array([1]))
    const b = modelo.process(new Float32Array([2]))
    const ids = w.recebidas.filter((m) => m.tipo === 'quadro').map((m) => (m as { id: number }).id)
    expect(new Set(ids).size).toBe(2)
    w.responder({ tipo: 'probabilidade', id: ids[1], isSpeech: 0.9 })
    w.responder({ tipo: 'probabilidade', id: ids[0], isSpeech: 0.2 })
    expect(await a).toEqual({ isSpeech: 0.2, notSpeech: 0.8 })
    expect(await b).toEqual({ isSpeech: 0.9, notSpeech: expect.closeTo(0.1, 6) })
  })

  it('reset manda "reiniciar"; um erro de um quadro rejeita SÓ aquele quadro', async () => {
    const w = new WorkerFalso()
    w.mudo = true
    const modelo = await criarModeloDoVad(URL_DO_MODELO, () => w)
    modelo.reset()
    expect(w.recebidas.at(-1)).toEqual({ tipo: 'reiniciar' })
    const ruim = modelo.process(new Float32Array(4))
    const bom = modelo.process(new Float32Array(4))
    const [i1, i2] = w.recebidas.filter((m) => m.tipo === 'quadro').map((m) => (m as { id: number }).id)
    w.responder({ tipo: 'erro', id: i1, mensagem: 'inferência quebrou' })
    w.responder({ tipo: 'probabilidade', id: i2, isSpeech: 0.5 })
    await expect(ruim).rejects.toThrow('inferência quebrou')
    expect((await bom).isSpeech).toBe(0.5)
  })

  it('modelo que não carrega: rejeita e encerra o worker', async () => {
    const w = new WorkerFalso()
    w.aoCarregar = 'modelo do VAD: HTTP 404'
    await expect(criarModeloDoVad(URL_DO_MODELO, () => w)).rejects.toThrow('HTTP 404')
    expect(w.encerrado).toBe(true)
  })

  it('worker que não abre (criarWorker lança) rejeita sem travar', async () => {
    await expect(
      criarModeloDoVad(URL_DO_MODELO, () => {
        throw new Error('Web Worker indisponível')
      }),
    ).rejects.toThrow('Web Worker indisponível')
  })

  it('worker que morre no meio: os quadros pendentes e os seguintes rejeitam', async () => {
    const w = new WorkerFalso()
    w.mudo = true
    const modelo = await criarModeloDoVad(URL_DO_MODELO, () => w)
    const pendente = modelo.process(new Float32Array(4))
    w.onerror?.({ message: 'wasm abortou' } as ErrorEvent)
    await expect(pendente).rejects.toThrow('wasm abortou')
    await expect(modelo.process(new Float32Array(4))).rejects.toThrow('wasm abortou')
    expect(w.encerrado).toBe(true)
  })

  it('release avisa o worker e o encerra', async () => {
    vi.useFakeTimers()
    try {
      const w = new WorkerFalso()
      const modelo = await criarModeloDoVad(URL_DO_MODELO, () => w)
      modelo.release()
      expect(w.recebidas.at(-1)).toEqual({ tipo: 'liberar' })
      vi.advanceTimersByTime(100)
      expect(w.encerrado).toBe(true)
    } finally {
      vi.useRealTimers()
    }
  })
})

/* ---- o VAD inteiro: worklet falso + FrameProcessor de verdade + worker falso ---- */

class NoFalso {
  static ultimo: NoFalso | null = null
  port: { onmessage: ((e: { data: unknown }) => void) | null; postMessage: ReturnType<typeof vi.fn> } = {
    onmessage: null,
    postMessage: vi.fn(),
  }
  constructor() {
    NoFalso.ultimo = this
  }
  /** O worklet real manda `{ message: AUDIO_FRAME, data: ArrayBuffer }`. */
  quadro(f: Float32Array): void {
    this.port.onmessage?.({ data: { message: Message.AudioFrame, data: f.buffer } })
  }
}
class FonteFalsa {
  connect = vi.fn()
  disconnect = vi.fn()
}

const instalarAudioFalso = (): AudioContext => {
  ;(globalThis as unknown as Record<string, unknown>).AudioWorkletNode = NoFalso
  ;(globalThis as unknown as Record<string, unknown>).MediaStreamAudioSourceNode = FonteFalsa
  return { audioWorklet: { addModule: vi.fn(async () => undefined) } } as unknown as AudioContext
}

const quadroDe = (valor: number): Float32Array => new Float32Array(1536).fill(valor)
const esperar = (ms = 0): Promise<void> => new Promise((r) => setTimeout(r, ms))

function opcoesDe(eventos: string[], extra: Partial<Parameters<typeof VadEmWorker.new>[0]> = {}) {
  return {
    baseAssetPath: '/',
    getStream: () => Promise.resolve({} as MediaStream),
    audioContext: instalarAudioFalso(),
    positiveSpeechThreshold: 0.5,
    negativeSpeechThreshold: 0.35,
    redemptionMs: 800,
    preSpeechPadMs: 300,
    minSpeechMs: 400,
    submitUserSpeechOnPause: true,
    onFrameProcessed: () => eventos.push('quadro'),
    onSpeechStart: () => eventos.push('inicio'),
    onVADMisfire: () => eventos.push('misfire'),
    onSpeechEnd: (a: Float32Array) => eventos.push(`fim:${a.length}`),
    ...extra,
  }
}

describe('VadEmWorker: a segmentação é a da biblioteca, com o modelo no worker', () => {
  beforeEach(() => {
    NoFalso.ultimo = null
  })

  it('fala de 10 quadros + 9 de silêncio (redenção de 800 ms / 96 ms = 8) fecha com pré-pad de 3 quadros', async () => {
    const w = new WorkerFalso()
    // Quadros 0-2 silêncio (viram pré-pad: 300 ms / 96 = 3), 3-12 fala, 13+ silêncio.
    w.probabilidade = (_p, n) => (n >= 3 && n <= 12 ? 0.9 : 0.1)
    const eventos: string[] = []
    const vad = await VadEmWorker.new(opcoesDe(eventos, { criarWorker: () => w }), { FrameProcessor, Message })
    const no = NoFalso.ultimo!
    for (let i = 0; i < 22; i++) {
      no.quadro(quadroDe(i + 1))
      await esperar()
    }
    expect(eventos.filter((e) => e !== 'quadro')).toEqual([
      'inicio',
      // 3 de pré-pad + 10 de fala + 8 de silêncio da redenção.
      `fim:${(3 + 10 + 8) * 1536}`,
    ])
    expect(eventos.filter((e) => e === 'quadro')).toHaveLength(22)
    await vad.destroy()
  })

  it('ruído curto (menos de 400 ms de fala) é misfire, não fala', async () => {
    const w = new WorkerFalso()
    w.probabilidade = (_p, n) => (n >= 1 && n <= 2 ? 0.9 : 0.1)
    const eventos: string[] = []
    await VadEmWorker.new(opcoesDe(eventos, { criarWorker: () => w }), { FrameProcessor, Message })
    for (let i = 0; i < 16; i++) {
      NoFalso.ultimo!.quadro(quadroDe(1))
      await esperar()
    }
    expect(eventos.filter((e) => e !== 'quadro')).toEqual(['inicio', 'misfire'])
  })

  it('pause() entrega a fala em curso (submitUserSpeechOnPause) e reinicia o modelo; start() volta a ouvir', async () => {
    const w = new WorkerFalso()
    w.probabilidade = () => 0.9
    const eventos: string[] = []
    const vad = await VadEmWorker.new(opcoesDe(eventos, { criarWorker: () => w }), { FrameProcessor, Message })
    for (let i = 0; i < 6; i++) {
      NoFalso.ultimo!.quadro(quadroDe(1))
      await esperar()
    }
    await vad.pause()
    expect(eventos.filter((e) => e !== 'quadro')).toEqual(['inicio', `fim:${6 * 1536}`])
    expect(w.recebidas.some((m) => m.tipo === 'reiniciar')).toBe(true)
    // Pausado: o que chegar não vira quadro.
    const antes = eventos.length
    NoFalso.ultimo!.quadro(quadroDe(1))
    await esperar()
    expect(eventos.length).toBe(antes)
    await vad.start()
    NoFalso.ultimo!.quadro(quadroDe(1))
    await esperar()
    expect(eventos.filter((e) => e === 'quadro')).toHaveLength(7)
  })

  it('o quadro vai ao worker com o áudio intacto e o evento de quadro traz as probabilidades', async () => {
    const w = new WorkerFalso()
    w.probabilidade = () => 0.25
    const vistos: Array<{ p: number; n: number }> = []
    await VadEmWorker.new(
      opcoesDe([], { criarWorker: () => w, onFrameProcessed: (p, f) => vistos.push({ p: p.isSpeech, n: f.length }) }),
      { FrameProcessor, Message },
    )
    NoFalso.ultimo!.quadro(quadroDe(0.5))
    await esperar()
    const enviado = w.recebidas.find((m) => m.tipo === 'quadro') as { pcm: Float32Array }
    expect(enviado.pcm).toHaveLength(1536)
    expect(enviado.pcm[0]).toBe(0.5)
    expect(vistos).toEqual([{ p: 0.25, n: 1536 }])
  })

  it('falha do worker em um quadro descarta o quadro e segue com o próximo', async () => {
    const w = new WorkerFalso()
    const erro = vi.spyOn(console, 'error').mockImplementation(() => undefined)
    const eventos: string[] = []
    await VadEmWorker.new(opcoesDe(eventos, { criarWorker: () => w }), { FrameProcessor, Message })
    w.mudo = true
    NoFalso.ultimo!.quadro(quadroDe(1))
    const id = (w.recebidas.filter((m) => m.tipo === 'quadro')[0] as { id: number }).id
    w.responder({ tipo: 'erro', id, mensagem: 'x' })
    await esperar()
    w.mudo = false
    NoFalso.ultimo!.quadro(quadroDe(1))
    await esperar()
    expect(eventos.filter((e) => e === 'quadro')).toHaveLength(1)
    expect(erro).toHaveBeenCalled()
    erro.mockRestore()
  })

  it('sem AudioWorklet, ou com o modelo ausente: new() rejeita (quem chama cai no MicVAD) e nada fica aberto', async () => {
    const w = new WorkerFalso()
    w.aoCarregar = 'modelo do VAD: HTTP 404'
    instalarAudioFalso()
    await expect(VadEmWorker.new(opcoesDe([], { criarWorker: () => w }), { FrameProcessor, Message })).rejects.toThrow(
      'HTTP 404',
    )
    expect(w.encerrado).toBe(true)

    const w2 = new WorkerFalso()
    const opcoes2 = opcoesDe([], { criarWorker: () => w2 })
    delete (globalThis as unknown as Record<string, unknown>).AudioWorkletNode
    await expect(VadEmWorker.new(opcoes2, { FrameProcessor, Message })).rejects.toThrow(/AudioWorklet/)
    expect(w2.recebidas).toEqual([]) // nem chegou a criar o worker
  })
})
