/**
 * Guarda do adapter local: o Moonshine só transcreve INGLÊS. O roteador já não o escolhe fora do
 * inglês, mas o adapter é quem vê a dica de idioma de CADA trecho — se uma chegar em outro idioma
 * com o moonshine carregado (rota antiga, override manual), ele troca para o whisper-base em vez
 * de devolver inglês inventado a partir de fala em português.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { WhisperLocalStt } from '../src/gateway/adapters/whisperLocal'
import { MOONSHINE_MODELS, WHISPER_MODELS } from '../src/gateway/sttRouter'

interface Msg {
  type: string
  id?: string
  model?: string
  language?: string
}

let enviadas: Msg[] = []

class WorkerFalso {
  onmessage: ((m: MessageEvent) => void) | null = null
  onerror: ((e: ErrorEvent) => void) | null = null
  postMessage(msg: Msg) {
    enviadas.push(msg)
    queueMicrotask(() => {
      if (msg.type === 'load') this.onmessage?.({ data: { type: 'ready' } } as MessageEvent)
      if (msg.type === 'transcribe')
        this.onmessage?.({ data: { type: 'result', id: msg.id, text: 'ok' } } as MessageEvent)
    })
  }
  terminate() {}
}

beforeEach(() => {
  enviadas = []
  vi.stubGlobal('Worker', WorkerFalso)
})
afterEach(() => vi.unstubAllGlobals())

describe('WhisperLocalStt com moonshine', () => {
  it('dica em inglês: carrega e transcreve com o moonshine', async () => {
    const stt = new WhisperLocalStt()
    stt.setModel(MOONSHINE_MODELS.base)
    await stt.transcribePcm(new Float32Array(1600), 16000, { languageHint: 'en' })
    expect(enviadas.filter((m) => m.type === 'load').map((m) => m.model)).toEqual([MOONSHINE_MODELS.base])
  })

  it('dica em português com moonshine: cai para o whisper-base antes de decodificar', async () => {
    const stt = new WhisperLocalStt()
    stt.setModel(MOONSHINE_MODELS.base)
    await stt.preload()
    const r = await stt.transcribePcm(new Float32Array(1600), 16000, { languageHint: 'pt' })
    expect(r.text).toBe('ok')
    const cargas = enviadas.filter((m) => m.type === 'load').map((m) => m.model)
    expect(cargas).toEqual([MOONSHINE_MODELS.base, WHISPER_MODELS.base])
    const decode = enviadas.find((m) => m.type === 'transcribe')
    expect(decode?.language).toBe('pt')
  })
})
