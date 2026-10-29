import { describe, expect, it } from 'vitest'

import {
  cederABoca,
  expressaoDaEmocao,
  INTENSIDADE_MAXIMA,
  PITCH_MAX,
  PITCH_MIN,
  RATE_MAX,
  RATE_MIN,
  vozDaEmocao,
} from '../src/core/avatar/emocao'
import { EMOCOES_DO_AVATAR } from '../src/core/avatar/estados'
import {
  balancoPermitido,
  criarEstadoDaVida,
  olharPermitido,
  passoDaVida,
  PISCAR_MAX_MS,
  PISCAR_MIN_MS,
  VIDA_PARADA,
} from '../src/core/avatar/vida'

describe('emoção → voz', () => {
  it('feliz acelera um pouco e sobe o tom; triste desacelera e baixa', () => {
    const f = vozDaEmocao('feliz')
    expect(f.rate).toBeCloseTo(1.05, 5)
    expect(f.pitch!).toBeGreaterThan(1)
    const t = vozDaEmocao('triste')
    expect(t.rate).toBeCloseTo(0.9, 5)
    expect(t.pitch!).toBeLessThan(1)
    expect(vozDaEmocao('neutro')).toEqual({ rate: 1, pitch: 1 })
  })

  it('parte da voz da pessoa e nunca passa dos limites do app, em nenhuma emoção', () => {
    for (const e of EMOCOES_DO_AVATAR) {
      for (const base of [
        { rate: 0.5, pitch: 0.5 },
        { rate: 2.5, pitch: 1.5 },
        { rate: 99, pitch: 99 },
        { rate: -1, pitch: 0 },
        {},
      ]) {
        const v = vozDaEmocao(e, base)
        expect(v.rate).toBeGreaterThanOrEqual(RATE_MIN)
        expect(v.rate).toBeLessThanOrEqual(RATE_MAX)
        expect(v.pitch!).toBeGreaterThanOrEqual(PITCH_MIN)
        expect(v.pitch!).toBeLessThanOrEqual(PITCH_MAX)
      }
    }
    expect(vozDaEmocao('feliz', { rate: 2.5 }).rate).toBe(RATE_MAX)
    expect(vozDaEmocao('triste', { pitch: 0.5 }).pitch).toBe(PITCH_MIN)
  })

  it('voz da nuvem (sem tom): só o ritmo; emoção desconhecida é neutra', () => {
    expect(vozDaEmocao('feliz', {}, false)).toEqual({ rate: 1.05 })
    expect('pitch' in vozDaEmocao('triste', { pitch: 1.2 }, false)).toBe(false)
    expect(vozDaEmocao('?????')).toEqual({ rate: 1, pitch: 1 })
    expect(vozDaEmocao(undefined)).toEqual({ rate: 1, pitch: 1 })
  })

  it('a variação é modesta: no máximo ±12% de ritmo e tom', () => {
    for (const e of EMOCOES_DO_AVATAR) {
      const v = vozDaEmocao(e)
      expect(Math.abs(v.rate - 1)).toBeLessThanOrEqual(0.12)
      expect(Math.abs(v.pitch! - 1)).toBeLessThanOrEqual(0.12)
    }
  })
})

describe('emoção → expressão do VRM', () => {
  const todas = ['happy', 'sad', 'angry', 'surprised', 'relaxed', 'blink', 'aa']

  it('usa a expressão certa, com intensidade limitada (nunca exagera)', () => {
    const e = expressaoDaEmocao('feliz', todas)
    expect(e).toEqual({ nome: 'happy', intensidade: INTENSIDADE_MAXIMA, substituta: false })
    expect(expressaoDaEmocao('feliz', todas, 5).intensidade).toBe(INTENSIDADE_MAXIMA)
    expect(expressaoDaEmocao('feliz', todas, 0.5).intensidade).toBeCloseTo(INTENSIDADE_MAXIMA / 2, 5)
    expect(INTENSIDADE_MAXIMA).toBeLessThan(1)
  })

  it('neutro e desconhecida: nenhuma expressão', () => {
    expect(expressaoDaEmocao('neutro', todas)).toMatchObject({ nome: null, intensidade: 0, substituta: false })
    expect(expressaoDaEmocao('xyz', todas).nome).toBeNull()
  })

  it('modelo sem a expressão: usa a vizinha; sem nenhuma, neutro', () => {
    expect(expressaoDaEmocao('feliz', ['relaxed'])).toMatchObject({ nome: 'relaxed', substituta: true })
    expect(expressaoDaEmocao('bravo', ['sad'])).toMatchObject({ nome: 'sad', substituta: true })
    expect(expressaoDaEmocao('surpreso', new Set(['happy']))).toMatchObject({ nome: 'happy', substituta: true })
    expect(expressaoDaEmocao('triste', ['blink'])).toMatchObject({ nome: null, intensidade: 0, substituta: true })
    expect(expressaoDaEmocao('feliz', [])).toMatchObject({ nome: null })
  })

  it('a vogal vence a emoção: a boca aberta reduz a expressão', () => {
    expect(cederABoca(0)).toBe(1)
    expect(cederABoca(1)).toBeCloseTo(0.45, 5)
    expect(cederABoca(NaN)).toBe(1)
    expect(cederABoca(9)).toBeCloseTo(0.45, 5)
  })
})

