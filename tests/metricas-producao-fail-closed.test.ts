/**
 * GAP-013 (auditoria 2026-09-13). Em produção, `/metrics` ligado sem `METRICS_TOKEN` é um scrape
 * aberto que expõe a superfície do servidor. O boot deve ABORTAR (fail-closed). Fora de produção
 * (self-host, rede interna) exigir token é fricção sem ameaça.
 */
import { describe, expect, it } from 'vitest'

import * as config from '../server/lib/config'
import { erroDeMetricasEmProducao, limiaresDeGastoPorUsuario, orcamentoDiarioDeIaUsd } from '../server/lib/config'

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
 * A porta interna de métricas (`METRICS_PORTA_INTERNA`, 9091) saiu na Task 10 da Fase 2: era o alvo do
 * `[metrics]` do Fly, que não manda `Authorization`. Sem ela, NADA dispensa o token em produção — o
 * fail-closed acima vale inclusive para quem ainda tem a variável no ambiente.
 */
describe('METRICS_PORTA_INTERNA aposentada — não abre exceção no fail-closed', () => {
  it('produção + METRICS_ENABLED=1 + porta interna herdada, SEM token → aborta (antes: ok)', () => {
    expect(
      erroDeMetricasEmProducao(env({ NODE_ENV: 'production', METRICS_ENABLED: '1', METRICS_PORTA_INTERNA: '9091' })),
    ).toMatch(/METRICS_TOKEN/)
    expect(
      erroDeMetricasEmProducao(env({ NODE_ENV: 'production', METRICS_ENABLED: '1', METRICS_PORTA_INTERNA: '3000' })),
    ).toMatch(/METRICS_TOKEN/)
  })
  it('com token, a porta herdada é irrelevante (ok)', () => {
    expect(
      erroDeMetricasEmProducao(
        env({ NODE_ENV: 'production', METRICS_ENABLED: '1', METRICS_TOKEN: 'seg', METRICS_PORTA_INTERNA: '9091' }),
      ),
    ).toBeNull()
  })
  it('a porta inválida deixa de ser lida (antes abortava): o helper e o aborto por porta não existem mais', () => {
    expect(erroDeMetricasEmProducao(env({ METRICS_ENABLED: '1', METRICS_PORTA_INTERNA: 'noventa' }))).toBeNull()
    expect('portaInternaDeMetricas' in config).toBe(false)
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
