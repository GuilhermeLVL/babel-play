/**
 * O ACERVO DA LEITURA ATIVA (spec `leitura-ativa-acervo`): 12 textos originais, 4 por nível, CC BY 4.0, autoria
 * da equipe Frasy, e todos passam no validador da ficha. O crédito do rodapé sai da ficha.
 */
import { describe, expect, it } from 'vitest'

import { validarFicha } from '../src/core/leitura/fichaDeTexto'
import { creditoDoTexto } from '../src/data/leitura/acervo'
import textos from '../src/data/leitura/textos.json'

describe('o acervo da leitura ativa', () => {
  it('tem 12 textos com id único, 4 por nível', () => {
    expect(textos).toHaveLength(12)
    expect(new Set(textos.map((t) => t.id)).size).toBe(12)
    for (const nivel of ['A1', 'A2', 'B1']) expect(textos.filter((t) => t.nivel === nivel)).toHaveLength(4)
  })

  it('todos com licença CC BY 4.0 e autoria da equipe Frasy', () => {
    for (const t of textos) {
      expect(t.licenca, t.id).toContain('CC BY 4.0')
      expect(t.autoria, t.id).toContain('Equipe Frasy')
    }
  })

  it('nenhuma ficha tem problema no validador', () => {
    const problemas = textos.flatMap((t) => validarFicha(t)).map((p) => p.mensagem)
    expect(problemas).toEqual([])
  })

  it('o crédito do rodapé sai da ficha: equipe Frasy, criado com IA e revisado, CC BY 4.0', () => {
    const mercado = textos.find((t) => t.titulo === 'At the Market')!
    const c = creditoDoTexto(mercado)
    expect(c).toContain('equipe Frasy')
    expect(c).toContain('criado com IA e revisado')
    expect(c).toContain('CC BY 4.0')
  })
})
