/**
 * A LEGENDA DO "RÁPIDO" NÃO REPETE A FALA (relato do dono no celular, 2026-09-29: "a legenda duplica,
 * repete o que a pessoa fala"). Reproduzido com uma Web Speech falsa no Pixel 7 emulado: "olá tudo bem
 * com você", dito UMA vez, virava 4 balões (finais crescendo + reenvio depois do religar) ou 7 (a lista
 * cumulativa reenviada com `resultIndex` 0).
 *
 * O Chrome do Android, com `continuous`, manda cada hipótese que cresce como um FINAL num índice novo
 * (confiança 0, nenhum parcial), às vezes reenvia os finais anteriores com `resultIndex` 0 e, depois
 * do religar do `onend`, reenvia o último final. O contrato: UM final por fala — a hipótese da sessão
 * é refeita de TODOS os resultados a cada evento, vai como parcial (o mesmo balão) e só é comprometida
 * quando para de crescer (`SILENCIO_DO_FINAL_MS`), no `onend` ou no `stop()`; o que já foi comprometido
 * sai dos finais seguintes; e o reenvio depois do religar (igual ou prefixo do último, dentro de
 * `JANELA_DO_REENVIO_MS`) é descartado. O desktop (parciais de verdade + finais) segue igual.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { JANELA_DO_REENVIO_MS, SILENCIO_DO_FINAL_MS, WebSpeechStt } from '../src/gateway/adapters/webSpeech'

type Item = [texto: string, final: boolean]

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
  constructor() {
    ReconhecedorFalso.instancias.push(this)
  }
  start() {
    this.starts++
  }
  stop() {}
  abort() {}
  /** Um evento com a lista INTEIRA de resultados da volta e o `resultIndex` dado. */
  emitir(itens: Item[], resultIndex: number, confianca = 0) {
    const results: Record<number, unknown> & { length: number } = { length: itens.length }
    itens.forEach(([t, f], i) => {
      results[i] = Object.assign([{ transcript: t, confidence: confianca }], { isFinal: f })
    })
    this.onresult?.({ resultIndex, results })
  }
  /** O `onend` do silêncio (o adaptador religa) com o áudio aberto nesta volta. */
  religar() {
    this.onaudiostart?.()
    this.onend?.()
  }
}

function montar() {
  ReconhecedorFalso.instancias = []
  vi.stubGlobal('window', { SpeechRecognition: ReconhecedorFalso })
  const cb = { onPartial: vi.fn(), onFinal: vi.fn(), onError: vi.fn() }
  const sessao = new WebSpeechStt().startLive('pt-BR', cb)
  const rec = ReconhecedorFalso.instancias[0]
  rec.onaudiostart?.()
  const finais = () => cb.onFinal.mock.calls.map((c) => (c[0] as { text: string }).text)
  return { cb, sessao, rec, finais }
}

const FRASE = 'olá tudo bem com você'

beforeEach(() => {
  vi.useFakeTimers()
})
afterEach(() => {
  vi.useRealTimers()
  vi.unstubAllGlobals()
})

