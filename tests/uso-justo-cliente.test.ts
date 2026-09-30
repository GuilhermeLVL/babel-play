// @vitest-environment jsdom
/**
 * O USO JUSTO DO DIA NO CLIENTE (C4 da change `planos-v2`, ADR 0011).
 *
 * O servidor recusa com 429 `uso_justo_do_dia` quando a pessoa passa do uso justo de nuvem do dia.
 * O cliente precisa:
 *   - PAUSAR a nuvem pelo `Retry-After` (o teto de 15 min do `PausaDaNuvem` reavalia) — o aparelho
 *     assume a legenda na hora, sem ida ao servidor por fala;
 *   - avisar UMA vez por dia, com o aviso funcional (`babel:uso-justo-do-dia`);
 *   - NUNCA transformar isso em oferta de venda: quem chega aqui já é assinante.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('../src/data/api', () => ({ apiFetch: vi.fn() }))

import { apiFetch } from '../src/data/api'
import { GroqWhisperStt } from '../src/gateway/adapters/groqWhisper'
import { ServerLlmMt } from '../src/gateway/adapters/serverLlmMt'
import { PAUSA_MAXIMA_MS } from '../src/gateway/pausaDaNuvem'
import { EVENTO_OFERTA, momentoDaRecusa } from '../src/lib/ofertas/eventos'
import {
  _esquecerUsoJusto,
  aoUsoJustoDoDia,
  avisarUsoJustoDoDia,
  EVENTO_USO_JUSTO_DO_DIA,
} from '../src/lib/usoJustoDoDia'

const api = apiFetch as unknown as ReturnType<typeof vi.fn>

const usoJusto = (retryAfter = '3600') =>
  new Response(JSON.stringify({ error: 'hoje já deu', code: 'uso_justo_do_dia', detalhes: { retryAfter: 3600 } }), {
    status: 429,
    headers: { 'content-type': 'application/json', 'retry-after': retryAfter },
  })

let ofertas: Event[]
let avisos: number
let soltar: () => void
const contarOferta = (e: Event) => ofertas.push(e)

beforeEach(() => {
  vi.useFakeTimers()
  vi.setSystemTime(new Date('2026-09-30T15:00:00Z'))
  api.mockReset()
  _esquecerUsoJusto()
  ofertas = []
  avisos = 0
  window.addEventListener(EVENTO_OFERTA, contarOferta)
  soltar = aoUsoJustoDoDia(() => avisos++)
})
afterEach(() => {
  window.removeEventListener(EVENTO_OFERTA, contarOferta)
  soltar()
  vi.useRealTimers()
})

describe('o 429 do uso justo não é momento de oferta', () => {
  it('momentoDaRecusa: nada', () => {
    expect(momentoDaRecusa(429, { code: 'uso_justo_do_dia' })).toBeNull()
  })
})

describe('tradução (server-llm-mt)', () => {
  it('pausa a nuvem, avisa UMA vez e não vende nada', async () => {
    const a = new ServerLlmMt()
    api.mockResolvedValue(usoJusto())
    await expect(a.translate('hello', 'en', 'pt')).rejects.toThrow()
    expect(a.supports('en', 'pt')).toBe(false) // o aparelho assume na hora
    expect(avisos).toBe(1)

    // A pausa reavalia no teto (15 min); a segunda recusa do MESMO dia não avisa de novo.
    vi.advanceTimersByTime(PAUSA_MAXIMA_MS)
    expect(a.supports('en', 'pt')).toBe(true)
    await expect(a.translate('hello', 'en', 'pt')).rejects.toThrow()
    expect(avisos).toBe(1)
    await vi.runAllTimersAsync()
    expect(ofertas).toEqual([])
  })
})

describe('transcrição (groq-whisper)', () => {
  it('pausa a nuvem e avisa; nenhuma oferta', async () => {
    const a = new GroqWhisperStt({ model: 'whisper-large-v3-turbo' })
    api.mockResolvedValue(usoJusto())
    await expect(a.transcribePcm(new Float32Array(1600), 16_000)).rejects.toMatchObject({
      status: 429,
      code: 'uso_justo_do_dia',
    })
    expect(a.isAvailable()).toBe(false)
    expect(avisos).toBe(1)
    await vi.runAllTimersAsync()
    expect(ofertas).toEqual([])
  })
})

describe('o aviso é um por dia', () => {
  it('mesmo dia: uma vez; dia seguinte: de novo', () => {
    const vistos: string[] = []
    const parar = aoUsoJustoDoDia(() => vistos.push('x'))
    expect(avisarUsoJustoDoDia()).toBe(true)
    expect(avisarUsoJustoDoDia()).toBe(false)
    vi.setSystemTime(new Date('2026-10-01T15:00:00Z'))
    expect(avisarUsoJustoDoDia()).toBe(true)
    parar()
    expect(vistos).toHaveLength(2)
  })

  it('o evento da janela também sai (quem desenha a tela escuta ele)', () => {
    const ouvido = vi.fn()
    window.addEventListener(EVENTO_USO_JUSTO_DO_DIA, ouvido)
    avisarUsoJustoDoDia()
    window.removeEventListener(EVENTO_USO_JUSTO_DO_DIA, ouvido)
    expect(ouvido).toHaveBeenCalledTimes(1)
  })
})
