import { describe, expect, it } from 'vitest'

import { deveAquecerNaIntencao, type EntradaDoAquecimento } from '../src/core/harness/aquecerNaIntencao'

const base: EntradaDoAquecimento = {
  poucaMemoria: false,
  leve: false,
  tipo: 'desktop-com-gpu',
  isolado: true,
  gatilho: 'ponteiro',
}

describe('deveAquecerNaIntencao', () => {
  it('desktop isolado, memória folgada: aquece nos dois gatilhos', () => {
    expect(deveAquecerNaIntencao(base).aquecer).toBe(true)
    expect(deveAquecerNaIntencao({ ...base, gatilho: 'idiomas' }).aquecer).toBe(true)
    expect(deveAquecerNaIntencao({ ...base, tipo: 'desktop-sem-gpu' }).aquecer).toBe(true)
  })

  it('pouca memória: ignora o ponteiro, aceita a confirmação dos idiomas', () => {
    const e = { ...base, poucaMemoria: true, tipo: 'celular-bom' as const }
    const p = deveAquecerNaIntencao(e)
    expect(p.aquecer).toBe(false)
    expect(p.motivo).toMatch(/ponteiro/i)
    expect(deveAquecerNaIntencao({ ...e, gatilho: 'idiomas' }).aquecer).toBe(true)
  })

  it('modo leve: ignora o ponteiro, aceita os idiomas', () => {
    const e = { ...base, leve: true }
    expect(deveAquecerNaIntencao(e).aquecer).toBe(false)
    expect(deveAquecerNaIntencao({ ...e, gatilho: 'idiomas' }).aquecer).toBe(true)
  })

  it('quest e celular fraco: só os idiomas aquecem', () => {
    for (const tipo of ['quest', 'celular-fraco', 'celular-bom'] as const) {
      const e = { ...base, tipo, poucaMemoria: true, leve: tipo !== 'celular-bom' }
      expect(deveAquecerNaIntencao(e).aquecer).toBe(false)
      expect(deveAquecerNaIntencao({ ...e, gatilho: 'idiomas' }).aquecer).toBe(true)
    }
  })

  it('desktop sem isolamento (Safari no Mac): nunca aquece, em nenhum gatilho', () => {
    for (const tipo of ['desktop-com-gpu', 'desktop-sem-gpu'] as const) {
      for (const gatilho of ['ponteiro', 'idiomas'] as const) {
        for (const poucaMemoria of [true, false]) {
          for (const leve of [true, false]) {
            const r = deveAquecerNaIntencao({ tipo, gatilho, poucaMemoria, leve, isolado: false })
            expect(r.aquecer).toBe(false)
            expect(r.motivo).toMatch(/isolamento|Safari/i)
          }
        }
      }
    }
  })

  it('celular sem isolamento não cai na regra do desktop (idiomas ainda aquece)', () => {
    const e = { ...base, tipo: 'celular-bom' as const, isolado: false, poucaMemoria: true, gatilho: 'idiomas' as const }
    expect(deveAquecerNaIntencao(e).aquecer).toBe(true)
  })

  it('sempre devolve um motivo', () => {
    expect(deveAquecerNaIntencao(base).motivo.length).toBeGreaterThan(0)
  })
})
