/**
 * REGRESSÃO — S-09: pesos de modelo baixados sem verificação de integridade.
 * Correção: SHA-256 por arquivo contra um manifesto (TOFU). (scripts/modelHash.mjs)
 */
import { describe, it, expect } from 'vitest'
import { sha256, checkModelHash } from '../../scripts/modelHash.mjs'

describe('S-09 — verificação de hash dos modelos', () => {
  const buf = Buffer.from('conteudo-do-peso-do-modelo')
  const hex: string = sha256(buf)

  it('arquivo NOVO (sem pin) → status new, devolve o hash para fixar', () => {
    const r = checkModelHash('org/repo/a.onnx', buf, {})
    expect(r.status).toBe('new')
    expect(r.hex).toBe(hex)
  })
  it('hash BATE → ok', () => {
    expect(checkModelHash('org/repo/a.onnx', buf, { 'org/repo/a.onnx': hex }).status).toBe('ok')
  })
  it('hash DIVERGE → mismatch (adulteração detectada)', () => {
    expect(checkModelHash('org/repo/a.onnx', buf, { 'org/repo/a.onnx': 'deadbeef' }).status).toBe('mismatch')
  })
})
