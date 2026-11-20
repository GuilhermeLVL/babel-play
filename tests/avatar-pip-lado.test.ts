import { describe, expect, it } from 'vitest'

import { ladoDoAvatarNoPip } from '../src/components/avatar/ComAvatarNoPip'
import { ladoDoAvatarNaJanela, ladoDoAvatarNoQuadro, TAMANHO_DO_FORMATO } from '../src/core/legendas/janelaFlutuante'
import {
  desenharQuadro,
  DIMENSOES_DO_QUADRO,
  type QuadroDaLegenda,
  retanguloDoAvatar,
} from '../src/lib/legendas/legendaEmVideo'

describe('ladoDoAvatarNoPip (regra pura em core/legendas/janelaFlutuante)', () => {
  it('nunca fica abaixo do mínimo (96 px em cima; 72 px ao lado)', () => {
    expect(ladoDoAvatarNoPip(200, 200, false)).toBe(110)
    expect(ladoDoAvatarNoPip(100, 100, false)).toBe(96)
    expect(ladoDoAvatarNoPip(520, 60, true)).toBe(72)
  })
  it('cresce com a janela: ao lado enche a altura (até 220); em cima, ~70% da largura (até 280)', () => {
    expect(ladoDoAvatarNoPip(520, 300, true)).toBe(146)
    expect(ladoDoAvatarNoPip(1200, 900, true)).toBe(220)
    expect(ladoDoAvatarNoPip(400, 600, false)).toBe(280)
  })
  it('em janela baixa, não passa de 55% da altura (mas respeita o mínimo)', () => {
    expect(ladoDoAvatarNoPip(600, 240, false)).toBe(132)
    expect(ladoDoAvatarNoPip(600, 150, false)).toBe(96)
  })
})

describe('PiP: o avatar ocupa o espaço, sem o vazio entre ele e a legenda', () => {
  it('janela de conversa (aberta como o formato manda): o avatar é > 50% da altura e a legenda ainda tem >= 150 px', () => {
    const { largura, altura } = TAMANHO_DO_FORMATO.conversa // 400 x 460, em pé: avatar em cima
    const lado = ladoDoAvatarNaJanela({ largura, altura }, false)
    expect(lado).toBeGreaterThan(altura * 0.5)
    expect(altura - lado - 8).toBeGreaterThanOrEqual(150)
  })
  it('janela de legenda e de faixa (aberta como o formato manda): o círculo enche a altura, menos o respiro', () => {
    for (const f of ['legenda', 'faixa'] as const) {
      const { largura, altura } = TAMANHO_DO_FORMATO[f]
      const lado = ladoDoAvatarNaJanela({ largura, altura }, true)
      expect(lado, f).toBeGreaterThanOrEqual(altura - 16)
      expect(lado, f).toBeLessThanOrEqual(altura)
    }
  })
  it('quadro do PiP de vídeo: faixa/legenda enchem a altura; conversa usa 60% da largura; estudo não tem avatar', () => {
    expect(ladoDoAvatarNoQuadro('faixa', DIMENSOES_DO_QUADRO.faixa)).toBe(168)
    expect(ladoDoAvatarNoQuadro('legenda', DIMENSOES_DO_QUADRO.legenda)).toBe(300)
    expect(ladoDoAvatarNoQuadro('conversa', DIMENSOES_DO_QUADRO.conversa)).toBe(432)
    expect(ladoDoAvatarNoQuadro('estudo', DIMENSOES_DO_QUADRO.estudo)).toBe(0)
  })

  it('quadro de conversa: a legenda fica COLADA embaixo do círculo (não no pé do quadro)', () => {
    const linhas: Array<{ s: string; y: number }> = []
    const ctx = {
      fillRect: () => {},
      fillText: (s: string, _x: number, y: number) => void linhas.push({ s, y }),
      measureText: (s: string) => ({ width: s.length * 10 }),
      beginPath: () => {},
      arc: () => {},
      fill: () => {},
      set fillStyle(_v: string) {},
      set font(_v: string) {},
      set textAlign(_v: string) {},
      set textBaseline(_v: string) {},
      set globalAlpha(_v: number) {},
    } as unknown as CanvasRenderingContext2D
    const quadro: QuadroDaLegenda = {
      falas: [{ original: 'good morning', traducao: 'bom dia', quem: 'Você' }],
      formato: 'conversa',
      fundo: 'escuro',
      mostrar: 'ambos',
      escala: 1,
      pausado: false,
      avatar: { lado: ladoDoAvatarNoQuadro('conversa', DIMENSOES_DO_QUADRO.conversa) },
      textos: { vazio: 'Esperando', pausada: 'Pausada' },
    }
    desenharQuadro(ctx, quadro)
    const r = retanguloDoAvatar(quadro)
    const baseDoCirculo = r.y + r.lado
    const primeira = Math.min(...linhas.map((l) => l.y))
    const ultima = Math.max(...linhas.map((l) => l.y))
    expect(primeira, 'o texto começa logo abaixo do círculo').toBeGreaterThan(baseDoCirculo)
    expect(primeira - baseDoCirculo, 'sem vazio grande entre o círculo e o texto').toBeLessThan(110)
    expect(ultima, 'o texto não fica no pé do quadro').toBeLessThan(DIMENSOES_DO_QUADRO.conversa.altura * 0.7)
  })
})
