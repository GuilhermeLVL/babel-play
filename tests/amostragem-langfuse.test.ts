/**
 * AMOSTRAGEM DO LANGFUSE (Fase 3 da auditoria de prontidão): o que deu certo de primeira é amostrado;
 * erro, 429, fallback e retentativa vão sempre — é o que se investiga.
 */
import { describe, expect, it } from 'vitest'

import { rastroObrigatorio, taxaDeAmostragem } from '../server/ai/telemetriaDeIa'

describe('taxa de amostragem', () => {
  it('padrão 0,1 em produção e 1 fora dela', () => {
    expect(taxaDeAmostragem({ NODE_ENV: 'production' })).toBe(0.1)
    expect(taxaDeAmostragem({ NODE_ENV: 'development' })).toBe(1)
    expect(taxaDeAmostragem({})).toBe(1)
  })

  it('respeita a variável e limita a 0–1; valor ilegível cai no padrão', () => {
    expect(taxaDeAmostragem({ NODE_ENV: 'production', LANGFUSE_AMOSTRAGEM: '0.25' })).toBe(0.25)
    expect(taxaDeAmostragem({ LANGFUSE_AMOSTRAGEM: '7' })).toBe(1)
    expect(taxaDeAmostragem({ LANGFUSE_AMOSTRAGEM: '-1' })).toBe(0)
    expect(taxaDeAmostragem({ NODE_ENV: 'production', LANGFUSE_AMOSTRAGEM: 'abc' })).toBe(0.1)
  })
})

describe('rastro obrigatório', () => {
  it('sucesso de primeira é amostrável', () => {
    expect(rastroObrigatorio(200, [{ status: 'ok' }])).toBe(false)
  })

  it('acerto de cache (nenhuma geração) também é amostrável', () => {
    expect(rastroObrigatorio(200, [])).toBe(false)
  })

  it('erro HTTP, falha do provedor ou fallback vão sempre', () => {
    expect(rastroObrigatorio(502, [{ status: '5xx' }])).toBe(true)
    expect(rastroObrigatorio(429, [])).toBe(true)
    expect(rastroObrigatorio(200, [{ status: '429' }, { status: 'ok' }])).toBe(true)
    expect(rastroObrigatorio(200, [{ status: 'timeout' }])).toBe(true)
  })
})
