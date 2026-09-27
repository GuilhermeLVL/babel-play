/**
 * AS FONTES DO GOOGLE SÃO DESCOBERTAS PELO HTML (auditoria de performance do frontend, 26/09/2026).
 *
 * Elas eram um `@import url(...)` na primeira linha de `src/index.css`. Um `@import` dentro de uma
 * folha só é visto DEPOIS que a folha chega e é lida: a cadeia era HTML → CSS do app → CSS do
 * Google (outra origem: DNS + TLS) → arquivos de fonte, tudo em série, antes do texto pintar com a
 * fonte certa. Com o `<link>` no `index.html` (e o `preconnect` para as duas origens), a folha do
 * Google desce EM PARALELO com a do app. As famílias, os pesos e o `display=swap` são os mesmos —
 * a aparência não muda, só a ordem da rede.
 */
import { readFileSync } from 'node:fs'

import { describe, expect, it } from 'vitest'

import { aplicarUrlPublica } from '../scripts/vite/urlPublica'

const HTML = readFileSync('index.html', 'utf8')
const CSS = readFileSync('src/index.css', 'utf8')

describe('fontes do Google', () => {
  it('não são mais @import no CSS do app', () => {
    expect(CSS).not.toMatch(/@import\s+url\(['"]?https:\/\/fonts\.googleapis\.com/)
  })

  it('o index.html abre as duas origens cedo e pede a folha com display=swap', () => {
    expect(HTML).toMatch(/<link rel="preconnect" href="https:\/\/fonts\.googleapis\.com"\s*\/?>/)
    expect(HTML).toMatch(/<link rel="preconnect" href="https:\/\/fonts\.gstatic\.com" crossorigin\s*\/?>/)
    const folha = /<link rel="stylesheet" href="(https:\/\/fonts\.googleapis\.com\/css2\?[^"]+)"/.exec(HTML)?.[1]
    expect(folha).toBeTruthy()
    expect(folha).toContain('display=swap')
    // As famílias dos temas continuam todas lá — tirar uma mudaria a aparência de um tema.
    for (const familia of ['Inter', 'Archivo', 'IBM+Plex+Mono', 'Geist', 'Silkscreen', 'Caveat', 'Merriweather'])
      expect(folha).toContain(`family=${familia}`)
  })

  it('a troca da URL pública não mexe nelas', () => {
    const saida = aplicarUrlPublica(HTML, undefined)
    expect(saida).toContain('https://fonts.googleapis.com/css2?')
    expect(saida).toContain('rel="preconnect"')
  })
})
