// @vitest-environment jsdom
import { beforeEach, describe, expect, it } from 'vitest'
import {
  nivelDoAprimoramento, custoDoProximoNivel, registrarAprimoramento, progressoDoAprimoramento,
  intensidadeMaxima, setIntensidade, intensidadeEfetiva, ajusteDeBurst, sorteDeEventos,
} from '../src/lib/aprimoramentos'
import { sortearEventoRaro } from '../src/lib/eventosDeJogo'

beforeEach(() => {
  localStorage.removeItem('babel.aprimoramentos')
  localStorage.removeItem('babel.particulas_intensidade')
})

describe('aprimoramentos', () => {
  it('sobe de nível com custo crescente e para no máximo', () => {
    expect(nivelDoAprimoramento('particulas')).toBe(0)
    expect(custoDoProximoNivel('particulas')).toBe(30)
    registrarAprimoramento('particulas')
    expect(custoDoProximoNivel('particulas')).toBe(60)
    registrarAprimoramento('particulas')
    registrarAprimoramento('particulas')
    expect(nivelDoAprimoramento('particulas')).toBe(3)
    expect(custoDoProximoNivel('particulas')).toBeNull()
    registrarAprimoramento('particulas') // não passa do teto
    expect(nivelDoAprimoramento('particulas')).toBe(3)
    expect(progressoDoAprimoramento('particulas')).toBe(100)
  })

  it('intensidade tem teto pelo nível, e voltar para pequena é sempre permitido', () => {
    expect(intensidadeMaxima(0)).toBe('media') // média é livre: o padrão do app não pode nascer invisível
    expect(intensidadeMaxima(1)).toBe('media')
    expect(intensidadeMaxima(2)).toBe('grande')
    setIntensidade('grande')
    expect(intensidadeEfetiva()).toBe('media') // Nv.0: o desejo não fura o teto
    registrarAprimoramento('particulas')
    registrarAprimoramento('particulas')
    expect(intensidadeEfetiva()).toBe('grande')
    setIntensidade('pequena') // dominou, mas prefere discreto: escolha respeitada
    expect(intensidadeEfetiva()).toBe('pequena')
  })

  it('multiplicadores crescem com nível e intensidade, com teto duro', () => {
    setIntensidade('media')
    const base = ajusteDeBurst()
    expect(base.countMul).toBeCloseTo(1) // Nv.0 + média = comportamento clássico intacto
    registrarAprimoramento('particulas')
    registrarAprimoramento('particulas')
    registrarAprimoramento('particulas')
    setIntensidade('grande')
    const cheio = ajusteDeBurst()
    expect(cheio.countMul).toBeGreaterThan(base.countMul)
    expect(cheio.countMul).toBeLessThanOrEqual(2.2)
    expect(cheio.sizeMul).toBeLessThanOrEqual(2)
  })

  it('sorte multiplica a chance dos eventos sem mudar o comportamento neutro', () => {
    expect(sorteDeEventos()).toBe(1)
    // com mul neutro, as faixas dos testes de eventos continuam exatas
    expect(sortearEventoRaro(() => 0.001, 1)?.id).toBe('estrelas')
    registrarAprimoramento('sorte')
    registrarAprimoramento('sorte')
    registrarAprimoramento('sorte')
    expect(sorteDeEventos()).toBe(1.75)
    // um dado que NÃO sorteava nada no neutro passa a sortear com a chance aumentada
    expect(sortearEventoRaro(() => 0.3, 1)).toBeNull()
    expect(sortearEventoRaro(() => 0.3, 1.75)).not.toBeNull()
  })
})
