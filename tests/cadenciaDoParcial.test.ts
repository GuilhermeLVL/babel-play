import { describe, expect, it } from 'vitest'

import { CADENCIA_PADRAO, criarMedidorDeParcial, decidirParcial } from '../src/core/legendas/cadenciaDoParcial'
import { ESPECULATIVO_MS } from '../src/gateway/capture/systemAudio'

const base = { rtf: 0.1, janelaS: 2, workerOcupado: false, msDesdeUltimo: Infinity, amostrasNovas: 16000 }

describe('cadência adaptativa do parcial', () => {
  it('worker ocupado nunca pede (o parcial não enfileira)', () => {
    expect(decidirParcial({ ...base, workerOcupado: true })).toMatchObject({ pedir: false, motivo: 'ocupado' })
  })

  it('poucas amostras novas: espera', () => {
    expect(decidirParcial({ ...base, amostrasNovas: 100 })).toMatchObject({ pedir: false, motivo: 'poucas-amostras' })
  })

  it('RTF baixo: o intervalo cai no piso (500 ms)', () => {
    const d = decidirParcial({ ...base, rtf: 0.05, janelaS: 1, msDesdeUltimo: 499 })
    expect(d.intervaloMs).toBe(CADENCIA_PADRAO.pisoMs)
    expect(d.motivo).toBe('intervalo')
    expect(decidirParcial({ ...base, rtf: 0.05, janelaS: 1, msDesdeUltimo: 500 }).pedir).toBe(true)
  })

  it('grade: o intervalo cresce com o RTF e com a janela, entre o piso e o teto', () => {
    const intervalos = [0.05, 0.1, 0.2, 0.4].map(
      (rtf) => decidirParcial({ ...base, rtf, janelaS: 4, msDesdeUltimo: Infinity }).intervaloMs,
    )
    for (let i = 1; i < intervalos.length; i++) expect(intervalos[i]).toBeGreaterThanOrEqual(intervalos[i - 1])
    for (const x of intervalos) {
      expect(x).toBeGreaterThanOrEqual(500)
      expect(x).toBeLessThanOrEqual(2000)
    }
    // rtf 0,2 × 4 s = 800 ms de custo → 1.600 ms com fração 0,5
    expect(decidirParcial({ ...base, rtf: 0.2, janelaS: 4 }).intervaloMs).toBeCloseTo(1600)
  })

  it('custo que não cabe nem no teto: pula o parcial (orçamento)', () => {
    expect(decidirParcial({ ...base, rtf: 1, janelaS: 3 })).toMatchObject({ pedir: false, motivo: 'orcamento' })
  })

  it('teto de CPU agregada segura o parcial', () => {
    expect(decidirParcial({ ...base, cpuRecente: 0.7 })).toMatchObject({ pedir: false, motivo: 'cpu' })
    expect(decidirParcial({ ...base, cpuRecente: 0.3 }).pedir).toBe(true)
  })

  it('sem medida de RTF usa o inicial e o 1º parcial sai (sem espera de intervalo)', () => {
    expect(decidirParcial({ ...base, rtf: null, janelaS: 0.6 }).pedir).toBe(true)
  })
})

describe('medidor do parcial', () => {
  it('RTF por média móvel e CPU numa janela deslizante', () => {
    let t = 0
    const m = criarMedidorDeParcial(() => t, 10_000, 0.5)
    expect(m.rtf()).toBeNull()
    t = 1000
    m.registrar(200, 2000) // 0,1
    expect(m.rtf()).toBeCloseTo(0.1)
    t = 2000
    m.registrar(600, 2000) // 0,3 → 0,5*0,3 + 0,5*0,1
    expect(m.rtf()).toBeCloseTo(0.2)
    expect(m.cpu()).toBeCloseTo(0.08)
    t = 30_000
    expect(m.cpu()).toBe(0)
  })

  it('ignora medidas inválidas', () => {
    const m = criarMedidorDeParcial(() => 0)
    m.registrar(-1, 1000)
    m.registrar(100, 0)
    expect(m.rtf()).toBeNull()
  })

  describe('V5: o final nunca espera o parcial (fim provável)', () => {
    // rtf 0,1 × 2 s = custo de 200 ms; o final especulativo é postado com 450 ms de silêncio
    it('o limite é o mesmo silêncio em que a captura posta o final especulativo', () => {
      expect(CADENCIA_PADRAO.finalEspeculativoMs).toBe(ESPECULATIVO_MS)
    })

    it('silêncio + custo estimado passando do final especulativo: não começa', () => {
      expect(decidirParcial({ ...base, silencioMs: 300 })).toMatchObject({ pedir: false, motivo: 'fim-provavel' })
    })

    it('silêncio + custo cabendo antes do final especulativo: pede', () => {
      expect(decidirParcial({ ...base, silencioMs: 96 }).pedir).toBe(true)
      expect(decidirParcial({ ...base, silencioMs: 250 }).pedir).toBe(true) // 250 + 200 = 450: ainda cabe
    })

    it('custo maior encurta a tolerância ao silêncio (a janela longa não começa com pausa)', () => {
      // rtf 0,1 × 4 s = 400 ms: com 96 ms de silêncio já passa de 450 ms
      expect(decidirParcial({ ...base, rtf: 0.1, janelaS: 4, silencioMs: 96 })).toMatchObject({
        pedir: false,
        motivo: 'fim-provavel',
      })
      expect(decidirParcial({ ...base, rtf: 0.1, janelaS: 4, silencioMs: 50 }).pedir).toBe(true)
    })

    it('falando (silêncio 0) ou sem a informação: pede como sempre', () => {
      expect(decidirParcial({ ...base, rtf: 0.1, janelaS: 4, silencioMs: 0 }).pedir).toBe(true)
      expect(decidirParcial({ ...base, rtf: 0.1, janelaS: 4 }).pedir).toBe(true)
    })
  })
})
