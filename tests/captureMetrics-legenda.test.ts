/**
 * O ACUMULADOR DA MEDIÇÃO DA LEGENDA (`lab-medicao-legenda-traduzida`, tarefa 2.4, definição D1).
 *
 * Por fala: `t_legenda − t_fim` (do último quadro de voz ao quadro que pinta a tradução FINAL). Fala sem tradução e fala
 * com falha ficam fora do percentil e viram contagem; tradução de cache, memória e nuvem ENTRAM (é o que a pessoa vê).
 * Só números: nada de texto, e o lote `v: 1` do servidor não muda.
 */
import { beforeEach, describe, expect, it } from 'vitest'

import { capMetrics } from '../src/gateway/capture/captureMetrics'

beforeEach(() => {
  capMetrics.reset()
  capMetrics.drenarLegenda()
})

describe('capMetrics — fim da fala até a legenda', () => {
  it('cache, nuvem, sem tradução e erro: as contagens da definição', () => {
    // 4 falas, cada uma com o último quadro de voz em t = 10 000 ms.
    for (const id of ['mic-1', 'mic-2', 'mic-3', 'mic-4']) capMetrics.fimDaVoz(id, 10_000)
    capMetrics.legendaTraduzida('mic-1', 'memoria', 10_040) // cache: entra, 40 ms
    capMetrics.legendaTraduzida('mic-2', 'nuvem', 11_350) // nuvem: entra, 1 350 ms
    capMetrics.semTraducaoDaLegenda('mic-3') // mesmo idioma: fora do percentil
    capMetrics.falhaDaLegenda('mic-4') // erro: fora do percentil

    expect(capMetrics.drenarLegenda()).toEqual({
      fimDaFalaAteLegendaMs: [40, 1350],
      falhas: 1,
      semTraducao: 1,
      carga: [],
    })
  })

  it('uma fala conta uma vez só: retradução ou falha depois do desfecho não soma', () => {
    capMetrics.fimDaVoz('mic-1', 1000)
    capMetrics.legendaTraduzida('mic-1', 'local', 1500)
    capMetrics.legendaTraduzida('mic-1', 'nuvem', 9000)
    capMetrics.falhaDaLegenda('mic-1')
    capMetrics.semTraducaoDaLegenda('mic-1')
    expect(capMetrics.drenarLegenda()).toMatchObject({ fimDaFalaAteLegendaMs: [500], falhas: 0, semTraducao: 0 })
  })

  it('fala sem marca de fim (Web Speech, sessão antiga) não entra em nada', () => {
    capMetrics.legendaTraduzida('mic-9', 'nuvem', 5000)
    capMetrics.falhaDaLegenda('mic-9')
    capMetrics.semTraducaoDaLegenda('mic-9')
    expect(capMetrics.drenarLegenda()).toMatchObject({ fimDaFalaAteLegendaMs: [], falhas: 0, semTraducao: 0 })
  })

  it('teto de 200 falas no lote (as mais antigas saem)', () => {
    for (let i = 0; i < 260; i++) {
      capMetrics.fimDaVoz(`mic-${i}`, 0)
      capMetrics.legendaTraduzida(`mic-${i}`, 'local', 100 + i)
    }
    const { fimDaFalaAteLegendaMs } = capMetrics.drenarLegenda()
    expect(fimDaFalaAteLegendaMs).toHaveLength(200)
    expect(fimDaFalaAteLegendaMs.at(-1)).toBe(359)
  })

  it('drenar zera o lote, mas a fala que ainda espera desfecho continua esperando', () => {
    capMetrics.fimDaVoz('mic-1', 100)
    capMetrics.fimDaVoz('mic-2', 100)
    capMetrics.legendaTraduzida('mic-1', 'local', 300)
    expect(capMetrics.drenarLegenda().fimDaFalaAteLegendaMs).toEqual([200])
    capMetrics.legendaTraduzida('mic-2', 'local', 700)
    expect(capMetrics.drenarLegenda().fimDaFalaAteLegendaMs).toEqual([600])
    expect(capMetrics.drenarLegenda().fimDaFalaAteLegendaMs).toEqual([])
  })

  it('uma gravação nova zera as falas em espera, mas não a carga dos modelos (é do aparelho)', () => {
    capMetrics.fimDaVoz('mic-1', 100)
    capMetrics.carga('bergamot-pt-en', 'download', 1200)
    capMetrics.reset()
    capMetrics.legendaTraduzida('mic-1', 'local', 900)
    expect(capMetrics.drenarLegenda()).toEqual({
      fimDaFalaAteLegendaMs: [],
      falhas: 0,
      semTraducao: 0,
      carga: [{ modelo: 'bergamot-pt-en', fase: 'download', ms: 1200 }],
    })
  })

  it('carga por modelo e fase: só números, valor inválido é ignorado', () => {
    capMetrics.carga('whisper', 'compilacao', 350.12345)
    capMetrics.carga('whisper', 'aquecimento', Number.NaN)
    expect(capMetrics.drenarLegenda().carga).toEqual([{ modelo: 'whisper', fase: 'compilacao', ms: 350.123 }])
  })

  it('o lote `v: 1` que vai ao servidor continua como era (nada novo nele)', () => {
    capMetrics.fimDaVoz('mic-1', 0)
    capMetrics.legendaTraduzida('mic-1', 'nuvem', 800)
    expect(Object.keys(capMetrics.drenarTelemetria()).sort()).toEqual(
      [
        'descartesAlucinacao',
        'fallbacks',
        'motorMt',
        'motorStt',
        'mtMs',
        'primeiroParcialMs',
        'rtf',
        'sttFinalMs',
      ].sort(),
    )
  })
})
