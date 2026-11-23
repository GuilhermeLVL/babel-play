import { describe, expect, it } from 'vitest'

import { criarLimitadorDeParcial, INTERVALO_DO_LIMITADOR_MS } from '../src/core/legendas/limitadorDeParcial'

describe('limitador de atualização do parcial vivo', () => {
  it('a 1ª oferta passa na hora; o intervalo é de 125 ms', () => {
    expect(INTERVALO_DO_LIMITADOR_MS).toBe(125)
    const l = criarLimitadorDeParcial<string>()
    expect(l.oferecer('a', 1000)).toEqual({ tipo: 'aplicar', valor: 'a' })
  })

  it('dentro do intervalo junta: agenda uma vez e libera só a ÚLTIMA hipótese', () => {
    const l = criarLimitadorDeParcial<string>()
    l.oferecer('a', 1000)
    expect(l.oferecer('b', 1030)).toEqual({ tipo: 'agendar', aguardarMs: 95 })
    expect(l.oferecer('c', 1060)).toEqual({ tipo: 'juntou' })
    expect(l.oferecer('d', 1100)).toEqual({ tipo: 'juntou' })
    expect(l.liberar(1125)).toBe('d')
    expect(l.liberar(1125)).toBeNull()
  })

  it('respeita o intervalo: depois de liberar, a próxima só passa 125 ms depois', () => {
    const l = criarLimitadorDeParcial<string>()
    l.oferecer('a', 0)
    l.oferecer('b', 10)
    l.liberar(125)
    expect(l.oferecer('c', 200)).toEqual({ tipo: 'agendar', aguardarMs: 50 })
    expect(l.liberar(250)).toBe('c')
    expect(l.oferecer('d', 375)).toEqual({ tipo: 'aplicar', valor: 'd' })
  })

  it('no máximo ~8 aplicações por segundo com oferta a cada 10 ms', () => {
    const l = criarLimitadorDeParcial<number>()
    let aplicadas = 0
    let venceEm: number | null = null
    for (let t = 0; t < 1000; t += 10) {
      if (venceEm !== null && t >= venceEm) {
        if (l.liberar(venceEm) !== null) aplicadas++
        venceEm = null
      }
      const r = l.oferecer(t, t)
      if (r.tipo === 'aplicar') aplicadas++
      if (r.tipo === 'agendar') venceEm = t + r.aguardarMs
    }
    expect(aplicadas).toBeLessThanOrEqual(9)
    expect(aplicadas).toBeGreaterThanOrEqual(7)
  })

  it('não atrasa o final: cancelar descarta o que esperava e nada é liberado depois', () => {
    const l = criarLimitadorDeParcial<string>()
    l.oferecer('a', 0)
    l.oferecer('b', 10)
    l.cancelar()
    expect(l.liberar(125)).toBeNull()
    expect(l.oferecer('c', 20)).toEqual({ tipo: 'agendar', aguardarMs: 105 })
  })
})
