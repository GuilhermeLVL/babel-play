/**
 * AS FONTES SÃO DO PRÓPRIO SITE (03/10/2026) — NADA VAI AO GOOGLE FONTS.
 *
 * Antes, o `index.html` pedia 14 famílias a `fonts.googleapis.com`: o Google recebia o IP e o
 * user-agent de cada visitante (LGPD) e a página esperava uma origem de fora para pintar texto.
 * Agora as famílias de base saem de `src/styles/fontes/base.css` (pacotes `@fontsource`, subsets
 * latin e latin-ext) e as de tema/skin carregam sob demanda (`src/lib/fontesDosTemas.ts`).
 */
import { existsSync, readdirSync,readFileSync } from 'node:fs'

import { describe, expect, it } from 'vitest'

import { aplicarUrlPublica } from '../scripts/vite/urlPublica'
import { FONTES_POR_FONTE, FONTES_POR_TEMA } from '../src/lib/fontesDosTemas'

const HTML = readFileSync('index.html', 'utf8')
const CSS = readFileSync('src/index.css', 'utf8')
const HEADERS = readFileSync('public/_headers', 'utf8')
const GOOGLE = /fonts\.(googleapis|gstatic)\.com/

describe('sem Google Fonts', () => {
  it('index.html e public/_headers não citam as origens do Google Fonts', () => {
    expect(HTML).not.toMatch(GOOGLE)
    expect(HEADERS).not.toMatch(GOOGLE)
  })

  it('nem o CSS do app, nem os @font-face próprios, usam @import de fora ou url https', () => {
    expect(CSS).not.toMatch(GOOGLE)
    const dir = 'src/styles/fontes'
    for (const arq of readdirSync(dir)) {
      const css = readFileSync(`${dir}/${arq}`, 'utf8')
      expect(css, arq).not.toMatch(/https?:\/\//)
      expect(css, arq).toContain('font-display: swap')
    }
  })

  it('a troca da URL pública não reintroduz nada', () => {
    expect(aplicarUrlPublica(HTML, undefined)).not.toMatch(GOOGLE)
  })
})

describe('as fontes de base e as de tema existem no próprio site', () => {
  const base = readFileSync('src/styles/fontes/base.css', 'utf8')

  it('base.css traz Inter, Archivo, IBM Plex Mono e Silkscreen, só em latin e latin-ext', () => {
    for (const familia of ['Inter', 'Archivo', 'IBM Plex Mono', 'Silkscreen'])
      expect(base).toContain(`font-family: '${familia}'`)
    expect(base).not.toMatch(/cyrillic|greek|vietnamese/)
  })

  it('todo @font-face aponta para um arquivo que existe no pacote instalado', () => {
    for (const arq of readdirSync('src/styles/fontes')) {
      const css = readFileSync(`src/styles/fontes/${arq}`, 'utf8')
      for (const [, caminho] of css.matchAll(/url\(([^)]+)\)/g)) {
        expect(existsSync(`node_modules/${caminho}`), `${arq}: ${caminho}`).toBe(true)
      }
    }
  })

  it('cada pacote de tema/skin tem o seu CSS, e as famílias de base não se repetem neles', () => {
    const usados = new Set([...Object.values(FONTES_POR_TEMA), ...Object.values(FONTES_POR_FONTE)].flat())
    for (const p of usados) expect(existsSync(`src/styles/fontes/${p}.css`), p).toBe(true)
    for (const p of usados) expect(readFileSync(`src/styles/fontes/${p}.css`, 'utf8')).not.toContain("font-family: 'Inter'")
  })
})

describe('preload das fontes críticas', () => {
  it('acha só Inter e Archivo latin no bundle, em ordem, e ignora as demais', async () => {
    const { fontesCriticas } = await import('../scripts/vite/preCarregarFontes')
    const asset = (fileName: string) => ({ type: 'asset' as const, fileName })
    const achados = fontesCriticas({
      a: asset('assets/archivo-latin-wght-normal-AbC123.woff2'),
      b: asset('assets/inter-latin-ext-wght-normal-ZZZ.woff2'),
      c: asset('assets/inter-latin-wght-normal-Dx4kXJAl.woff2'),
      d: asset('assets/orbitron-latin-wght-normal-Q.woff2'),
      e: { type: 'chunk' as const, fileName: 'assets/inter-latin-wght-normal-X.woff2' },
    })
    expect(achados).toEqual(['assets/inter-latin-wght-normal-Dx4kXJAl.woff2', 'assets/archivo-latin-wght-normal-AbC123.woff2'])
  })
})
