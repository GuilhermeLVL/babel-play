/**
 * O SEGMENTADOR DA LEITURA EM VOZ ALTA (openspec `leitura-ativa-com-moonshine`, 2.2): abre com fala, fecha na pausa,
 * ignora estalo e sala, e o tempo é o do áudio.
 */
import { describe, expect, it } from 'vitest'

import { criarSegmentadorDeFala } from '../src/core/fala/segmentadorDeFala'

const TAXA = 16000
const bloco = (ms: number, amp: number) => new Float32Array(Math.round((TAXA * ms) / 1000)).fill(amp)

describe('segmentadorDeFala', () => {
  it('sala silenciosa: nunca abre', () => {
    const s = criarSegmentadorDeFala(TAXA)
    for (let i = 0; i < 50; i++) expect(s.alimentar(bloco(100, 0.001)).falando).toBe(false)
  })

  it('abre com fala, segue aberto e fecha só depois de ~400 ms de pausa', () => {
    const s = criarSegmentadorDeFala(TAXA)
    s.alimentar(bloco(200, 0.001))
    expect(s.alimentar(bloco(200, 0.1)).abriu).toBe(true)
    expect(s.alimentar(bloco(200, 0.1)).falando).toBe(true)
    const meio = s.alimentar(bloco(300, 0.001))
    expect(meio.falando).toBe(true)
    expect(meio.fechou).toBe(false)
    const fim = s.alimentar(bloco(200, 0.001))
    expect(fim.fechou).toBe(true)
    expect(fim.falando).toBe(false)
  })

  it('um estalo de 20 ms não abre trecho', () => {
    const s = criarSegmentadorDeFala(TAXA)
    s.alimentar(bloco(200, 0.001))
    expect(s.alimentar(bloco(20, 0.2)).abriu).toBe(false)
    expect(s.alimentar(bloco(300, 0.001)).falando).toBe(false)
  })

  it('blocos pequenos do AudioWorklet (128 amostras) formam quadros', () => {
    const s = criarSegmentadorDeFala(48000)
    let abriu = false
    for (let i = 0; i < 100; i++) abriu ||= s.alimentar(new Float32Array(128).fill(0.1)).abriu
    expect(abriu).toBe(true)
  })

  it('reiniciar esquece o trecho aberto', () => {
    const s = criarSegmentadorDeFala(TAXA)
    s.alimentar(bloco(300, 0.1))
    s.reiniciar()
    expect(s.alimentar(bloco(20, 0.001)).falando).toBe(false)
  })
})
