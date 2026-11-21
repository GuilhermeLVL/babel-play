/**
 * A CARGA DE CADA MODELO EM TRÊS FASES (`lab-medicao-legenda-traduzida`, tarefa 2.5): download, compilação e
 * aquecimento, com `frasy:modelo:<fase>:inicio|fim` e `{ modelo }`, em ordem, para o Whisper, o Moonshine, o Parakeet, o
 * opus-mt e o Bergamot. O worker avisa só as viradas de fase (`{ type: 'fase' }`); o adapter, na janela, põe as marcas.
 * Os workers aqui são falsos (as viradas reais de cada worker têm teste em `parakeetWorker.test.ts` e `bergamotWorker.test.ts`).
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { ID_DO_PARAKEET } from '../src/gateway/adapters/parakeetModelo'
import { MOONSHINE_MODELS, WHISPER_MODELS } from '../src/gateway/sttRouter'

type Mensagem = { type: string; id?: string; model?: string; src?: string; tgt?: string }

/** Responde a uma carga com as viradas de fase e o `ready`, como os workers de verdade. */
class WorkerFalso {
  static todos: WorkerFalso[] = []
  onmessage: ((e: MessageEvent) => void) | null = null
  onerror: ((e: ErrorEvent) => void) | null = null
  readonly tipo: string
  constructor(url: URL | string) {
    this.tipo = /(whisper|parakeet|bergamot|mt)Worker/.exec(String(url))?.[1] ?? '?'
    WorkerFalso.todos.push(this)
  }
  postMessage(m: Mensagem) {
    const carga = m.type === 'load' || m.type === 'carregar' || m.type === 'preload'
    if (!carga || this.tipo === 'bergamot') return // o do Bergamot é conduzido pelo teste (o id do par vai na resposta)
    // O worker do opus-mt responde com o modelo da direção pedida (`mtWorker.ts`).
    const model = m.type === 'preload' ? `Xenova/opus-mt-${m.src}-${m.tgt}` : m.model
    queueMicrotask(() => {
      this.responder({ type: 'fase', fase: 'compilacao', model })
      this.responder({ type: 'fase', fase: 'aquecimento', model })
      this.responder({ type: 'ready', model })
    })
  }
  responder(data: unknown) {
    this.onmessage?.({ data } as MessageEvent)
  }
  terminate() {}
}

const lerMarcas = (modelo: string) =>
  (performance.getEntriesByType('mark') as PerformanceMark[])
    .filter((m) => m.name.startsWith('frasy:modelo:') && (m.detail as { modelo?: string })?.modelo === modelo)
    .map((m) => m.name)

const SEIS = [
  'frasy:modelo:download:inicio',
  'frasy:modelo:download:fim',
  'frasy:modelo:compilacao:inicio',
  'frasy:modelo:compilacao:fim',
  'frasy:modelo:aquecimento:inicio',
  'frasy:modelo:aquecimento:fim',
]

function localStorageFalso() {
  const m = new Map<string, string>()
  return {
    getItem: (k: string) => m.get(k) ?? null,
    setItem: (k: string, v: string) => void m.set(k, v),
    removeItem: (k: string) => void m.delete(k),
    key: (i: number) => [...m.keys()][i] ?? null,
    get length() {
      return m.size
    },
  }
}

const tick = () => new Promise((r) => setTimeout(r, 0))

beforeEach(() => {
  vi.resetModules()
  WorkerFalso.todos = []
  performance.clearMarks()
  vi.stubGlobal('Worker', WorkerFalso)
  vi.stubGlobal('localStorage', localStorageFalso())
  vi.stubGlobal('__BERGAMOT_PT_EN__', true)
  vi.spyOn(console, 'warn').mockImplementation(() => {})
})
afterEach(() => {
  vi.unstubAllGlobals()
  vi.restoreAllMocks()
})

describe('marcas de carga por fase', () => {
  it('Whisper: as três fases em ordem, com o modelo', async () => {
    const { WhisperLocalStt } = await import('../src/gateway/adapters/whisperLocal')
    const stt = new WhisperLocalStt()
    stt.setModel(WHISPER_MODELS.base)
    await stt.preload()
    expect(lerMarcas(WHISPER_MODELS.base)).toEqual(SEIS)
  })

  it('Moonshine (o mesmo adapter, outro modelo): as três fases em ordem', async () => {
    const { WhisperLocalStt } = await import('../src/gateway/adapters/whisperLocal')
    const stt = new WhisperLocalStt()
    stt.setModel(MOONSHINE_MODELS.base)
    await stt.preload()
    expect(lerMarcas(MOONSHINE_MODELS.base)).toEqual(SEIS)
  })

  it('Parakeet: as três fases em ordem, com o id do modelo', async () => {
    const { ParakeetLocalStt } = await import('../src/gateway/adapters/parakeetLocal')
    await new ParakeetLocalStt().preload()
    expect(lerMarcas(ID_DO_PARAKEET)).toEqual(SEIS)
  })

  it('opus-mt: as três fases em ordem (cada modelo tem as suas)', async () => {
    const { OpusMtLocal } = await import('../src/gateway/adapters/opusMtLocal')
    const mt = new OpusMtLocal()
    mt.preload('es', 'en')
    await tick()
    expect(lerMarcas('Xenova/opus-mt-es-en')).toEqual(SEIS)
    expect(WorkerFalso.todos.filter((w) => w.tipo === 'mt')).toHaveLength(1)
  })

  it('Bergamot: as três fases em ordem', async () => {
    const { BergamotLocal } = await import('../src/gateway/adapters/bergamotLocal')
    const b = new BergamotLocal()
    b.preload('pt', 'en')
    // O worker responde com o id que o adapter espera para o par.
    const w = WorkerFalso.todos.find((x) => x.tipo === 'bergamot')!
    w.responder({ type: 'fase', fase: 'compilacao', model: 'bergamot/pt-en' })
    w.responder({ type: 'fase', fase: 'aquecimento', model: 'bergamot/pt-en' })
    w.responder({ type: 'ready', model: 'bergamot/pt-en' })
    expect(lerMarcas('bergamot/pt-en')).toEqual(SEIS)
  })

  it('carga que cai antes do ready não deixa fase aberta nem marca de fim', async () => {
    const { OpusMtLocal } = await import('../src/gateway/adapters/opusMtLocal')
    const mt = new OpusMtLocal()
    vi.spyOn(WorkerFalso.prototype, 'postMessage').mockImplementation(() => {})
    mt.preload('es', 'en')
    const w = WorkerFalso.todos.find((x) => x.tipo === 'mt')!
    w.responder({ type: 'loadError', model: 'Xenova/opus-mt-es-en', message: 'x' })
    w.responder({ type: 'fase', fase: 'aquecimento', model: 'Xenova/opus-mt-es-en' })
    expect(lerMarcas('Xenova/opus-mt-es-en')).toEqual(['frasy:modelo:download:inicio'])
  })
})
