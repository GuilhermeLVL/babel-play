// @vitest-environment jsdom
/**
 * O CONTEXTO DE ÁUDIO NASCE NO CLIQUE. No iPhone (WebKit), um `AudioContext` criado fora do gesto
 * pode ficar 'suspended' para sempre: sem quadros, nível 0, "Ouvindo…" e nenhuma legenda, sem erro
 * nenhum. Entre o toque em Iniciar e o `MicVAD.new` havia vários `await` (cache, sonda do navegador,
 * permissão, Silero) — e o VAD criava o contexto DELE lá no fim. Agora o clique cria UM contexto e
 * chama `resume()` antes de qualquer `await`; a captura do microfone o recebe e o entrega ao VAD
 * (`audioContext` do `@ricky0123/vad-web`) e à sonda de nível — nenhum outro é criado.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const opcoesDoVad: Array<Record<string, unknown>> = []
vi.mock('@ricky0123/vad-web', () => ({
  MicVAD: {
    new: vi.fn(async (o: Record<string, unknown>) => {
      opcoesDoVad.push(o)
      return { start: vi.fn(), pause: vi.fn(), destroy: vi.fn() }
    }),
  },
}))

import { startMicCapture } from '../src/gateway/capture/systemAudio'
import {
  abrirContextoDoClique,
  descartarContextoDoClique,
  tomarContextoDoClique,
} from '../src/lib/captura/contextoDoClique'

class ContextoFalso {
  static criados: ContextoFalso[] = []
  state = 'suspended'
  sampleRate = 48000
  resume = vi.fn(async () => {
    this.state = 'running'
  })
  close = vi.fn(async () => {
    this.state = 'closed'
  })
  createAnalyser = vi.fn(() => ({ fftSize: 0, getFloatTimeDomainData: vi.fn() }))
  createMediaStreamSource = vi.fn(() => ({ connect: vi.fn() }))
  constructor() {
    ContextoFalso.criados.push(this)
  }
}

class GravadorFalso {
  static isTypeSupported = () => true
  state = 'inactive'
  ondataavailable = null
  onstop: (() => void) | null = null
  start() {
    this.state = 'recording'
  }
  stop() {
    this.state = 'inactive'
    this.onstop?.()
  }
}

beforeEach(() => {
  opcoesDoVad.length = 0
  ContextoFalso.criados = []
  vi.stubGlobal('AudioContext', ContextoFalso)
  vi.stubGlobal('MediaRecorder', GravadorFalso)
})
afterEach(() => {
  descartarContextoDoClique()
  vi.unstubAllGlobals()
})

function microfoneQue(abre: () => Promise<MediaStream>) {
  Object.defineProperty(navigator, 'mediaDevices', { configurable: true, value: { getUserMedia: vi.fn(abre) } })
}
const faixa = () => ({ enabled: true, stop: vi.fn(), addEventListener: vi.fn() })
const streamCom = (f: ReturnType<typeof faixa>) =>
  ({ getAudioTracks: () => [f], getTracks: () => [f] }) as unknown as MediaStream

describe('contexto de áudio do clique', () => {
  it('abrir cria UM contexto e chama resume() na hora (síncrono, dentro do gesto)', () => {
    const ctx = abrirContextoDoClique()
    expect(ctx).toBe(ContextoFalso.criados[0])
    expect(ContextoFalso.criados[0].resume).toHaveBeenCalledTimes(1)
  })

  it('tomar entrega o contexto uma vez só; um clique novo fecha o que ninguém tomou', () => {
    abrirContextoDoClique()
    abrirContextoDoClique()
    expect(ContextoFalso.criados[0].close).toHaveBeenCalled()
    expect(tomarContextoDoClique()).toBe(ContextoFalso.criados[1])
    expect(tomarContextoDoClique()).toBeNull()
  })

  it('descartar fecha o contexto que sobrou (o Rápido não usa)', () => {
    abrirContextoDoClique()
    descartarContextoDoClique()
    expect(ContextoFalso.criados[0].close).toHaveBeenCalled()
    expect(tomarContextoDoClique()).toBeNull()
  })

  it('sem AudioContext no navegador: null, sem lançar', () => {
    vi.stubGlobal('AudioContext', undefined)
    expect(abrirContextoDoClique()).toBeNull()
  })
})

describe('startMicCapture com o contexto do clique', () => {
  it('o VAD e a sonda de nível usam o contexto recebido; nenhum outro nasce', async () => {
    microfoneQue(async () => streamCom(faixa()))
    const ctx = new ContextoFalso() as unknown as AudioContext
    ContextoFalso.criados = []
    await startMicCapture(undefined, { onUtterance: vi.fn() } as never, { audioContext: ctx })
    expect(opcoesDoVad[0].audioContext).toBe(ctx)
    expect((ctx as unknown as ContextoFalso).createAnalyser).toHaveBeenCalled()
    expect(ContextoFalso.criados).toHaveLength(0)
  })

  it('sem contexto recebido, o de sempre (o VAD cria o dele)', async () => {
    microfoneQue(async () => streamCom(faixa()))
    await startMicCapture(undefined, { onUtterance: vi.fn() } as never)
    expect(opcoesDoVad[0].audioContext).toBeUndefined()
  })

  it('permissão negada: a mensagem de sempre, com o nome do DOMException guardado (a tela classifica)', async () => {
    microfoneQue(async () => {
      throw new DOMException('Permission denied', 'NotAllowedError')
    })
    const erro = await startMicCapture(undefined, { onUtterance: vi.fn() } as never).catch((e: unknown) => e)
    expect((erro as Error).message).toMatch(/Permissão do microfone negada/)
    expect((erro as { nomeDoErro?: string }).nomeDoErro).toBe('NotAllowedError')
  })
})
