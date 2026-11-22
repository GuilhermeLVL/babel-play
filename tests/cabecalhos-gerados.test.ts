/**
 * O `dist/_headers` é GERADO no build (`scripts/vite/cabecalhos.ts`) com a mesma CSP bloqueante do
 * Express (`diretivasDeCsp`), no lugar do antigo `public/_headers` com uma política fixa em modo relato.
 */
import { readFileSync } from 'node:fs'

import { describe, expect, it } from 'vitest'

import { gerarHeaders } from '../scripts/vite/cabecalhos'
import { diretivasDeCsp, serializarCsp } from '../server/http/csp'

const BASE = readFileSync('scripts/vite/_headers.base', 'utf8')
const env = (e: Record<string, string>) => e as unknown as NodeJS.ProcessEnv

/** O valor de um cabeçalho dentro de um bloco do `_headers` (rota + linhas indentadas). */
function bloco(headers: string, rota: string): string {
  const linhas = headers.split(/\r?\n/)
  const i = linhas.findIndex((l) => l === rota)
  expect(i, `bloco ${rota}`).toBeGreaterThanOrEqual(0)
  const fora: string[] = []
  for (const l of linhas.slice(i + 1)) {
    if (!/^\s/.test(l)) {
      if (l.trim() === '' || l.startsWith('#')) {
        if (fora.length) break
        continue
      }
      break
    }
    fora.push(l.trim())
  }
  return fora.join('\n')
}

