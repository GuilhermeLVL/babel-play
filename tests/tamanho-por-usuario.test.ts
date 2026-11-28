/**
 * O orçamento de tamanho por usuário (`scripts/perf/escala/tamanho-por-usuario.mjs`, openspec `modelo-do-aluno-e-dados` 2.4b):
 * a regra que decide, sem subir banco. O banco de verdade roda no job `carga` do CI.
 */
import { readFileSync } from 'node:fs'

import { describe, expect, it } from 'vitest'

import { avaliarTamanho, fatiasPorUsuario } from '../scripts/perf/escala/tamanho-por-usuario.mjs'
import { carregarSlo } from '../scripts/perf/suite/slo.mjs'

describe('tamanho por usuário', () => {
  it('reparte o tamanho de cada tabela pela parte das linhas de cada usuário', () => {
    const por = fatiasPorUsuario([
      { nome: 'a', bytes: 1000, total: 10, porUsuario: { u1: 4, u2: 1 } },
      { nome: 'b', bytes: 200, total: 2, porUsuario: { u1: 1 } },
      { nome: 'vazia', bytes: 8192, total: 0, porUsuario: {} },
    ])
    expect(por).toEqual({ u1: 500, u2: 100 })
  })

  it('reprova o usuário acima do teto e dá o número; sem usuário medido também reprova', () => {
    expect(avaliarTamanho({ u1: 2048 * 1024 }, 4096).falhas).toEqual([])
    expect(avaliarTamanho({ u1: 5000 * 1024 }, 4096).falhas[0]).toMatch(/5000 KB > teto de 4096 KB/)
    expect(avaliarTamanho({}, 4096).falhas).toEqual(['nenhum usuário medido'])
  })

  it('o teto vem do slo.json e docs/slo.md o cita', () => {
    const teto = carregarSlo().banco.porUsuarioPesadoMaxKB
    expect(teto).toBeGreaterThan(0)
    expect(readFileSync('docs/slo.md', 'utf8')).toContain('porUsuarioPesadoMaxKB')
    expect(readFileSync('.github/workflows/ci.yml', 'utf8')).toContain('tamanho-por-usuario.mjs')
  })
})
