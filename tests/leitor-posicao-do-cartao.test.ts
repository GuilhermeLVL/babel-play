/**
 * ONDE O CARTÃO DA PALAVRA FICA (`core/leitura/posicaoDoCartao.ts`): perto da palavra, nunca por cima dela.
 */
import { describe, expect, it } from 'vitest'

import { posicaoDoCartao } from '../src/core/leitura/posicaoDoCartao'

const palavra = (top: number, left = 300, altura = 20, largura = 60) => ({
  top,
  left,
  bottom: top + altura,
  right: left + largura,
})
const DESKTOP = { largura: 1280, altura: 800 }
const CELULAR = { largura: 390, altura: 844 }
const CARTAO = { largura: 360, altura: 220 }

describe('posicaoDoCartao — computador', () => {
  it('abre abaixo da palavra quando cabe', () => {
    const p = posicaoDoCartao({ palavra: palavra(200), janela: DESKTOP, cartao: CARTAO })
    expect(p.modo).toBe('ancorado')
    if (p.modo !== 'ancorado') return
    expect(p.lado).toBe('abaixo')
    expect(p.top).toBeGreaterThanOrEqual(220)
  })

  it('abre acima quando a palavra está no pé da janela, sem cobri-la', () => {
    const w = palavra(740)
    const p = posicaoDoCartao({ palavra: w, janela: DESKTOP, cartao: CARTAO })
    expect(p.modo).toBe('ancorado')
    if (p.modo !== 'ancorado') return
    expect(p.lado).toBe('acima')
    expect(p.top + CARTAO.altura).toBeLessThanOrEqual(w.top)
  })

  it('sem espaço inteiro nos dois lados, usa o lado maior e limita a altura', () => {
    const w = palavra(300)
    const p = posicaoDoCartao({
      palavra: w,
      janela: { largura: 1280, altura: 500 },
      cartao: { largura: 360, altura: 400 },
    })
    expect(p.modo).toBe('ancorado')
    if (p.modo !== 'ancorado') return
    expect(p.lado).toBe('acima')
    expect(p.maxAltura).toBeLessThan(400)
    expect(p.top + p.maxAltura).toBeLessThanOrEqual(w.top)
  })

  it('não sai pela lateral da janela', () => {
    const p = posicaoDoCartao({ palavra: palavra(200, 1250, 20, 20), janela: DESKTOP, cartao: CARTAO })
    if (p.modo !== 'ancorado') throw new Error('esperava ancorado')
    expect(p.left + CARTAO.largura).toBeLessThanOrEqual(DESKTOP.largura)
    expect(p.left).toBeGreaterThanOrEqual(0)
  })
})

describe('posicaoDoCartao — celular (≤ 600 px)', () => {
  it('vira mini-folha embaixo, com no máximo 40% da altura', () => {
    const p = posicaoDoCartao({ palavra: palavra(150, 40), janela: CELULAR, cartao: CARTAO })
    expect(p).toEqual({ modo: 'folha', borda: 'baixo', maxAltura: Math.floor(844 * 0.4) })
  })

  it('a mini-folha sobe para o topo quando embaixo cobriria a palavra', () => {
    const p = posicaoDoCartao({ palavra: palavra(700, 40), janela: CELULAR, cartao: CARTAO })
    expect(p.modo).toBe('folha')
    if (p.modo === 'folha') expect(p.borda).toBe('topo')
  })

  it('sem o retângulo da palavra, é mini-folha embaixo também no computador', () => {
    const p = posicaoDoCartao({ palavra: null, janela: DESKTOP, cartao: CARTAO })
    expect(p.modo).toBe('folha')
  })
})
