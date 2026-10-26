// @vitest-environment jsdom
/**
 * A POLÍTICA DE RECURSOS DO LIVRO (revisão de segurança de 26/10/2026): negação por padrão no manifesto do
 * EPUB, marcação farejada mesmo com o tipo errado, link externo só http(s) e a instrução XSLT fora do HTML.
 * O e2e `leitor-seguranca` prova, com o EPUB hostil, que nada disso executa no navegador de verdade.
 */
import { describe, expect, it } from 'vitest'

import { limparHtml } from '../src/lib/leitor/limparHtml'
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
