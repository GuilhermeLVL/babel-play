/**
 * CSP ESTREITA (Fase 6) — `connect-src` deixa de ser `https:` (qualquer host da internet).
 *
 * Com `connect-src https:`, um script injetado conseguia mandar o que quisesse para qualquer
 * servidor — a CSP não segurava exfiltração nenhuma. A lista agora é a dos hosts que o CLIENTE
 * realmente chama, levantada lendo o código (ver `server/http/csp.ts`), mais os que dependem do
 * deploy e chegam por variável (Supabase, bucket dos modelos, Sentry).
 */
import { describe, expect, it } from 'vitest'

import { diretivasDeCsp } from '../../server/http/csp'

const env = (e: Record<string, string>) => e as unknown as NodeJS.ProcessEnv

describe('diretivasDeCsp', () => {
  it('connect-src não tem mais o curinga `https:`', () => {
    const d = diretivasDeCsp(env({}))
    expect(d.connectSrc).not.toContain('https:')
    expect(d.connectSrc).toContain("'self'")
  })

  it('traz os hosts fixos que o cliente chama', () => {
    const c = diretivasDeCsp(env({})).connectSrc
    // modelos locais (transformers.js) e o runtime ONNX que ele baixa
    expect(c).toContain('https://huggingface.co')
    expect(c).toContain('https://*.hf.co')
    expect(c).toContain('https://cdn.jsdelivr.net')
    // dicionário, imagens e tradução de reserva do cliente
    expect(c).toContain('https://*.wiktionary.org')
    expect(c).toContain('https://api.openverse.org')
    expect(c).toContain('https://api.mymemory.translated.net')
  })

  it('o Supabase entra pela origem configurada, e só ela', () => {
    const c = diretivasDeCsp(
      env({ SUPABASE_URL: 'https://abcd.supabase.co/', VITE_SUPABASE_URL: 'https://abcd.supabase.co' }),
    ).connectSrc
    expect(c.filter((x) => x.includes('supabase'))).toEqual(['https://abcd.supabase.co'])
  })

  it('o bucket dos modelos entra pela origem de VITE_SELF_HOST_MODELS quando é URL', () => {
    const c = diretivasDeCsp(env({ VITE_SELF_HOST_MODELS: 'https://modelos.exemplo.com.br/v1/' })).connectSrc
    expect(c).toContain('https://modelos.exemplo.com.br')
  })

  it('os modelos do Bergamot num CDN (VITE_BERGAMOT_MODELOS_URL) entram pela origem', () => {
    const c = diretivasDeCsp(env({ VITE_BERGAMOT_MODELOS_URL: 'https://r2.exemplo.dev/modelos/' })).connectSrc
    expect(c).toContain('https://r2.exemplo.dev')
    // O motor (WASM e cola) é código: continua só do próprio domínio.
    expect(diretivasDeCsp(env({ VITE_BERGAMOT_MODELOS_URL: 'https://r2.exemplo.dev' })).scriptSrc).not.toContain(
      'https://r2.exemplo.dev',
    )
  })

  it('VITE_SELF_HOST_MODELS=1 (mesmo domínio) não acrescenta host', () => {
    const base = diretivasDeCsp(env({})).connectSrc
    expect(diretivasDeCsp(env({ VITE_SELF_HOST_MODELS: '1' })).connectSrc).toEqual(base)
  })

  it('o Sentry entra pelo host do DSN do navegador', () => {
    const c = diretivasDeCsp(env({ VITE_SENTRY_DSN: 'https://chavepub@o123.ingest.us.sentry.io/456' })).connectSrc
    expect(c).toContain('https://o123.ingest.us.sentry.io')
  })

  it('variável malformada é ignorada, não vira curinga', () => {
    const c = diretivasDeCsp(env({ SUPABASE_URL: 'nao-e-url', VITE_SENTRY_DSN: '???' })).connectSrc
    expect(c).not.toContain('https:')
    expect(c.some((x) => x.includes('nao-e-url'))).toBe(false)
  })

  it('as fontes são do próprio site: font-src só self e nenhuma origem do Google em lugar nenhum', () => {
    const d = diretivasDeCsp(env({}))
    expect(d.fontSrc).toEqual(["'self'"])
    expect(d.styleSrc).toEqual(["'self'", "'unsafe-inline'"])
    for (const lista of Object.values(d))
      expect((lista as string[]).some((x) => /fonts.(googleapis|gstatic).com/.test(x))).toBe(false)
  })

  it('script-src continua sem host externo e sem unsafe-eval', () => {
    const s = diretivasDeCsp(env({})).scriptSrc
    expect(s).toEqual(["'self'", "'wasm-unsafe-eval'", 'blob:'])
  })

  it('object-src none, frame-ancestors self, base-uri self e form-action self', () => {
    const d = diretivasDeCsp(env({}))
    expect(d.objectSrc).toEqual(["'none'"])
    expect(d.frameAncestors).toEqual(["'self'"])
    expect(d.baseUri).toEqual(["'self'"])
    expect(d.formAction).toEqual(["'self'"])
  })
})
