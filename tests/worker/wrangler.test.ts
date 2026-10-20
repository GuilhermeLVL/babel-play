/**
 * O `wrangler.jsonc` CONTRA O CÓDIGO: o que mora em dois lugares e não pode divergir.
 *  - `triggers.crons` = o conjunto de `cron` do registro de jobs (`server/jobs/registro.ts`): uma expressão a
 *    mais nunca roda nada; uma a menos deixa um job sem disparo, em silêncio.
 *  - `define.__VERSAO_DO_PACOTE__` = a versão do `package.json` (no Worker não há disco para lê-la).
 *  - o Worker é sempre produção: `define` do literal e `vars.NODE_ENV`, no topo e no staging.
 *  - os buckets de mídia são os que `scripts/cloudflare/r2.mjs` cria (`frasy-midia`, `frasy-midia-staging`).
 *  - o staging é publicável: Hyperdrive próprio (`scripts/cloudflare/hyperdrive-staging.mjs`), sem cron, no
 *    workers.dev, e com o `define` do topo (o wrangler não herda `define` nos ambientes).
 */
import { readFileSync } from 'node:fs'
import { join } from 'node:path'

import ts from 'typescript'
import { describe, expect, it } from 'vitest'

import { JOBS } from '../../server/jobs/registro'

const RAIZ = join(__dirname, '..', '..')

interface Ambiente {
  name?: string
  workers_dev?: boolean
  preview_urls?: boolean
  hyperdrive?: { binding: string; id: string; localConnectionString?: string }[]
  triggers?: { crons?: string[] }
  vars?: Record<string, string>
  define?: Record<string, string>
  r2_buckets?: { binding: string; bucket_name: string }[]
  analytics_engine_datasets?: { binding: string; dataset: string }[]
}
interface Config extends Ambiente {
  env?: Record<string, Ambiente>
}

const lido = ts.parseConfigFileTextToJson('wrangler.jsonc', readFileSync(join(RAIZ, 'wrangler.jsonc'), 'utf8'))
if (lido.error) throw new Error(String(lido.error.messageText))
const config = lido.config as Config

describe('wrangler.jsonc', () => {
  it('triggers.crons é exatamente o conjunto de crons do registro de jobs', () => {
    const doRegistro = [...new Set(JOBS.map((j) => j.cron))].sort()
    expect([...(config.triggers?.crons ?? [])].sort()).toEqual(doRegistro)
    expect(new Set(config.triggers?.crons).size).toBe(config.triggers?.crons?.length)
  })

  it('a versão embutida é a do package.json', () => {
    const { version } = JSON.parse(readFileSync(join(RAIZ, 'package.json'), 'utf8')) as { version: string }
    expect(config.define?.__VERSAO_DO_PACOTE__).toBe(JSON.stringify(version))
  })

  it('o Worker é produção no literal e no runtime, também no staging', () => {
    expect(config.define?.['process.env.NODE_ENV']).toBe('"production"')
    expect(config.vars?.NODE_ENV).toBe('production')
    expect(config.env?.staging?.vars?.NODE_ENV).toBe('production')
  })

  it('a mídia vai para frasy-midia (produção) e frasy-midia-staging (staging), no binding MIDIA', () => {
    expect(config.r2_buckets).toEqual([{ binding: 'MIDIA', bucket_name: 'frasy-midia' }])
    expect(config.env?.staging?.r2_buckets).toEqual([{ binding: 'MIDIA', bucket_name: 'frasy-midia-staging' }])
  })

  it('o Analytics Engine está ligado no binding METRICAS, com dataset próprio no staging', () => {
    expect(config.analytics_engine_datasets).toEqual([{ binding: 'METRICAS', dataset: 'frasy_metricas' }])
    expect(config.env?.staging?.analytics_engine_datasets).toEqual([
      { binding: 'METRICAS', dataset: 'frasy_metricas_staging' },
    ])
  })

  it('o staging tem Hyperdrive próprio, nenhum cron, workers.dev e o mesmo define do topo', () => {
    const staging = config.env?.staging
    expect(staging?.name).toBe('frasy-staging')
    expect(staging?.hyperdrive).toHaveLength(1)
    expect(staging?.hyperdrive?.[0].binding).toBe('HYPERDRIVE')
    expect(staging?.hyperdrive?.[0].id).toMatch(/^[0-9a-f]{32}$/)
    expect(staging?.hyperdrive?.[0].id).not.toBe(config.hyperdrive?.[0].id)
    expect(staging?.triggers?.crons).toEqual([])
    expect(staging?.r2_buckets?.[0].bucket_name).toBe('frasy-midia-staging')
    expect(staging?.workers_dev).toBe(true)
    expect(config.workers_dev).toBe(false)
    expect(staging?.define).toEqual(config.define)
  })

  /* `erroDeAsaasSandboxEmProducao` aborta o boot quando a base do Asaas é sandbox (ou falta) sem
     `ASAAS_SANDBOX=1`: a produção declara a base real; só o staging declara o sandbox. */
  it('Asaas: produção com a base real e sem ASAAS_SANDBOX; staging com o sandbox declarado', () => {
    expect(config.vars?.ASAAS_BASE_URL).toBe('https://api.asaas.com/v3')
    expect(config.vars).not.toHaveProperty('ASAAS_SANDBOX')
    expect(config.env?.staging?.vars?.ASAAS_SANDBOX).toBe('1')
    expect(config.env?.staging?.vars?.ASAAS_BASE_URL).toMatch(/sandbox/)
  })

  it('preview_urls ligado no topo (portão antes do tráfego) e workers.dev desligado na produção', () => {
    expect(config.preview_urls).toBe(true)
    expect(config.workers_dev).toBe(false)
  })
})
