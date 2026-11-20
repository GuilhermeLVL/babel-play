/**
 * A RODA NORMALIZADA DO SITE PÚBLICO (`public/site/roda.js`, usada por `rolo.js`). O arquivo é JS puro
 * servido como está (fora do build); aqui ele roda num `window` de mentira e a função pura é testada com os
 * eventos de cada configuração comum (relato do Windows em 19/11/2026: a roda pulava capítulos do filme).
 */
import { readFileSync } from 'node:fs'
import path from 'node:path'

import { beforeAll, describe, expect, it } from 'vitest'

type Evento = { deltaY: number; deltaMode: number; wheelDeltaY?: number; timeStamp?: number }
type Estado = Record<string, unknown>
type Opcoes = { alturaTela: number; limitar?: boolean; adiante?: number; agora?: number }
type Roda = {
  normalizarRoda: (e: Evento, s: Estado, o: Opcoes) => { px: number; bruto: number; tipo: 'roda' | 'trackpad' }
  novoEstadoDaRoda: () => Estado
  PX_POR_LINHA: number
}

let roda: Roda
beforeAll(() => {
  const codigo = readFileSync(path.join(__dirname, '..', 'public', 'site', 'roda.js'), 'utf8')
  const janela: { FrasyRoda?: Roda } = {}
  new Function('window', codigo)(janela)
  roda = janela.FrasyRoda!
})

const TELA = 768

/** Uma sequência de eventos a cada `ms`, com o filme limitando; devolve o total rolado e cada passo. */
function rolar(eventos: Evento[], ms: number, opcoes: Partial<Opcoes> = {}) {
  const estado = roda.novoEstadoDaRoda()
  const passos = eventos.map((e, i) =>
    roda.normalizarRoda(e, estado, { alturaTela: TELA, limitar: true, agora: 1000 + i * ms, ...opcoes }),
  )
  return { passos, total: passos.reduce((s, p) => s + p.px, 0) }
}

describe('normalizarRoda', () => {
  it('converte linhas (deltaMode 1) e páginas (deltaMode 2) em pixels', () => {
    const s = roda.novoEstadoDaRoda()
    expect(roda.normalizarRoda({ deltaY: 3, deltaMode: 1 }, s, { alturaTela: TELA, agora: 0 }).bruto).toBeCloseTo(100)
    expect(roda.normalizarRoda({ deltaY: 1, deltaMode: 2 }, s, { alturaTela: TELA, agora: 500 }).bruto).toBe(TELA)
  })

  it('Windows padrão (100 px por clique) passa inteiro', () => {
    const s = roda.novoEstadoDaRoda()
    const r = roda.normalizarRoda({ deltaY: 100, deltaMode: 0, wheelDeltaY: -120 }, s, {
      alturaTela: TELA,
      limitar: true,
      agora: 0,
    })
    expect(r).toMatchObject({ px: 100, tipo: 'roda' })
  })

  it('degraus grandes (600 px, 10 linhas, uma página) ficam no teto de 120 px por clique', () => {
    for (const e of [
      { deltaY: 600, deltaMode: 0, wheelDeltaY: -720 },
      { deltaY: 10, deltaMode: 1 },
      { deltaY: 1, deltaMode: 2 },
      { deltaY: -600, deltaMode: 0 },
    ]) {
      const r = roda.normalizarRoda(e, roda.novoEstadoDaRoda(), { alturaTela: TELA, agora: 0 })
      expect(r.tipo).toBe('roda')
      expect(Math.abs(r.px)).toBe(120)
      expect(Math.sign(r.px)).toBe(Math.sign(e.deltaY))
    }
  })

  it('trackpad: deltas pequenos e contínuos passam sem mudança (fora do teto de velocidade)', () => {
    const deltas = [4, 9, 14, 20, 17, 11, 6, 4]
    const { passos } = rolar(
      deltas.map((d) => ({ deltaY: d, deltaMode: 0, wheelDeltaY: -3 * d })),
      16,
    )
    expect(passos.map((p) => p.tipo)).toEqual(deltas.map(() => 'trackpad'))
    expect(passos.map((p) => p.px)).toEqual(deltas)
  })

  it('a inércia do trackpad (delta grande colado num fluxo) continua trackpad', () => {
    const s = roda.novoEstadoDaRoda()
    roda.normalizarRoda({ deltaY: 30, deltaMode: 0 }, s, { alturaTela: TELA, agora: 0 })
    const r = roda.normalizarRoda({ deltaY: 180, deltaMode: 0 }, s, { alturaTela: TELA, agora: 12 })
    expect(r).toMatchObject({ tipo: 'trackpad', px: 180 })
    // O mesmo degrau isolado é um clique de roda.
    const isolado = roda.normalizarRoda({ deltaY: 180, deltaMode: 0 }, s, { alturaTela: TELA, agora: 500 })
    expect(isolado).toMatchObject({ tipo: 'roda', px: 120 })
  })

  it('no filme, a velocidade tem teto: rajada de cliques não passa de ~3 telas por segundo', () => {
    // 40 cliques de 600 px a cada 25 ms (1 s de roda girando solta, como num driver que manda rajadas).
    const { total } = rolar(
      Array.from({ length: 40 }, () => ({ deltaY: 600, deltaMode: 0 })),
      25,
    )
    expect(total).toBeLessThanOrEqual(3.4 * TELA)
    expect(total).toBeGreaterThan(2.5 * TELA)
  })

  it('fora do filme, só o teto por clique (sem teto de velocidade)', () => {
    const { total } = rolar(
      Array.from({ length: 40 }, () => ({ deltaY: 600, deltaMode: 0 })),
      25,
      { limitar: false },
    )
    expect(total).toBe(40 * 120)
  })

  it('trocar de sentido reenche o balde (voltar nunca fica travado)', () => {
    const s = roda.novoEstadoDaRoda()
    for (let i = 0; i < 10; i++)
      roda.normalizarRoda({ deltaY: 600, deltaMode: 0 }, s, { alturaTela: TELA, limitar: true, agora: i })
    const volta = roda.normalizarRoda({ deltaY: -100, deltaMode: 0 }, s, {
      alturaTela: TELA,
      limitar: true,
      agora: 11,
    })
    expect(volta.px).toBe(-100)
  })

  it('com Lenis, o alvo não fica mais que meia tela à frente do que se vê', () => {
    const s = roda.novoEstadoDaRoda()
    const o = { alturaTela: TELA, limitar: true, agora: 0 }
    expect(roda.normalizarRoda({ deltaY: 100, deltaMode: 0 }, s, { ...o, adiante: 0.5 * TELA - 30 }).px).toBe(30)
    expect(roda.normalizarRoda({ deltaY: 100, deltaMode: 0 }, s, { ...o, adiante: 0.5 * TELA }).px).toBe(0)
    // À frente no sentido contrário não segura (voltar é imediato).
    expect(roda.normalizarRoda({ deltaY: -100, deltaMode: 0 }, s, { ...o, adiante: 0.5 * TELA }).px).toBe(-100)
  })

  it('delta zero não rola nem gasta o balde', () => {
    const r = roda.normalizarRoda({ deltaY: 0, deltaMode: 0 }, roda.novoEstadoDaRoda(), {
      alturaTela: TELA,
      limitar: true,
      agora: 0,
    })
    expect(r.px === 0 && r.bruto === 0).toBe(true)
  })
})
