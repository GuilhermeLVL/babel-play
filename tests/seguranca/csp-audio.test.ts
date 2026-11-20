/**
 * O ÁUDIO DOS AUDIOLIVROS (F2, `docs/specs/2026-10-31-audiolivros-e-leitura.md` §6.2): `VITE_AUDIO_URL` é a raiz
 * pública do bucket com os capítulos pré-gerados. O manifesto e os tempos vêm por `fetch` (`connect-src`) e o
 * `<audio>` toca o `.opus` por `media-src`. Só a ORIGEM entra, nas duas diretivas; nada em script/worker.
 */
import { readFileSync } from 'node:fs'

import { describe, expect, it } from 'vitest'

import { gerarHeaders } from '../../scripts/vite/cabecalhos'
import { diretivasDeCsp } from '../../server/http/csp'

const env = (e: Record<string, string>) => e as unknown as NodeJS.ProcessEnv

describe('CSP do áudio dos audiolivros (VITE_AUDIO_URL)', () => {
  it('sem a variável nada muda e connect-src não tem o curinga https:', () => {
    const base = diretivasDeCsp(env({}))
    expect(base.connectSrc).not.toContain('https:')
    expect(base.mediaSrc).toEqual(["'self'", 'blob:', 'data:'])
    expect(diretivasDeCsp(env({ VITE_AUDIO_URL: '' }))).toEqual(base)
  })

  it('a origem de VITE_AUDIO_URL entra em connect-src e media-src, e só ali', () => {
    const d = diretivasDeCsp(env({ VITE_AUDIO_URL: 'https://audio.frasy.com.br/x' }))
    expect(d.connectSrc).toContain('https://audio.frasy.com.br')
    expect(d.mediaSrc).toContain('https://audio.frasy.com.br')
    expect(d.scriptSrc).not.toContain('https://audio.frasy.com.br')
    expect(d.workerSrc).not.toContain('https://audio.frasy.com.br')
    expect(d.connectSrc.some((x) => x.endsWith('/x'))).toBe(false)
  })

  it('a origem local da demonstração (http://localhost:porta) também entra', () => {
    const d = diretivasDeCsp(env({ VITE_AUDIO_URL: 'http://localhost:3176' }))
    expect(d.connectSrc).toContain('http://localhost:3176')
    expect(d.mediaSrc).toContain('http://localhost:3176')
  })

  it('URL inválida é ignorada, não vira curinga', () => {
    const base = diretivasDeCsp(env({}))
    for (const v of ['nao-e-url', 'ftp://audio.exemplo.dev', 'javascript:alert(1)']) {
      const d = diretivasDeCsp(env({ VITE_AUDIO_URL: v }))
      expect(d.connectSrc).toEqual(base.connectSrc)
      expect(d.mediaSrc).toEqual(base.mediaSrc)
    }
  })

  it('o dist/_headers gerado traz o mesmo host em connect-src e media-src', () => {
    const h = gerarHeaders(
      env({ VITE_AUDIO_URL: 'https://audio.frasy.com.br/' }),
      readFileSync('scripts/vite/_headers.base', 'utf8'),
    )
    const csp = h.split(/\r?\n/).find((l) => l.trim().startsWith('Content-Security-Policy:'))!
    const dir = (nome: string) => csp.split(/;\s*/).find((d) => d.trim().startsWith(nome + ' ')) ?? ''
    expect(dir('connect-src')).toContain('https://audio.frasy.com.br')
    expect(dir('media-src')).toContain('https://audio.frasy.com.br')
  })
})
