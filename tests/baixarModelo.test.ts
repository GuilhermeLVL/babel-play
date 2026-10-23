// @vitest-environment jsdom
/**
 * baixarModelo: o download em segundo plano do Parakeet pelo caminho de carga do adapter (worker falso).
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { ID_DO_PARAKEET } from '../src/gateway/adapters/parakeetModelo'
import { baixarModelo } from '../src/gateway/baixarModelo'
import { gravarManifesto, temCopiaNoAparelho } from '../src/gateway/modelManifest'

let criados: WorkerFalso[] = []
let aoCarregar: (w: WorkerFalso) => void

/** O que o worker real faz antes do 'ready': manda o manifesto para a janela gravar. */
function manifestoDoWorker(w: WorkerFalso, extra: Record<string, unknown> = {}) {
  w.responder({
    type: 'manifesto-do-modelo',
    manifesto: {
      modelId: ID_DO_PARAKEET,
      dtype: 'int8',
      device: 'wasm',
      arquivos: [],
      bytesTotais: 10,
      bytesEsperados: 10,
      gravadoEm: 1,
      ...extra,
    },
  })
}

class WorkerFalso {
  onmessage: ((m: MessageEvent) => void) | null = null
  onerror: ((e: ErrorEvent) => void) | null = null
  encerrado = false
  constructor() {
    criados.push(this)
  }
  responder(data: unknown) {
    this.onmessage?.({ data } as MessageEvent)
  }
  postMessage(msg: { type: string }) {
    queueMicrotask(() => {
      if (!this.encerrado && msg.type === 'carregar') aoCarregar(this)
    })
  }
  terminate() {
    this.encerrado = true
  }
}

beforeEach(() => {
  criados = []
  localStorage.clear()
  aoCarregar = (w) => {
    w.responder({ type: 'progress', progress: 0.5, loaded: 5, total: 10, label: 'x' })
    manifestoDoWorker(w)
    w.responder({ type: 'ready', model: ID_DO_PARAKEET, cargaMs: 1 })
  }
  vi.stubGlobal('Worker', WorkerFalso)
})
afterEach(() => {
  vi.unstubAllGlobals()
})

describe('baixarModelo', () => {
  it('Parakeet: o progresso chega a 1, devolve baixado e libera o worker (sentinela limpa)', async () => {
    const fracoes: number[] = []
    const r = await baixarModelo(ID_DO_PARAKEET, (f) => fracoes.push(f))
    expect(r).toBe('baixado')
    expect(fracoes).toContain(0.5)
    expect(fracoes[fracoes.length - 1]).toBe(1)
    expect(criados[0].encerrado).toBe(true)
    expect(Object.keys(localStorage).some((k) => k.startsWith('babel.sentinela.'))).toBe(false)
  })

  it('AbortSignal abortado devolve cancelado', async () => {
    aoCarregar = () => {} // nunca termina
    const c = new AbortController()
    const p = baixarModelo(ID_DO_PARAKEET, undefined, c.signal)
    await new Promise((r) => setTimeout(r, 5))
    c.abort()
    expect(await p).toBe('cancelado')
    expect(criados[0].encerrado).toBe(true)
  })

  it('já abortado antes de começar: cancelado, sem criar worker', async () => {
    const c = new AbortController()
    c.abort()
    expect(await baixarModelo(ID_DO_PARAKEET, undefined, c.signal)).toBe('cancelado')
    expect(criados).toHaveLength(0)
  })

  it('erro de carga devolve falhou', async () => {
    aoCarregar = (w) => w.responder({ type: 'loadError', motivo: 'rede', message: 'sem rede' })
    expect(await baixarModelo(ID_DO_PARAKEET)).toBe('falhou')
  })

  it('id que não é o Parakeet devolve falhou (ainda não suportado)', async () => {
    expect(await baixarModelo('Xenova/whisper-small')).toBe('falhou')
  })

  it('com navigator.locks, a segunda chamada simultânea espera a primeira', async () => {
    const filas = new Map<string, Promise<unknown>>()
    const ordem: string[] = []
    vi.stubGlobal('navigator', {
      locks: {
        request: (nome: string, fn: () => Promise<unknown>) => {
          const anterior = filas.get(nome) ?? Promise.resolve()
          const atual = anterior.then(fn)
          filas.set(
            nome,
            atual.catch(() => {}),
          )
          return atual
        },
      },
    })
    const a = baixarModelo(ID_DO_PARAKEET, (f) => f === 1 && ordem.push('a'))
    const b = baixarModelo(ID_DO_PARAKEET, (f) => f === 1 && ordem.push('b'))
    await Promise.all([a, b])
    // Um worker só foi criado para a primeira; a segunda começou depois que a primeira terminou.
    expect(ordem[0]).toBe('a')
    expect(criados.length).toBeGreaterThanOrEqual(1)
  })

  it('o manifesto do int8 conta como cópia no aparelho', () => {
    gravarManifesto({
      modelId: ID_DO_PARAKEET,
      dtype: 'int8',
      device: 'wasm',
      arquivos: [],
      bytesTotais: 1,
      gravadoEm: 1,
    } as never)
    expect(temCopiaNoAparelho(ID_DO_PARAKEET)).toBe(true)
  })

  it('manifesto PARCIAL (bytesTotais < bytesEsperados) não é cópia e o download devolve falhou', async () => {
    aoCarregar = (w) => {
      manifestoDoWorker(w, { bytesTotais: 4 })
      w.responder({ type: 'ready', model: ID_DO_PARAKEET, cargaMs: 1 })
    }
    expect(await baixarModelo(ID_DO_PARAKEET)).toBe('falhou')
    expect(temCopiaNoAparelho(ID_DO_PARAKEET)).toBe(false)
  })

  it('manifesto legado sem bytesEsperados continua valendo como cópia', () => {
    gravarManifesto({
      modelId: ID_DO_PARAKEET,
      dtype: 'int8',
      device: 'wasm',
      arquivos: [],
      bytesTotais: 4,
      gravadoEm: 1,
    })
    expect(temCopiaNoAparelho(ID_DO_PARAKEET)).toBe(true)
  })

  it('iniciar a captura (abort) cancela, libera o worker e permite baixar de novo depois', async () => {
    const original = aoCarregar
    aoCarregar = () => {}
    const c = new AbortController()
    const p = baixarModelo(ID_DO_PARAKEET, undefined, c.signal)
    await new Promise((r) => setTimeout(r, 5))
    c.abort() // o que o LiveCapture faz quando isRecording vira true
    expect(await p).toBe('cancelado')
    expect(criados[0].encerrado).toBe(true)
    aoCarregar = original
    expect(await baixarModelo(ID_DO_PARAKEET)).toBe('baixado')
  })

  it('LiveCapture aborta o download ao gravar e ao desmontar (ligação)', async () => {
    const { readFileSync } = await import('node:fs')
    const fonte = readFileSync('src/components/views/LiveCapture.tsx', 'utf8')
    expect(fonte).toMatch(/if \(isRecording\) downloadDoPrecisoRef\.current\?\.abort\(\)/)
    expect(fonte).toMatch(/useEffect\(\(\) => \(\) => downloadDoPrecisoRef\.current\?\.abort\(\), \[\]\)/)
  })
})
