// @vitest-environment jsdom
/**
 * TELEMETRIA DE QUALIDADE DA CAPTURA — as métricas que só existiam no console passam a chegar.
 *
 * `captureMetrics` media latência de STT, primeiro parcial, MT e RTF numa sessão real, mas o ring
 * buffer morria na aba: `window.__capSummary()` só servia a quem abrisse o DevTools. Sem esses
 * números, "a legenda está lenta" não tinha como ser medido em produção.
 *
 * O contrato (o servidor recebe do outro lado): POST `/api/metricas/captura` a cada 60 s enquanto
 * grava e uma vez ao parar, com EXATAMENTE `{ v, sttFinalMs, primeiroParcialMs, mtMs, rtf,
 * descartesAlucinacao, fallbacks, motorStt, motorMt }` — só amostras desde o último envio, até 200
 * por lista, NENHUM texto do usuário, nenhum id. Falha é silenciosa. Quem desligou "Métricas de uso
 * anônimas" em Ajustes → Privacidade não manda nada; sem conta não há servidor para onde mandar.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('../src/data/api', () => ({ apiFetch: vi.fn(async () => new Response('{}', { status: 202 })) }))
const estado = { identidade: 'conta', metricas: true, restrita: false }
vi.mock('../src/lib/identidade', () => ({ estadoDeIdentidade: () => estado.identidade }))
vi.mock('../src/lib/preferencias', () => ({ lerPreferencias: () => ({ consentimentos: { metricas: estado.metricas } }) }))
vi.mock('../src/lib/protecaoDoMenor', () => ({ estadoDaProtecao: () => ({ restrita: estado.restrita }) }))

import { apiFetch } from '../src/data/api'
import { capMetrics } from '../src/gateway/capture/captureMetrics'
import {
  iniciarTelemetriaDeCaptura,
  pararTelemetriaDeCaptura,
  ROTA_DA_TELEMETRIA,
} from '../src/gateway/capture/telemetriaDeCaptura'

const api = apiFetch as unknown as ReturnType<typeof vi.fn>
let agora = 0

/** Um enunciado completo: fala começa, 1º parcial em 400 ms, fim em 2 s, final em 2,8 s. */
function enunciado(seq: number, texto = 'uma frase qualquer') {
  agora = 1000 * seq
  capMetrics.start(seq, 'system')
  agora += 400
  capMetrics.partial(seq)
  agora += 1600
  capMetrics.speechEnd(seq)
  agora += 800
  capMetrics.final(seq, { decodeMs: 800, audioMs: 2000, text: texto, engine: 'groq-whisper' })
}

function corpoEnviado(i = 0) {
  return JSON.parse(api.mock.calls[i][1].body as string)
}

beforeEach(() => {
  vi.useFakeTimers()
  vi.spyOn(performance, 'now').mockImplementation(() => agora)
  api.mockClear()
  estado.identidade = 'conta'
  estado.metricas = true
  estado.restrita = false
  capMetrics.reset()
})
afterEach(() => {
  pararTelemetriaDeCaptura()
  vi.useRealTimers()
  vi.restoreAllMocks()
})

describe('o que o captureMetrics acumula para enviar', () => {
  it('só as amostras desde o último envio', () => {
    enunciado(1)
    capMetrics.mt(120, 'server-llm-mt')
    const a = capMetrics.drenarTelemetria()
    expect(a.sttFinalMs).toEqual([800])
    expect(a.primeiroParcialMs).toEqual([400])
    expect(a.rtf).toEqual([0.4])
    expect(a.mtMs).toEqual([120])
    expect(a.motorStt).toBe('groq-whisper')
    expect(a.motorMt).toBe('server-llm-mt')
    const b = capMetrics.drenarTelemetria()
    expect(b.sttFinalMs).toEqual([])
    expect(b.mtMs).toEqual([])
  })

  it('conta descartes por alucinação e fallbacks de motor', () => {
    capMetrics.alucinacao()
    capMetrics.alucinacao()
    capMetrics.fallback('stt:groq-whisper')
    capMetrics.fallback('stt:groq-whisper')
    capMetrics.fallback('mt:server-llm-mt')
    const a = capMetrics.drenarTelemetria()
    expect(a.descartesAlucinacao).toBe(2)
    expect(a.fallbacks).toEqual({ 'stt:groq-whisper': 2, 'mt:server-llm-mt': 1 })
    expect(capMetrics.drenarTelemetria().descartesAlucinacao).toBe(0)
  })

  it('cada lista tem no máximo 200 amostras (as mais recentes)', () => {
    for (let i = 0; i < 250; i++) capMetrics.mt(i, 'opus-mt-local')
    const a = capMetrics.drenarTelemetria()
    expect(a.mtMs).toHaveLength(200)
    expect(a.mtMs[0]).toBe(50)
  })
})

