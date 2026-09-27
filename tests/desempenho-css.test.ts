/**
 * AS REGRAS DE DESEMPENHO DE RENDERIZAÇÃO (auditoria de performance do frontend, 26/09/2026) —
 * `src/styles/desempenho.css`. O ganho é medido por `scripts/perf/telas/medir-telas.mjs` (INP da
 * troca de aba da Loja); aqui fica travado o que produz o ganho, para ninguém tirar sem saber.
 */
import { readFileSync } from 'node:fs'

import { describe, expect, it } from 'vitest'

const CSS = readFileSync('src/styles/desempenho.css', 'utf8').replace(/\/\*[\s\S]*?\*\//g, '')
const MAIN = readFileSync('src/main.tsx', 'utf8')

function regra(seletor: string): string {
  const i = CSS.indexOf(`${seletor} {`)
  return i < 0 ? '' : CSS.slice(i, CSS.indexOf('}', i))
}

describe('desempenho.css', () => {
  it('as peças de Personalizar/Loja só são diagramadas quando chegam perto da tela', () => {
    const r = regra('.cartao.peca')
    expect(r).toMatch(/content-visibility:\s*auto/)
    // Sem o tamanho intrínseco a barra de rolagem salta; `auto` guarda a altura real medida.
    expect(r).toMatch(/contain-intrinsic-size:\s*auto\s+\d+px/)
  })

  it('é carregado DEPOIS do CSS do protótipo (o desenho vem de lá; esta folha só acrescenta)', () => {
    const iPrototipo = MAIN.indexOf("import './styles/prototipo-app.css'")
    const iDesempenho = MAIN.indexOf("import './styles/desempenho.css'")
    expect(iPrototipo).toBeGreaterThan(-1)
    expect(iDesempenho).toBeGreaterThan(iPrototipo)
  })

  it('não mexe em cor, fonte, borda, sombra nem espaçamento', () => {
    expect(CSS).not.toMatch(/\b(color|background|font|border|box-shadow|margin|padding|width|height)\s*:/)
  })
})
