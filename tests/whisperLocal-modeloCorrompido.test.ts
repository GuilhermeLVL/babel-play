/**
 * FALHA PERSISTENTE DO MODELO (change `modelos-confiaveis-e-offline`, requisito "Modelo do cache que não carrega
 * se cura sozinho"): a cura do worker apagou e baixou de novo, e a sessão ainda não abre. A captura segue com o
 * modelo MENOR, no mesmo backend, avisa (motivo `modelo-corrompido`) e não entra em laço: o tiny não tem menor.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { modeloMenor, WhisperLocalStt } from '../src/gateway/adapters/whisperLocal'
import type { AvisoDeDegradacaoDoStt } from '../src/gateway/capabilities'
import { MOONSHINE_MODELS, WHISPER_MODELS } from '../src/gateway/sttRouter'

interface Msg {
  type: string
  model?: string
  device?: string
}

let enviadas: Msg[] = []
let defeituosos = new Set<string>()

class WorkerFalso {
  onmessage: ((m: MessageEvent) => void) | null = null
  onerror: ((e: ErrorEvent) => void) | null = null
  morto = false
  postMessage(msg: Msg) {
    enviadas.push(msg)
    if (msg.type !== 'load') return
    const data = defeituosos.has(msg.model!)
      ? { type: 'error', message: `[falha:modelo-corrompido] ${msg.model}: protobuf parsing failed` }
      : { type: 'ready' }
    queueMicrotask(() => !this.morto && this.onmessage?.({ data } as MessageEvent))
  }
  terminate() {
    this.morto = true
  }
}

beforeEach(() => {
  enviadas = []
  vi.stubGlobal('Worker', WorkerFalso)
  vi.stubGlobal('navigator', { ...globalThis.navigator, gpu: undefined })
})
afterEach(() => vi.unstubAllGlobals())

const cargas = () => enviadas.filter((m) => m.type === 'load').map((m) => m.model)

describe('modeloMenor', () => {
  it('a escada de cada família', () => {
    expect(modeloMenor(WHISPER_MODELS.small)).toBe(WHISPER_MODELS.base)
    expect(modeloMenor(WHISPER_MODELS.base)).toBe(WHISPER_MODELS.tiny)
    expect(modeloMenor(WHISPER_MODELS.tiny)).toBeNull()
    expect(modeloMenor(MOONSHINE_MODELS.base)).toBe(MOONSHINE_MODELS.tiny)
  })
})

describe('WhisperLocalStt com o modelo corrompido', () => {
  it('o base que não abre vira o tiny, com aviso, na mesma preparação', async () => {
    defeituosos = new Set([WHISPER_MODELS.base])
    const avisos: AvisoDeDegradacaoDoStt[] = []
    const stt = new WhisperLocalStt()
    stt.setModel(WHISPER_MODELS.base, { device: 'wasm' })
    await stt.preload(undefined, { aoDegradar: (a) => avisos.push(a) })
    expect(cargas()).toEqual([WHISPER_MODELS.base, WHISPER_MODELS.tiny])
    expect(avisos).toEqual([expect.objectContaining({ motivo: 'modelo-corrompido', modelo: WHISPER_MODELS.tiny })])
  })

  it('o tiny que não abre: a preparação falha com a marca, sem laço', async () => {
    defeituosos = new Set([WHISPER_MODELS.tiny])
    const stt = new WhisperLocalStt()
    stt.setModel(WHISPER_MODELS.tiny, { device: 'wasm' })
    await expect(stt.preload()).rejects.toThrow(/modelo-corrompido/)
    expect(cargas()).toEqual([WHISPER_MODELS.tiny])
  })
})
