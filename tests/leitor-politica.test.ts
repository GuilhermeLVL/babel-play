// @vitest-environment jsdom
/**
 * A POLÍTICA DE RECURSOS DO LIVRO (revisão de segurança de 26/10/2026): negação por padrão no manifesto do
 * EPUB, marcação farejada mesmo com o tipo errado, link externo só http(s) e a instrução XSLT fora do HTML.
 * O e2e `leitor-seguranca` prova, com o EPUB hostil, que nada disso executa no navegador de verdade.
 */
import { describe, expect, it } from 'vitest'

import { ehRemoto, limparCss, limparHtml } from '../src/lib/leitor/limparHtml'
import { linkExternoSeguro, pareceMarcacao, tipoDaMarcacao, tipoPermitido } from '../src/lib/leitor/politicaDeRecursos'

describe('política de recursos do livro (negação por padrão)', () => {
  it('só (X)HTML, SVG, CSS, imagem, fonte e áudio entram', () => {
    for (const t of [
      'application/xhtml+xml',
      'text/html; charset=utf-8',
      'image/svg+xml',
      'text/css',
      'image/png',
      'font/woff2',
      'application/vnd.ms-opentype',
      'audio/mpeg',
    ])
      expect(tipoPermitido(t), t).toBe(true)
  })

  it('XML, XSLT, JS, SMIL, octet-stream e sem tipo ficam fora', () => {
    for (const t of [
      'application/xml',
      'text/xml',
      'application/xslt+xml',
      'application/javascript',
      'text/javascript',
      'application/smil+xml',
      'application/octet-stream',
      '',
      undefined,
    ])
      expect(tipoPermitido(t), String(t)).toBe(false)
  })

  it('fareja marcação mesmo com o tipo errado', () => {
    expect(pareceMarcacao('\uFEFF  <?xml version="1.0"?><svg/>')).toBe(true)
    expect(pareceMarcacao('<!DOCTYPE html><html>')).toBe(true)
    expect(pareceMarcacao('\x89PNG\r\n')).toBe(false)
    expect(tipoDaMarcacao('<svg xmlns="x">', 'image/png')).toBe('image/svg+xml')
    expect(tipoDaMarcacao('<html>', 'image/png')).toBe('text/html')
  })

  it('link externo: só http(s) com host', () => {
    expect(linkExternoSeguro('https://standardebooks.org/x')).toBe('https://standardebooks.org/x')
    for (const u of [
      'javascript:alert(1)',
      'data:text/html,x',
      'file:///etc/passwd',
      'blob:http://x/y',
      '/relativo',
      'https://',
    ])
      expect(linkExternoSeguro(u), u).toBeNull()
  })

  it('limparHtml tira a instrução xml-stylesheet (XSLT)', () => {
    const x =
      '<?xml version="1.0"?><?xml-stylesheet type="text/xsl" href="evil.xsl"?><html xmlns="http://www.w3.org/1999/xhtml"><body><p>ok</p></body></html>'
    const limpo = limparHtml(x, 'application/xhtml+xml')
    expect(limpo).not.toContain('xml-stylesheet')
    expect(limpo).toContain('<p>ok</p>')
  })
})

describe('privacidade: o livro só carrega o que é dele', () => {
  it('remoto é tudo com esquema que não seja blob:/data:, e o que começa por //', () => {
    for (const u of [
      'https://x.test/a.png',
      'http://x.test',
      '//cdn.x.test/f.woff',
      'ftp://x.test/a',
      'HTTPS://X.TEST',
    ])
      expect(ehRemoto(u), u).toBe(true)
    for (const u of ['blob:http://localhost/abc', 'data:image/png;base64,AA', 'imagens/capa.png', '#nota', '', null])
      expect(ehRemoto(u as string), String(u)).toBe(false)
  })

  it('CSS: url() remoto vira url(""), @import remoto sai; o do livro fica', () => {
    const css = `@import url("https://fonts.x.test/css?f=1");
@import 'http://x.test/b.css';
@import url(blob:http://localhost/ok);
@font-face { font-family: X; src: url(https://fonts.x.test/x.woff2) format('woff2'), url(blob:http://localhost/f) }
body { background: url('//cdn.x.test/bg.png') }
p { background-image: url(data:image/png;base64,AA) }`
    const limpo = limparCss(css)
    expect(limpo).not.toMatch(/x\.test/)
    expect(limpo).toContain('url(blob:http://localhost/ok)')
    expect(limpo).toContain('url(blob:http://localhost/f)')
    expect(limpo).toContain('url(data:image/png;base64,AA)')
  })

  it('HTML: imagem, srcset, poster, áudio, vídeo, SVG <image>, <link> e estilo remotos saem; o link de navegação fica', () => {
    const x = `<?xml version="1.0"?><html xmlns="http://www.w3.org/1999/xhtml" xmlns:xlink="http://www.w3.org/1999/xlink"><head>
      <link rel="stylesheet" href="https://x.test/a.css"/><link rel="preconnect" href="//x.test"/>
      <style>body { background: url(https://x.test/bg.png) }</style></head><body>
      <img src="https://x.test/pixel.png" alt="p"/><img src="blob:http://localhost/capa" alt="c"/>
      <img srcset="https://x.test/a.png 1x, blob:http://localhost/b 2x" alt="s"/>
      <video poster="https://x.test/p.jpg" src="https://x.test/v.mp4"><source src="https://x.test/v.webm"/></video>
      <audio src="//x.test/a.mp3"></audio>
      <svg xmlns="http://www.w3.org/2000/svg"><image href="https://x.test/i.png"/><image xlink:href="https://x.test/j.png"/></svg>
      <p style="background: url('https://x.test/s.png')">texto</p>
      <a href="https://standardebooks.org" ping="https://x.test/ping">fonte</a>
      </body></html>`
    const limpo = limparHtml(x, 'application/xhtml+xml')
    expect(limpo.replace('https://standardebooks.org', '')).not.toMatch(/x\.test/)
    expect(limpo).toContain('src="blob:http://localhost/capa"')
    expect(limpo).toContain('href="https://standardebooks.org"')
    expect(limpo).toContain('texto')
  })
})
