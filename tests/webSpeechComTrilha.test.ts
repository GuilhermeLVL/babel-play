/**
 * WEB SPEECH COM TRILHA — o adaptador reconhece o áudio de uma `MediaStreamTrack` (aba/sistema) NO
 * aparelho: `rec.start(trilha)` + `processLocally = true` (Chrome 133+ / ~139+). Se as duas coisas
 * combinam não está documentado, então o adaptador falha FECHADO e com o código do erro, e quem chama
 * (a captura do sistema) cai no Whisper. A Web Speech na NUVEM nunca ouve a trilha: o áudio de um
 * vídeo é a fala de terceiros, e sairia para o Google.
 *
 * Um `SpeechRecognition` FALSO no `window` (o Node não tem nenhum): guarda o que recebeu no `start`.
 */
import { afterEach, describe, expect, it, vi } from 'vitest'

import { ERROS_FATAIS_DA_TRILHA, WebSpeechStt } from '../src/gateway/adapters/webSpeech'

type Evento = { resultIndex: number; results: { length: number; [i: number]: unknown } }

class ReconhecedorFalso {
  static instancias: ReconhecedorFalso[] = []
  static lancarNoStart: Error | null = null
  lang = ''
  continuous = false
  interimResults = false
  maxAlternatives = 1
  processLocally = false
  onresult: ((e: Evento) => void) | null = null
  onerror: ((e: { error?: string }) => void) | null = null
  onend: (() => void) | null = null
  starts: unknown[] = []
  parou = false
  constructor() {
    ReconhecedorFalso.instancias.push(this)
  }
  start(trilha?: unknown) {
    if (ReconhecedorFalso.lancarNoStart) throw ReconhecedorFalso.lancarNoStart
    this.starts.push(trilha)
  }
  stop() {
    this.parou = true
  }
  abort() {}
  /** Emite um resultado (parcial ou final) como o Chrome faz. */
  emitir(texto: string, isFinal: boolean) {
    const res = Object.assign([{ transcript: texto, confidence: 0.9 }], { isFinal })
    this.onresult?.({ resultIndex: 0, results: { length: 1, 0: res } })
  }
}

/** Um Chrome antigo: a propriedade `processLocally` não existe. */
class ReconhecedorSemLocal extends ReconhecedorFalso {
  constructor() {
    super()
    delete (this as { processLocally?: boolean }).processLocally
  }
}

const TRILHA = { kind: 'audio', id: 'trilha-da-aba' } as unknown as MediaStreamTrack

function comReconhecedor(Ctor: typeof ReconhecedorFalso) {
  ReconhecedorFalso.instancias = []
  ReconhecedorFalso.lancarNoStart = null
  vi.stubGlobal('window', { SpeechRecognition: Ctor })
}

function callbacks() {
  return { onPartial: vi.fn(), onFinal: vi.fn(), onError: vi.fn() }
}

afterEach(() => {
  vi.unstubAllGlobals()
})

describe('WebSpeechStt com trilha (áudio da aba/sistema, no aparelho)', () => {
  it('passa a trilha ao start e liga o processLocally', () => {
    comReconhecedor(ReconhecedorFalso)
    new WebSpeechStt({ processLocally: true, trilha: TRILHA }).startLive('en-US', callbacks())
    const rec = ReconhecedorFalso.instancias[0]
    expect(rec.starts).toEqual([TRILHA])
    expect(rec.processLocally).toBe(true)
    expect(rec.continuous).toBe(true)
    expect(rec.interimResults).toBe(true)
    expect(rec.lang).toBe('en-US')
  })

  it('NUNCA na nuvem: trilha sem processLocally lança antes de criar o reconhecedor', () => {
    comReconhecedor(ReconhecedorFalso)
    expect(() => new WebSpeechStt({ trilha: TRILHA }).startLive('en-US', callbacks())).toThrow()
    expect(ReconhecedorFalso.instancias).toHaveLength(0)
  })

  it('navegador sem processLocally: lança (o chamador cai no Whisper)', () => {
    comReconhecedor(ReconhecedorSemLocal)
    expect(() => new WebSpeechStt({ processLocally: true, trilha: TRILHA }).startLive('en-US', callbacks())).toThrow()
  })

  it('start(trilha) que lança (Chrome sem a sobrecarga): LANÇA, não vira erro assíncrono', () => {
    comReconhecedor(ReconhecedorFalso)
    ReconhecedorFalso.lancarNoStart = new TypeError('Failed to execute start: parameter 1 is not of type MediaStreamTrack')
    const cb = callbacks()
    expect(() => new WebSpeechStt({ processLocally: true, trilha: TRILHA }).startLive('en-US', cb)).toThrow(TypeError)
    expect(cb.onError).not.toHaveBeenCalled()
  })

  it('parciais e finais chegam como no microfone', () => {
    comReconhecedor(ReconhecedorFalso)
    const cb = callbacks()
    new WebSpeechStt({ processLocally: true, trilha: TRILHA }).startLive('pt-BR', cb)
    const rec = ReconhecedorFalso.instancias[0]
    rec.emitir('olá a', false)
    rec.emitir('olá a todos', true)
    expect(cb.onPartial).toHaveBeenCalledWith('olá a')
    expect(cb.onFinal).toHaveBeenCalledWith({ text: 'olá a todos', language: 'pt-BR', confidence: 0.9 })
  })

  it('onend religa COM A MESMA trilha enquanto a captura está ativa; stop encerra', () => {
    comReconhecedor(ReconhecedorFalso)
    const sessao = new WebSpeechStt({ processLocally: true, trilha: TRILHA }).startLive('en-US', callbacks())
    const rec = ReconhecedorFalso.instancias[0]
    rec.onend?.()
    rec.onend?.()
    expect(rec.starts).toEqual([TRILHA, TRILHA, TRILHA])
    sessao.stop()
    rec.onend?.()
    expect(rec.starts).toHaveLength(3)
    expect(rec.parou).toBe(true)
  })

  it.each([...ERROS_FATAIS_DA_TRILHA])('erro fatal %s: sobe com o código e NÃO religa', (codigo) => {
    comReconhecedor(ReconhecedorFalso)
    const cb = callbacks()
    new WebSpeechStt({ processLocally: true, trilha: TRILHA }).startLive('en-US', cb)
    const rec = ReconhecedorFalso.instancias[0]
    rec.onerror?.({ error: codigo })
    rec.onend?.()
    expect(rec.starts).toHaveLength(1)
    expect(cb.onError).toHaveBeenCalledTimes(1)
    expect((cb.onError.mock.calls[0][0] as Error & { codigo?: string }).codigo).toBe(codigo)
  })

  it("'no-speech' e 'aborted' não são erro: religa", () => {
    comReconhecedor(ReconhecedorFalso)
    const cb = callbacks()
    new WebSpeechStt({ processLocally: true, trilha: TRILHA }).startLive('en-US', cb)
    const rec = ReconhecedorFalso.instancias[0]
    rec.onerror?.({ error: 'no-speech' })
    rec.onerror?.({ error: 'aborted' })
    rec.onend?.()
    expect(cb.onError).not.toHaveBeenCalled()
    expect(rec.starts).toHaveLength(2)
  })

  it('o microfone (sem trilha) continua chamando start() sem argumento', () => {
    comReconhecedor(ReconhecedorFalso)
    new WebSpeechStt({ processLocally: true }).startLive('pt-BR', callbacks())
    expect(ReconhecedorFalso.instancias[0].starts).toEqual([undefined])
  })
})
