/**
 * GAP-013 (auditoria 2026-09-13). Em produção, `/metrics` ligado sem `METRICS_TOKEN` é um scrape
 * aberto que expõe a superfície do servidor. O boot deve ABORTAR (fail-closed). Fora de produção
 * (self-host, rede interna) exigir token é fricção sem ameaça.
 */
import { describe, expect, it } from 'vitest'

import { erroDeMetricasEmProducao } from '../server/lib/config'

const env = (o: Record<string, string>) => o as unknown as NodeJS.ProcessEnv

describe('GAP-013 — /metrics fail-closed em produção', () => {
  it('produção + METRICS_ENABLED=1 SEM token → aborta', () => {
    expect(erroDeMetricasEmProducao(env({ NODE_ENV: 'production', METRICS_ENABLED: '1' }))).toMatch(/METRICS_TOKEN/)
  })
  it('produção + METRICS_ENABLED=1 + token → ok', () => {
    expect(erroDeMetricasEmProducao(env({ NODE_ENV: 'production', METRICS_ENABLED: '1', METRICS_TOKEN: 'seg' }))).toBeNull()
  })
  it('produção + métricas desligadas → ok', () => {
    expect(erroDeMetricasEmProducao(env({ NODE_ENV: 'production' }))).toBeNull()
  })
  it('self-host + métricas sem token → ok', () => {
    expect(erroDeMetricasEmProducao(env({ NODE_ENV: 'development', METRICS_ENABLED: '1' }))).toBeNull()
  })
})
