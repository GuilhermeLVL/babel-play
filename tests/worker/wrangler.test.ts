/**
 * O `wrangler.jsonc` CONTRA O CÓDIGO: o que mora em dois lugares e não pode divergir.
 *  - `triggers.crons` = o conjunto de `cron` do registro de jobs (`server/jobs/registro.ts`): uma expressão a
 *    mais nunca roda nada; uma a menos deixa um job sem disparo, em silêncio.
 *  - `define.__VERSAO_DO_PACOTE__` = a versão do `package.json` (no Worker não há disco para lê-la).
 *  - o Worker é sempre produção: `define` do literal e `vars.NODE_ENV`, no topo e no staging.
 *  - os buckets de mídia são os que `scripts/cloudflare/r2.mjs` cria (`frasy-midia`, `frasy-midia-staging`).
 */
import { readFileSync } from 'node:fs'
import { join } from 'node:path'

import ts from 'typescript'
import { describe, expect, it } from 'vitest'

import { JOBS } from '../../server/jobs/registro'

const RAIZ = join(__dirname, '..', '..')

interface Ambiente {
  triggers?: { crons?: string[] }
  vars?: Record<string, string>
  define?: Record<string, string>
  r2_buckets?: { binding: string; bucket_name: string }[]
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
})
