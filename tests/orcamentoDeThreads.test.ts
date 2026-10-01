/**
 * O ORÇAMENTO GLOBAL DE THREADS (plano "Grátis sem travar", A3).
 *
 * Antes cada motor pedia as suas sem saber dos outros: o Whisper `min(núcleos, 4)` e o tradutor o
 * padrão do ONNX Runtime (`min(4, ⌈núcleos/2⌉)`). Num desktop de 8 núcleos eram 4 + 4 threads de
 * inferência, mais a thread principal (interface e VAD) — mais threads que núcleos, e a aba travava.
 * Agora a conta é uma só: um núcleo fica para a thread principal, o resto se divide.
 */
import { describe, expect, it } from 'vitest'

import { distribuirThreads, tetoDeThreads } from '../src/lib/dispositivo/orcamentoDeThreads'

describe('distribuirThreads', () => {
  it.each([
    // núcleos, isolado, leve → whisper, mt
    [1, true, false, 1, 1],
    [2, true, false, 1, 1],
    [4, true, false, 1, 1],
    [6, true, false, 3, 1],
    [8, true, false, 4, 2],
    [16, true, false, 4, 2],
    [8, true, true, 2, 2],
    [16, true, true, 2, 2],
    [4, true, true, 1, 1],
  ])('%i núcleos, isolado=%s, leve=%s → whisper %i, mt %i', (nucleos, isolado, leve, whisper, mt) => {
    expect(distribuirThreads({ nucleos, isolado, leve })).toEqual({ whisper, mt, vad: 1, voz: 1 })
  })

  /* O QUEST DÁ AO APP ~3 NÚCLEOS EM CLOCK REDUZIDO (doc da Meta, CPU levels e boost), e o rastreamento
     e o compositor do headset disputam os mesmos. Com 6 ou 8 núcleos anunciados o orçamento de "leve"
     dava 2 threads ao Whisper e até 2 ao tradutor — mais a thread principal (interface e VAD) e a voz:
     5 a 6 threads ocupadas, e o headset inteiro travava. No Quest, uma thread por motor. */
  it.each([
    [6, 1, 1],
    [8, 1, 1],
    [4, 1, 1],
  ])('Quest com %i núcleos anunciados → whisper %i, mt %i', (nucleos, whisper, mt) => {
    expect(distribuirThreads({ nucleos, isolado: true, leve: true, quest: true })).toEqual({
      whisper,
      mt,
      vad: 1,
      voz: 1,
    })
  })

  it('sem crossOriginIsolated (sem SharedArrayBuffer): tudo em 1 thread, em qualquer aparelho', () => {
    for (const nucleos of [1, 2, 4, 8, 16])
      for (const leve of [false, true])
        expect(distribuirThreads({ nucleos, isolado: false, leve })).toEqual({ whisper: 1, mt: 1, vad: 1, voz: 1 })
  })

  it('núcleos desconhecidos (API ausente) contam como 4, o mesmo padrão do perfil', () => {
    expect(distribuirThreads({ nucleos: null, isolado: true, leve: false })).toEqual(
      distribuirThreads({ nucleos: 4, isolado: true, leve: false }),
    )
  })

  it('a soma dos motores em worker nunca passa do teto (um núcleo fica para a thread principal)', () => {
    for (const nucleos of [1, 2, 3, 4, 5, 6, 7, 8, 12, 16, 32])
      for (const isolado of [false, true])
        for (const leve of [false, true]) {
          const o = distribuirThreads({ nucleos, isolado, leve })
          const emWorker = o.whisper + o.mt + o.voz
          // Abaixo de 4 núcleos cada motor já está no mínimo (1): não há o que tirar.
          expect(emWorker).toBeLessThanOrEqual(Math.max(3, tetoDeThreads(nucleos)))
          if (nucleos >= 4) expect(emWorker).toBeLessThanOrEqual(nucleos - 1)
          // O VAD roda NA thread principal: 1, sempre (ver `ortDoVadNumaThread`).
          expect(o.vad).toBe(1)
          for (const v of Object.values(o)) expect(v).toBeGreaterThanOrEqual(1)
        }
  })

  it('o Whisper nunca passa de 4 (o teto que o worker aplica)', () => {
    expect(distribuirThreads({ nucleos: 64, isolado: true, leve: false }).whisper).toBe(4)
  })
})

describe('tetoDeThreads', () => {
  it('núcleos − 1, nunca menos de 1', () => {
    expect(tetoDeThreads(8)).toBe(7)
    expect(tetoDeThreads(1)).toBe(1)
    expect(tetoDeThreads(null)).toBe(3)
  })
})
