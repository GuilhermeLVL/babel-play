/**
 * ADAPTER DO PARAKEET — a mesma interface dos outros STT locais, com as recusas que o tornam seguro:
 * só português e espanhol com dica explícita, só 16 kHz, sem parcial, e a falha do MOTOR lembrada até
 * recarregar a página (rede e integridade tentam de novo).
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { ParakeetLocalStt } from '../src/gateway/adapters/parakeetLocal'
import { ID_DO_PARAKEET } from '../src/gateway/adapters/parakeetModelo'

interface Msg {
  type: string
  id?: string
  pcm?: Float32Array
  idioma?: string
  threads?: number
  plano?: { modelId: string; arquivos: { url: string }[] }
}

let enviadas: Array<{ msg: Msg; transferidos: unknown[] | undefined }> = []
let criados: WorkerFalso[] = []
/** O que o worker falso responde ao `carregar`. */
let aoCarregar: (w: WorkerFalso) => void

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
  postMessage(msg: Msg, transferidos?: unknown[]) {
    enviadas.push({ msg, transferidos })
    queueMicrotask(() => {
      if (this.encerrado) return
      if (msg.type === 'carregar') aoCarregar(this)
      if (msg.type === 'transcrever') this.responder({ type: 'result', id: msg.id, text: 'olá', descartado: false })
      if (msg.type === 'cancelar') this.responder({ type: 'cancelado', id: msg.id })
    })
  }
  terminate() {
    this.encerrado = true
  }
}

const doTipo = (tipo: string) => enviadas.filter((e) => e.msg.type === tipo).map((e) => e.msg)

beforeEach(() => {
  enviadas = []
  criados = []
  aoCarregar = (w) => w.responder({ type: 'ready', model: ID_DO_PARAKEET, cargaMs: 1 })
  vi.stubGlobal('Worker', WorkerFalso)
})
afterEach(() => vi.unstubAllGlobals())

