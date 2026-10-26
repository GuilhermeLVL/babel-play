// @vitest-environment jsdom
/**
 * AS PEÇAS DE NAVEGADOR DO LEITOR (L2): a limpeza do HTML do livro (nenhum script do EPUB roda), a frase e a
 * citação de um trecho, o livro de texto (sessão/TXT) e a rota `/leitor`. A estante e a sincronização estão em
 * `leitor-estante.test.ts` (ambiente node: o Blob do jsdom não atravessa o IndexedDB falso).
 */
import { describe, expect, it } from 'vitest'

import { limparHtml } from '../src/lib/leitor/limparHtml'
import { capitulosDoTexto, livroDeTexto, xhtmlDoCapitulo } from '../src/lib/leitor/livroDeTexto'
import { citacaoDoRange, fraseDoRange, palavraEm } from '../src/lib/leitor/selecao'
import { estadoParaUrl, urlParaEstado } from '../src/lib/rotas'

describe('limparHtml (nenhum script do livro roda)', () => {
  it('tira <script>, on*, javascript: e as tags que embutem conteúdo ativo', () => {
    const sujo = `<?xml version="1.0"?><html xmlns="http://www.w3.org/1999/xhtml"><head><script>alert(1)</script></head>
      <body onload="x()"><p onclick="y()">Olá <a href="javascript:z()">link</a> <a href="#n">nota</a></p>
      <iframe src="https://mal.test"></iframe><object data="x.swf"></object><form action="/x"><input/></form>
      <img src="capa.png" onerror="w()"/></body></html>`
    const limpo = limparHtml(sujo, 'application/xhtml+xml')
    expect(limpo).not.toMatch(/<script|onload|onclick|onerror|javascript:|<iframe|<object|<form/i)
    expect(limpo).toContain('Olá')
    expect(limpo).toContain('href="#n"')
    expect(limpo).toContain('src="capa.png"')
  })

  it('HTML que não é XHTML válido também sai limpo', () => {
    const limpo = limparHtml('<p>ok<script>alert(1)</script><svg onload="x()"></svg>', 'text/html')
    expect(limpo).toContain('ok')
    expect(limpo).not.toMatch(/script|onload/i)
  })
})

describe('frase e citação do trecho', () => {
  const doc = new DOMParser().parseFromString(
    '<html><body><h2>Título</h2><p>Era uma vez um gato. O gato <em>dormia</em> no sol. Fim.</p></body></html>',
    'text/html',
  )
  const p = doc.querySelector('p')!
  const textoDe = (n: Node) => n.firstChild!

  it('palavraEm segue o Intl.Segmenter (sem cortar contração nem hífen)', () => {
    expect(palavraEm("l'eau d'abord", 0, 'fr')).toEqual({ inicio: 0, fim: 5 })
    expect(palavraEm('co-operate now', 8, 'en')).not.toBeNull()
    expect(palavraEm('a, b', 1)).toBeNull()
  })

  it('a frase do trecho é a frase do parágrafo, mesmo atravessando o <em>', () => {
    const r = doc.createRange()
    const em = doc.querySelector('em')!
    r.setStart(textoDe(em), 0)
    r.setEnd(textoDe(em), 6)
    expect(fraseDoRange(r, 'pt')).toBe('O gato dormia no sol.')
  })

  it('a citação leva o entorno da seção inteira', () => {
    const r = doc.createRange()
    r.setStart(p.firstChild!, 21)
    r.setEnd(p.firstChild!, 27)
    const c = citacaoDoRange(r)
    expect(c.exact).toBe('O gato')
    expect(c.prefix.endsWith('Era uma vez um gato. ')).toBe(true)
    expect(c.prefix.length).toBeLessThanOrEqual(32)
    expect(c.suffix.startsWith(' dormia')).toBe(true)
  })
})

describe('livro de texto (sessão e TXT)', () => {
  it('o XHTML escapa o texto e cada parágrafo vira <p>', () => {
    const x = xhtmlDoCapitulo({ titulo: 'A & B', paragrafos: ['1 < 2', 'fim'] }, 'pt')
    expect(x).toContain('<h2>A &amp; B</h2><p>1 &lt; 2</p><p>fim</p>')
    expect(new DOMParser().parseFromString(x, 'application/xhtml+xml').querySelector('parsererror')).toBeNull()
  })

  it('TXT: linha em branco separa parágrafo; texto grande vira partes', () => {
    const caps = capitulosDoTexto('um\nlinha\n\ndois\n\n\ntres', 'Parte', 2)
    expect(caps).toEqual([
      { titulo: 'Parte 1', paragrafos: ['um linha', 'dois'] },
      { titulo: 'Parte 2', paragrafos: ['tres'] },
    ])
  })

  it('o livro tem seções que o motor sabe carregar, sumário e href → índice', async () => {
    const l = livroDeTexto({
      titulo: 'T',
      idioma: 'en',
      capitulos: [
        { titulo: 'A', paragrafos: ['x'] },
        { titulo: 'B', paragrafos: ['y'] },
      ],
    })
    expect(l.sections).toHaveLength(2)
    expect(l.toc?.map((x) => x.label)).toEqual(['A', 'B'])
    expect(l.resolveHref?.('cap-1')).toEqual({ index: 1 })
    const d = await l.sections[1].createDocument!()
    expect(d.body?.textContent ?? d.documentElement.textContent).toContain('y')
  })
})

describe('a rota do leitor', () => {
  it('/leitor/<id> faz ida e volta, com o id na caixa original', () => {
    const url = estadoParaUrl({ view: 'leitor', livroId: 'cat:SE-Moby_Dick' })
    expect(url).toBe('/leitor/cat%3ASE-Moby_Dick')
    expect(urlParaEstado(url)).toEqual({ view: 'leitor', livroId: 'cat:SE-Moby_Dick' })
    expect(urlParaEstado('/leitor')).toEqual({ view: 'leitor' })
    expect(urlParaEstado('/leitor/%E0%A4%A')).toEqual({ view: 'leitor' })
  })
})
