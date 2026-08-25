/**
 * REGRESSÃO — M-08: cálculo de posição do popover de palavra estava DUPLICADO byte-a-byte em
 * Analysis e Reading. Extraído para posicaoPopoverPalavra (src/lib/posicaoFlutuante.ts).
 */
import { describe, it, expect } from 'vitest'
import { posicaoPopoverPalavra } from '../../src/lib/posicaoFlutuante'

const vp = { width: 1200, height: 800 }

describe('M-08 — posição do popover de palavra', () => {
  it('centraliza no termo e abre abaixo quando cabe', () => {
    const rect = { left: 500, top: 100, bottom: 120, width: 40 }
    const p = posicaoPopoverPalavra(rect, vp)
    expect(p.left).toBe(500 + 20 - 160) // centro - largura/2
    expect(p.top).toBe(128)             // bottom + 8
  })
  it('respeita a margem esquerda (não vaza pela borda)', () => {
    const p = posicaoPopoverPalavra({ left: 5, top: 100, bottom: 120, width: 20 }, vp)
    expect(p.left).toBe(16) // margem
  })
  it('respeita a margem direita', () => {
    const p = posicaoPopoverPalavra({ left: 1190, top: 100, bottom: 120, width: 20 }, vp)
    expect(p.left).toBe(1200 - 320 - 16)
  })
  it('abre para CIMA quando não cabe abaixo', () => {
    const rect = { left: 500, top: 700, bottom: 760, width: 40 } // perto do rodapé
    const p = posicaoPopoverPalavra(rect, vp)
    expect(p.top).toBe(700 - 360 - 8)
  })
})
