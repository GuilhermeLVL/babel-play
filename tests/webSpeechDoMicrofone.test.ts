/**
 * WEB SPEECH NO MICROFONE — o "Rápido" no celular falhava CALADO (relato do dono, 2026-09-28): a
 * permissão negada, o Siri/Ditado desligado no iPhone (`service-not-allowed`), o microfone ocupado
 * (`audio-capture`) e a rede caída (`network`) só iam ao `clog`, e o `onend` religava para sempre. A
 * tela dizia "Microfone ativo / Ouvindo…" e nenhuma legenda vinha.
 *
 * O contrato novo: o erro que diz "não vai funcionar aqui" sobe com `codigo` e `fatal` e PARA o
 * religar; o `no-speech` sobe como aviso (não para); um reconhecedor que termina e religa sem nunca
 * abrir o áudio é tratado como fatal; e o ciclo de vida (`onstart`/`onaudiostart`/som) chega a quem
 * chama — é ele que diz "o microfone abriu de verdade" (o relógio só anda a partir daí).
 */
import { afterEach, describe, expect, it, vi } from 'vitest'

import { type ErroDaWebSpeech, ERROS_FATAIS_DO_MIC, WebSpeechStt } from '../src/gateway/adapters/webSpeech'

class ReconhecedorFalso {
  static instancias: ReconhecedorFalso[] = []
  lang = ''
  continuous = false
  interimResults = false
  maxAlternatives = 1
  onresult: ((e: unknown) => void) | null = null
  onerror: ((e: { error?: string }) => void) | null = null
  onend: (() => void) | null = null
  onstart: (() => void) | null = null
  onaudiostart: (() => void) | null = null
  onsoundstart: (() => void) | null = null
  onsoundend: (() => void) | null = null
  starts = 0
  parou = false
  constructor() {
    ReconhecedorFalso.instancias.push(this)
  }
  start() {
    this.starts++
  }
  stop() {
    this.parou = true
  }
  abort() {}
  emitir(texto: string, isFinal: boolean) {
    const res = Object.assign([{ transcript: texto, confidence: 0.9 }], { isFinal })
    this.onresult?.({ resultIndex: 0, results: { length: 1, 0: res } })
  }
}

function montar() {
  ReconhecedorFalso.instancias = []
  vi.stubGlobal('window', { SpeechRecognition: ReconhecedorFalso })
  const cb = {
    onPartial: vi.fn(),
    onFinal: vi.fn(),
    onError: vi.fn(),
    onAudioAberto: vi.fn(),
    onSom: vi.fn(),
  }
  const sessao = new WebSpeechStt().startLive('pt-BR', cb)
  return { cb, sessao, rec: ReconhecedorFalso.instancias[0] }
}

afterEach(() => {
  vi.unstubAllGlobals()
})

describe('WebSpeechStt no microfone', () => {
  it.each([...ERROS_FATAIS_DO_MIC])('erro fatal %s: sobe com codigo + fatal e NÃO religa', (codigo) => {
    const { cb, rec } = montar()
    rec.onerror?.({ error: codigo })
    rec.onend?.()
    expect(rec.starts).toBe(1)
    expect(cb.onError).toHaveBeenCalledTimes(1)
    const erro = cb.onError.mock.calls[0][0] as ErroDaWebSpeech
    expect(erro.codigo).toBe(codigo)
    expect(erro.fatal).toBe(true)
  })

  it("'no-speech' sobe como aviso (não fatal) e o reconhecedor religa", () => {
    const { cb, rec } = montar()
    rec.onaudiostart?.()
    rec.onerror?.({ error: 'no-speech' })
    rec.onend?.()
    expect(rec.starts).toBe(2)
    const erro = cb.onError.mock.calls[0][0] as ErroDaWebSpeech
    expect(erro.codigo).toBe('no-speech')
    expect(erro.fatal).toBeFalsy()
  })

  it("'aborted' (parada normal) não é erro", () => {
    const { cb, rec } = montar()
    rec.onerror?.({ error: 'aborted' })
    expect(cb.onError).not.toHaveBeenCalled()
  })

  it('o áudio aberto chega UMA vez por sessão (onaudiostart, ou onstart quando o navegador não o tem)', () => {
    const { cb, rec } = montar()
    rec.onstart?.()
    rec.onaudiostart?.()
    rec.onend?.()
    rec.onaudiostart?.()
    expect(cb.onAudioAberto).toHaveBeenCalledTimes(1)
  })

  it('o som entra e sai: é o que anima o indicador sem um segundo getUserMedia', () => {
    const { cb, rec } = montar()
    rec.onsoundstart?.()
    rec.onsoundend?.()
    expect(cb.onSom.mock.calls).toEqual([[true], [false]])
  })

  it('religa-e-termina sem NUNCA abrir o áudio: vira erro fatal, e o religar para', () => {
    const { cb, rec } = montar()
    for (let i = 0; i < 10; i++) rec.onend?.()
    expect(rec.starts).toBeLessThanOrEqual(6)
    const erro = cb.onError.mock.calls.at(-1)?.[0] as ErroDaWebSpeech
    expect(erro.codigo).toBe('sem-audio')
    expect(erro.fatal).toBe(true)
  })

  it('com o áudio abrindo a cada volta, o religar do silêncio continua indefinidamente', () => {
    const { cb, rec } = montar()
    for (let i = 0; i < 10; i++) {
      rec.onaudiostart?.()
      rec.onend?.()
    }
    expect(rec.starts).toBe(11)
    expect(cb.onError).not.toHaveBeenCalled()
  })

  it('parciais e finais seguem como antes; stop encerra', () => {
    const { cb, rec, sessao } = montar()
    rec.emitir('bom', false)
    rec.emitir('bom dia', true)
    expect(cb.onPartial).toHaveBeenCalledWith('bom')
    expect(cb.onFinal).toHaveBeenCalledWith({ text: 'bom dia', language: 'pt-BR', confidence: 0.9 })
    sessao.stop()
    rec.onend?.()
    expect(rec.starts).toBe(1)
    expect(rec.parou).toBe(true)
  })
})
