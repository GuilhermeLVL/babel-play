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

let marca = 'modelo-corrompido'
let workers = 0
let soUmaVez = false

class WorkerFalso {
  constructor() {
    workers += 1
  }
  onmessage: ((m: MessageEvent) => void) | null = null
  onerror: ((e: ErrorEvent) => void) | null = null
  morto = false
  postMessage(msg: Msg) {
    enviadas.push(msg)
    if (msg.type !== 'load') return
    const data = defeituosos.has(msg.model!)
      ? { type: 'error', message: `[falha:${marca}] ${msg.model}: protobuf parsing failed` }
      : { type: 'ready' }
    // A cópia ruim saiu do cache: o download seguinte vem íntegro.
    if (soUmaVez) defeituosos.delete(msg.model!)
    queueMicrotask(() => !this.morto && this.onmessage?.({ data } as MessageEvent))
  }
  terminate() {
    this.morto = true
  }
}

beforeEach(() => {
  enviadas = []
  workers = 0
  soUmaVez = false
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
  it('1ª falha: worker NOVO e o mesmo modelo de novo (a cura); se abrir, nada de aviso', async () => {
    soUmaVez = true
    defeituosos = new Set([WHISPER_MODELS.base])
    const avisos: AvisoDeDegradacaoDoStt[] = []
    const stt = new WhisperLocalStt()
    stt.setModel(WHISPER_MODELS.base, { device: 'wasm' })
    await stt.preload(undefined, { aoDegradar: (a) => avisos.push(a) })
    expect(cargas()).toEqual([WHISPER_MODELS.base, WHISPER_MODELS.base])
    expect(workers).toBe(2)
    expect(avisos).toEqual([])
  })

  it('falha persistente: depois da cura, o base vira o tiny, com aviso, na mesma preparação', async () => {
    defeituosos = new Set([WHISPER_MODELS.base])
    const avisos: AvisoDeDegradacaoDoStt[] = []
    const stt = new WhisperLocalStt()
    stt.setModel(WHISPER_MODELS.base, { device: 'wasm' })
    await stt.preload(undefined, { aoDegradar: (a) => avisos.push(a) })
    expect(cargas()).toEqual([WHISPER_MODELS.base, WHISPER_MODELS.base, WHISPER_MODELS.tiny])
    expect(avisos).toEqual([expect.objectContaining({ motivo: 'modelo-corrompido', modelo: WHISPER_MODELS.tiny })])
  })

  it('o tiny que não abre: cura uma vez, depois a preparação falha com a marca, sem laço', async () => {
    defeituosos = new Set([WHISPER_MODELS.tiny])
    const stt = new WhisperLocalStt()
    stt.setModel(WHISPER_MODELS.tiny, { device: 'wasm' })
    await expect(stt.preload()).rejects.toThrow(/modelo-corrompido/)
    expect(cargas()).toEqual([WHISPER_MODELS.tiny, WHISPER_MODELS.tiny])
  })

  it('download cortado: cura uma vez; falhou de novo, rejeita e o próximo pedido nasce num worker limpo', async () => {
    defeituosos = new Set([WHISPER_MODELS.base])
    marca = 'download-interrompido'
    const stt = new WhisperLocalStt()
    stt.setModel(WHISPER_MODELS.base, { device: 'wasm' })
    await expect(stt.preload()).rejects.toThrow(/download-interrompido/)
    expect(cargas()).toEqual([WHISPER_MODELS.base, WHISPER_MODELS.base])
    // "Baixar de novo", com a rede de volta: worker novo, carga boa.
    defeituosos.clear()
    const antes = workers
    await stt.preload()
    expect(workers).toBe(antes + 1)
    marca = 'modelo-corrompido'
  })
})
