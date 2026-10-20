/**
 * Analytics Engine no Worker (Fase 4, T8, R6): as 6 famílias viram pontos de dados com o esquema do runbook;
 * o resto da fachada segue sem efeito; o binding nunca derruba quem mede. `BABEL_RUNTIME=worker` faz o Node
 * responder como o Worker.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import {
  contarAdmissaoRecusada,
  contarCacheDeTraducao,
  contarCustoPorPlano,
  esquecerMetricas,
  medirUsoDoR2,
  observarChamadaDeProvedor,
  observarJob,
} from '../../server/http/metricas'
import {
  esquecerAnalyticsEngine,
  gravarPonto,
  ligarAnalyticsEngine,
  type PontoDeDados,
} from '../../server/http/metricasDoAnalyticsEngine'
import * as logger from '../../server/lib/logger'

const antes = process.env.BABEL_RUNTIME
let pontos: PontoDeDados[]

beforeEach(() => {
  process.env.BABEL_RUNTIME = 'worker'
  pontos = []
  esquecerMetricas()
  esquecerAnalyticsEngine()
  ligarAnalyticsEngine({ writeDataPoint: (p) => void pontos.push(p) })
})

afterEach(() => {
  vi.restoreAllMocks()
  esquecerMetricas()
  esquecerAnalyticsEngine()
  if (antes === undefined) delete process.env.BABEL_RUNTIME
  else process.env.BABEL_RUNTIME = antes
})

describe('famílias do Analytics Engine', () => {
  it('admissao_recusada', () => {
    contarAdmissaoRecusada('cota', 'gratis')
    expect(pontos).toEqual([{ blobs: ['admissao_recusada', 'cota', 'gratis'], doubles: [1], indexes: ['cota'] }])
  })

  it('custo_por_plano', () => {
    contarCustoPorPlano('premium', 0.25)
    expect(pontos).toHaveLength(1)
    expect(pontos[0]!.blobs![0]).toBe('custo_por_plano')
    expect(pontos[0]!.doubles).toEqual([0.25])
    expect(pontos[0]!.indexes).toEqual([pontos[0]!.blobs![1]])
  })

  it('r2', () => {
    medirUsoDoR2('ops_a', 0.4)
    expect(pontos).toEqual([{ blobs: ['r2', 'ops_a'], doubles: [0.4], indexes: ['ops_a'] }])
  })

  it('provedor', () => {
    observarChamadaDeProvedor({
      provedor: 'stt',
      funcao: 'transcrever',
      ms: 120,
      custoUsd: 0.01,
      fornecedor: 'groq',
      modelo: 'm1',
    })
    expect(pontos).toEqual([
      { blobs: ['provedor', 'stt', 'transcrever', 'groq', 'm1'], doubles: [120, 0.01], indexes: ['stt'] },
    ])
  })

  it('provedor sem custo grava 0', () => {
    observarChamadaDeProvedor({ provedor: 'stt', funcao: 'transcrever', ms: 5 })
    expect(pontos[0]!.doubles).toEqual([5, 0])
  })

  it('job', () => {
    observarJob('limpeza', 42, 'ok')
    observarJob('limpeza', 7, 'falhou')
    expect(pontos).toEqual([
      { blobs: ['job', 'limpeza', 'ok'], doubles: [42], indexes: ['limpeza'] },
      { blobs: ['job', 'limpeza', 'falhou'], doubles: [7], indexes: ['limpeza'] },
    ])
  })

  it('requisicao (gravarPonto direto, o formato que o middleware usa)', () => {
    gravarPonto('requisicao', ['/api/x/:id', 'GET', '200'], [12.5], '/api/x/:id')
    expect(pontos).toEqual([
      { blobs: ['requisicao', '/api/x/:id', 'GET', '200'], doubles: [12.5], indexes: ['/api/x/:id'] },
    ])
  })
})

describe('fora das 6 famílias e sem binding', () => {
  it('uma função fora das 6 não grava nada', () => {
    contarCacheDeTraducao(true)
    expect(pontos).toEqual([])
  })

  it('sem binding nada é gravado e nada lança', () => {
    ligarAnalyticsEngine(undefined)
    expect(() => {
      contarAdmissaoRecusada('cota', 'gratis')
      observarJob('x', 1, 'ok')
    }).not.toThrow()
    expect(pontos).toEqual([])
  })

  it('número não finito derruba o ponto', () => {
    gravarPonto('job', ['x', 'ok'], [Number.NaN], 'x')
    expect(pontos).toEqual([])
  })
})

describe('robustez', () => {
  it('binding que lança não propaga e avisa uma vez só', () => {
    const aviso = vi.spyOn(logger, 'log').mockImplementation(() => undefined)
    ligarAnalyticsEngine({
      writeDataPoint: () => {
        throw new Error('quebrou')
      },
    })
    expect(() => {
      contarAdmissaoRecusada('a', 'b')
      contarAdmissaoRecusada('a', 'b')
    }).not.toThrow()
    expect(aviso.mock.calls.filter(([nivel]) => nivel === 'warn')).toHaveLength(1)
  })

  it('blob e índice acima de 96 bytes são truncados (sem partir caractere)', () => {
    gravarPonto('r2', ['a'.repeat(200), 'é'.repeat(100)], [1], 'b'.repeat(200))
    const [p] = pontos
    expect(p!.blobs![1]).toBe('a'.repeat(96))
    expect(new TextEncoder().encode(p!.blobs![2]).length).toBeLessThanOrEqual(96)
    expect(p!.blobs![2]).toBe('é'.repeat(48))
    expect(p!.indexes).toEqual(['b'.repeat(96)])
  })
})
