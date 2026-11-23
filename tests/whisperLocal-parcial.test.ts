/** Parcial do Whisper/Moonshine com `onUpdate` (flag `parciais_vivos`): sem ele, o parcial é o de sempre. */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { WhisperLocalStt } from '../src/gateway/adapters/whisperLocal'

interface Msg {
  type: string
  id?: string
  prioridade?: string
}

let enviadas: Msg[] = []
let atualizacoes: string[] = []

class WorkerFalso {
  onmessage: ((m: MessageEvent) => void) | null = null
  onerror: ((e: ErrorEvent) => void) | null = null
  postMessage(msg: Msg) {
    enviadas.push(msg)
    queueMicrotask(() => {
      const r = (data: unknown) => this.onmessage?.({ data } as MessageEvent)
      if (msg.type === 'load') r({ type: 'ready' })
      if (msg.type === 'transcribe') {
        for (const t of atualizacoes) r({ type: 'update', id: msg.id, text: t })
        r({ type: 'result', id: msg.id, text: atualizacoes.at(-1) ?? 'ok' })
      }
    })
  }
  terminate() {}
}

beforeEach(() => {
  enviadas = []
  atualizacoes = ['the', 'the cat', 'the cat sat']
  vi.stubGlobal('Worker', WorkerFalso)
})
afterEach(() => vi.unstubAllGlobals())

const pronto = async () => {
  const stt = new WhisperLocalStt()
  await stt.preload()
  return stt
}

describe('WhisperLocalStt.transcribeIfIdle com onUpdate', () => {
  it('o texto do decode em curso chega ao `onUpdate`, em prioridade `parcial`', async () => {
    const stt = await pronto()
    const vistos: string[] = []
    const r = await stt.transcribeIfIdle(new Float32Array(16000), 16000, {
      languageHint: 'en',
      onUpdate: (t) => vistos.push(t),
    })
    expect(vistos).toEqual(['the', 'the cat', 'the cat sat'])
    expect(r?.text).toBe('the cat sat')
    expect(enviadas.find((m) => m.type === 'transcribe')?.prioridade).toBe('parcial')
  })

  it('sem `onUpdate` (flag desligada): ninguém é avisado e o resultado é o de sempre', async () => {
    const stt = await pronto()
    const r = await stt.transcribeIfIdle(new Float32Array(16000), 16000, { languageHint: 'en' })
    expect(r?.text).toBe('the cat sat')
  })

  it('modelo não carregado: `null`, sem chamar o `onUpdate`', async () => {
    const stt = new WhisperLocalStt()
    const onUpdate = vi.fn()
    expect(await stt.transcribeIfIdle(new Float32Array(16000), 16000, { onUpdate })).toBeNull()
    expect(onUpdate).not.toHaveBeenCalled()
  })
})
