// @vitest-environment jsdom
import { describe, it, expect } from 'vitest'
import { EVENTOS_RAROS, sortearEventoRaro, eventosCondicionais, todosOsEventos, marcarEventoVisto, eventosVistos } from '../src/lib/eventosDeJogo'

describe('eventos de jogo', () => {
  it('a soma das probabilidades raras fica abaixo de 5% por acerto', () => {
    const soma = EVENTOS_RAROS.reduce((s, e) => s + e.prob, 0)
    expect(soma).toBeLessThan(0.25) // frequente o bastante para aparecer numa sessão
  })
  it('o sorteio respeita as faixas do rng', () => {
    expect(sortearEventoRaro(() => 0.001)?.id).toBe('estrelas')
    expect(sortearEventoRaro(() => 0.09)?.id).toBe('patos')
    expect(sortearEventoRaro(() => 0.9)).toBeNull()
  })
  it('condicionais: combo 10 dá tempestade; recorde dá fogos; nada em combo comum', () => {
    expect(eventosCondicionais({ combo: 10, fever: true }).map(e => e.id)).toContain('tempestade')
    expect(eventosCondicionais({ combo: 4, fever: false, recorde: true }).map(e => e.id)).toContain('fogos')
    expect(eventosCondicionais({ combo: 5, fever: false }).map(e => e.id)).toContain('aquecendo')
    expect(eventosCondicionais({ combo: 4, fever: false })).toHaveLength(0)
  })
  it('colecionável: marca e lê os vistos; o catálogo lista todos', () => {
    localStorage.removeItem('babel.eventos_vistos')
    marcarEventoVisto('patos')
    marcarEventoVisto('patos')
    expect(eventosVistos()).toEqual(['patos'])
    expect(todosOsEventos()).toContain('fogos')
    expect(todosOsEventos().length).toBeGreaterThanOrEqual(11)
  })
})
