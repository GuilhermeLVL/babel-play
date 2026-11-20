/**
 * O ASSISTENTE AO VIVO, PARTE LOCAL (spec `docs/specs/2026-10-25-assistente-ao-vivo.md`): as palavras acima do nível
 * (recurso 2, sem rede, também no Grátis) e os candidatos a sigla (a detecção local do recurso 3).
 */
import { describe, expect, it } from 'vitest'

import { formasDoIngles, palavrasAcimaDoNivel } from '../src/core/assistente/palavrasAcimaDoNivel'
import { candidatosATermo } from '../src/core/assistente/termosCandidatos'
import { nivelCefr, registrarNiveis } from '../src/core/learning/cefrWordlist'

describe('palavrasAcimaDoNivel', () => {
  it('as listas de referência são as da trilha (os níveis que os testes abaixo supõem)', () => {
    expect(nivelCefr('weather', 'en').level).toBe('A1')
    expect(nivelCefr('abandon', 'en').level).toBe('B1')
    expect(nivelCefr('ambiguous', 'en').level).toBe('B2')
    expect(nivelCefr('scrutinize', 'en').level).toBe('C1')
  })

  it('marca só o que está ESTRITAMENTE acima do nível da pessoa, com a posição exata na linha', () => {
    const linha = 'The weather report was ambiguous, so they scrutinize it.'
    const b1 = palavrasAcimaDoNivel(linha, 'en', 'B1')
    expect(b1.map((p) => [p.palavra, p.nivel, p.escala])).toEqual([
      ['ambiguous', 'B2', 'cefr'],
      ['scrutinize', 'C1', 'cefr'],
    ])
    for (const p of b1) expect(linha.slice(p.inicio, p.fim)).toBe(p.palavra)
    expect(palavrasAcimaDoNivel(linha, 'en', 'B2').map((p) => p.palavra)).toEqual(['scrutinize'])
    expect(palavrasAcimaDoNivel(linha, 'en', 'C2')).toEqual([])
    expect(palavrasAcimaDoNivel(linha, 'en', 'A1').map((p) => p.palavra)).toEqual(['report', 'ambiguous', 'scrutinize'])
  })

  it('o inglês acha a forma-base das flexões simples (-ed, -ing, plural)', () => {
    expect(formasDoIngles('abandoned')).toContain('abandon')
    expect(formasDoIngles('scrutinizing')).toContain('scrutinize')
    expect(formasDoIngles('studies')).toContain('study')
    const r = palavrasAcimaDoNivel('They abandoned the plan, scrutinizing it.', 'en-US', 'A2')
    expect(r.map((p) => [p.palavra, p.nivel])).toEqual([
      ['abandoned', 'B1'],
      ['scrutinizing', 'C1'],
    ])
  })

  it('não marca palavra fora da lista (a não ser que peça), nome próprio no meio da frase nem sigla', () => {
    expect(palavrasAcimaDoNivel('Our KPI depends on retention.', 'en', 'B1')).toEqual([])
    const fora = palavrasAcimaDoNivel('Our KPI depends on retention.', 'en', 'A1', { marcarForaDaLista: true })
    expect(fora.map((p) => p.palavra)).toContain('retention')
    expect(fora.every((p) => p.palavra !== 'KPI')).toBe(true)
    expect(fora.find((p) => p.palavra === 'retention')).toMatchObject({ nivel: null, escala: 'fora_da_lista' })
    // "Ambiguous" no começo da frase conta; "Scrutinize" no meio (maiúscula) é tratado como nome próprio.
    expect(palavrasAcimaDoNivel('Ambiguous. Then we met Scrutinize.', 'en', 'A1').map((p) => p.palavra)).toEqual([
      'Ambiguous',
    ])
  })

  it('idioma de escala por frequência devolve a faixa, e idioma sem espaço ou sem lista não marca nada', () => {
    registrarNiveis('xx', { A1: 'casa|perro', C1: 'menester' })
    expect(palavrasAcimaDoNivel('es menester la casa', 'xx', 'B1').map((p) => [p.palavra, p.nivel])).toEqual([
      ['menester', 'C1'],
    ])
    expect(palavrasAcimaDoNivel('我们今天开会', 'zh', 'A1')).toEqual([])
    expect(palavrasAcimaDoNivel('qualquer coisa', 'qq', 'A1')).toEqual([])
    expect(palavrasAcimaDoNivel('', 'en', 'A1')).toEqual([])
    expect(palavrasAcimaDoNivel('ambiguous', 'en', 'Z9' as never)).toEqual([])
  })
})

describe('candidatosATermo', () => {
  it('acha siglas em caixa alta, com dígito, & ou plural, sem repetir e até 3', () => {
    expect(candidatosATermo('Our main KPI this quarter is retention.')).toEqual(['KPI'])
    expect(candidatosATermo('We are a B2B company with an R&D team and KPIs.')).toEqual(['B2B', 'R&D', 'KPIs'])
    expect(candidatosATermo('API, API and SDK, CDN, MVP')).toEqual(['API', 'SDK', 'CDN'])
  })

  it('ignora palavras comuns em caixa alta, a linha toda gritada e palavras normais', () => {
    expect(candidatosATermo('I think it is OK on TV.')).toEqual([])
    expect(candidatosATermo('WHAT ARE YOU DOING HERE')).toEqual([])
    expect(candidatosATermo('Let us grab lunch at noon.')).toEqual([])
    expect(candidatosATermo('')).toEqual([])
  })
})
