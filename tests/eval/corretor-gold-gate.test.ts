/**
 * GATE DE REGRESSÃO DE IA (braço determinístico) — corretor de exercícios.
 *
 * Roda a heurística REAL de produção (`src/lib/exercicios/diff.ts`, similarityPercentage)
 * sobre o gold set da auditoria e reprova se o F1 cair abaixo do baseline homologado. Cross-platform,
 * sem custo, sem chave — roda em todo push via `npx vitest run`.
 *
 * O braço LLM (Groq) fica em docs/auditoria/eval/run-corretor-llm.mjs (on-demand, custa cota).
 * Baseline e thresholds: docs/auditoria/eval-baseline-v1.md.
 */
import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { similarityPercentage } from '../../src/lib/exercicios/diff'

const THRESHOLD = 0.8 // handleVerifyLocal: isPass = score >= 0.8 (activeProduction.tsx:105)
const F1_FLOOR = 0.85 // baseline determinístico medido = 0,857 (eval-baseline-v1.md)

interface GoldCase { id: string; cat: string; word: string; attempt: string; gold: 'aceita' | 'rejeita' }

const gold: GoldCase[] = readFileSync(join(__dirname, 'fixtures/gold-corretor-v0.jsonl'), 'utf8')
  .trim().split('\n').map((l) => JSON.parse(l))

describe('gate de regressão do corretor (heurística determinística real)', () => {
  it(`o gold set tem casos suficientes (${gold.length})`, () => {
    expect(gold.length).toBeGreaterThanOrEqual(40)
  })

  it(`F1 da heurística de produção não regride abaixo de ${F1_FLOOR}`, () => {
    let tp = 0, fp = 0, fn = 0
    for (const c of gold) {
      const localAceita = similarityPercentage(c.word, c.attempt) >= THRESHOLD
      const goldAceita = c.gold === 'aceita'
      if (goldAceita && localAceita) tp++
      else if (!goldAceita && localAceita) fp++
      else if (goldAceita && !localAceita) fn++
    }
    const prec = tp / (tp + fp) || 0
    const rec = tp / (tp + fn) || 0
    const f1 = (2 * prec * rec) / (prec + rec) || 0
    expect(f1).toBeGreaterThanOrEqual(F1_FLOOR)
  })

  it('a heurística mantém precision alta (não aceita resposta errada) — piso 0,95', () => {
    let tp = 0, fp = 0
    for (const c of gold) {
      const localAceita = similarityPercentage(c.word, c.attempt) >= THRESHOLD
      const goldAceita = c.gold === 'aceita'
      if (goldAceita && localAceita) tp++
      else if (!goldAceita && localAceita) fp++
    }
    const prec = tp / (tp + fp) || 0
    // baseline: precision 100%. Um FP novo aqui = a heurística passou a aceitar resposta errada.
    expect(prec).toBeGreaterThanOrEqual(0.95)
  })
})
