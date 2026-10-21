/**
 * A CSP E OS ANÚNCIOS (Task 4 do estado 3, ruling R32).
 *
 * O GPT do Google não suporta COEP e só aceita CSP por nonce: os anúncios rodam numa ORIGEM PRÓPRIA
 * (`ANUNCIOS_ORIGEM`), embutida por `<iframe credentialless>`. Para o app, a única porta que se abre é
 * `frame-src` com essa origem — e só com a flag `anuncios` ligada. Nenhum host do Google entra em
 * `script-src` do app, nunca.
 *
 * A página de anúncios (`/anuncios/espaco.html`) tem a CSP larga dela, que vive só naquela origem.
 */
import { describe, expect, it } from 'vitest'

import {
  cspComAnuncios,
  cspDaPaginaDeAnuncios,
  diretivasDeCsp,
  origemDosAnuncios,
  serializarCsp,
} from '../../server/http/csp'

const env = (e: Record<string, string>) => e as unknown as NodeJS.ProcessEnv
const ORIGEM = 'https://ads.frasy.com.br'
const GOOGLE = /doubleclick|googlesyndication|googletagservices|google\.com|adtrafficquality/

const diretiva = (csp: string, nome: string) =>
  csp
    .split(/;\s*/)
    .find((d) => d.startsWith(nome + ' '))
    ?.split(' ')
    .slice(1) ?? null

describe('origemDosAnuncios', () => {
  it('só a origem (caminho fora), e só https', () => {
    expect(origemDosAnuncios(env({ ANUNCIOS_ORIGEM: 'https://ads.frasy.com.br/anuncios/' }))).toBe(ORIGEM)
    expect(origemDosAnuncios(env({ ANUNCIOS_ORIGEM: 'http://ads.frasy.com.br' }))).toBeNull()
    expect(origemDosAnuncios(env({ ANUNCIOS_ORIGEM: 'nao-e-url' }))).toBeNull()
    expect(origemDosAnuncios(env({}))).toBeNull()
  })

  it('localhost em http vale (worker:dev)', () => {
    expect(origemDosAnuncios(env({ ANUNCIOS_ORIGEM: 'http://localhost:8787' }))).toBe('http://localhost:8787')
  })
})

describe('diretivasDeCsp com anúncios', () => {
  it('flag desligada: nada muda, mesmo com a origem configurada', () => {
    const base = diretivasDeCsp(env({}))
    expect(diretivasDeCsp(env({ ANUNCIOS_ORIGEM: ORIGEM }))).toEqual(base)
    expect(diretivasDeCsp(env({ ANUNCIOS_ORIGEM: ORIGEM }), { anuncios: false })).toEqual(base)
  })

  it('flag ligada sem origem: nada muda', () => {
    expect(diretivasDeCsp(env({}), { anuncios: true })).toEqual(diretivasDeCsp(env({})))
  })

  it('flag ligada + origem: a origem entra SÓ em frame-src', () => {
    const base = diretivasDeCsp(env({}))
    const d = diretivasDeCsp(env({ ANUNCIOS_ORIGEM: ORIGEM }), { anuncios: true })
    expect(d.frameSrc).toEqual(["'self'", ORIGEM])
    const { frameSrc: _f, ...resto } = d
    expect(resto).toEqual(base)
    expect(d.scriptSrc).toEqual(["'self'", "'wasm-unsafe-eval'", 'blob:'])
  })

  it('com o Turnstile, frame-src leva os dois', () => {
    const d = diretivasDeCsp(env({ ANUNCIOS_ORIGEM: ORIGEM, VITE_TURNSTILE_SITE_KEY: 'x' }), { anuncios: true })
    expect(d.frameSrc).toEqual(["'self'", 'https://challenges.cloudflare.com', ORIGEM])
  })

  it('nenhum host do Google em lugar nenhum da CSP do app', () => {
    const texto = serializarCsp(diretivasDeCsp(env({ ANUNCIOS_ORIGEM: ORIGEM }), { anuncios: true }))
    expect(texto).not.toMatch(GOOGLE)
  })
})

describe('cspComAnuncios (a sobreposição do Worker)', () => {
  it('sem frame-src: cria com self e a origem; o resto fica igual', () => {
    const antes = serializarCsp(diretivasDeCsp(env({})))
    const depois = cspComAnuncios(antes, ORIGEM)
    expect(diretiva(depois, 'frame-src')).toEqual(["'self'", ORIGEM])
    expect(diretiva(depois, 'script-src')).toEqual(diretiva(antes, 'script-src'))
    expect(depois.replace(/;\s*frame-src [^;]*/, '')).toBe(antes)
  })

  it('com frame-src: acrescenta a origem sem repetir', () => {
    const antes = serializarCsp(diretivasDeCsp(env({ VITE_TURNSTILE_SITE_KEY: 'x' })))
    const depois = cspComAnuncios(antes, ORIGEM)
    expect(diretiva(depois, 'frame-src')).toEqual(["'self'", 'https://challenges.cloudflare.com', ORIGEM])
    expect(cspComAnuncios(depois, ORIGEM)).toBe(depois)
    expect(diretiva(depois, 'script-src')).toEqual(diretiva(antes, 'script-src'))
  })
})

describe('cspDaPaginaDeAnuncios (só na origem de anúncios)', () => {
  const csp = cspDaPaginaDeAnuncios(env({}))

  it('script-src: o próprio, o GPT e os hosts do Google da pesquisa, com unsafe-inline (documentado)', () => {
    const s = diretiva(csp, 'script-src')!
    expect(s).toContain("'self'")
    expect(s).toContain('https://securepubads.g.doubleclick.net')
    expect(s).toContain('https://pagead2.googlesyndication.com')
    expect(s).toContain("'unsafe-inline'")
    expect(s).not.toContain("'unsafe-eval'")
  })

  it('object-src none, base-uri none e frame-ancestors só self (mais APP_URL quando existe)', () => {
    expect(diretiva(csp, 'object-src')).toEqual(["'none'"])
    expect(diretiva(csp, 'base-uri')).toEqual(["'none'"])
    expect(diretiva(csp, 'frame-ancestors')).toEqual(["'self'"])
    const comApp = cspDaPaginaDeAnuncios(env({ APP_URL: 'https://frasy.com.br/' }))
    expect(diretiva(comApp, 'frame-ancestors')).toEqual(["'self'", 'https://frasy.com.br'])
  })
})
