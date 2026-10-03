/**
 * O PISO DO SILÊNCIO (fim de fala inteligente): o silêncio a partir do qual o app PERGUNTA ao modelo de turno se
 * a frase acabou. Acompanha as pausas da própria pessoa por média móvel (alfa 0,9), sempre entre 250 e
 * 600 ms, e recomeça a cada sessão. Quem fala devagar não é cortado; quem fala rápido não espera à toa.
 */
import { describe, expect, it } from 'vitest'

import {
  criarPisoDoSilencio,
  PISO_INICIAL_MS,
  PISO_MAXIMO_MS,
  PISO_MINIMO_MS,
} from '../src/gateway/capture/pisoDoSilencio'

describe('pisoDoSilencio', () => {
  it('nasce em 300 ms, dentro dos limites', () => {
    const piso = criarPisoDoSilencio()
    expect(PISO_INICIAL_MS).toBe(300)
    expect(piso.valor()).toBe(300)
    expect(PISO_MINIMO_MS).toBe(250)
    expect(PISO_MAXIMO_MS).toBe(600)
  })

  it('sobe com pausas longas (quem fala devagar), sem passar de 600 ms', () => {
    const piso = criarPisoDoSilencio()
    for (let i = 0; i < 10; i++) piso.registrarPausa(500)
    const meio = piso.valor()
    expect(meio).toBeGreaterThan(300)
    expect(meio).toBeLessThan(500)
    for (let i = 0; i < 500; i++) piso.registrarPausa(2000)
    expect(piso.valor()).toBe(600)
  })

  it('desce com pausas curtas, sem passar de 250 ms', () => {
    const piso = criarPisoDoSilencio()
    for (let i = 0; i < 500; i++) piso.registrarPausa(100)
    expect(piso.valor()).toBe(250)
  })

  it('é média móvel exponencial com alfa 0,9: cada pausa pesa 10%', () => {
    const piso = criarPisoDoSilencio()
    piso.registrarPausa(500)
    // 0,9 * 300 + 0,1 * 500
    expect(piso.valor()).toBeCloseTo(320, 6)
    piso.registrarPausa(500)
    expect(piso.valor()).toBeCloseTo(0.9 * 320 + 50, 6)
  })

  it('ignora pausa inválida (zero, negativa, NaN, infinita)', () => {
    const piso = criarPisoDoSilencio()
    piso.registrarPausa(0)
    piso.registrarPausa(-5)
    piso.registrarPausa(Number.NaN)
    piso.registrarPausa(Number.POSITIVE_INFINITY)
    expect(piso.valor()).toBe(300)
  })

  it('volta ao valor inicial numa nova sessão', () => {
    const piso = criarPisoDoSilencio()
    for (let i = 0; i < 50; i++) piso.registrarPausa(600)
    expect(piso.valor()).toBeGreaterThan(400)
    piso.reiniciar()
    expect(piso.valor()).toBe(300)
    // e duas instâncias não dividem estado
    const outro = criarPisoDoSilencio()
    expect(outro.valor()).toBe(300)
  })
})
