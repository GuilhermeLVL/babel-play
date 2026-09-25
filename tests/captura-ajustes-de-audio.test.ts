// @vitest-environment jsdom
/**
 * TRÊS AJUSTES DA CAPTURA QUE MUDAM O QUE CHEGA AO STT E AO DISCO.
 *
 *  1. Áudio do SISTEMA sem o processamento de voz de chamada (EC/NS/AGC). É música, vídeo, jogo —
 *     o DSP de conferência foi feito para microfone e come consoantes e trilha sonora.
 *  2. O gravador com taxa de bits EXPLÍCITA (uma constante só, para o benchmark poder afinar).
 *  3. O corte forçado de fala contínua vem por OPÇÃO: nuvem corta em 12 s (a Groq cobra 10 s
 *     mínimos por requisição e frase inteira transcreve melhor), local segue em 6 s.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

type OpcoesDoVad = { onSpeechStart?: () => void; onFrameProcessed?: (p: unknown, f: Float32Array) => void }
const vadFalso = { start: vi.fn(), pause: vi.fn(async () => {}), destroy: vi.fn() }
let opcoesDoVad: OpcoesDoVad = {}
vi.mock('@ricky0123/vad-web', () => ({
  MicVAD: {
    new: vi.fn(async (op: OpcoesDoVad) => {
      opcoesDoVad = op
      return vadFalso
    }),
  },
}))

import {
  MAX_SPEECH_MS_LOCAL,
  MAX_SPEECH_MS_NUVEM,
  startMicCapture,
  startSystemAudioCapture,
  TAXA_DE_BITS_DA_GRAVACAO,
} from '../src/gateway/capture/systemAudio'

class FakeRecorder {
  static opcoes: MediaRecorderOptions | undefined
  static isTypeSupported = () => true
  state = 'inactive'
  ondataavailable: ((e: unknown) => void) | null = null
  onstop: (() => void) | null = null
  constructor(_s: MediaStream, op?: MediaRecorderOptions) {
    FakeRecorder.opcoes = op
  }
  start() { this.state = 'recording' }
  pause() { this.state = 'paused' }
  resume() { this.state = 'recording' }
  stop() { this.state = 'inactive'; this.onstop?.() }
}

function faixaFalsa() {
  return { enabled: true, stop: vi.fn(), addEventListener: vi.fn(), label: 'x' }
}

async function micAberto(opcoes?: Parameters<typeof startMicCapture>[2]) {
  const faixa = faixaFalsa()
  const stream = { getAudioTracks: () => [faixa], getTracks: () => [faixa] } as unknown as MediaStream
  Object.defineProperty(navigator, 'mediaDevices', {
    configurable: true,
    value: { getUserMedia: vi.fn(async () => stream) },
  })
  return startMicCapture(undefined, { onUtterance: vi.fn() } as never, opcoes)
}

let agora = 0
beforeEach(() => {
  agora = 1 // 0 é "sem fala em curso" para o corte forçado
  vi.spyOn(performance, 'now').mockImplementation(() => agora)
  vadFalso.pause.mockClear()
  ;(globalThis as unknown as { MediaRecorder: unknown }).MediaRecorder = FakeRecorder
  // jsdom não tem MediaStream; a captura de tela embrulha só as faixas de áudio num stream novo.
  ;(globalThis as unknown as { MediaStream: unknown }).MediaStream = class {
    constructor(private faixas: unknown[] = []) {}
    getAudioTracks() { return this.faixas }
    getTracks() { return this.faixas }
  }
})
afterEach(() => vi.restoreAllMocks())

describe('áudio do sistema pelo compartilhamento de tela', () => {
  it('pede a faixa SEM cancelamento de eco, supressão de ruído e ganho automático', async () => {
    let pedido: Record<string, unknown> = {}
    const video = { getSettings: () => ({ displaySurface: 'browser' }), stop: vi.fn(), addEventListener: vi.fn() }
    const audio = faixaFalsa()
    Object.defineProperty(navigator, 'mediaDevices', {
      configurable: true,
      value: {
        getDisplayMedia: vi.fn(async (c: Record<string, unknown>) => {
          pedido = c
          return {
            getVideoTracks: () => [video],
            getAudioTracks: () => [audio],
            getTracks: () => [video, audio],
          }
        }),
      },
    })
    const captura = await startSystemAudioCapture({ onUtterance: vi.fn() } as never)
    const a = pedido.audio as Record<string, unknown>
    expect(a.echoCancellation).toBe(false)
    expect(a.noiseSuppression).toBe(false)
    expect(a.autoGainControl).toBe(false)
    expect(a.suppressLocalAudioPlayback).toBe(false)
    await captura.stop()
  })
})

describe('gravador da sessão', () => {
  it('grava com a taxa de bits explícita (Opus de fala a 32 kbps)', async () => {
    const captura = await micAberto()
    expect(TAXA_DE_BITS_DA_GRAVACAO).toBe(32_000)
    expect(FakeRecorder.opcoes?.audioBitsPerSecond).toBe(TAXA_DE_BITS_DA_GRAVACAO)
    await captura.stop()
  })
})

describe('corte forçado de fala contínua', () => {
  const quadro = new Float32Array(512)

  it('sem opção, corta em 6 s (caminho local)', async () => {
    const captura = await micAberto()
    expect(MAX_SPEECH_MS_LOCAL).toBe(6000)
    opcoesDoVad.onSpeechStart?.()
    agora = 6002
    opcoesDoVad.onFrameProcessed?.({}, quadro)
    expect(vadFalso.pause).toHaveBeenCalledTimes(1)
    await captura.stop()
  })

  it('com o motor final na nuvem, só corta em 12 s', async () => {
    const captura = await micAberto({ maxSpeechMs: () => MAX_SPEECH_MS_NUVEM })
    expect(MAX_SPEECH_MS_NUVEM).toBe(12_000)
    opcoesDoVad.onSpeechStart?.()
    agora = 7000
    opcoesDoVad.onFrameProcessed?.({}, quadro)
    expect(vadFalso.pause).not.toHaveBeenCalled()
    agora = 12_002
    opcoesDoVad.onFrameProcessed?.({}, quadro)
    expect(vadFalso.pause).toHaveBeenCalledTimes(1)
    await captura.stop()
  })

  it('a opção é lida a cada quadro: a rota decidida DEPOIS de abrir a captura vale', async () => {
    let nuvem = false
    const captura = await micAberto({ maxSpeechMs: () => (nuvem ? MAX_SPEECH_MS_NUVEM : MAX_SPEECH_MS_LOCAL) })
    nuvem = true // o roteador de STT responde depois do getUserMedia
    opcoesDoVad.onSpeechStart?.()
    agora = 6500
    opcoesDoVad.onFrameProcessed?.({}, quadro)
    expect(vadFalso.pause).not.toHaveBeenCalled()
    await captura.stop()
  })
})
