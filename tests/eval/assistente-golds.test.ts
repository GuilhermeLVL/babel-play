/**
 * OS GOLDS DO ASSISTENTE AO VIVO (`tests/eval/fixtures/gold-assistente-*-v1.jsonl`, lidos por
 * `scripts/eval-ia/assistente.mjs`): forma, tamanho e coerência — um gold torto mediria o modelo contra nada.
 */
import { readFileSync } from 'node:fs'

import { describe, expect, it } from 'vitest'

import { estaNaFrase } from '../../src/lib/estudo/promptDoAssistente'

const ler = (nome: string): any[] =>
  readFileSync(`tests/eval/fixtures/gold-assistente-${nome}-v1.jsonl`, 'utf8')
    .split('\n')
    .filter((l) => l.trim())
    .map((l) => JSON.parse(l))

const comum = (c: any) => {
  expect(typeof c.id).toBe('string')
  expect(['adulto', 'menor']).toContain(c.perfil)
  expect(c.lang).toMatch(/^[a-z]{2}$/)
  expect(c.langDaPessoa).toBe('pt-BR')
}

describe('golds do assistente', () => {
  it('expressões: ~30 linhas, cada trecho esperado está na frase, e há linhas sem expressão', () => {
    const g = ler('expressoes')
    expect(g.length).toBeGreaterThanOrEqual(30)
    for (const c of g) {
      comum(c)
      expect(c.esperado.nenhuma).toBe(c.esperado.expressoes.length === 0)
      for (const e of c.esperado.expressoes) expect(estaNaFrase(e.trecho, c.frase), `${c.id}: ${e.trecho}`).toBe(true)
    }
    expect(g.filter((c) => c.esperado.nenhuma).length).toBeGreaterThanOrEqual(4)
  })

  it('termos: ~30 linhas, cada termo pedido e esperado está na frase', () => {
    const g = ler('termos')
    expect(g.length).toBeGreaterThanOrEqual(30)
    for (const c of g) {
      comum(c)
      for (const t of c.termos) expect(estaNaFrase(t, c.frase), `${c.id}: ${t}`).toBe(true)
      for (const t of c.esperado.termos) expect(estaNaFrase(t.termo, c.frase), `${c.id}: ${t.termo}`).toBe(true)
    }
  })

  it('"Como respondo?": ~20 contextos com intenção e 3 exemplos', () => {
    const g = ler('como-respondo')
    expect(g.length).toBeGreaterThanOrEqual(20)
    for (const c of g) {
      comum(c)
      expect(c.frase.length).toBeGreaterThan(0)
      expect(c.esperado.intencao.length).toBeGreaterThan(0)
      expect(c.esperado.exemplos).toHaveLength(3)
    }
  })

  it('correção: ~20 falas, com erro e sem erro', () => {
    const g = ler('correcao')
    expect(g.length).toBeGreaterThanOrEqual(20)
    for (const c of g) {
      comum(c)
      expect(typeof c.esperado.ok).toBe('boolean')
      expect(c.esperado.corrigida.length).toBeGreaterThan(0)
    }
    expect(g.filter((c) => c.esperado.ok).length).toBeGreaterThanOrEqual(5)
    expect(g.filter((c) => !c.esperado.ok).length).toBeGreaterThanOrEqual(10)
  })
})
