// @vitest-environment jsdom
/**
 * O AVATAR NO PiP (M4), o que dá para provar sem navegador de verdade:
 *  · qual avatar a janelinha mostra (um só, o de quem tem atividade);
 *  · a loja que o Intérprete publica e o PiP lê (e que a ausência vira "sem avatar");
 *  · a ponte do PiP de vídeo: o quadro reserva lugar, o texto se afasta, `pintarAvatar` só pinta com reserva, redesenhar o
 *    texto repinta a cópia do avatar, e `limparAvatar` a esquece;
 *  · a janela de mentira por temporizador (o motor desenha com a aba em segundo plano).
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { avatarDoPip } from '../src/core/avatar/interprete'
import { publicarAvatarDoPip, SEM_AVATAR_NO_PIP, useAvatarDoPip } from '../src/lib/avatar/avatarDoPip'
import { janelaPorTemporizador } from '../src/lib/avatar/janelaPorTemporizador'
import {
  criarLegendaEmVideo,
  desenharQuadro,
  type QuadroDaLegenda,
  reservaDoAvatar,
  reservaDoAvatarNoTopo,
  retanguloDoAvatar,
} from '../src/lib/legendas/legendaEmVideo'

describe('qual avatar o PiP mostra', () => {
  it('sempre o intérprete, com o estado de maior atividade entre os dois lados', () => {
    expect(avatarDoPip({ meu: 'falando', outro: 'ouvindo' })).toEqual({ dono: 'outro', estado: 'falando' })
    expect(avatarDoPip({ meu: 'ouvindo', outro: 'pensando' })).toEqual({ dono: 'outro', estado: 'pensando' })
    expect(avatarDoPip({ meu: 'parado', outro: 'parado' })).toEqual({ dono: 'outro', estado: 'parado' })
    expect(avatarDoPip({ meu: 'ouvindo', outro: 'parado' })).toEqual({ dono: 'outro', estado: 'ouvindo' })
  })
})

describe('loja do avatar do PiP', () => {
  afterEach(() => publicarAvatarDoPip(null))
  it('sem publicação, nenhum avatar; publicar e limpar avisa quem observa, e só quando muda', async () => {
    const { renderHook, act } = await import('@testing-library/react')
    const { result } = renderHook(() => useAvatarDoPip())
    expect(result.current).toBe(SEM_AVATAR_NO_PIP)
    expect(result.current.ativo).toBe(false)
    act(() => publicarAvatarDoPip({ ativo: true, estados: { meu: 'falando', outro: 'ouvindo' }, boca: null }))
    expect(result.current.ativo).toBe(true)
    const antes = result.current
    act(() => publicarAvatarDoPip({ ativo: true, estados: { meu: 'falando', outro: 'ouvindo' }, boca: null }))
    expect(result.current).toBe(antes) // igual: nada de novo render
    act(() => publicarAvatarDoPip(null))
    expect(result.current.ativo).toBe(false)
  })
})

describe('janela por temporizador', () => {
  beforeEach(() => vi.useFakeTimers())
  afterEach(() => vi.useRealTimers())
  it('entrega quadros por temporizador, cancela, e nunca está oculta', () => {
    const j = janelaPorTemporizador(10)
    const cb = vi.fn()
    const id = j.requestAnimationFrame(cb)
    vi.advanceTimersByTime(99)
    expect(cb).not.toHaveBeenCalled()
    vi.advanceTimersByTime(2)
    expect(cb).toHaveBeenCalledTimes(1)
    const cb2 = vi.fn()
    j.cancelAnimationFrame(j.requestAnimationFrame(cb2))
    vi.advanceTimersByTime(500)
    expect(cb2).not.toHaveBeenCalled()
    expect(id).toBeDefined()
    expect(j.document.hidden).toBe(false)
    expect(j.document.createElement('canvas').tagName).toBe('CANVAS')
  })
})

describe('ponte do avatar no quadro do PiP de vídeo', () => {
  const quadro = (extra: Partial<QuadroDaLegenda> = {}): QuadroDaLegenda => ({
    falas: [{ original: 'good morning', traducao: 'bom dia' }],
    formato: 'legenda',
    fundo: 'escuro',
    mostrar: 'ambos',
    escala: 1,
    pausado: false,
    textos: { vazio: 'Esperando', pausada: 'Pausada' },
    ...extra,
  })

  it('reserva lugar só nos formatos horizontais e só com avatar', () => {
    expect(reservaDoAvatar(quadro())).toBe(0)
    expect(reservaDoAvatar(quadro({ avatar: { lado: 220 } }))).toBe(268)
    expect(reservaDoAvatar(quadro({ avatar: { lado: 150 }, formato: 'faixa' }))).toBe(198)
    expect(reservaDoAvatar(quadro({ avatar: { lado: 200 }, formato: 'conversa' }))).toBe(0)
    expect(reservaDoAvatarNoTopo(quadro({ avatar: { lado: 200 }, formato: 'conversa' }))).toBe(232)
    expect(reservaDoAvatar(quadro({ avatar: { lado: 220 }, formato: 'estudo' }))).toBe(0)
    expect(retanguloDoAvatar(quadro({ avatar: { lado: 220 }, formato: 'estudo' })).lado).toBe(0)
    expect(retanguloDoAvatar(quadro({ avatar: { lado: 200 }, formato: 'conversa' }))).toEqual({
      x: 260,
      y: 16,
      lado: 200,
    })
    const r = retanguloDoAvatar(quadro({ avatar: { lado: 220 } }))
    expect(r).toEqual({ x: 24, y: 70, lado: 220 })
  })

  function ctxFalso() {
    const textos: Array<{ s: string; x: number }> = []
    const chamadas: string[] = []
    const ctx = {
      fillRect: () => chamadas.push('fillRect'),
      fillText: (s: string, x: number) => void textos.push({ s, x }),
      measureText: (s: string) => ({ width: s.length * 10 }),
      beginPath: () => chamadas.push('beginPath'),
      arc: () => chamadas.push('arc'),
      fill: () => chamadas.push('fill'),
      save: () => chamadas.push('save'),
      restore: () => chamadas.push('restore'),
      clip: () => chamadas.push('clip'),
      clearRect: () => chamadas.push('clearRect'),
      drawImage: () => chamadas.push('drawImage'),
      set fillStyle(_v: string) {},
      set font(_v: string) {},
      set textAlign(_v: string) {},
      set textBaseline(_v: string) {},
      set globalAlpha(_v: number) {},
    }
    return { ctx: ctx as unknown as CanvasRenderingContext2D, textos, chamadas }
  }

  it('com avatar o texto se afasta para a direita; sem avatar fica centrado como sempre', () => {
    const sem = ctxFalso()
    desenharQuadro(sem.ctx, quadro())
    const com = ctxFalso()
    desenharQuadro(com.ctx, quadro({ avatar: { lado: 220 } }))
    expect(sem.textos[0].x).toBe(640) // 1280 / 2
    expect(com.textos[0].x).toBe(268 + (1280 - 268) / 2)
    expect(sem.chamadas).not.toContain('arc')
    expect(com.chamadas).toContain('arc') // o círculo do avatar
  })

  it('a soletração ligada desenha o aviso curto "Demonstração · não é tradução" em todos os formatos com avatar; desligada, nada', () => {
    const aviso = 'Demonstração · não é tradução'
    for (const formato of ['faixa', 'legenda', 'conversa'] as const) {
      const com = ctxFalso()
      desenharQuadro(com.ctx, quadro({ formato, avatar: { lado: 150 }, avisoDaSoletracao: aviso }))
      expect(com.textos.map((t) => t.s)).toContain(aviso)
      const sem = ctxFalso()
      desenharQuadro(sem.ctx, quadro({ formato, avatar: { lado: 150 } }))
      expect(sem.textos.map((t) => t.s)).not.toContain(aviso)
    }
  })

  it('pintarAvatar só pinta com reserva, redesenhar o texto repinta a cópia, e limparAvatar a esquece', () => {
    const g = ctxFalso()
    HTMLCanvasElement.prototype.getContext = vi.fn(() => g.ctx) as never
    const c = criarLegendaEmVideo()
    ;(HTMLCanvasElement.prototype as unknown as { captureStream: () => unknown }).captureStream = vi.fn(() => ({
      getTracks: () => [],
      getVideoTracks: () => [],
    }))
    HTMLMediaElement.prototype.play = vi.fn(async () => {})
    c.preparar()
    const origem = document.createElement('canvas')

    c.desenhar(quadro()) // sem avatar no quadro
    g.chamadas.length = 0
    c.pintarAvatar(origem)
    expect(g.chamadas).toEqual([]) // sem reserva, nada

    c.desenhar(quadro({ avatar: { lado: 220 } }))
    g.chamadas.length = 0
    c.pintarAvatar(origem)
    expect(g.chamadas.filter((x) => x === 'drawImage').length).toBe(2) // para a cópia e da cópia para o quadro
    expect(g.chamadas).toContain('clip')

    // o texto muda: o quadro é refeito e a cópia do avatar volta junto, sem esperar o próximo quadro do motor
    g.chamadas.length = 0
    c.desenhar(quadro({ avatar: { lado: 220 }, falas: [{ original: 'next phrase' }] }))
    expect(g.chamadas).toContain('drawImage')

    c.limparAvatar()
    g.chamadas.length = 0
    c.desenhar(quadro({ avatar: { lado: 220 }, falas: [{ original: 'another one' }] }))
    expect(g.chamadas).not.toContain('drawImage')
    c.destruir()
  })
})
