/**
 * AVALIAÇÃO DO ROTEADOR (E-005): o cálculo de precisão, trocas/min, custo/h e rede indevida e o veredito, sobre dados
 * sintéticos de resultado conhecido. Não há dado de campo aqui: o teste só prova que o critério é aplicado como foi escrito.
 */
import { describe, expect, it } from 'vitest'

import {
  acertou,
  avaliar,
  CRITERIO,
  melhorRotaAPosteriori,
  relatorio,
} from '../scripts/perf/latencia-legenda/avaliar-roteador.mjs'

type Fala = {
  decisao: string
  efetiva: string
  falaS: number
  latenciaPorRota: Record<string, number>
}
const fala = (decisao: string, lat: Record<string, number>, efetiva = 'modelo-no-aparelho', falaS = 3): Fala => ({
  decisao,
  efetiva,
  falaS,
  latenciaPorRota: lat,
})
const LAT = { manter: 1000, 'modelo-menor': 700, nuvem: 1500 }
const sessao = (falas: Fala[], minutos = 10, perfil = 'adulto-consentiu') => ({ perfil, minutos, falas })
const muitas = (n: number, f: () => Fala): Fala[] => Array.from({ length: n }, f)

describe('a melhor rota a posteriori e o acerto', () => {
  it('a de menor latência; ignora valor inválido', () => {
    expect(melhorRotaAPosteriori({ a: 900, b: 400, c: Number.NaN })).toEqual({ rota: 'b', ms: 400 })
    expect(melhorRotaAPosteriori({})).toBeNull()
  })
  it('acerta se é a melhor ou está a até 10% dela; erra além disso', () => {
    expect(acertou(fala('modelo-menor', LAT))).toBe(true)
    expect(acertou(fala('manter', { manter: 770, 'modelo-menor': 700 }))).toBe(true) // +10%
    expect(acertou(fala('manter', { manter: 780, 'modelo-menor': 700 }))).toBe(false) // +11,4%
    expect(acertou(fala('nuvem', { manter: 1000 }))).toBe(false) // decisão sem medição
    expect(acertou(fala('manter', {}))).toBeNull()
  })
})

