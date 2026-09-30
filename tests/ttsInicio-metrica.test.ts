/**
 * A MÉTRICA `tts_inicio` (E1/E6 da Fase E): do fim da fala original ao começo da voz que lê a
 * tradução, por motor (a voz do aparelho ou a natural da nuvem). A meta do plano — ≤ 2,5 s p50 no
 * Premium — é medida no e2e do E6 por `window.__capSummary().ttsInicioMs`. Fica na aba, como as
 * escaladas: não entra no lote da telemetria (o contrato `v: 1` não muda).
 */
import { beforeEach, describe, expect, it } from 'vitest'

import { capMetrics } from '../src/gateway/capture/captureMetrics'

beforeEach(() => capMetrics.reset())

describe('tts_inicio', () => {
  it('sem amostra, o resumo diz null (não um zero inventado)', () => {
    expect(capMetrics.summary().ttsInicioMs).toBeNull()
  })

  it('p50/p95 das esperas e os motores que falaram', () => {
    for (const ms of [800, 1200, 2000, 2400]) capMetrics.ttsInicio(ms, 'voz-da-nuvem')
    capMetrics.ttsInicio(300, 'voz-do-aparelho')
    const r = capMetrics.summary().ttsInicioMs!
    expect(r.p50).toBe(1200)
    expect(r.p95).toBe(2400)
    expect(r.motores.sort()).toEqual(['voz-da-nuvem', 'voz-do-aparelho'])
    expect(r.porMotor['voz-da-nuvem'].p50).toBe(2000)
    expect(r.porMotor['voz-do-aparelho'].p50).toBe(300)
  })

  it('número inválido não entra; o reset zera', () => {
    capMetrics.ttsInicio(Number.NaN, 'voz-da-nuvem')
    capMetrics.ttsInicio(-5, 'voz-da-nuvem')
    expect(capMetrics.summary().ttsInicioMs).toBeNull()
    capMetrics.ttsInicio(500, 'voz-da-nuvem')
    capMetrics.reset()
    expect(capMetrics.summary().ttsInicioMs).toBeNull()
  })

  it('não vai para o lote da telemetria', () => {
    capMetrics.ttsInicio(500, 'voz-da-nuvem')
    expect(Object.keys(capMetrics.drenarTelemetria())).not.toContain('ttsInicioMs')
  })
})
