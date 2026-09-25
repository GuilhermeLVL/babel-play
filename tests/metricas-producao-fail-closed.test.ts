/**
 * GAP-013 (auditoria 2026-09-13). Em produção, `/metrics` ligado sem `METRICS_TOKEN` é um scrape
 * aberto que expõe a superfície do servidor. O boot deve ABORTAR (fail-closed). Fora de produção
 * (self-host, rede interna) exigir token é fricção sem ameaça.
 */
import { describe, expect, it } from 'vitest'

import {
  erroDeMetricasEmProducao,
  limiaresDeGastoPorUsuario,
  orcamentoDiarioDeIaUsd,
  portaInternaDeMetricas,
} from '../server/lib/config'

const env = (o: Record<string, string>) => o as unknown as NodeJS.ProcessEnv

describe('GAP-013 — /metrics fail-closed em produção', () => {
  it('produção + METRICS_ENABLED=1 SEM token → aborta', () => {
    expect(erroDeMetricasEmProducao(env({ NODE_ENV: 'production', METRICS_ENABLED: '1' }))).toMatch(/METRICS_TOKEN/)
  })
  it('produção + METRICS_ENABLED=1 + token → ok', () => {
    expect(
      erroDeMetricasEmProducao(env({ NODE_ENV: 'production', METRICS_ENABLED: '1', METRICS_TOKEN: 'seg' })),
    ).toBeNull()
  })
  it('produção + métricas desligadas → ok', () => {
    expect(erroDeMetricasEmProducao(env({ NODE_ENV: 'production' }))).toBeNull()
  })
  it('self-host + métricas sem token → ok', () => {
    expect(erroDeMetricasEmProducao(env({ NODE_ENV: 'development', METRICS_ENABLED: '1' }))).toBeNull()
  })
})

/*
 * Fase 5 de prontidão (25/09/2026): o raspador gerenciado do Fly (`[metrics]` do fly.toml) NÃO manda
 * `Authorization` — a doc só tem `port` e `path`. `METRICS_PORTA_INTERNA` tira o `/metrics` da porta
 * pública e o serve numa porta não publicada; aí o token deixa de ser exigido.
 */
describe('METRICS_PORTA_INTERNA — o scrape do Fly sem token, fora da porta pública', () => {
  it('produção + porta interna, sem token → ok (o /metrics público nem é montado)', () => {
    expect(
      erroDeMetricasEmProducao(env({ NODE_ENV: 'production', METRICS_ENABLED: '1', METRICS_PORTA_INTERNA: '9091' })),
    ).toBeNull()
  })
  it('porta interna igual à do app → aborta (o scrape sem token ficaria público)', () => {
    expect(
      erroDeMetricasEmProducao(
        env({ NODE_ENV: 'production', METRICS_ENABLED: '1', METRICS_PORTA_INTERNA: '3000', PORT: '3000' }),
      ),
    ).toMatch(/mesma porta/)
    expect(
      erroDeMetricasEmProducao(env({ NODE_ENV: 'production', METRICS_ENABLED: '1', METRICS_PORTA_INTERNA: '3000' })),
    ).toMatch(/mesma porta/)
  })
  it('porta inválida → aborta em vez de cair silenciosamente no scrape público', () => {
    expect(erroDeMetricasEmProducao(env({ METRICS_ENABLED: '1', METRICS_PORTA_INTERNA: 'noventa' }))).toMatch(
      /porta válida/,
    )
    expect(portaInternaDeMetricas(env({ METRICS_PORTA_INTERNA: '70000' }))).toBeUndefined()
    expect(portaInternaDeMetricas(env({ METRICS_PORTA_INTERNA: ' 9091 ' }))).toBe(9091)
    expect(portaInternaDeMetricas(env({}))).toBeUndefined()
  })
})

describe('teto diário e limiares do gasto anômalo por usuário (config)', () => {
  it('AI_BUDGET_USD_DAY: ausente = sem teto; número (com vírgula) = teto; 0 = fecha', () => {
    expect(orcamentoDiarioDeIaUsd(env({}))).toBe(Infinity)
    expect(orcamentoDiarioDeIaUsd(env({ AI_BUDGET_USD_DAY: '2,5' }))).toBe(2.5)
    expect(orcamentoDiarioDeIaUsd(env({ AI_BUDGET_USD_DAY: '0' }))).toBe(0)
  })
  it('limiares por usuário têm padrão e aceitam override', () => {
    expect(limiaresDeGastoPorUsuario(env({}))).toMatchObject({ tetoUsdDia: 0.5, fatorDaMediana: 10 })
    expect(
      limiaresDeGastoPorUsuario(env({ AI_USUARIO_ALERTA_USD_DIA: '1', AI_USUARIO_ALERTA_FATOR: '5' })),
    ).toMatchObject({ tetoUsdDia: 1, fatorDaMediana: 5 })
    expect(limiaresDeGastoPorUsuario(env({ AI_USUARIO_ALERTA_USD_DIA: 'x' })).tetoUsdDia).toBe(0.5)
  })
})
