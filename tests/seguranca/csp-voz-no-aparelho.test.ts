/**
 * A VOZ NO APARELHO (openspec `voz-no-aparelho`): `VITE_VOZ_MODELO_URL` é a raiz dos pesos do Supertonic. O worker os
 * baixa por `fetch` (`connect-src`). Só a ORIGEM entra, e só ali: é dado, nunca script, worker ou mídia.
 */
import { readFileSync } from 'node:fs'

import { describe, expect, it } from 'vitest'

import { gerarHeaders } from '../../scripts/vite/cabecalhos'
import { diretivasDeCsp } from '../../server/http/csp'

const env = (e: Record<string, string>) => e as unknown as NodeJS.ProcessEnv

describe('CSP da voz no aparelho (VITE_VOZ_MODELO_URL)', () => {
  it('sem a variável nada muda', () => {
    expect(diretivasDeCsp(env({ VITE_VOZ_MODELO_URL: '' }))).toEqual(diretivasDeCsp(env({})))
  })

  it('a origem entra só em connect-src, sem o caminho', () => {
    const d = diretivasDeCsp(env({ VITE_VOZ_MODELO_URL: 'https://modelos.frasy.com.br/supertonic-3' }))
    expect(d.connectSrc).toContain('https://modelos.frasy.com.br')
    expect(d.scriptSrc).not.toContain('https://modelos.frasy.com.br')
    expect(d.workerSrc).not.toContain('https://modelos.frasy.com.br')
    expect(d.mediaSrc).not.toContain('https://modelos.frasy.com.br')
    expect(d.connectSrc.some((x) => x.includes('supertonic'))).toBe(false)
  })

  it('a origem local da demonstração entra; URL inválida não vira curinga', () => {
    expect(diretivasDeCsp(env({ VITE_VOZ_MODELO_URL: 'http://localhost:3185/assets' })).connectSrc).toContain(
      'http://localhost:3185',
    )
    const base = diretivasDeCsp(env({}))
    for (const v of ['nao-e-url', 'ftp://x.dev', 'javascript:alert(1)'])
      expect(diretivasDeCsp(env({ VITE_VOZ_MODELO_URL: v })).connectSrc).toEqual(base.connectSrc)
  })

  it('o dist/_headers gerado traz o mesmo host em connect-src', () => {
    const h = gerarHeaders(
      env({ VITE_VOZ_MODELO_URL: 'https://modelos.frasy.com.br/supertonic-3' }),
      readFileSync('scripts/vite/_headers.base', 'utf8'),
    )
    const csp = h.split(/\r?\n/).find((l) => l.trim().startsWith('Content-Security-Policy:'))!
    const connect = csp.split(/;\s*/).find((d) => d.trim().startsWith('connect-src ')) ?? ''
    expect(connect).toContain('https://modelos.frasy.com.br')
  })
})
