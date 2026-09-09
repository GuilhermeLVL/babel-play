import { describe, expect,it } from 'vitest'

import { classificarVazamento, sobreposicaoMs } from '../src/lib/vazamento'

const base = { idiomaDoMic: 'pt', idiomaDoSistema: 'en', mic: { inicioMs: 1000, fimMs: 3000 } }

describe('vazamento da caixa de som no microfone', () => {
  it('sobreposição soma a união, sem contar duas vezes', () => {
    expect(sobreposicaoMs({ inicioMs: 0, fimMs: 10 }, [{ inicioMs: 2, fimMs: 6 }, { inicioMs: 4, fimMs: 8 }])).toBe(6)
    expect(sobreposicaoMs({ inicioMs: 0, fimMs: 10 }, [{ inicioMs: 20, fimMs: 30 }])).toBe(0)
  })

  it('inglês no mic, por cima de uma fala do sistema → vazamento', () => {
    const r = classificarVazamento({ ...base, idiomaDetectado: 'en', falasDoSistema: [{ inicioMs: 500, fimMs: 2800 }] })
    expect(r.veredicto).toBe('vazamento')
    expect(r.fracao).toBeCloseTo(0.9)
  })

  it('inglês no mic SEM sobreposição → fala própria (você pode falar inglês de propósito)', () => {
    const r = classificarVazamento({ ...base, idiomaDetectado: 'en', falasDoSistema: [{ inicioMs: 4000, fimMs: 6000 }] })
    expect(r.veredicto).toBe('fala-propria')
  })

  it('português por cima dos outros → fala própria (idioma certo)', () => {
    const r = classificarVazamento({ ...base, idiomaDetectado: 'pt', falasDoSistema: [{ inicioMs: 0, fimMs: 5000 }] })
    expect(r.veredicto).toBe('fala-propria')
  })

  it('sobreposição parcial abaixo do limiar não basta', () => {
    const r = classificarVazamento({ ...base, idiomaDetectado: 'en', falasDoSistema: [{ inicioMs: 2500, fimMs: 5000 }] })
    expect(r.veredicto).toBe('fala-propria')
    expect(r.fracao).toBeCloseTo(0.25)
  })

  it('sem detecção, ou sistema no mesmo idioma que você, nunca acusa', () => {
    expect(classificarVazamento({ ...base, idiomaDetectado: null, falasDoSistema: [{ inicioMs: 0, fimMs: 5000 }] }).veredicto).toBe('fala-propria')
    expect(classificarVazamento({ ...base, idiomaDoSistema: 'pt', idiomaDetectado: 'pt', falasDoSistema: [{ inicioMs: 0, fimMs: 5000 }] }).veredicto).toBe('fala-propria')
  })
})
