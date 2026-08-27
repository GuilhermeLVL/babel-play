import { describe, it, expect } from 'vitest'
import { nivelNecessario, desbloqueado, recompensasDoNivel, rotuloDaRecompensa } from '../src/lib/desbloqueios'

describe('desbloqueios por nível', () => {
  it('o básico é livre; o resto tem degrau', () => {
    expect(nivelNecessario('tema', 'babel')).toBe(1)
    expect(nivelNecessario('tema', 'linear')).toBe(2)
    expect(nivelNecessario('fonte', 'pixel')).toBe(5)
    expect(nivelNecessario('posicao', 'top')).toBe(1)
    expect(nivelNecessario('posicao', 'right')).toBe(3)
    expect(nivelNecessario('estudio', 'abrir')).toBe(10)
  })
  it('nível libera; escolha já salva NUNCA é rebaixada', () => {
    expect(desbloqueado(1, 'tema', 'vercel')).toBe(false)
    expect(desbloqueado(4, 'tema', 'vercel')).toBe(true)
    // pessoa nível 1 que JÁ usa vercel continua podendo usá-lo
    expect(desbloqueado(1, 'tema', 'vercel', 'vercel')).toBe(true)
    expect(desbloqueado(1, 'tema', 'mochi', 'vercel')).toBe(false)
  })
  it('recompensas por nível alimentam o toast', () => {
    expect(recompensasDoNivel(5).map(r => r.id)).toContain('pixel')
    expect(recompensasDoNivel(3)).toHaveLength(2)
    expect(rotuloDaRecompensa({ tipo: 'fonte', id: 'pixel' })).toMatch(/Arcade/)
  })
})
