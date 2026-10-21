/**
 * A PÁGINA DE ANÚNCIOS NUM WORKER PRÓPRIO (ruling R35). Ela roda o GPT do Google sem isolamento e com CSP larga;
 * se a origem do app a servisse, qualquer script do Google ficaria na mesma origem do app. Por isso:
 *  - ela não está em `public/` nem no `dist` do app;
 *  - `wrangler.anuncios.jsonc` é um Worker só de assets, sem banco nem bucket;
 *  - o `_headers` gerado não tem COOP/COEP/DIP e o `frame-ancestors` é só a origem do app (`APP_URL`);
 *  - o `config.js` gerado leva só a rede e a origem do app (nada de segredo).
 */
import { existsSync, mkdtempSync, readFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import ts from 'typescript'
import { afterAll, describe, expect, it } from 'vitest'

import {
  construir,
  cspDaPaginaDeAnuncios,
  gerarCabecalhosDosAnuncios,
  gerarConfig,
} from '../scripts/anuncios/build.mjs'

const env = (e: Record<string, string>) => e as unknown as NodeJS.ProcessEnv
const temporarios: string[] = []
afterAll(() => {
  for (const d of temporarios) rmSync(d, { recursive: true, force: true })
})

describe('a página de anúncios fora do app', () => {
  it('public/ e dist/ do app não têm a página de anúncios', () => {
    expect(existsSync('public/anuncios/espaco.html')).toBe(false)
    expect(existsSync('dist/anuncios/espaco.html')).toBe(false)
    expect(existsSync('dist/espaco.html')).toBe(false)
    expect(existsSync('anuncios/espaco.html')).toBe(true)
    expect(existsSync('anuncios/espaco.js')).toBe(true)
  })

  it('wrangler.anuncios.jsonc: Worker só de assets (dist-anuncios), sem hyperdrive, r2 nem código', () => {
    const lido = ts.parseConfigFileTextToJson('w', readFileSync('wrangler.anuncios.jsonc', 'utf8'))
    expect(lido.error).toBeUndefined()
    const c = lido.config as Record<string, unknown> & {
      assets: { directory: string }
      env: { staging: { name: string; workers_dev: boolean } }
    }
    expect(c.name).toBe('frasy-anuncios')
    expect(c.assets.directory).toBe('dist-anuncios')
    expect(c).not.toHaveProperty('main')
    const texto = JSON.stringify(c)
    expect(texto).not.toMatch(/hyperdrive|r2_buckets|analytics_engine/)
    expect(c.env.staging.name).toBe('frasy-anuncios-staging')
    expect(c.env.staging.workers_dev).toBe(true)
  })

  it('o _headers: sem COOP/COEP/DIP; CSP da página com frame-ancestors só do APP_URL; nosniff e Referrer-Policy', () => {
    const h = gerarCabecalhosDosAnuncios(env({ APP_URL: 'https://frasy.com.br/qualquer' }))
    expect(h).not.toMatch(/Cross-Origin-(Opener|Embedder)-Policy|Document-Isolation-Policy/)
    expect(h).toContain('X-Content-Type-Options: nosniff')
    expect(h).toContain('Referrer-Policy: strict-origin-when-cross-origin')
    const csp = h.split('\n').find((l) => l.includes('Content-Security-Policy:'))!
    expect(csp).toContain('frame-ancestors https://frasy.com.br')
    expect(csp).not.toMatch(/frame-ancestors[^;]*'self'/)
    expect(csp).toContain("script-src 'self' 'unsafe-inline' https://securepubads.g.doubleclick.net")
    expect(csp).not.toContain("'unsafe-eval'")
    expect(csp).toContain("object-src 'none'")
  })

  it("sem APP_URL, frame-ancestors 'none' (ninguém embute: falha fechada)", () => {
    expect(cspDaPaginaDeAnuncios(env({}))).toContain("frame-ancestors 'none'")
  })

  it('config.js: só a rede (dígitos) e a origem do app; nenhum segredo', () => {
    const c = gerarConfig(
      env({
        VITE_ANUNCIOS_REDE_CONTA: '123456',
        APP_URL: 'https://frasy.com.br/x',
        SECRET_KEY: 'nao-pode-vazar',
        SUPABASE_SERVICE_ROLE_KEY: 'nao-pode-vazar',
      }),
    )
    expect(c).toContain('"rede":"123456"')
    expect(c).toContain('"app":"https://frasy.com.br"')
    expect(c).not.toContain('nao-pode-vazar')
    expect(gerarConfig(env({ VITE_ANUNCIOS_REDE_CONTA: '12; alert(1)' }))).toContain('"rede":""')
  })

  it('construir() grava espaco.html, espaco.js, config.js e _headers', () => {
    const destino = mkdtempSync(join(tmpdir(), 'anuncios-'))
    temporarios.push(destino)
    construir(env({ APP_URL: 'https://frasy.com.br', VITE_ANUNCIOS_REDE_CONTA: '1' }), destino)
    for (const nome of ['espaco.html', 'espaco.js', 'config.js', '_headers'])
      expect(existsSync(join(destino, nome)), nome).toBe(true)
  })
})