describe('envio', () => {
  it('a cada 60 s, POST com EXATAMENTE as chaves do contrato e sem texto do usuário', async () => {
    iniciarTelemetriaDeCaptura()
    enunciado(1, 'meu segredo falado')
    await vi.advanceTimersByTimeAsync(60_000)
    expect(api).toHaveBeenCalledTimes(1)
    expect(api.mock.calls[0][0]).toBe(ROTA_DA_TELEMETRIA)
    expect(ROTA_DA_TELEMETRIA).toBe('/api/metricas/captura')
    expect(api.mock.calls[0][1]).toMatchObject({ method: 'POST', keepalive: true })
    const corpo = corpoEnviado()
    expect(Object.keys(corpo).sort()).toEqual(
      ['descartesAlucinacao', 'fallbacks', 'motorMt', 'motorStt', 'mtMs', 'primeiroParcialMs', 'rtf', 'sttFinalMs', 'v'].sort(),
    )
    expect(corpo.v).toBe(1)
    expect(corpo.sttFinalMs).toEqual([800])
    expect(api.mock.calls[0][1].body).not.toContain('segredo')
  })

  it('janela sem nada medido não gera requisição', async () => {
    iniciarTelemetriaDeCaptura()
    await vi.advanceTimersByTimeAsync(60_000)
    expect(api).not.toHaveBeenCalled()
  })

  it('ao parar, manda o que sobrou e para o relógio', async () => {
    iniciarTelemetriaDeCaptura()
    enunciado(1)
    pararTelemetriaDeCaptura()
    expect(api).toHaveBeenCalledTimes(1)
    enunciado(2)
    await vi.advanceTimersByTimeAsync(120_000)
    expect(api).toHaveBeenCalledTimes(1)
  })

  it('na saída da página (pagehide), vai por sendBeacon', () => {
    const beacon = vi.fn(() => true)
    Object.defineProperty(navigator, 'sendBeacon', { configurable: true, value: beacon })
    iniciarTelemetriaDeCaptura()
    enunciado(1)
    window.dispatchEvent(new Event('pagehide'))
    expect(beacon).toHaveBeenCalledTimes(1)
    expect((beacon.mock.calls[0] as unknown[])[0]).toBe(ROTA_DA_TELEMETRIA)
    expect(api).not.toHaveBeenCalled()
  })

  it('falha de rede é engolida', async () => {
    api.mockRejectedValueOnce(new Error('offline'))
    iniciarTelemetriaDeCaptura()
    enunciado(1)
    expect(() => pararTelemetriaDeCaptura()).not.toThrow()
    await vi.runAllTimersAsync()
  })

  it('"Métricas de uso anônimas" desligada: nada sai', async () => {
    estado.metricas = false
    iniciarTelemetriaDeCaptura()
    enunciado(1)
    await vi.advanceTimersByTimeAsync(60_000)
    pararTelemetriaDeCaptura()
    expect(api).not.toHaveBeenCalled()
  })

  it('sem conta (modo anônimo) ou conta de menor restrita: nada sai, nem por beacon', async () => {
    const beacon = vi.fn(() => true)
    Object.defineProperty(navigator, 'sendBeacon', { configurable: true, value: beacon })
    for (const caso of [{ identidade: 'anonimo', restrita: false }, { identidade: 'conta', restrita: true }]) {
      Object.assign(estado, caso)
      iniciarTelemetriaDeCaptura()
      enunciado(1)
      window.dispatchEvent(new Event('pagehide'))
      pararTelemetriaDeCaptura()
    }
    expect(api).not.toHaveBeenCalled()
    expect(beacon).not.toHaveBeenCalled()
  })
})
