import { describe, expect, it } from 'vitest'

import {
  aoFimDaFrase,
  aoFimDaPausa,
  CONFIG_PADRAO,
  limitarPausa,
  limitarRepeticoes,
  normalizarConfig,
} from '../src/core/learning/frasePorFrase'

describe('frasePorFrase: aoFimDaFrase', () => {
  it('repete até o número escolhido e então espera e segue', () => {
    const cfg = { repeticoes: 3 as const, pausa: 1, pararNoFim: false }
    const a = aoFimDaFrase(cfg, 2, 10, 0, 2000)
    expect(a).toEqual({ acao: { tipo: 'repetir' }, feita: 1 })
    const b = aoFimDaFrase(cfg, 2, 10, a.feita, 2000)
    expect(b).toEqual({ acao: { tipo: 'repetir' }, feita: 2 })
    const c = aoFimDaFrase(cfg, 2, 10, b.feita, 2000)
    expect(c).toEqual({ acao: { tipo: 'esperar', ms: 2000 }, feita: 0 })
    expect(aoFimDaPausa()).toEqual({ tipo: 'seguir' })
  })

  it('repetir 1x não repete: espera direto', () => {
    expect(aoFimDaFrase(CONFIG_PADRAO, 0, 5, 0, 1500).acao).toEqual({ tipo: 'esperar', ms: 1500 })
  })

  it('a última frase termina em parar, depois das repetições', () => {
    const cfg = { repeticoes: 2 as const, pausa: 1, pararNoFim: false }
    expect(aoFimDaFrase(cfg, 4, 5, 0, 1000).acao).toEqual({ tipo: 'repetir' })
    expect(aoFimDaFrase(cfg, 4, 5, 1, 1000).acao).toEqual({ tipo: 'parar' })
  })

  it('"parar no fim" para depois das repetições, sem esperar', () => {
    const cfg = { repeticoes: 2 as const, pausa: 1, pararNoFim: true }
    expect(aoFimDaFrase(cfg, 1, 5, 0, 1000).acao).toEqual({ tipo: 'repetir' })
    expect(aoFimDaFrase(cfg, 1, 5, 1, 1000).acao).toEqual({ tipo: 'parar' })
  })

  it('a pausa é a duração vezes o fator, limitado a 0,5x a 2x', () => {
    const mk = (pausa: number) => ({ repeticoes: 1 as const, pausa, pararNoFim: false })
    expect(aoFimDaFrase(mk(0.5), 0, 5, 0, 2000).acao).toEqual({ tipo: 'esperar', ms: 1000 })
    expect(aoFimDaFrase(mk(9), 0, 5, 0, 2000).acao).toEqual({ tipo: 'esperar', ms: 4000 })
    expect(aoFimDaFrase(mk(0), 0, 5, 0, 2000).acao).toEqual({ tipo: 'esperar', ms: 1000 })
  })
})

describe('frasePorFrase: normalização', () => {
  it('limita repetições e pausa e aceita lixo', () => {
    expect(limitarRepeticoes(7)).toBe(3)
    expect(limitarRepeticoes(0)).toBe(1)
    expect(limitarRepeticoes('2')).toBe(2)
    expect(limitarRepeticoes('x')).toBe(1)
    expect(limitarPausa(0.1)).toBe(0.5)
    expect(limitarPausa(5)).toBe(2)
    expect(limitarPausa(NaN)).toBe(1)
    expect(normalizarConfig(null)).toEqual(CONFIG_PADRAO)
    expect(normalizarConfig({ repeticoes: 9, pausa: 9, pararNoFim: true })).toEqual({
      repeticoes: 3,
      pausa: 2,
      pararNoFim: true,
    })
  })
})