describe('avaliar: resultado conhecido', () => {
  const base = { usdPorHoraDeNuvem: 0.058 }

  it('precisão 74%: não sair da sombra (o cenário da spec)', () => {
    const falas = [...muitas(74, () => fala('modelo-menor', LAT)), ...muitas(26, () => fala('nuvem', LAT))]
    const r = avaliar({
      ...base,
      sessoes: Array.from({ length: 10 }, (_, i) => sessao(falas.slice(i * 10, i * 10 + 10), 5)),
    })
    expect(r.precisao).toBeCloseTo(0.74, 5)
    expect(r.veredito).toBe('não sair da sombra')
    expect(r.falhas).toContain('precisão')
  })

  it('tudo certo e dados suficientes: seguir', () => {
    const sessoes = Array.from({ length: 6 }, () =>
      sessao(
        muitas(40, () => fala('modelo-menor', LAT)),
        20,
      ),
    )
    const r = avaliar({ ...base, sessoes })
    expect(r).toMatchObject({ precisao: 1, trocasPorMinuto: 0, redeIndevida: 0, veredito: 'seguir', falhas: [] })
  })

  it('acerta, mas com poucos dados: dados insuficientes (nunca seguir)', () => {
    const r = avaliar({ ...base, sessoes: [sessao(muitas(20, () => fala('modelo-menor', LAT)))] })
    expect(r.veredito).toBe('dados insuficientes')
    expect(relatorio(r)).toContain('sem veredito "seguir"')
  })

  it('trocas por minuto: 12 trocas em 4 min = 3/min falha', () => {
    const alternando = Array.from({ length: 13 }, (_, i) =>
      fala(i % 2 ? 'modelo-menor' : 'manter', { manter: 800, 'modelo-menor': 800 }),
    )
    const r = avaliar({ ...base, sessoes: [sessao(alternando, 4)] })
    expect(r.trocasPorMinuto).toBe(3)
    expect(r.falhas).toContain('trocas/min')
    expect(r.veredito).toBe('não sair da sombra')
  })

  it('custo: 1 hora com metade da fala na nuvem custa metade do preço; o acréscimo desconta a rota efetiva', () => {
    // 1 sessão de 60 min; 1800 s de fala na nuvem pela sombra, dos quais 600 s já iam à nuvem pela rota real
    const falas = [fala('nuvem', LAT, 'modelo-no-aparelho', 1200), fala('nuvem', LAT, 'nuvem-por-trechos', 600)]
    const r = avaliar({ usdPorHoraDeNuvem: 0.1, sessoes: [sessao(falas, 60)] })
    expect(r.custoSimuladoUsdPorHora).toBeCloseTo((1800 / 3600) * 0.1, 8)
    expect(r.custoDaRotaEfetivaUsdPorHora).toBeCloseTo((600 / 3600) * 0.1, 8)
    expect(r.custoAdicionalUsdPorHora).toBeCloseTo((1200 / 3600) * 0.1, 8)
    // acréscimo de 0,0333 > teto de 0,01: falha
    expect(avaliar({ usdPorHoraDeNuvem: 0.1, sessoes: [sessao(falas, 60)] }).falhas).toContain('custo/h')
  })

  it('o teto é sobre o ACRÉSCIMO: sombra igual à rota efetiva (mesmo cara) não reprova; 1 h de nuvem a mais reprova', () => {
    const igual = [fala('nuvem', LAT, 'nuvem-por-trechos', 3600)]
    const rIgual = avaliar({ usdPorHoraDeNuvem: 0.058, sessoes: [sessao(igual, 60)] })
    expect(rIgual.custoAdicionalUsdPorHora).toBeCloseTo(0, 8)
    expect(rIgual.falhas).not.toContain('custo/h')
    const a_mais = [fala('nuvem', LAT, 'parakeet', 3600)]
    const rMais = avaliar({ usdPorHoraDeNuvem: 0.058, sessoes: [sessao(a_mais, 60)] })
    expect(rMais.custoAdicionalUsdPorHora).toBeCloseTo(0.058, 8)
    expect(rMais.falhas).toContain('custo/h')
    // dentro do teto: 0,01 de acréscimo exato passa
    const limite = [fala('nuvem', LAT, 'parakeet', (0.01 / 0.058) * 3600)]
    expect(avaliar({ usdPorHoraDeNuvem: 0.058, sessoes: [sessao(limite, 60)] }).falhas).not.toContain('custo/h')
  })

  it('a rota Parakeet é candidata: `manter` com efetiva parakeet vale a latência do Parakeet', () => {
    const lat = { parakeet: 600, 'modelo-menor': 900, nuvem: 1300 }
    expect(melhorRotaAPosteriori(lat)).toEqual({ rota: 'parakeet', ms: 600 })
    expect(acertou(fala('manter', lat, 'parakeet'))).toBe(true) // manter = Parakeet = a melhor
    expect(acertou(fala('modelo-menor', lat, 'parakeet'))).toBe(false) // 50% pior que o Parakeet
    expect(acertou(fala('nuvem', lat, 'parakeet'))).toBe(false)
  })

  it('nuvem para convidado, menor ou sem consentimento reprova, mesmo com o resto perfeito', () => {
    for (const perfil of ['convidado', 'menor-sem-consentimento', 'adulto-sem-consentimento']) {
      const sessoes = [
        ...Array.from({ length: 6 }, () =>
          sessao(
            muitas(40, () => fala('modelo-menor', LAT)),
            20,
          ),
        ),
        sessao([fala('nuvem', { nuvem: 500, 'modelo-menor': 600 })], 20, perfil),
      ]
      const r = avaliar({ ...base, sessoes })
      expect(r.redeIndevida).toBe(1)
      expect(r.veredito).toBe('não sair da sombra')
    }
  })

  it('exige o preço da nuvem (vem do custo-de-ia, não de um padrão escondido)', () => {
    expect(() => avaliar({ sessoes: [] } as never)).toThrow(/usdPorHoraDeNuvem/)
  })

  it('o critério é o escrito antes da coleta', () => {
    expect(CRITERIO).toMatchObject({ precisaoMinima: 0.8, trocasPorMinutoMaximas: 2, acrescimoUsdPorHoraMaximo: 0.01 })
  })
})
