/**
 * O Elo por palavra com desconto de chute (`src/core/learning/elo.ts`, openspec `modelo-do-aluno-e-dados` 3.5).
 */
import { describe, expect, it } from 'vitest'

import {
  aplicarResposta,
  chanceDeAcertar,
  chanceDeChute,
  dificuldadeInicial,
  ELO_INICIAL,
  notaNova,
} from '../src/core/learning/elo'

/** Gerador determinístico (mulberry32), para a convergência não depender de sorte. */
function gerador(semente: number) {
  let s = semente
  return () => {
    s = (s + 0x6d2b79f5) | 0
    let t = Math.imul(s ^ (s >>> 15), 1 | s)
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

describe('chance de chute', () => {
  it('4 alternativas = 1/4; recordação livre = 0', () => {
    expect(chanceDeChute(4)).toBe(0.25)
    expect(chanceDeChute(2)).toBe(0.5)
    expect(chanceDeChute(0)).toBe(0)
    expect(chanceDeChute(1)).toBe(0)
  })

  it('quem não sabe nada ainda acerta ~1/4 em 4 alternativas', () => {
    expect(chanceDeAcertar(ELO_INICIAL - 4000, ELO_INICIAL, 4)).toBeCloseTo(0.25, 3)
    expect(chanceDeAcertar(ELO_INICIAL - 4000, ELO_INICIAL, 0)).toBeCloseTo(0, 3)
    expect(chanceDeAcertar(ELO_INICIAL, ELO_INICIAL, 0)).toBeCloseTo(0.5, 5)
  })
})

describe('aplicar resposta', () => {
  it('acerto sobe a pessoa e desce o item na mesma medida', () => {
    const r = aplicarResposta(notaNova(), notaNova(), true)
    expect(r.pessoa.nota).toBeGreaterThan(ELO_INICIAL)
    expect(r.item.nota).toBeLessThan(ELO_INICIAL)
    expect(r.pessoa.nota - ELO_INICIAL).toBeCloseTo(ELO_INICIAL - r.item.nota, 6)
  })

  it('acerto com 4 alternativas rende menos que o mesmo acerto sem alternativas; o erro custa mais', () => {
    const livre = aplicarResposta(notaNova(), notaNova(), true, 0)
    const escolha = aplicarResposta(notaNova(), notaNova(), true, 4)
    expect(escolha.pessoa.nota - ELO_INICIAL).toBeLessThan(livre.pessoa.nota - ELO_INICIAL)
    const erroLivre = aplicarResposta(notaNova(), notaNova(), false, 0)
    const erroEscolha = aplicarResposta(notaNova(), notaNova(), false, 4)
    expect(ELO_INICIAL - erroEscolha.pessoa.nota).toBeGreaterThan(ELO_INICIAL - erroLivre.pessoa.nota)
  })

  it('o chute puro quase não move a nota: quem está bem abaixo e acerta em 4 alternativas sobe ~ (1 - 1/4) do passo', () => {
    const abaixo = { nota: ELO_INICIAL - 2000, respostas: 0 }
    const r = aplicarResposta(abaixo, notaNova(), true, 4)
    expect(r.esperado).toBeCloseTo(0.25, 2)
    // o acerto que o chute explica a 1/4 das vezes rende 3/4 do passo cheio; sem alternativas rende o passo inteiro
    const livre = aplicarResposta(abaixo, notaNova(), true, 0)
    expect((r.pessoa.nota - abaixo.nota) / (livre.pessoa.nota - abaixo.nota)).toBeCloseTo(0.75, 1)
  })
})

describe('convergência', () => {
  it('com respostas sintéticas, a ordem das dificuldades dos itens é recuperada', () => {
    const rnd = gerador(7)
    const verdade = [-300, -100, 0, 100, 300] // dificuldade verdadeira de 5 itens, na escala do Elo
    const itens = verdade.map(() => notaNova())
    let pessoa = notaNova()
    const habilidadeVerdadeira = 0
    for (let i = 0; i < 4000; i++) {
      const j = i % verdade.length
      const p = chanceDeAcertar(habilidadeVerdadeira, verdade[j], 4)
      const r = aplicarResposta(pessoa, itens[j], rnd() < p, 4)
      pessoa = r.pessoa
      itens[j] = r.item
    }
    const notas = itens.map((x) => x.nota)
    for (let j = 1; j < notas.length; j++) expect(notas[j]).toBeGreaterThan(notas[j - 1])
  })
})

describe('dificuldade para todo cartão', () => {
  it('o cartão nunca jogado ganha nota pela dificuldade do FSRS, monotônica e limitada', () => {
    expect(dificuldadeInicial(null)).toBe(ELO_INICIAL)
    expect(dificuldadeInicial(undefined)).toBe(ELO_INICIAL)
    expect(dificuldadeInicial(1)).toBeLessThan(dificuldadeInicial(5))
    expect(dificuldadeInicial(5)).toBeLessThan(dificuldadeInicial(10))
    expect(dificuldadeInicial(99)).toBe(dificuldadeInicial(10))
    expect(Math.abs(dificuldadeInicial(10) - ELO_INICIAL)).toBeLessThanOrEqual(400)
  })
})