describe('gerarHeaders', () => {
  it('a CSP do _headers é a mesma de diretivasDeCsp(env), bloqueante', () => {
    const e = env({
      SUPABASE_URL: 'https://abcd.supabase.co',
      VITE_TURNSTILE_SITE_KEY: 'x',
      VITE_SENTRY_DSN: 'https://chave@o1.ingest.sentry.io/2',
      VITE_BERGAMOT_MODELOS_URL: 'https://modelos.exemplo.dev/bergamot',
    })
    const h = gerarHeaders(e, BASE)
    const global = bloco(h, '/*')
    expect(global).toContain(`Content-Security-Policy: ${serializarCsp(diretivasDeCsp(e))}`)
    const csp = global.split('\n').find((l) => l.startsWith('Content-Security-Policy:'))!
    const dir = (nome: string) => csp.split(/;\s*/).find((d) => d.includes(nome + ' ')) ?? ''
    expect(dir('script-src')).toContain('https://challenges.cloudflare.com')
    expect(dir('connect-src')).toContain('https://challenges.cloudflare.com')
    expect(dir('frame-src')).toContain('https://challenges.cloudflare.com')
    expect(dir('connect-src')).toContain('https://abcd.supabase.co')
    expect(dir('connect-src')).toContain('https://o1.ingest.sentry.io')
    expect(dir('connect-src')).toContain('https://modelos.exemplo.dev')
    /* "Trazer o seu" por link: só o raw do GitHub, nunca o curinga. */
    expect(dir('connect-src')).toContain('https://raw.githubusercontent.com')
    expect(dir('connect-src').split(/\s+/)).not.toContain('https:')
  })

  it('VITE_ORT_WASM_URL abre a origem do runtime do ONNX em connect-src, script-src e worker-src', () => {
    const csp = bloco(gerarHeaders(env({ VITE_ORT_WASM_URL: 'https://modelos.frasy.com.br/ort/' }), BASE), '/*')
    const linha = csp.split('\n').find((l) => l.startsWith('Content-Security-Policy:'))!
    const dir = (nome: string) => linha.split(/;\s*/).find((d) => d.includes(nome + ' ')) ?? ''
    for (const nome of ['connect-src', 'script-src', 'worker-src'])
      expect(dir(nome), nome).toContain('https://modelos.frasy.com.br')
    expect(dir('connect-src')).not.toContain('/ort/')
  })

  it('com o espelho próprio, o _headers sai sem Hub e sem jsDelivr (o mesmo de diretivasDeCsp)', () => {
    const e = env({ VITE_SELF_HOST_MODELS: 'https://modelos.frasy.com.br', VITE_AUTH_REQUIRED: '1' })
    const csp = bloco(gerarHeaders(e, BASE), '/*')
    expect(csp).toContain(serializarCsp(diretivasDeCsp(e)))
    expect(csp).not.toContain('huggingface')
    expect(csp).not.toContain('hf.co')
    expect(csp).not.toContain('jsdelivr')
  })

  it('sem variáveis, a política é a mínima do app (self, wasm-unsafe-eval, blob:, jsdelivr, huggingface…)', () => {
    const csp = bloco(gerarHeaders(env({}), BASE), '/*')
    expect(csp).toContain("default-src 'self'")
    expect(csp).toContain("script-src 'self' 'wasm-unsafe-eval' blob:;")
    expect(csp).toContain('https://cdn.jsdelivr.net')
    expect(csp).toContain('https://huggingface.co')
    expect(csp).not.toContain('challenges.cloudflare.com')
    // O leitor de livros (L2): cada capítulo é um documento `blob:` num iframe — e só isso entra em frame-src.
    expect(csp).toContain("frame-src 'self' blob:")
    expect(csp).not.toMatch(/frame-src [^;]*https:/)
  })

  it('o build do Worker (VITE_AUTH_REQUIRED=1) sai sem o Ollama local; a edição estática (sem ela) o mantém', () => {
    const publico = bloco(gerarHeaders(env({ VITE_AUTH_REQUIRED: '1' }), BASE), '/*')
    expect(publico).not.toContain('11434')
    const estatica = bloco(gerarHeaders(env({ VITE_AUTH_REQUIRED: '' }), BASE), '/*')
    expect(estatica).toContain('http://localhost:11434')
  })

  it('libera o AnkiConnect local (8765) só em connect-src, também no build público, e nenhuma outra porta', () => {
    for (const authRequired of ['1', '']) {
      const g = bloco(gerarHeaders(env({ VITE_AUTH_REQUIRED: authRequired }), BASE), '/*')
      const csp = g.split('\n').find((l) => l.startsWith('Content-Security-Policy:'))!
      const dir = (nome: string) => csp.split(/;\s*/).find((d) => d.startsWith(nome + ' ')) ?? ''
      expect(dir('connect-src').split(/\s+/)).toEqual(expect.arrayContaining(['http://127.0.0.1:8765']))
      for (const outra of ['script-src', 'worker-src', 'frame-src', 'img-src', 'media-src']) {
        expect(dir(outra)).not.toContain(':8765')
      }
      const d = diretivasDeCsp(env({ VITE_AUTH_REQUIRED: authRequired }))
      expect(d.connectSrc.filter((o) => o.includes(':8765'))).toEqual(['http://127.0.0.1:8765'])
      expect(d.scriptSrc.concat(d.workerSrc, d.mediaSrc).some((o) => o.includes(':8765'))).toBe(false)
      const locais = d.connectSrc.filter((o) => /(localhost|127\.0\.0\.1|\[::1\])/.test(o))
      // modo público: só a origem exata do Anki (127.0.0.1), sem curinga de porta e sem outra origem local
      if (authRequired === '1') expect(locais).toEqual(['http://127.0.0.1:8765'])
      else expect(locais.filter((o) => !o.includes(':11434'))).toEqual(['http://127.0.0.1:8765'])
      expect(locais.some((o) => o.includes('*'))).toBe(false)
    }
  })

  it('traz o isolamento e os demais cabeçalhos globais', () => {
    const g = bloco(gerarHeaders(env({}), BASE), '/*')
    expect(g).toContain('Cross-Origin-Opener-Policy: same-origin')
    expect(g).toContain('Cross-Origin-Embedder-Policy: credentialless')
    expect(g).toContain('Document-Isolation-Policy: isolate-and-credentialless')
    expect(g).toContain('X-Content-Type-Options: nosniff')
    expect(g).toContain('Strict-Transport-Security: max-age=31536000; includeSubDomains')
    expect(g).toContain('Referrer-Policy: strict-origin-when-cross-origin')
    expect(g).toContain('Permissions-Policy: microphone=(self)')
  })

  it('as regras de cache do base vêm inalteradas', () => {
    const h = gerarHeaders(env({}), BASE)
    const cache = BASE.slice(BASE.indexOf('/ort-wasm-*'))
    expect(cache).toContain('/assets/*')
    expect(h.endsWith(cache) || h.includes(cache)).toBe(true)
    expect(bloco(h, '/assets/*')).toBe('Cache-Control: public, max-age=31536000, immutable')
    expect(bloco(h, '/trilha/*')).toBe('Cache-Control: public, max-age=86400, must-revalidate')
  })

  it('diagnostico-audio.html fica sem CSP', () => {
    expect(bloco(gerarHeaders(env({}), BASE), '/diagnostico-audio.html')).toBe('! Content-Security-Policy')
  })

  /* Ruling R35: a página de anúncios mora no Worker próprio `frasy-anuncios`; o `_headers` do app não tem
     bloco para ela e não abre mão do isolamento em caminho nenhum. */
  it('o _headers do app não tem bloco /anuncios/* nem host do Google', () => {
    const h = gerarHeaders(env({ APP_URL: 'https://frasy.com.br' }), BASE)
    expect(h).not.toContain('/anuncios')
    expect(h).not.toMatch(/doubleclick|googlesyndication/)
    expect(h).not.toMatch(/! Cross-Origin/)
  })

  it('não existe Content-Security-Policy-Report-Only', () => {
    expect(gerarHeaders(env({}), BASE)).not.toMatch(/Report-Only/)
    expect(BASE).not.toMatch(/Content-Security-Policy-Report-Only:/)
  })
})
