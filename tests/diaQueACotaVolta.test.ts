/**
 * O dia em que a cota volta (tarefa 3.1 de `cota-pelo-periodo-pago`): quem paga renova no `renovaEm` do servidor, e
 * não no dia 1º; sem ele (ou com ele vencido), o primeiro dia do mês UTC seguinte.
 */
import { afterEach, describe, expect, it } from 'vitest'

import { diaQueACotaVolta, lembrarRenovacaoDaCota } from '../src/lib/diaQueACotaVolta'

const agora = new Date('2026-11-15T15:00:00Z')

afterEach(() => lembrarRenovacaoDaCota(null))

describe('diaQueACotaVolta', () => {
  it('sem renovaEm: o dia 1º do mês que vem', () => {
    expect(diaQueACotaVolta(agora, null)).toBe('1 de dezembro')
  })

  it('com o renovaEm de quem paga: essa data', () => {
    expect(diaQueACotaVolta(agora, Date.parse('2026-12-03T12:00:00Z'))).toBe('3 de dezembro')
  })

  it('renovaEm vencido não vale: volta ao dia 1º', () => {
    expect(diaQueACotaVolta(agora, Date.parse('2026-11-10T12:00:00Z'))).toBe('1 de dezembro')
  })

  it('usa o renovaEm lembrado da última leitura de /api/me/uso', () => {
    lembrarRenovacaoDaCota(Date.parse('2026-11-28T12:00:00Z'))
    expect(diaQueACotaVolta(agora)).toBe('28 de novembro')
    lembrarRenovacaoDaCota(undefined)
    expect(diaQueACotaVolta(agora)).toBe('1 de dezembro')
  })
})
