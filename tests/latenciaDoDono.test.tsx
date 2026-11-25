// @vitest-environment jsdom
/**
 * A VISÃO DO DONO DA LATÊNCIA (openspec `latencia-publicada-por-aparelho`, tarefa 2.4): p95 só com 1.000 falas ou mais, carga do
 * modelo por fase, mesma regra de `insuficiente`, contrato estrito e o painel com um arquivo fixo.
 */
import { cleanup, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'

const mundo = vi.hoisted(() => ({ ligada: true }))
vi.mock('../src/lib/flags', () => ({ useFlag: () => mundo.ligada }))
vi.mock('../src/lib/flagsCache', () => ({ flagLigada: () => mundo.ligada }))

import { fonteDeArquivo, fonteDoAnalyticsEngine, fonteDoPrometheus } from '../scripts/producao/latencia/fontes.mjs'
import { gerarLatenciaDoDono } from '../scripts/producao/publicar-latencia.mjs'
import SecaoDeLatencia, { PainelDeLatenciaView } from '../src/components/views/admin/SecaoDeLatencia'
import { LIMITES_DOS_BALDES_MS } from '../src/core/latencia/agregarLatencia'
import { agregarLatenciaDoDono, validarLatenciaDoDono } from '../src/core/latencia/latenciaDoDono'

const HOJE = new Date('2026-11-25T12:00:00Z')
afterEach(cleanup)

const AMOSTRAS = [
  { classe: 'celular-bom', idioma: 'en', baldes: [0, 0, 600, 300, 100, 0, 0, 0, 0], falas: 1000, falhas: 0 },
  { classe: 'quest', idioma: 'en', baldes: [0, 0, 400, 200, 0, 0, 0, 0, 0], falas: 600, falhas: 0 },
]
const CARGAS = [
  { classe: 'celular-bom', modelo: 'whisper-tiny', fase: 'download', baldes: [0, 0, 0, 0, 0, 100, 100, 0, 0] },
  { classe: 'celular-bom', modelo: 'whisper-tiny', fase: 'aquecimento', baldes: [0, 10, 0, 0, 0, 0, 0, 0, 0] },
  { classe: 'celular-bom', modelo: 'Modelo Inventado!', fase: 'download', baldes: [500, 0, 0, 0, 0, 0, 0, 0, 0] },
  { classe: 'celular-bom', modelo: 'whisper-tiny', fase: 'inventada', baldes: [500, 0, 0, 0, 0, 0, 0, 0, 0] },
]

describe('agregarLatenciaDoDono', () => {
  const dono = agregarLatenciaDoDono(AMOSTRAS, CARGAS, HOJE)

  it('p95 só com 1.000 falas ou mais: 1000 tem, 600 não', () => {
    const bom = dono.celulas.find((c) => c.classe === 'celular-bom' && c.idioma === 'en')!
    const quest = dono.celulas.find((c) => c.classe === 'quest' && c.idioma === 'en')!
    expect(bom).toMatchObject({ estado: 'ok', n: 1000, p50Ms: 1000, p75Ms: 1500, p95Ms: 2000 })
    expect(quest.estado).toBe('ok')
    expect(quest.p95Ms).toBeUndefined()
  })

  it('carga por fase: soma de baldes, piso de 200, modelo e fase fora da lista descartados', () => {
    const download = dono.cargas.find((c) => c.fase === 'download')!
    expect(download).toMatchObject({ modelo: 'whisper-tiny', n: 200, estado: 'ok', p50Ms: 3000, p75Ms: 5000 })
    expect(dono.cargas.find((c) => c.fase === 'aquecimento')).toMatchObject({ n: 10, estado: 'insuficiente' })
    expect(dono.cargas.find((c) => c.fase === 'aquecimento')?.p50Ms).toBeUndefined()
    expect(dono.cargas).toHaveLength(2)
  })

  it('o contrato aceita o que o agregador gera e recusa p95 com amostra pequena, campo extra e fase fora da lista', () => {
    expect(validarLatenciaDoDono(JSON.parse(JSON.stringify(dono)))).toEqual(dono)
    const quest = dono.celulas.findIndex((c) => c.classe === 'quest' && c.idioma === 'en')
    const comP95 = structuredClone(dono)
    comP95.celulas[quest]!.p95Ms = 3000
    expect(validarLatenciaDoDono(comP95)).toBeNull()
    expect(validarLatenciaDoDono({ ...dono, extra: 1 })).toBeNull()
    expect(validarLatenciaDoDono({ ...dono, cargas: [{ ...dono.cargas[0], fase: 'x' }] })).toBeNull()
    expect(validarLatenciaDoDono({ ...dono, cargas: [{ ...dono.cargas[0], texto: 'oi' }] })).toBeNull()
  })
})

describe('fontes: cargas', () => {
  it('Analytics Engine e Prometheus entregam as mesmas cargas', async () => {
    const linhas = CARGAS.slice(0, 2).flatMap((c) =>
      c.baldes.flatMap((q, i) =>
        q > 0
          ? [
              {
                classe: c.classe,
                modelo: c.modelo,
                fase: c.fase,
                limite_ms: LIMITES_DOS_BALDES_MS[i] ?? 30000,
                q: String(q),
              },
            ]
          : [],
      ),
    )
    const ae = fonteDoAnalyticsEngine({
      conta: 'b'.repeat(32),
      token: 't',
      buscar: (async () => ({ ok: true, json: async () => ({ data: linhas }) })) as never,
    })
    const serie = CARGAS.slice(0, 2).flatMap((c) => {
      let cum = 0
      return [...LIMITES_DOS_BALDES_MS.map(String), '+Inf'].map((le, i) => {
        cum += c.baldes[i]!
        return { metric: { classe: c.classe, modelo: c.modelo, fase: c.fase, le }, value: [0, String(cum)] }
      })
    })
    const prom = fonteDoPrometheus({
      base: 'http://p',
      buscar: (async () => ({ ok: true, json: async () => ({ status: 'success', data: { result: serie } }) })) as never,
    })
    const [a, p] = [await ae.lerCargas({ janelaDias: 28 }), await prom.lerCargas({ janelaDias: 28 })]
    const ordenar = (x: { fase: string }[]) => [...x].sort((m, n) => m.fase.localeCompare(n.fase))
    expect(ordenar(a)).toEqual(ordenar(p))
    expect(a).toHaveLength(2)
  })

  it('gerarLatenciaDoDono passa pelo contrato', async () => {
    const r = await gerarLatenciaDoDono({ fonte: fonteDeArquivo({ amostras: AMOSTRAS, cargas: CARGAS }), hoje: HOJE })
    expect(r.cargas).toHaveLength(2)
    expect(r.celulas.some((c: { p95Ms?: number }) => c.p95Ms === 2000)).toBe(true)
  })
})

describe('o painel do dono', () => {
  const dono = agregarLatenciaDoDono(AMOSTRAS, CARGAS, HOJE)

  it('mostra p50, p75, falha e n; p95 com 1.000 falas e "amostra pequena" com 600; carga por fase', () => {
    render(<PainelDeLatenciaView publico={null} dono={dono} />)
    const linhas = screen.getAllByRole('row')
    const bom = linhas.find((r) => r.textContent?.includes('Celular bom') && r.textContent.includes('EN'))!
    expect(bom.textContent).toContain('1000 ms')
    expect(bom.textContent).toContain('1500 ms')
    expect(bom.textContent).toContain('2000 ms')
    const quest = linhas.find((r) => r.textContent?.includes('Quest') && r.textContent.includes('EN'))!
    expect(quest.textContent).toContain('amostra pequena')
    expect(screen.getByText('Download')).toBeTruthy()
    expect(screen.getAllByText('whisper-tiny', { selector: 'td' }).length).toBe(2)
    expect(screen.queryByTestId('sem-visao-do-dono')).toBeNull()
  })

  it('sem a visão do dono usa o público e avisa que não há p95 nem carga; sem nada, explica', () => {
    const publico = { v: 1 as const, geradoEm: dono.geradoEm, janelaDias: dono.janelaDias, celulas: dono.celulas }
    const { unmount } = render(<PainelDeLatenciaView publico={publico} dono={null} />)
    expect(screen.getByTestId('sem-visao-do-dono')).toBeTruthy()
    unmount()
    render(<PainelDeLatenciaView publico={null} dono={null} />)
    expect(screen.getByText('Ainda sem agregado publicado')).toBeTruthy()
  })

  it('com a flag desligada o painel não renderiza', () => {
    mundo.ligada = false
    const { container } = render(<SecaoDeLatencia />)
    expect(container.innerHTML).toBe('')
    mundo.ligada = true
  })
})
