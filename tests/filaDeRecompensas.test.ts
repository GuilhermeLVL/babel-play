import { describe, expect, it } from 'vitest'

import { enfileirarSemRepetir, type Recompensa, tirarDaFila } from '../src/lib/filaDeRecompensas'

/**
 * A FILA DO MODAL DE RESGATE NÃO REPETE. As conquistas são reavaliadas a cada métrica nova, e
 * antes de o usuário fechar a primeira a mesma conquista já tinha entrado de novo: "Primeira
 * captura" aparecia, fechava, e voltava — o dono viu isso ao abrir o app (23/09/2026).
 */
const conquista = (id: string): Recompensa => ({ tipo: 'conquista', id, nome: id, seeds: 10, xp: 5 })

describe('fila de recompensas', () => {
  it('não enfileira de novo o que já está na fila', () => {
    const fila = enfileirarSemRepetir([conquista('a')], [conquista('a'), conquista('b')])
    expect(fila.map((r) => (r.tipo === 'conquista' ? r.id : ''))).toEqual(['a', 'b'])
  })

  it('não repete dentro do mesmo lote', () => {
    expect(enfileirarSemRepetir([], [conquista('a'), conquista('a')])).toHaveLength(1)
  })

  it('fechar tira todas as cópias daquela recompensa', () => {
    const fila = [conquista('a'), conquista('b'), conquista('a')]
    expect(tirarDaFila(fila, conquista('a')).map((r) => (r.tipo === 'conquista' ? r.id : ''))).toEqual(['b'])
  })
})
