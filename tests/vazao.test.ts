// @vitest-environment jsdom
/**
 * A VAZÃO MEDIDA (carga-rapida-no-celular, 3.2): sem `navigator.connection` (Safari), a vazão vem dos arquivos que o
 * app já baixou e do progresso do modelo; guardada por 24 h; e a estimativa sai em faixa.
 */
import { beforeEach, describe, expect, it } from 'vitest'

import {
  estimarTempo,
  faixaEmTexto,
  guardarVazao,
  MedidorDeVazao,
  redeLentaPor,
  vazaoGuardada,
  vazaoPelosRecursos,
} from '../src/lib/dispositivo/vazao'

const t = (s: string, v?: Record<string, string | number>) =>
  s.replace(/\{(\w+)\}/g, (_, k: string) => String(v?.[k] ?? ''))

beforeEach(() => localStorage.clear())

describe('vazão pelos arquivos do app', () => {
  it('3G (~1,3 Mbit/s): o pedaço da Captura de 140 KB em ~880 ms', () => {
    const v = vazaoPelosRecursos([{ transferSize: 140 * 1024, responseStart: 1000, responseEnd: 1880 }])
    expect(v).toBeGreaterThan(1.2)
    expect(v).toBeLessThan(1.4)
  })

  it('ignora o pequeno, o do cache e o sem tempo; fica a maior', () => {
    expect(
      vazaoPelosRecursos([
        { transferSize: 2 * 1024, responseStart: 0, responseEnd: 500 },
        { transferSize: 0, encodedBodySize: 90 * 1024, responseStart: 0, responseEnd: 3 },
      ]),
    ).toBeNull()
    expect(
      vazaoPelosRecursos([
        { transferSize: 100 * 1024, responseStart: 0, responseEnd: 1000 },
        { transferSize: 0, encodedBodySize: 100 * 1024, responseStart: 0, responseEnd: 100 },
      ]),
    ).toBeCloseTo(8.19, 1)
  })
})

describe('rede lenta', () => {
  it('o tipo declarado vence; sem ele (Safari), a vazão medida abaixo de 1,5 Mbit/s', () => {
    expect(redeLentaPor({ tipoDeRede: '3g', vazaoMbps: 50 })).toBe(true)
    expect(redeLentaPor({ tipoDeRede: '4g', vazaoMbps: 0.5 })).toBe(false)
    expect(redeLentaPor({ tipoDeRede: null, vazaoMbps: 1.2 })).toBe(true)
    expect(redeLentaPor({ tipoDeRede: null, vazaoMbps: 9 })).toBe(false)
    expect(redeLentaPor({ tipoDeRede: null, vazaoMbps: null })).toBeNull()
  })
})

describe('guardada por 24 h', () => {
  it('vale até 24 h; depois some', () => {
    guardarVazao(1.3, 1_000)
    expect(vazaoGuardada(1_000 + 23 * 3600_000)).toBe(1.3)
    expect(vazaoGuardada(1_000 + 25 * 3600_000)).toBeNull()
  })
})

describe('medidor do progresso', () => {
  it('fetch lento: guarda a vazão depois dos primeiros 256 KB e dá a média da janela', () => {
    const guardadas: number[] = []
    const m = new MedidorDeVazao((v) => guardadas.push(v))
    /* 160 KB/s ≈ 1,31 Mbit/s */
    for (let s = 0; s <= 12; s++) m.registrar(s * 160 * 1024, s * 1000)
    expect(guardadas).toHaveLength(1)
    expect(guardadas[0]).toBeCloseTo(1.31, 1)
    expect(m.vazao()).toBeCloseTo(1.31, 1)
  })

  it('fetch rápido: 5 MB/s ≈ 42 Mbit/s', () => {
    const m = new MedidorDeVazao(() => undefined)
    for (let s = 0; s <= 3; s++) m.registrar(s * 5 * 1024 * 1024, s * 1000)
    expect(m.vazao()).toBeCloseTo(41.9, 0)
  })

  it('sem amostra suficiente, não diz nada', () => {
    const m = new MedidorDeVazao(() => undefined)
    m.registrar(0, 0)
    m.registrar(10 * 1024, 300)
    expect(m.vazao()).toBeNull()
  })
})

describe('estimativa em faixa', () => {
  it('76 MB a 1,3 Mbit/s: cerca de 7 a 12 min', () => {
    const f = estimarTempo(76 * 1024 * 1024, 1.3)!
    expect(faixaEmTexto(f, t)).toBe('cerca de 7 a 12 min')
  })

  it('pouco: menos de 1 min; sem vazão: sem estimativa', () => {
    expect(faixaEmTexto(estimarTempo(1024 * 1024, 20)!, t)).toBe('menos de 1 min')
    expect(estimarTempo(1024, null)).toBeNull()
  })
})
