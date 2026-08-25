/**
 * Substituição de `estimateCefr` (Ajuste 1 da retomada).
 *
 * O estimador antigo decidia o nível pelo COMPRIMENTO da palavra + um set de 68 termos. Medido no
 * banco real: 2.087 de 2.126 cartões com confiança < 0,5, e distribuição invertida — A1 com 100
 * palavras contra B1 com 739, porque palavra longa virava nível alto. Ruído.
 *
 * A substituição é lookup numa wordlist REAL: CEFR-J Vocabulary Profile 1.5 (Tono Laboratory,
 * TUFS) + Octanove C1/C2, já vendorizada em `src/data/trilha/en.json` com licenças em FONTES.md.
 *
 * A regra que importa: palavra FORA da wordlist não recebe nível chutado — recebe `null` com
 * procedência `ausente`. Nível inventado tem peso zero no modelo de dificuldade (F4).
 */
import { describe, it, expect } from 'vitest'
import { nivelCefr, PROCEDENCIAS, coberturaDaWordlist } from '../src/core/learning/cefrWordlist'

describe('nivelCefr — lookup em wordlist real', () => {
  it('palavra A1 conhecida devolve A1 com procedência de wordlist', () => {
    const r = nivelCefr('about', 'en')
    expect(r.level).toBe('A1')
    expect(r.source).toBe('wordlist')
    expect(r.confidence).toBeGreaterThanOrEqual(0.9)
  })

  it('é insensível a caixa e a espaços', () => {
    expect(nivelCefr('  ABOUT ', 'en').level).toBe('A1')
  })

  it('palavra FORA da wordlist NÃO recebe nível chutado', () => {
    const r = nivelCefr('zzzqxwv', 'en')
    expect(r.level).toBeNull()
    expect(r.source).toBe('ausente')
    expect(r.confidence).toBe(0)
  })

  it('REGRESSÃO do defeito antigo: palavra longa e comum não vira nível alto', () => {
    // `estimateCefr` classificava por comprimento — "information" (11 letras) ia para C.
    const r = nivelCefr('information', 'en')
    if (r.level) expect(['A1', 'A2', 'B1', 'B2']).toContain(r.level)
  })

  it('idioma sem wordlist devolve ausente, não um chute', () => {
    const r = nivelCefr('cachorro', 'pt')
    expect(r.level).toBeNull()
    expect(r.source).toBe('ausente')
  })

  it('nível curado explícito vence a wordlist', () => {
    const r = nivelCefr('about', 'en', { curado: 'C2' })
    expect(r.level).toBe('C2')
    expect(r.source).toBe('curado')
    expect(r.confidence).toBe(1)
  })

  it('as três procedências são exaustivas e explícitas', () => {
    expect(PROCEDENCIAS).toEqual(['curado', 'wordlist', 'ausente'])
  })
})

describe('coberturaDaWordlist', () => {
  it('reporta a cobertura real, para a limitação ser mensurável e não presumida', () => {
    const c = coberturaDaWordlist('en')
    expect(c.total).toBe(2784)
    expect(c.porNivel.A1).toBe(704)
    expect(c.porNivel.C2).toBe(64)
  })

  it('idioma sem wordlist reporta zero em vez de lançar', () => {
    expect(coberturaDaWordlist('pt').total).toBe(0)
  })
})
