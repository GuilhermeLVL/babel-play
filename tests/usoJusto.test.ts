/**
 * O CONTRATO DO USO JUSTO DO DIA (`src/core/usoJusto.ts`): o código da recusa e a espera até a
 * virada do dia LOCAL (`segundosAteVirarODia`, em `learning/economia.ts`) — o `Retry-After` do 429
 * `uso_justo_do_dia`.
 */
import { describe, expect, it } from 'vitest'

import { segundosAteVirarODia } from '../src/core/learning/economia'
import { CODIGO_USO_JUSTO_DO_DIA, ehRecusaDoUsoJusto } from '../src/core/usoJusto'

describe('segundosAteVirarODia', () => {
  it('20h30 em São Paulo: faltam 3h30 para a meia-noite de lá', () => {
    expect(segundosAteVirarODia(Date.parse('2026-09-30T23:30:00Z'), 'America/Sao_Paulo')).toBe(3.5 * 3600)
  })

  it('o mesmo instante em Tóquio já é outro dia: faltam 15h30', () => {
    expect(segundosAteVirarODia(Date.parse('2026-09-30T23:30:00Z'), 'Asia/Tokyo')).toBe(15.5 * 3600)
  })

  it('fuso de meia hora (Índia) e segundos quebrados', () => {
    // 23:59:30 em Calcutá (UTC+5:30) → faltam 30 s.
    expect(segundosAteVirarODia(Date.parse('2026-09-30T18:29:30Z'), 'Asia/Kolkata')).toBe(30)
  })

  it('o dia da troca de horário de verão fecha certo (Nova York, 2 de novembro de 2026: 25 h)', () => {
    // 00:30 do dia 1º em Nova York (EDT, UTC−4) → a próxima meia-noite local é 05:00Z do dia 2.
    expect(segundosAteVirarODia(Date.parse('2026-11-01T04:30:00Z'), 'America/New_York')).toBe(24.5 * 3600)
  })

  it('fuso inválido cai no padrão (São Paulo), e a espera nunca é zero', () => {
    const agora = Date.parse('2026-10-01T02:59:59.500Z') // 23:59:59,5 em São Paulo
    expect(segundosAteVirarODia(agora, 'Lugar/Nenhum')).toBe(1)
  })
})

describe('ehRecusaDoUsoJusto', () => {
  it('só o 429 com o código do uso justo', () => {
    expect(ehRecusaDoUsoJusto(429, { code: CODIGO_USO_JUSTO_DO_DIA })).toBe(true)
    expect(ehRecusaDoUsoJusto(429, { code: 'nuvem_ocupada' })).toBe(false)
    expect(ehRecusaDoUsoJusto(402, { code: CODIGO_USO_JUSTO_DO_DIA })).toBe(false)
    expect(ehRecusaDoUsoJusto(429, null)).toBe(false)
  })
})
