import { describe, expect, it } from 'vitest'

import {
  armazenamentoComoArgumento,
  armazenamentoDoAlvo,
  lerArmazenamentoDoAlvo,
  paresDoArgumento,
} from '../scripts/perf/latencia-legenda/armazenamento-do-alvo.mjs'

const ler = lerArmazenamentoDoAlvo as (t: string) => Record<string, Record<string, string>>
const doAlvo = armazenamentoDoAlvo as (n: string, m: Record<string, Record<string, string>>) => Record<string, string>

describe('--armazenamento-do-alvo: chaves de laboratório por braço do A/B', () => {
  it('lê alvo=chave:valor, vários alvos por ; e várias chaves por alvo por ,', () => {
    expect(ler('a=babel.lab.parciaisModo:sem-cauda;b=babel.lab.parciaisModo:cauda-decode,babel.lab.x:1')).toEqual({
      a: { 'babel.lab.parciaisModo': 'sem-cauda' },
      b: { 'babel.lab.parciaisModo': 'cauda-decode', 'babel.lab.x': '1' },
    })
    expect(ler('')).toEqual({})
    expect(ler('a=k:1;a=j:2')).toEqual({ a: { k: '1', j: '2' } })
  })

  it('recusa par sem "=", item sem ":" e caracteres estranhos', () => {
    expect(() => ler('a')).toThrow(/sem "alvo=chave:valor"/)
    expect(() => ler('a=chave')).toThrow(/sem "chave:valor"/)
    expect(() => ler('a=k:v w')).toThrow(/valor inválido/)
    expect(() => ler('a=k"x:v')).toThrow(/chave inválida/)
  })

  it('alvo sem par fica sem chaves; o argumento do medir.mjs faz ida e volta', () => {
    const m = ler('a=k:v,j:w')
    expect(doAlvo('b', m)).toEqual({})
    expect(armazenamentoComoArgumento(doAlvo('a', m))).toBe('k:v,j:w')
    expect(paresDoArgumento('k:v,j:w')).toEqual([
      ['k', 'v'],
      ['j', 'w'],
    ])
    expect(paresDoArgumento('')).toEqual([])
  })
})
