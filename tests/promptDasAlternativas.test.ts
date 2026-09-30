/**
 * D4 (Fase D, 30/09/2026) — O PROMPT E A LEITURA DAS "OUTRAS FORMAS".
 *
 * Tocar numa frase e pedir "Outras formas" devolve até 3 traduções diferentes da atual e uma nota
 * curta. O prompt segue a disciplina dos outros dois: o fixo primeiro (cache de prompt do provedor),
 * idioma e sufixos da Nuance no fim, a frase e a tradução atual delimitadas como DADO. A resposta do
 * modelo é JSON — e modelo erra JSON (cerca de código, texto em volta, opção repetida, a própria
 * tradução atual de volta): a leitura é defensiva e nunca inventa opção.
 */
import { describe, expect, it } from 'vitest'

import { FALA_CLOSE, FALA_OPEN } from '../src/lib/traducao/promptComunicativo'
import {
  lerAlternativas,
  MAX_OPCOES,
  systemDasAlternativas,
  userDasAlternativas,
} from '../src/lib/traducao/promptDasAlternativas'

describe('o prompt', () => {
  it('o fixo primeiro: o system sem sufixo é prefixo do system com registro e glossário', () => {
    const base = systemDasAlternativas('pt', 'en')
    const com = systemDasAlternativas('pt', 'en', {
      registro: 'formal',
      glossario: [{ termo: 'deadline', traducao: 'prazo' }],
    })
    expect(com.startsWith(base)).toBe(true)
    expect(com.slice(base.length)).toMatch(/FORMAL/)
    expect(com.slice(base.length)).toMatch(/GLOSSÁRIO/)
    expect(base).toMatch(/Idioma de destino: português\./)
    expect(base).toMatch(/JSON/)
  })

  it('a frase e a tradução atual vão delimitadas como dado, depois do contexto', () => {
    const u = userDasAlternativas('see you later', 'até mais', ['hi', 'how are you?'])
    expect(u).toContain(`Frase: ${FALA_OPEN}see you later${FALA_CLOSE}`)
    expect(u).toContain(`Tradução atual: ${FALA_OPEN}até mais${FALA_CLOSE}`)
    expect(u.indexOf('Contexto')).toBeLessThan(u.indexOf('Frase:'))
  })

  it('sem tradução atual, nada de linha vazia inventada', () => {
    expect(userDasAlternativas('hi')).toBe(`Frase: ${FALA_OPEN}hi${FALA_CLOSE}`)
  })
})

describe('a leitura da resposta', () => {
  it('JSON limpo: as opções e a nota', () => {
    expect(lerAlternativas('{"opcoes":["Até logo","A gente se vê"],"nota":"A segunda é mais informal."}')).toEqual({
      opcoes: ['Até logo', 'A gente se vê'],
      nota: 'A segunda é mais informal.',
    })
  })

  it('JSON dentro de cerca de código e com texto em volta também serve', () => {
    const r = lerAlternativas(
      'Claro! Aqui está:\n```json\n{"opcoes": ["Até logo"], "nota": ""}\n```\nEspero ter ajudado.',
    )
    expect(r).toEqual({ opcoes: ['Até logo'], nota: '' })
  })

  it(`no máximo ${MAX_OPCOES}, sem repetida (caixa e espaço não contam) e sem a tradução atual`, () => {
    const r = lerAlternativas(
      JSON.stringify({ opcoes: ['Até mais', ' até  mais ', 'Até logo', 'Tchau', 'A gente se vê', 'Fui'], nota: 'x' }),
      'Até mais',
    )
    expect(r?.opcoes).toEqual(['Até logo', 'Tchau', 'A gente se vê'])
  })

  it('nota longa é cortada; opção que não é texto é ignorada', () => {
    const r = lerAlternativas(JSON.stringify({ opcoes: ['Oi', 42, null, { x: 1 }], nota: 'n'.repeat(500) }))
    expect(r?.opcoes).toEqual(['Oi'])
    expect(r?.nota.length).toBeLessThanOrEqual(200)
  })

  it('nada que preste: null — a rota responde erro, nunca opção inventada', () => {
    expect(lerAlternativas('não sei')).toBeNull()
    expect(lerAlternativas('{"opcoes": []}')).toBeNull()
    expect(lerAlternativas('{"opcoes": ["Até mais"]}', 'até mais')).toBeNull()
    expect(lerAlternativas('{quebrado')).toBeNull()
  })
})