describe('WebSpeechStt no Android (finais que crescem, sem parciais)', () => {
  it('finais crescendo em índices novos: UM final, depois que a fala para de crescer', () => {
    const { cb, rec, finais } = montar()
    rec.emitir([['olá', true]], 0)
    vi.advanceTimersByTime(700)
    rec.emitir([['olá', true], ['olá tudo', true]], 1)
    vi.advanceTimersByTime(700)
    rec.emitir([['olá', true], ['olá tudo', true], [FRASE, true]], 2)
    // Enquanto cresce, é o MESMO balão parcial.
    expect(cb.onFinal).not.toHaveBeenCalled()
    expect(cb.onPartial.mock.calls.map((c) => c[0])).toEqual(['olá', 'olá tudo', FRASE])
    vi.advanceTimersByTime(SILENCIO_DO_FINAL_MS)
    expect(finais()).toEqual([FRASE])
  })

  it('lista cumulativa reenviada com resultIndex 0: UM final', () => {
    const { rec, finais } = montar()
    rec.emitir([['olá', true]], 0)
    rec.emitir([['olá', true], ['olá tudo', true]], 0)
    rec.emitir([['olá', true], ['olá tudo', true], [FRASE, true]], 0)
    rec.emitir([['olá', true], ['olá tudo', true], [FRASE, true]], 0)
    vi.advanceTimersByTime(SILENCIO_DO_FINAL_MS + 10)
    expect(finais()).toEqual([FRASE])
  })

  it('o reenvio do último final depois do religar é descartado (e o onend compromete o pendente)', () => {
    const { cb, rec, finais } = montar()
    rec.emitir([['olá', true]], 0)
    rec.emitir([['olá', true], [FRASE, true]], 1)
    // O onend chega antes do silêncio: compromete já, e religa.
    rec.religar()
    expect(finais()).toEqual([FRASE])
    expect(rec.starts).toBe(2)
    const parciais = cb.onPartial.mock.calls.length
    // A volta nova reenvia o último final (e, às vezes, só o começo dele).
    vi.advanceTimersByTime(600)
    rec.emitir([[FRASE, true]], 0)
    rec.emitir([['Olá, tudo bem', true]], 0)
    vi.advanceTimersByTime(SILENCIO_DO_FINAL_MS * 2)
    expect(finais()).toEqual([FRASE])
    expect(cb.onPartial.mock.calls.length).toBe(parciais)
  })

  it('reenvio + fala nova na volta seguinte: só a parte nova vira final', () => {
    const { rec, finais } = montar()
    rec.emitir([[FRASE, true]], 0)
    rec.religar()
    rec.emitir([[`${FRASE} e aí`, true]], 0)
    vi.advanceTimersByTime(SILENCIO_DO_FINAL_MS)
    expect(finais()).toEqual([FRASE, 'e aí'])
  })

  it('fala nova depois do religar, fora do reenvio, entra inteira', () => {
    const { rec, finais } = montar()
    rec.emitir([[FRASE, true]], 0)
    vi.advanceTimersByTime(SILENCIO_DO_FINAL_MS)
    rec.religar()
    rec.emitir([['vamos embora', true]], 0)
    vi.advanceTimersByTime(SILENCIO_DO_FINAL_MS)
    // Depois da janela, até a MESMA frase dita de novo é fala nova.
    vi.advanceTimersByTime(JANELA_DO_REENVIO_MS + 1)
    rec.religar()
    rec.emitir([['vamos embora', true]], 0)
    vi.advanceTimersByTime(SILENCIO_DO_FINAL_MS)
    expect(finais()).toEqual([FRASE, 'vamos embora', 'vamos embora'])
  })

  it('segunda fala na MESMA volta: o que já foi comprometido sai do final seguinte', () => {
    const { rec, finais } = montar()
    rec.emitir([['olá', true], [FRASE, true]], 1)
    vi.advanceTimersByTime(SILENCIO_DO_FINAL_MS)
    rec.emitir([['olá', true], [FRASE, true], [`${FRASE} e aí`, true]], 2)
    vi.advanceTimersByTime(SILENCIO_DO_FINAL_MS)
    rec.emitir([['olá', true], [FRASE, true], [`${FRASE} e aí`, true], ['tudo certo', true]], 3)
    vi.advanceTimersByTime(SILENCIO_DO_FINAL_MS)
    expect(finais()).toEqual([FRASE, 'e aí', 'tudo certo'])
  })

  it('finais que NÃO se estendem (trechos separados) são juntados num final só', () => {
    const { rec, finais } = montar()
    rec.emitir([['olá', true]], 0)
    rec.emitir([['olá', true], ['tudo bem', true]], 1)
    vi.advanceTimersByTime(SILENCIO_DO_FINAL_MS)
    expect(finais()).toEqual(['olá tudo bem'])
  })

  it('stop() compromete o pendente na hora', () => {
    const { rec, sessao, finais } = montar()
    rec.emitir([[FRASE, true]], 0)
    sessao.stop()
    expect(finais()).toEqual([FRASE])
    vi.advanceTimersByTime(SILENCIO_DO_FINAL_MS * 2)
    expect(finais()).toEqual([FRASE])
  })
})

describe('WebSpeechStt no desktop (parciais de verdade + finais)', () => {
  it('parcial → final compromete NA HORA (sem esperar o silêncio), e a volta segue sem repetir', () => {
    const { cb, rec, finais } = montar()
    rec.emitir([['hello', false]], 0, 0.9)
    rec.emitir([['hello there', true]], 0, 0.9)
    expect(finais()).toEqual(['hello there'])
    expect(cb.onFinal.mock.calls[0][0]).toEqual({ text: 'hello there', language: 'pt-BR', confidence: 0.9 })
    rec.emitir([['hello there', true], ['how', false]], 1, 0.9)
    rec.emitir([['hello there', true], ['how are you', true]], 1, 0.9)
    expect(finais()).toEqual(['hello there', 'how are you'])
    expect(cb.onPartial.mock.calls.map((c) => c[0])).toEqual(['hello', 'how'])
    vi.advanceTimersByTime(SILENCIO_DO_FINAL_MS * 3)
    expect(finais()).toEqual(['hello there', 'how are you'])
  })
})
