/**
 * GASTO ANÔMALO POR USUÁRIO (Fase 5 de prontidão, 25/09/2026).
 *
 * A cota do plano limita o MÊS de um assinante; o orçamento global limita a SOMA. Nenhum dos dois
 * diz "este usuário, hoje, gastou vinte vezes o que os outros gastam" — que é o sinal de um cliente
 * em laço, de uma conta compartilhada ou de uso automatizado, e que precisa chegar a alguém ANTES da
 * cota dele (ou o orçamento do serviço) acabar. O vigia não bloqueia nada: ele avisa, uma vez por
 * usuário por dia e por motivo.
 */
import { describe, expect, it } from 'vitest'

import { criarVigiaDeGasto } from '../server/lib/gastoAnomalo'

const limiares = { tetoUsdDia: 0.5, fatorDaMediana: 10, minimoDeUsuarios: 5 }

function vigiaNoDia(dia = '2026-09-25T12:00:00Z') {
  let agora = Date.parse(dia)
  const v = criarVigiaDeGasto({ limiares: () => limiares, agora: () => agora })
  return { v, avancar: (ms: number) => (agora += ms) }
}

describe('teto absoluto por usuário', () => {
  it('passa do teto do dia → anômalo com motivo `teto`, uma vez só', () => {
    const { v } = vigiaNoDia()
    expect(v.registrar('u1', 0.3)).toBeNull()
    const a = v.registrar('u1', 0.25)
    expect(a?.motivo).toBe('teto')
    expect(a?.gastoUsd).toBeCloseTo(0.55, 6)
    // O mesmo usuário continua gastando: o alerta não se repete no mesmo dia.
    expect(v.registrar('u1', 0.5)).toBeNull()
  })

  it('o dia vira (UTC) e o gasto recomeça do zero', () => {
    const { v, avancar } = vigiaNoDia('2026-09-25T23:59:00Z')
    expect(v.registrar('u1', 0.45)).toBeNull()
    avancar(2 * 60_000)
    expect(v.registrar('u1', 0.1)).toBeNull()
    expect(v.usuariosHoje()).toBe(1)
  })
})

describe('múltiplo da mediana do dia', () => {
  it('com poucos usuários a mediana não vale (evita alarme no primeiro cliente do dia)', () => {
    const { v } = vigiaNoDia()
    v.registrar('a', 0.001)
    v.registrar('b', 0.001)
    expect(v.registrar('c', 0.2)).toBeNull()
  })

  it('usuário acima de N× a mediana (com usuários suficientes) → anômalo com motivo `mediana`', () => {
    const { v } = vigiaNoDia()
    for (const u of ['a', 'b', 'c', 'd', 'e', 'f']) v.registrar(u, 0.01)
    const a = v.registrar('g', 0.2)
    expect(a?.motivo).toBe('mediana')
    expect(a?.medianaUsd).toBeCloseTo(0.01, 6)
    expect(a?.gastoUsd).toBeCloseTo(0.2, 6)
  })

  it('dentro do múltiplo não alerta', () => {
    const { v } = vigiaNoDia()
    for (const u of ['a', 'b', 'c', 'd', 'e', 'f']) v.registrar(u, 0.01)
    expect(v.registrar('g', 0.05)).toBeNull()
  })

  it('custo inválido ou não positivo é ignorado', () => {
    const { v } = vigiaNoDia()
    expect(v.registrar('a', Number.NaN)).toBeNull()
    expect(v.registrar('a', -1)).toBeNull()
    expect(v.usuariosHoje()).toBe(0)
  })
})
