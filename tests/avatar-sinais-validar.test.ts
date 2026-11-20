import { describe, expect, it } from 'vitest'

import type { Limites } from '../src/core/avatar/sinais/tipos'
import { validarAlfabeto } from '../src/core/avatar/sinais/validar'
import alfabetoAsl from '../src/data/avatar/sinais/alfabeto-asl.json'
import alfabetoLibras from '../src/data/avatar/sinais/alfabeto-libras.json'
import limitesJson from '../src/data/avatar/sinais/limites.json'

const lim = limitesJson as unknown as Limites
const clone = <T>(x: T): T => JSON.parse(JSON.stringify(x)) as T

type Mao = Record<string, Record<string, number | null>>
interface LetraB {
  mao: Mao
  movimento: boolean
  movimento_descricao: string
  caminho: unknown[]
}

/** As 7 adulterações do teste de rejeição do protótipo (`validar.mjs`), reimplementadas. */
const ADULTERACOES: Array<[string, (L: LetraB) => void]> = [
  ['pip do indicador = 130 (limite 115)', (L) => void (L.mao.indicador.pip = 130)],
  ['dip explícito do médio = 95 (limite 90)', (L) => void (L.mao.medio.dip = 95)],
  ['mcp do anelar = -40 (limite -20)', (L) => void (L.mao.anelar.mcp = -40)],
  ['abd do indicador = 45 (limite 30)', (L) => void (L.mao.indicador.abd = 45)],
  ['polegar cmc_abd = -30 (convenção antiga; limite -15)', (L) => void (L.mao.polegar.cmc_abd = -30)],
  ['polegar mcp = 120 (limite 75)', (L) => void (L.mao.polegar.mcp = 120)],
  [
    'dip nulo com pip = 115 e delta que passa do limite',
    (L) => {
      L.mao.minimo = { mcp: 0, pip: 115, dip: null, abd: 0 }
      L.movimento = true
      L.movimento_descricao = 'x'
      L.caminho = [{ t: 1, dflex: { minimo: [0, 30, 0, 0] } }]
    },
  ],
]

describe('validarAlfabeto (porta de validar.mjs)', () => {
  it('aceita os dois alfabetos reais (controle sem adulteração)', () => {
    expect(validarAlfabeto(alfabetoAsl, 'asl', lim)).toEqual({ ok: true, erros: [] })
    expect(validarAlfabeto(alfabetoLibras, 'libras', lim)).toEqual({ ok: true, erros: [] })
  })

  it.each(ADULTERACOES)('rejeita: %s', (_nome, muta) => {
    const base = clone(alfabetoAsl) as unknown as { letras: { B: LetraB } }
    muta(base.letras.B)
    const r = validarAlfabeto(base, 'asl', lim)
    expect(r.ok).toBe(false)
    expect(r.erros.some((e) => e.startsWith('asl.B'))).toBe(true)
  })

  it('prova do conjunto: 7/7 rejeitadas e o controle aceito', () => {
    let rejeitadas = 0
    for (const [, muta] of ADULTERACOES) {
      const base = clone(alfabetoAsl) as unknown as { letras: { B: LetraB } }
      muta(base.letras.B)
      if (!validarAlfabeto(base, 'asl', lim).ok) rejeitadas += 1
    }
    expect(rejeitadas).toBe(7)
    expect(validarAlfabeto(clone(alfabetoAsl), 'asl', lim).ok).toBe(true)
  })

  it('falha se o aviso de "NÃO revisadas" sumir, se faltar letra ou o esquema mudar', () => {
    const a = clone(alfabetoLibras) as unknown as { aviso: string; esquema: string; letras: Record<string, unknown> }
    a.aviso = 'Poses prontas.'
    expect(validarAlfabeto(a, 'libras', lim).erros.join('|')).toMatch(/NÃO revisadas/)
    const b = clone(alfabetoLibras) as unknown as { esquema: string; letras: Record<string, unknown> }
    delete b.letras.Ç
    b.esquema = 'frasy-alfabeto-mao/1'
    const rb = validarAlfabeto(b, 'libras', lim).erros.join('|')
    expect(rb).toMatch(/letra Ç ausente/)
    expect(rb).toMatch(/esquema inesperado/)
  })

  it('não lança com lixo (null, string, letra que não é objeto)', () => {
    expect(validarAlfabeto(null, 'asl', lim).ok).toBe(false)
    expect(validarAlfabeto('x', 'asl', lim).ok).toBe(false)
    const a = clone(alfabetoAsl) as unknown as { letras: Record<string, unknown> }
    a.letras.A = 7
    expect(validarAlfabeto(a, 'asl', lim).ok).toBe(false)
  })

  it('exige movimento nas letras de percurso e orientação perpendicular', () => {
    const a = clone(alfabetoAsl) as unknown as {
      letras: Record<string, { movimento: boolean; orientacao: { palma: number[] } }>
    }
    a.letras.J.movimento = false
    a.letras.A.orientacao.palma = [0, 1, 0] // paralela a `dedos` [0,1,0]
    const e = validarAlfabeto(a, 'asl', lim).erros.join('|')
    expect(e).toMatch(/asl\.J: deve estar marcada movimento/)
    expect(e).toMatch(/asl\.A: dedos e palma não são perpendiculares/)
  })

  it('nenhuma letra de Libras está marcada com fidelidade alta (não promover sem revisão)', () => {
    const altas = Object.entries((alfabetoLibras as { letras: Record<string, { fidelidade: string }> }).letras).filter(
      ([, l]) => l.fidelidade === 'alta',
    )
    expect(altas).toEqual([])
  })
})
