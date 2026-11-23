import { describe, expect, it } from 'vitest'

import {
  flagsComoArgumento,
  flagsDoAlvo,
  flagsDoNavegador,
  lerFlagsDoAlvo,
} from '../scripts/perf/latencia-legenda/flags-do-alvo.mjs'

const ler = lerFlagsDoAlvo as (t: string) => Record<string, string[]>
const doAlvo = flagsDoAlvo as (n: string, m: Record<string, string[]>, g?: string) => string[]
const doNavegador = flagsDoNavegador as (f: string[] | string) => Record<string, { ligada: boolean }>

describe('--flag-do-alvo: flags por braço do A/B', () => {
  it('várias flags por alvo (vírgula ou +) e alvos separados por ;', () => {
    expect(ler('depois=parciais_vivos,parciais_parakeet;antes=')).toEqual({
      depois: ['parciais_vivos', 'parciais_parakeet'],
      antes: [],
    })
    expect(ler('b=parciais_vivos+traducao_incremental')).toEqual({ b: ['parciais_vivos', 'traducao_incremental'] })
    expect(ler('')).toEqual({})
  })

  it('recusa par sem "=" e flag com caractere estranho', () => {
    expect(() => ler('depois')).toThrow(/sem "nome=flags"/)
    expect(() => ler('depois=a b;')).toThrow(/inválida/)
    expect(() => ler('depois=../x')).toThrow(/inválida/)
  })

  it('o alvo com par usa o dele (mesmo vazio); sem par, cai no --flag global, que também aceita várias', () => {
    const m = ler('depois=parciais_vivos,parciais_parakeet;antes=')
    expect(doAlvo('depois', m, 'x')).toEqual(['parciais_vivos', 'parciais_parakeet'])
    expect(doAlvo('antes', m, 'x')).toEqual([])
    expect(doAlvo('outro', m, 'a,b')).toEqual(['a', 'b'])
    expect(doAlvo('outro', {}, '')).toEqual([])
  })

  it('vira o argumento do medir.mjs e o `babel.flags` do navegador, todas ligadas', () => {
    expect(flagsComoArgumento(['a', 'b'])).toBe('a,b')
    expect(doNavegador('parciais_vivos,parciais_parakeet')).toEqual({
      parciais_vivos: { ligada: true },
      parciais_parakeet: { ligada: true },
    })
    expect(doNavegador([])).toEqual({})
  })
})
