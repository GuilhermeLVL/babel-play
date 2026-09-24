/**
 * `index.html:23` cravava `https://babel-play.pages.dev/` no canonical e no og — o endereço da
 * edição leve encerrada. Agora ele vem de `VITE_PUBLIC_URL` no build, ou some.
 */
import { readFileSync } from 'node:fs'

import { describe, expect, it } from 'vitest'

import { aplicarUrlPublica, MARCA_DA_URL } from '../scripts/vite/urlPublica'

const HTML = readFileSync('index.html', 'utf8')

describe('URL pública no index.html', () => {
  it('o index.html não crava mais domínio nenhum', () => {
    expect(HTML).not.toContain('pages.dev')
    expect(HTML).toContain(MARCA_DA_URL)
  })

  it('com VITE_PUBLIC_URL, canonical e og apontam para ela (sem barra dupla)', () => {
    const saida = aplicarUrlPublica(HTML, 'https://babelplay.com.br/')
    expect(saida).toContain('<link rel="canonical" href="https://babelplay.com.br/" />')
    expect(saida).toContain('content="https://babelplay.com.br/og.png"')
    expect(saida).not.toContain(MARCA_DA_URL)
  })

  it('sem VITE_PUBLIC_URL, as marcações de URL absoluta saem — o resto fica', () => {
    const saida = aplicarUrlPublica(HTML, undefined)
    expect(saida).not.toContain(MARCA_DA_URL)
    expect(saida).not.toContain('rel="canonical"')
    expect(saida).not.toContain('og:url')
    expect(saida).toContain('og:title')
    expect(saida).toContain('<div id="root"></div>')
  })

  it('URL que não é https conta como ausente', () => {
    expect(aplicarUrlPublica(HTML, 'http://inseguro.com')).not.toContain('rel="canonical"')
    expect(aplicarUrlPublica(HTML, 'lixo')).not.toContain('rel="canonical"')
  })
})
