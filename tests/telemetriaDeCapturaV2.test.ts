// @vitest-environment jsdom
/**
 * TELEMETRIA DE CAMPO `v: 2` (`lab-medicao-legenda-traduzida`, 5.2): o cliente só monta o lote com a flag `rum_latencia`
 * ligada, consentimento, conta e perfil NÃO protegido; fora disso sai só o `v: 1`, como sempre. O lote passa no
 * validador do servidor e não carrega texto, id nem hora.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { LIMITES_DOS_BALDES_DE_CAMPO_MS } from '../server/http/metricas'
import { validarRelatorioDeCaptura } from '../server/routes/metricasCaptura'

vi.mock('../src/data/api', () => ({ apiFetch: vi.fn(async () => new Response('{}', { status: 202 })) }))
const estado = { flag: true, identidade: 'conta', metricas: true, restrita: false, protegido: false }
vi.mock('../src/lib/flagsCache', () => ({ flagLigada: () => estado.flag }))
vi.mock('../src/lib/identidade', () => ({ estadoDeIdentidade: () => estado.identidade }))
vi.mock('../src/lib/preferencias', () => ({
  lerPreferencias: () => ({ consentimentos: { metricas: estado.metricas } }),
}))
vi.mock('../src/lib/protecaoDoMenor', () => ({
  estadoDaProtecao: () => ({ restrita: estado.restrita }),
  perfilProtegido: () => estado.protegido,
}))
vi.mock('../src/lib/dispositivo/perfil', () => ({ perfilDoDispositivo: () => ({ tipo: 'desktop-com-gpu' }) }))
vi.mock('../src/lib/langConfig', () => ({ fetchLangConfig: async () => ({ studying: 'en-US' }) }))

import { apiFetch } from '../src/data/api'
import { capMetrics } from '../src/gateway/capture/captureMetrics'
import {
  iniciarTelemetriaDeCaptura,
  LIMITES_DOS_BALDES_MS,
  pararTelemetriaDeCaptura,
} from '../src/gateway/capture/telemetriaDeCaptura'

const api = apiFetch as unknown as ReturnType<typeof vi.fn>

/** Uma fala medida (fim da voz a 1000 ms, legenda a 1700 ms) e uma carga de modelo; liga também a telemetria de v1. */
function medir(): void {
  capMetrics.fimDaVoz('b1', 1000)
  capMetrics.mt(120, 'server-llm-mt')
  capMetrics.carga('opus-mt-en-pt', 'download', 1800)
  capMetrics.carga('opus-mt-en-pt', 'download', 400)
  capMetrics.carga('opus-mt-en-pt', 'compilacao', 20000)
  capMetrics.legendaTraduzida('b1', 'local', 1700)
}

beforeEach(() => {
  vi.useFakeTimers()
  api.mockClear()
  Object.assign(estado, { flag: true, identidade: 'conta', metricas: true, restrita: false, protegido: false })
  capMetrics.reset()
})
afterEach(() => {
  pararTelemetriaDeCaptura()
  vi.useRealTimers()
  vi.restoreAllMocks()
})

async function enviarUmLote(): Promise<Record<string, unknown> | null> {
  iniciarTelemetriaDeCaptura()
  await vi.advanceTimersByTimeAsync(0)
  medir()
  await vi.advanceTimersByTimeAsync(60_000)
  return api.mock.calls.length ? JSON.parse(api.mock.calls[0][1].body as string) : null
}

describe('v: 2 — a grade de quem pode', () => {
  const grade: { nome: string; mexer: Partial<typeof estado>; v: 2 | 1 | null }[] = [
    { nome: 'tudo certo', mexer: {}, v: 2 },
    { nome: 'flag desligada', mexer: { flag: false }, v: 1 },
    { nome: 'sem consentimento', mexer: { metricas: false }, v: null },
    { nome: 'sem conta', mexer: { identidade: 'anonimo' }, v: null },
    { nome: 'conta restrita (menor)', mexer: { restrita: true }, v: null },
    { nome: 'perfil protegido', mexer: { protegido: true }, v: 1 },
    { nome: 'flag desligada e protegido', mexer: { flag: false, protegido: true }, v: 1 },
  ]
  for (const c of grade) {
    it(c.nome, async () => {
      Object.assign(estado, c.mexer)
      const corpo = await enviarUmLote()
      expect(corpo?.v ?? null).toBe(c.v)
      if (c.v === 1) {
        expect(corpo).not.toHaveProperty('classe')
        expect(corpo).not.toHaveProperty('fimDaFalaAteLegenda')
        expect(corpo).not.toHaveProperty('carga')
      }
    })
  }
})

describe('v: 2 — formato', () => {
  it('os baldes são os do servidor', () => {
    expect([...LIMITES_DOS_BALDES_MS]).toEqual([...LIMITES_DOS_BALDES_DE_CAMPO_MS])
  })

  it('passa no validador do servidor, com contagens e sem texto, id ou hora', async () => {
    const corpo = await enviarUmLote()
    expect(corpo?.v).toBe(2)
    const r = validarRelatorioDeCaptura(corpo)
    expect(r).not.toBeNull()
    expect(r?.campo?.classe).toBe('desktop-com-gpu')
    expect(r?.campo?.carga).toHaveLength(2)
    // download: 400 ms (balde 1, até 500) e 1800 ms (balde 4, até 2000)
    expect(r?.campo?.carga.find((c) => c.fase === 'download')?.baldes).toEqual([0, 1, 0, 0, 1, 0, 0, 0, 0])
    // fala: 700 ms (balde 2, até 1000)
    expect(r?.campo?.legenda?.baldes).toEqual([0, 0, 1, 0, 0, 0, 0, 0, 0])
    expect(r?.campo?.legenda?.idioma).toBe('en')
    expect(Object.keys(corpo as object).sort()).toEqual(
      [
        'carga',
        'classe',
        'fimDaFalaAteLegenda',
        'descartesAlucinacao',
        'fallbacks',
        'mtMs',
        'motorMt',
        'motorStt',
        'primeiroParcialMs',
        'rtf',
        'sttFinalMs',
        'v',
      ].sort(),
    )
    expect(JSON.stringify(corpo)).not.toMatch(/b1|texto|userAgent/i)
  })
})