describe('ParakeetLocalStt', () => {
  it('é um STT de blob, local e sem custo; NÃO tem parcial nem microfone ao vivo', () => {
    const stt = new ParakeetLocalStt()
    expect(stt.id).toBe('parakeet-local')
    expect(stt.supportsBlob).toBe(true)
    expect(stt.supportsLiveMic).toBe(false)
    expect(stt.isAvailable()).toBe(true)
    expect(stt.modeloAtual).toBe(ID_DO_PARAKEET)
    // Sem texto parcial: o gateway procura `transcribeIfIdle` e não acha aqui.
    expect((stt as unknown as Record<string, unknown>).transcribeIfIdle).toBeUndefined()
  })

  it('preload: manda o plano fixado e as threads, repassa o progresso por bytes e resolve no `ready`', async () => {
    aoCarregar = (w) => {
      w.responder({ type: 'progress', progress: 0.5, loaded: 336, total: 672, label: '336 de 672 MB' })
      w.responder({ type: 'ready', model: ID_DO_PARAKEET, cargaMs: 1 })
    }
    const stt = new ParakeetLocalStt()
    const progresso: unknown[] = []
    await stt.preload((p, rotulo, bytes) => progresso.push([p, rotulo, bytes]))
    const carga = doTipo('carregar')
    expect(carga).toHaveLength(1)
    expect(carga[0].plano!.modelId).toBe(ID_DO_PARAKEET)
    expect(carga[0].plano!.arquivos).toHaveLength(4)
    for (const a of carga[0].plano!.arquivos)
      expect(a.url).toMatch(/^https:\/\/huggingface\.co\/.+\/resolve\/[0-9a-f]{40}\//)
    expect(carga[0].threads).toBeGreaterThanOrEqual(1)
    expect(progresso).toEqual([[0.5, '336 de 672 MB', { loaded: 336, total: 672 }]])
  })

  it('dois preloads seguidos são UMA carga', async () => {
    const stt = new ParakeetLocalStt()
    await Promise.all([stt.preload(), stt.preload()])
    await stt.preload()
    expect(doTipo('carregar')).toHaveLength(1)
    expect(criados).toHaveLength(1)
  })

  it('transcreve: carrega no primeiro trecho, manda a dica de idioma e devolve o texto', async () => {
    const stt = new ParakeetLocalStt()
    const r = await stt.transcribePcm(new Float32Array(1600), 16000, { languageHint: 'pt-BR' })
    expect(r).toEqual({ text: 'olá' })
    expect(doTipo('carregar')).toHaveLength(1)
    expect(doTipo('transcrever')[0].idioma).toBe('pt-BR')
  })

  it('o PCM vai por CÓPIA: se o Parakeet falhar, o Whisper ainda recebe o mesmo trecho inteiro', async () => {
    const stt = new ParakeetLocalStt()
    const pcm = new Float32Array(1600).fill(0.1)
    await stt.transcribePcm(pcm, 16000, { languageHint: 'es' })
    const envio = enviadas.find((e) => e.msg.type === 'transcrever')!
    expect(envio.transferidos ?? []).toEqual([])
    expect(pcm.length).toBe(1600)
  })

  it('texto que o filtro de alucinação esvaziou chega marcado, para a telemetria contar', async () => {
    const stt = new ParakeetLocalStt()
    await stt.preload()
    criados[0].postMessage = function (msg: Msg) {
      queueMicrotask(() => this.responder({ type: 'result', id: msg.id, text: '', descartado: true }))
    }
    expect(await stt.transcribePcm(new Float32Array(1600), 16000, { languageHint: 'pt' })).toEqual({
      text: '',
      alucinacaoDescartada: true,
    })
  })

  it.each(['en', 'fr', '', undefined])('dica %j: recusa ANTES de carregar (a cadeia cai no Whisper)', async (dica) => {
    const stt = new ParakeetLocalStt()
    await expect(stt.transcribePcm(new Float32Array(1600), 16000, { languageHint: dica })).rejects.toThrow(
      /só atende português e espanhol/,
    )
    expect(enviadas).toEqual([])
    expect(criados).toEqual([])
  })

  it('áudio fora de 16 kHz é recusado (o modelo não reamostra)', async () => {
    const stt = new ParakeetLocalStt()
    await expect(stt.transcribePcm(new Float32Array(4800), 48000, { languageHint: 'pt' })).rejects.toThrow(/16 kHz/)
    expect(enviadas).toEqual([])
  })

  it('erro do worker num trecho rejeita só aquele trecho', async () => {
    const stt = new ParakeetLocalStt()
    await stt.preload()
    criados[0].postMessage = function (msg: Msg) {
      queueMicrotask(() => this.responder({ type: 'error', id: msg.id, message: 'falta de memória' }))
    }
    await expect(stt.transcribePcm(new Float32Array(1600), 16000, { languageHint: 'pt' })).rejects.toThrow(
      'falta de memória',
    )
    expect(stt.queueDepth).toBe(0)
    expect(stt.isAvailable()).toBe(true)
  })

  it('sinal já abortado, ou abortado no meio: AbortError (o gateway não passa ao próximo motor)', async () => {
    const stt = new ParakeetLocalStt()
    await stt.preload()
    const antes = new AbortController()
    antes.abort()
    await expect(
      stt.transcribePcm(new Float32Array(1600), 16000, { languageHint: 'pt', signal: antes.signal }),
    ).rejects.toMatchObject({ name: 'AbortError' })

    // O worker demora: só responde ao `cancelar`.
    criados[0].postMessage = function (msg: Msg) {
      enviadas.push({ msg, transferidos: undefined })
      if (msg.type === 'cancelar') queueMicrotask(() => this.responder({ type: 'cancelado', id: msg.id }))
    }
    const noMeio = new AbortController()
    const pedido = stt.transcribePcm(new Float32Array(1600), 16000, { languageHint: 'pt', signal: noMeio.signal })
    await Promise.resolve()
    expect(stt.busy).toBe(true)
    noMeio.abort()
    await expect(pedido).rejects.toMatchObject({ name: 'AbortError' })
    expect(doTipo('cancelar')).toHaveLength(1)
    expect(stt.busy).toBe(false)
  })

  it('falha de REDE na carga: rejeita, e o próximo preload tenta de novo num worker novo', async () => {
    aoCarregar = (w) => w.responder({ type: 'loadError', model: ID_DO_PARAKEET, motivo: 'rede', message: 'HTTP 503' })
    const stt = new ParakeetLocalStt()
    await expect(stt.preload()).rejects.toThrow(/rede.*HTTP 503/)
    expect(criados[0].encerrado).toBe(true)
    expect(stt.isAvailable()).toBe(true)
    aoCarregar = (w) => w.responder({ type: 'ready', model: ID_DO_PARAKEET, cargaMs: 1 })
    await stt.preload()
    expect(criados).toHaveLength(2)
  })

  it('falha do MOTOR (WASM, memória): fica lembrada; não baixa 672 MB de novo para falhar igual', async () => {
    aoCarregar = (w) =>
      w.responder({
        type: 'loadError',
        model: ID_DO_PARAKEET,
        motivo: 'motor',
        message: 'encoder não abriu: bad_alloc',
      })
    const stt = new ParakeetLocalStt()
    await expect(stt.preload()).rejects.toThrow(/motor.*bad_alloc/)
    expect(stt.isAvailable()).toBe(false)
    await expect(stt.preload()).rejects.toThrow(/bad_alloc/)
    await expect(stt.transcribePcm(new Float32Array(1600), 16000, { languageHint: 'pt' })).rejects.toThrow(/bad_alloc/)
    expect(criados).toHaveLength(1)
  })

  it('o worker que morre (onerror) não deixa pedido sem resposta', async () => {
    const stt = new ParakeetLocalStt()
    await stt.preload()
    criados[0].postMessage = () => {}
    const pedido = stt.transcribePcm(new Float32Array(1600), 16000, { languageHint: 'pt' })
    await Promise.resolve()
    criados[0].onerror?.({ message: 'Out of memory' } as ErrorEvent)
    await expect(pedido).rejects.toThrow('Out of memory')
    expect(stt.queueDepth).toBe(0)
  })

  it('liberar encerra o worker; a próxima transcrição recarrega', async () => {
    const stt = new ParakeetLocalStt()
    await stt.preload()
    stt.liberar()
    expect(criados[0].encerrado).toBe(true)
    await stt.transcribePcm(new Float32Array(1600), 16000, { languageHint: 'pt' })
    expect(criados).toHaveLength(2)
    expect(doTipo('carregar')).toHaveLength(2)
  })

  it('o manifesto que o worker manda é gravado na janela (o Worker não tem localStorage)', async () => {
    const gravados = new Map<string, string>()
    vi.stubGlobal('localStorage', {
      setItem: (k: string, v: string) => void gravados.set(k, v),
      getItem: (k: string) => gravados.get(k) ?? null,
    })
    aoCarregar = (w) => {
      w.responder({
        type: 'manifesto-do-modelo',
        manifesto: {
          modelId: ID_DO_PARAKEET,
          dtype: 'int8',
          device: 'wasm',
          arquivos: [],
          bytesTotais: 1,
          gravadoEm: 1,
        },
      })
      w.responder({ type: 'ready', model: ID_DO_PARAKEET, cargaMs: 1 })
    }
    await new ParakeetLocalStt().preload()
    expect([...gravados.keys()]).toEqual([`babel.modelManifest.${ID_DO_PARAKEET}|int8|wasm`])
  })
})
