import { describe, expect, it } from 'vitest'

import { IDS_DAS_PECAS, PECAS, TETO_DE_TRIANGULOS_POR_PECA } from '../src/core/avatar/pecas'
import {
  construirPartes,
  IDS_COM_GEOMETRIA,
  type MedidasDaCabeca,
  triangulosDaGeometria,
} from '../src/lib/avatar/pecas3d'

/** Uma cabeça de 17 cm de largura, a medida típica de um VRM em metros. */
const cabeca = (escala = 1): MedidasDaCabeca => ({
  largura: 0.17 * escala,
  profundidade: 0.2 * escala,
  topo: 0.24 * escala,
  cx: 0,
  cz: 0.005 * escala,
  frente: 0.105 * escala,
  olhosY: 0.1 * escala,
  olhosX: 0.032 * escala,
  meiaNaOrelha: 0.085 * escala,
})

describe('geometria das peças', () => {
  it('toda peça do catálogo tem geometria e toda geometria tem peça', () => {
    expect([...IDS_COM_GEOMETRIA].sort()).toEqual([...IDS_DAS_PECAS].sort())
  })

  it.each(PECAS.map((p) => [p.id, p] as const))(
    '%s: ≤ 500 triângulos, bate com o orçamento do catálogo',
    (id, peca) => {
      const partes = construirPartes(id, cabeca())!
      expect(partes.length).toBeGreaterThan(0)
      const tri = partes.reduce((s, p) => s + triangulosDaGeometria(p.geo), 0)
      expect(tri).toBeLessThanOrEqual(TETO_DE_TRIANGULOS_POR_PECA)
      // O catálogo declara um teto honesto: cobre o real e não passa do dobro dele.
      expect(tri).toBeLessThanOrEqual(peca.orcamento.triangulos)
      expect(peca.orcamento.triangulos).toBeLessThanOrEqual(Math.ceil(tri * 1.35) + 20)
      partes.forEach((p) => p.geo.dispose())
    },
  )

  it.each(PECAS.map((p) => p.id))('%s: sem NaN e cabe perto da cabeça (calibrada pelo tamanho)', (id) => {
    for (const escala of [0.6, 1, 1.7]) {
      const m = cabeca(escala)
      const partes = construirPartes(id, m)!
      for (const p of partes) {
        p.geo.computeBoundingBox()
        const b = p.geo.boundingBox!
        for (const v of [b.min.x, b.min.y, b.min.z, b.max.x, b.max.y, b.max.z]) expect(Number.isFinite(v)).toBe(true)
        // Nada passa de ~6 larguras de cabeça do centro (capa e lenço descem pelo corpo; o resto é bem menor).
        const alcance = Math.max(
          Math.abs(b.min.x),
          Math.abs(b.max.x),
          Math.abs(b.max.y),
          Math.abs(b.min.y),
          Math.abs(b.min.z),
          Math.abs(b.max.z),
        )
        expect(alcance).toBeLessThan(m.largura * 6)
      }
      partes.forEach((p) => p.geo.dispose())
    }
  })

  it('as medidas escalam: a mesma peça numa cabeça duas vezes maior é duas vezes maior', () => {
    const largura = (e: number) => {
      const partes = construirPartes('bone', cabeca(e))!
      let max = -Infinity
      let min = Infinity
      for (const p of partes) {
        p.geo.computeBoundingBox()
        max = Math.max(max, p.geo.boundingBox!.max.x)
        min = Math.min(min, p.geo.boundingBox!.min.x)
      }
      return max - min
    }
    expect(largura(2) / largura(1)).toBeCloseTo(2, 3)
  })
})