describe('vida procedural', () => {
  const seq = (...v: number[]) => {
    let i = 0
    return () => v[i++ % v.length]
  }

  it('piscar: intervalo entre 2,5 e 4,5 s; a piscada fecha e reabre', () => {
    const r = seq(0, 1, 0.5)
    const st = criarEstadoDaVida(r)
    expect(st.proximoPiscar).toBeGreaterThanOrEqual(PISCAR_MIN_MS)
    expect(st.proximoPiscar).toBeLessThanOrEqual(PISCAR_MAX_MS)
    const cfg = { tier: 'forte' as const, movimentoReduzido: false }
    let t = 0
    let max = 0
    let piscadas = 0
    let fechado = false
    for (let i = 0; i < 60 * 12; i += 1) {
      const s = passoDaVida(st, 16.67, cfg, 'parado', r)
      t += 16.67
      max = Math.max(max, s.piscar)
      if (s.piscar > 0.5 && !fechado) {
        piscadas += 1
        fechado = true
      }
      if (s.piscar === 0) fechado = false
    }
    expect(max).toBeGreaterThan(0.9)
    // em 12 s com 2,5–4,5 s por piscada: de 2 a 5 piscadas
    expect(piscadas).toBeGreaterThanOrEqual(2)
    expect(piscadas).toBeLessThanOrEqual(5)
    expect(t).toBeGreaterThan(11_000)
  })

  it('movimento reduzido: nada ocioso, em nenhum tier', () => {
    for (const tier of ['forte', 'medio', 'fraco'] as const) {
      const st = criarEstadoDaVida()
      for (let i = 0; i < 1000; i += 1) {
        expect(passoDaVida(st, 16, { tier, movimentoReduzido: true }, 'falando')).toBe(VIDA_PARADA)
      }
    }
  })

  it('tier fraco: respira e pisca, mas sem olhar nem balanço', () => {
    const cfg = { tier: 'fraco' as const, movimentoReduzido: false }
    expect(olharPermitido(cfg)).toBe(false)
    expect(balancoPermitido(cfg)).toBe(false)
    const st = criarEstadoDaVida()
    let respirou = false
    for (let i = 0; i < 400; i += 1) {
      const s = passoDaVida(st, 16.67, cfg, 'pensando')
      if (Math.abs(s.respiracao) > 0.005) respirou = true
      expect(s.balanco).toBe(0)
      expect(s.olhar).toEqual({ yaw: 0, pitch: 0 })
    }
    expect(respirou).toBe(true)
  })

  it('tier forte: olhar e balanço pequenos; pensando desvia o olhar', () => {
    const cfg = { tier: 'forte' as const, movimentoReduzido: false }
    const st = criarEstadoDaVida(seq(0.5))
    let maxBalanco = 0
    let olharFinal = { yaw: 0, pitch: 0 }
    for (let i = 0; i < 600; i += 1) {
      const s = passoDaVida(st, 16.67, cfg, 'pensando', seq(0.5))
      maxBalanco = Math.max(maxBalanco, Math.abs(s.balanco))
      olharFinal = s.olhar
      expect(Math.abs(s.olhar.yaw)).toBeLessThan(15)
      expect(Math.abs(s.respiracao)).toBeLessThan(0.02)
    }
    expect(maxBalanco).toBeGreaterThan(0.005)
    expect(maxBalanco).toBeLessThan(0.02)
    expect(olharFinal.yaw).toBeGreaterThan(5) // pensando: desvia para o lado
  })

  it('dt inválido ou gigante (aba que voltou) não faz a vida pular', () => {
    const cfg = { tier: 'forte' as const, movimentoReduzido: false }
    const st = criarEstadoDaVida()
    passoDaVida(st, NaN, cfg, 'parado')
    passoDaVida(st, -50, cfg, 'parado')
    expect(st.t).toBe(0)
    passoDaVida(st, 60_000, cfg, 'parado')
    expect(st.t).toBe(100)
  })
})
