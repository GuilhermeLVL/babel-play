// @vitest-environment jsdom
import { readFileSync } from 'node:fs'
import { join } from 'node:path'

import { describe, expect, it } from 'vitest'

import { frasesDoCapituloEpub } from '../scripts/audiolivros/capitulos.mjs'
import { frasesDoDocumento } from '../src/lib/leitor/frasesDoCapitulo'

const XHTML = readFileSync(join(__dirname, 'fixtures/audiolivros/capitulo-paridade.xhtml'), 'utf8')

/** O caminho do app: o documento da seção no navegador (aqui o jsdom) e `frasesDoDocumento`. */
function frasesDoApp(xhtml: string, idioma: string) {
  const doc = new DOMParser().parseFromString(xhtml, 'text/html')
  return frasesDoDocumento(doc, idioma).map((f) => ({ texto: f.texto, fimDeParagrafo: f.fimDeParagrafo ?? false }))
}

describe('paridade das frases entre o gerador (linkedom) e o leitor (DOM do navegador)', () => {
  const app = frasesDoApp(XHTML, 'pt')
  const gerador = frasesDoCapituloEpub(XHTML, 'pt')

  it('a mesma lista de textos e o mesmo fimDeParagrafo', () => {
    expect(app.length).toBeGreaterThan(8)
    expect(gerador).toEqual(app)
  })

  it('script, rt/rp e title ficam de fora; o "* * *" não é lido', () => {
    const tudo = gerador.map((f) => f.texto).join(' ')
    expect(tudo).not.toContain('não ler isto')
    expect(tudo).not.toContain('kan')
    expect(tudo).not.toContain('Capítulo de paridade')
    expect(tudo).not.toContain('* * *')
  })

  it('o diálogo com "--" e o "fim.\\nComeço" sem espaço viram frases próprias', () => {
    const textos = gerador.map((f) => f.texto)
    expect(textos).toContain('--Bom dia, disse ele.')
    expect(textos).toContain('fim.')
    expect(textos.some((t) => t.startsWith('Começo de outra linha'))).toBe(true)
  })

  it('a frase de 900 caracteres vira ≥ 2 pedaços (teto 600) nos dois lados', () => {
    const longa = XHTML.match(/Esta frase é longa[^<]+/)?.[0] ?? ''
    expect(longa.length).toBeGreaterThanOrEqual(900)
    const pedacos = (l: { texto: string }[]) => l.filter((f) => longa.includes(f.texto.slice(0, 40)))
    expect(pedacos(gerador).length).toBeGreaterThanOrEqual(2)
    expect(pedacos(app).length).toBe(pedacos(gerador).length)
    for (const f of gerador) expect(f.texto.length).toBeLessThanOrEqual(600)
  })

  it('o fim de cada parágrafo é marcado', () => {
    const titulo = gerador.findIndex((f) => f.texto.startsWith('DO TÍTULO') || f.texto.includes('DO TÍTULO'))
    expect(titulo).toBeGreaterThanOrEqual(0)
    expect(gerador[titulo].fimDeParagrafo).toBe(true)
    expect(gerador.at(-1)).toEqual({ texto: 'Citação no fim do capítulo.', fimDeParagrafo: true })
  })

  it('documento sem texto dá lista vazia', () => {
    expect(frasesDoCapituloEpub('<html><body><img src="a.png"/></body></html>', 'pt')).toEqual([])
  })
})
