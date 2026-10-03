/**
 * O MEDIDOR POR ETAPA do intérprete (tasks 1.1/1.2b da change `interprete-fim-de-fala-inteligente`):
 * por fala, o tempo do STT e da tradução e o motor de cada um (`captureMetrics`); por sessão, p50/p95 de
 * cada etapa e o custo estimado (`tempoAteAVoz`). Só números e nomes de motor, nenhum texto.
 */
// @vitest-environment jsdom
import { beforeEach, describe, expect, it, vi } from 'vitest'

import { capMetrics, PRECO_DA_NUVEM_USD_POR_MIN } from '../src/gateway/capture/captureMetrics'
import { CHAVE_DO_ULTIMO_INTERPRETE, descreverEtapas, lerUltimoDoInterprete, tempoAteAVoz } from '../src/lib/voz/tempoAteAVoz'

beforeEach(() => {
  capMetrics.reset()
  tempoAteAVoz.zerar()
  localStorage.clear()
})

describe('capMetrics.etapasDaFala', () => {
  it('guarda STT e tradução da fala pelo id do balão, sem texto', () => {
    vi.spyOn(performance, 'now').mockReturnValueOnce(1000).mockReturnValueOnce(2000).mockReturnValueOnce(2400)
    capMetrics.start(5, 'mic')
    capMetrics.speechEnd(5)
    capMetrics.final(5, { audioMs: 3000, engine: 'groq-whisper', text: 'segredo do usuario' })
    capMetrics.mt(120, 'server-llm-mt', 'mic-5')
    const e = capMetrics.etapasDaFala('mic-5')
    expect(e?.stt).toEqual({ ms: 400, motor: 'groq-whisper', audioMs: 3000 })
    expect(e?.mt).toEqual({ ms: 120, motor: 'server-llm-mt' })
    expect(JSON.stringify(e)).not.toMatch(/segredo/)
    vi.restoreAllMocks()
  })

  it('o sistema usa o prefixo sys e uma fala sem id de tradução não cria etapa de MT', () => {
    capMetrics.start(2, 'system')
    capMetrics.speechEnd(2)
    capMetrics.final(2, { engine: 'whisper-local', text: 'a' })
    capMetrics.mt(50, 'opus-mt-local')
    expect(capMetrics.etapasDaFala('sys-2')?.stt?.motor).toBe('whisper-local')
    expect(capMetrics.etapasDaFala('sys-2')?.mt).toBeUndefined()
    expect(capMetrics.etapasDaFala('mic-2')).toBeUndefined()
  })

  it('reset apaga as etapas', () => {
    capMetrics.start(1, 'mic')
    capMetrics.speechEnd(1)
    capMetrics.final(1, { engine: 'x', text: 'a' })
    capMetrics.reset()
    expect(capMetrics.etapasDaFala('mic-1')).toBeUndefined()
  })
})

describe('tempoAteAVoz.etapa', () => {
  const voz = () => tempoAteAVoz.registrar(1500, 'voz-da-nuvem')

  it('sem etapa registrada o resumo não traz etapas nem custo inventado', () => {
    voz()
    const r = tempoAteAVoz.resumo()!
    expect(r.etapas).toBeUndefined()
    expect(r.custoUsd).toBeUndefined()
  })

  it('agrega p50/p95 por etapa e lista os motores', () => {
    voz()
    for (const ms of [300, 400, 500, 900]) tempoAteAVoz.etapa(`mic-${ms}`, 'stt', ms, 'groq-whisper')
    tempoAteAVoz.etapa('mic-1', 'mt', 700, 'server-llm-mt')
    tempoAteAVoz.etapa('mic-1', 'vad', 800, 'vad-fixo')
    tempoAteAVoz.etapa('mic-1', 'tts', 250, 'voz-da-nuvem')
    const r = tempoAteAVoz.resumo()!
    expect(r.etapas?.stt).toMatchObject({ p50: 500, p95: 900, amostras: 4, motores: ['groq-whisper'] })
    expect(r.etapas?.mt).toMatchObject({ p50: 700, amostras: 1, motores: ['server-llm-mt'] })
    expect(r.etapas?.vad?.motores).toEqual(['vad-fixo'])
    expect(r.etapas?.tts?.p50).toBe(250)
  })

  it('ignora tempo inválido', () => {
    voz()
    tempoAteAVoz.etapa('mic-1', 'stt', -5, 'x')
    tempoAteAVoz.etapa('mic-1', 'stt', Number.NaN, 'x')
    expect(tempoAteAVoz.resumo()!.etapas).toBeUndefined()
  })

  it('o custo estimado é só o do STT na nuvem (tradução e voz não têm preço no código)', () => {
    voz()
    tempoAteAVoz.etapa('mic-1', 'stt', 400, 'groq-whisper', 60_000)
    tempoAteAVoz.etapa('mic-2', 'stt', 400, 'whisper-local', 60_000)
    const r = tempoAteAVoz.resumo()!
    expect(r.custoUsd).toBeCloseTo(PRECO_DA_NUVEM_USD_POR_MIN, 6)
    expect(r.custoCobre).toBe('stt')
  })

  it('a mesma fala e etapa de novo substitui (o Repetir não duplica a amostra)', () => {
    voz()
    tempoAteAVoz.etapa('mic-1', 'tts', 100, 'voz-da-nuvem')
    tempoAteAVoz.etapa('mic-1', 'tts', 300, 'voz-da-nuvem')
    expect(tempoAteAVoz.resumo()!.etapas?.tts?.amostras).toBe(1)
    expect(tempoAteAVoz.resumo()!.etapas?.tts?.p50).toBe(300)
  })

  it('guarda as etapas para o /diagnostico, ainda sem texto, e zerar limpa', () => {
    voz()
    tempoAteAVoz.etapa('mic-1', 'stt', 400, 'groq-whisper', 3000)
    tempoAteAVoz.guardar(7)
    const g = lerUltimoDoInterprete()
    expect(g?.etapas?.stt?.p50).toBe(400)
    expect(localStorage.getItem(CHAVE_DO_ULTIMO_INTERPRETE)).not.toMatch(/texto/i)
    tempoAteAVoz.zerar()
    voz()
    expect(tempoAteAVoz.resumo()!.etapas).toBeUndefined()
  })
})

describe('descreverEtapas', () => {
  it('uma linha com p50/p95 e motor de cada etapa, na ordem do fluxo; null sem etapa', () => {
    expect(descreverEtapas({})).toBeNull()
    tempoAteAVoz.registrar(1500, 'voz-da-nuvem')
    tempoAteAVoz.etapa('a', 'tts', 250, 'voz-da-nuvem')
    tempoAteAVoz.etapa('a', 'stt', 400, 'groq-whisper')
    const linha = descreverEtapas(tempoAteAVoz.resumo()!)
    expect(linha).toBe('transcrição 400/400 ms (groq-whisper) · início da voz 250/250 ms (voz-da-nuvem)')
  })
})
