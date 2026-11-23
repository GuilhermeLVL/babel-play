import { describe, expect, it } from 'vitest'

import { cenarioDaBancada } from '../scripts/perf/latencia-legenda/cenario-da-bancada.mjs'

type Cen = { fixture: string; idioma: string; n: string; nome: string; eles: string; eu: string; qualidade: string }
const cenario = cenarioDaBancada as (opt: (n: string, d: string) => string, raiz: string) => Cen
const com = (o: Record<string, string>) => (n: string, d: string) => o[n] ?? d

describe('cenário da bancada por opção', () => {
  it('sem opções é o cenário de sempre: fleurs-en-8, en-US para pt-BR, qualidade do aparelho', () => {
    const c = cenario(com({}), '/r')
    expect(c).toMatchObject({ idioma: 'en', n: '8', nome: 'bancada_en', eles: 'en-US', eu: 'pt-BR', qualidade: '' })
    expect(c.fixture).toBe('/r/tests/fixtures/bancada-captura/fleurs-en-8.json')
  })

  it('o cenário do Parakeet: fixture pt, as duas fontes pt-BR e qualidade accurate', () => {
    const c = cenario(
      com({ fixture: 'tests/fixtures/bancada-captura/fleurs-pt-12.json', eles: 'pt-BR', qualidade: 'accurate' }),
      '/r',
    )
    expect(c).toMatchObject({
      idioma: 'pt',
      n: '12',
      nome: 'bancada_pt',
      eles: 'pt-BR',
      eu: 'pt-BR',
      qualidade: 'accurate',
    })
  })

  it('recusa fixture fora do padrão, valor inseguro e qualidade desconhecida', () => {
    expect(() => cenario(com({ fixture: 'x.json' }), '/r')).toThrow(/fleurs-<idioma>-<n>/)
    expect(() => cenario(com({ eles: 'pt;rm' }), '/r')).toThrow(/inválido/)
    expect(() => cenario(com({ qualidade: 'otima' }), '/r')).toThrow(/desconhecida/)
  })
})
