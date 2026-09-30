/**
 * A MÉTRICA `tts_inicio` (E1/E6 da Fase E): do fim da fala original ao começo da voz que lê a
 * tradução, por motor (a voz do aparelho ou a natural da nuvem). A meta do plano — ≤ 2,5 s p50 no
 * Premium — é medida no e2e do E6 por `window.__ttsInicio()`. Fica na aba e FORA do JS inicial (mora
 * com a fila, não no `captureMetrics` da captura): não entra no lote da telemetria.
 */
import { beforeEach, describe, expect, it } from 'vitest'

import { capMetrics } from '../src/gateway/capture/captureMetrics'
import { tempoAteAVoz } from '../src/lib/voz/tempoAteAVoz'

beforeEach(() => tempoAteAVoz.zerar())

describe('tts_inicio', () => {
  it('sem amostra, o resumo diz null (não um zero inventado)', () => {
    expect(tempoAteAVoz.resumo()).toBeNull()
  })

  it('p50/p95 das esperas e os motores que falaram', () => {
    for (const ms of [800, 1200, 2000, 2400]) tempoAteAVoz.registrar(ms, 'voz-da-nuvem')
    tempoAteAVoz.registrar(300, 'voz-do-aparelho')
    const r = tempoAteAVoz.resumo()!
    expect(r.p50).toBe(1200)
    expect(r.p95).toBe(2400)
    expect(r.amostras).toBe(5)
    expect(r.motores.sort()).toEqual(['voz-da-nuvem', 'voz-do-aparelho'])
    expect(r.porMotor['voz-da-nuvem'].p50).toBe(2000)
    expect(r.porMotor['voz-do-aparelho'].p50).toBe(300)
  })

  it('número inválido não entra; zerar zera', () => {
    tempoAteAVoz.registrar(Number.NaN, 'voz-da-nuvem')
    tempoAteAVoz.registrar(-5, 'voz-da-nuvem')
    expect(tempoAteAVoz.resumo()).toBeNull()
    tempoAteAVoz.registrar(500, 'voz-da-nuvem')
    tempoAteAVoz.zerar()
    expect(tempoAteAVoz.resumo()).toBeNull()
  })

  it('não vai para o lote da telemetria da captura', () => {
    tempoAteAVoz.registrar(500, 'voz-da-nuvem')
    expect(Object.keys(capMetrics.drenarTelemetria())).not.toContain('ttsInicioMs')
  })
})
