// @vitest-environment jsdom
/**
 * A POLÍTICA DE RECURSOS DO LIVRO (revisão de segurança de 26/10/2026): negação por padrão no manifesto do
 * EPUB, marcação farejada mesmo com o tipo errado, link externo só http(s) e a instrução XSLT fora do HTML.
 * O e2e `leitor-seguranca` prova, com o EPUB hostil, que nada disso executa no navegador de verdade.
 */
import { describe, expect, it } from 'vitest'

import {
  CSP_DO_CAPITULO,
  ehRemoto,
  limparCapitulo,
  limparCss,
  limparSvgDeImagem,
  tipoDeMarcacao,
} from '../src/lib/leitor/limparHtml'
import { linkExternoSeguro, tipoPermitido } from '../src/lib/leitor/politicaDeRecursos'

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

  it('o predicado único: marcação pelo tipo declarado ou, sem ele, pelo começo do conteúdo', () => {
    expect(tipoDeMarcacao('application/xhtml+xml', '')).toBe('xhtml')
    expect(tipoDeMarcacao('text/html; charset=utf-8', '')).toBe('html')
    expect(tipoDeMarcacao('image/svg+xml', '')).toBe('svg')
    expect(tipoDeMarcacao('image/png', '\uFEFF  <?xml version="1.0"?><svg/>')).toBe('svg')
    expect(tipoDeMarcacao('image/png', '<!DOCTYPE html><html>')).toBe('html')
    expect(tipoDeMarcacao('image/png', '\x89PNG\r\n')).toBeNull()
    expect(tipoDeMarcacao('text/css', 'body {}')).toBeNull()
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

  it('o capítulo limpo não leva a instrução xml-stylesheet (XSLT)', () => {
    const x =
      '<?xml version="1.0"?><?xml-stylesheet type="text/xsl" href="evil.xsl"?><html xmlns="http://www.w3.org/1999/xhtml"><body><p>ok</p></body></html>'
    const limpo = limparCapitulo(x, 'xhtml') ?? ''
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

  it('CSS: a declaração que puxa algo de fora sai INTEIRA (falha fechada); o @import remoto sai; o do livro fica', () => {
    const css = `@import url("https://fonts.x.test/css?f=1");
@import 'http://x.test/b.css';
@import url(blob:http://localhost/ok);
@font-face { font-family: X; src: url(https://fonts.x.test/x.woff2) format('woff2'), url(blob:http://localhost/f) }
body { background: url('//cdn.x.test/bg.png') }
p { background-image: url(data:image/png;base64,AA) }`
    const limpo = limparCss(css)
    expect(limpo).not.toMatch(/x\.test/)
    expect(limpo).toContain('url(blob:http://localhost/ok)')
    // A declaração que mistura remoto e interno sai inteira: falhar fechado vale mais que salvar a metade.
    expect(limpo).not.toContain('url(blob:http://localhost/f)')
    expect(limpo).toContain('url(data:image/png;base64,AA)')
  })

  it('HTML: imagem, srcset, poster, áudio, vídeo, SVG <image>, <link> e estilo remotos saem; o link de navegação vira data-href', () => {
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
    const limpo = limparCapitulo(x, 'xhtml') ?? ''
    expect(limpo.replace('https://standardebooks.org', '')).not.toMatch(/x\.test/)
    expect(limpo).toContain('src="blob:http://localhost/capa"')
    expect(limpo).toContain('data-href="https://standardebooks.org"')
    expect(limpo).not.toMatch(/<a [^>]*\shref=/)
    expect(limpo).toContain('texto')
  })
})

describe('os seis desvios da revisão (o filtro falha fechado)', () => {
  it('esquema com controle, tab, quebra e barra invertida é remoto; o que não se entende também', () => {
    for (const u of [
      'ht\ttps://x.test/a',
      '\nhttps://x.test',
      '\u0001https://x.test',
      '\\\\x.test\\a.png',
      'https:\\\\x.test',
      'ja\tvascript:x',
      'http://[::1',
    ])
      expect(ehRemoto(u), JSON.stringify(u)).toBe(true)
    expect(ehRemoto('  blob:http://localhost/a  ')).toBe(false)
  })

  it('CSS com escape: url(), @import, esquema e image-set escondidos saem; o escape de content fica', () => {
    const css = [
      'p { background: u\\72l(https://x.test/a.png) }',
      '@im\\70ort "https://x.test/b.css";',
      'p { background: url("ht\\74ps://x.test/c.png") }',
      'p { background: url(\\68ttps://x.test/d.png) }',
      'p { background-image: image-set("https://x.test/e.png" 1x) }',
      'p { background-image: -webkit-image-set(url(https://x.test/f.png) 1x) }',
      'q::before { content: "\\201C" }',
    ].join('\n')
    const limpo = limparCss(css)
    expect(limpo).not.toMatch(/x\.test/)
    expect(limpo).toContain('content: "\\201C"')
  })

  it('namespace: svg:style com prefixo e href com prefixo qualquer são limpos; SMIL sai', () => {
    const x = `<?xml version="1.0"?><html xmlns="http://www.w3.org/1999/xhtml" xmlns:svg="http://www.w3.org/2000/svg" xmlns:xl="http://www.w3.org/1999/xlink"><head></head><body>
      <svg:svg><svg:style>rect { fill: url(https://x.test/s.png) }</svg:style><svg:image xl:href="https://x.test/p.png"/></svg:svg>
      <svg xmlns="http://www.w3.org/2000/svg"><image href="data:,"><set attributeName="href" to="https://x.test/set.png"/><animate attributeName="href" values="https://x.test/an.png"/></image></svg>
      <p>ok</p></body></html>`
    const limpo = limparCapitulo(x, 'xhtml') ?? ''
    expect(limpo).not.toMatch(/x\.test/)
    expect(limpo).not.toMatch(/<(svg:)?(set|animate)\b/i)
    expect(limpo).toContain('ok')
  })

  it('a CSP do capítulo é o PRIMEIRO filho do <head>; a CSP e o refresh do livro saem; o (X)HTML sai como HTML', () => {
    const x = `<?xml version="1.0"?><html xmlns="http://www.w3.org/1999/xhtml"><head>
      <meta http-equiv="Content-Security-Policy" content="default-src *"/><meta http-equiv="refresh" content="0;url=https://x.test"/>
      <title>t</title></head><body><a id="ancora"/><p>ok</p></body></html>`
    const limpo = limparCapitulo(x, 'xhtml') ?? ''
    expect(limpo.startsWith('<!DOCTYPE html>')).toBe(true)
    const d = new DOMParser().parseFromString(limpo, 'text/html')
    const primeiro = d.head.firstElementChild!
    expect(primeiro.getAttribute('http-equiv')).toBe('Content-Security-Policy')
    expect(primeiro.getAttribute('content')).toBe(CSP_DO_CAPITULO)
    expect(d.querySelectorAll('meta[http-equiv]')).toHaveLength(1)
    // `<a id="x"/>` do XHTML não engole o parágrafo no HTML.
    expect(d.querySelector('a#ancora')?.textContent).toBe('')
    expect(d.querySelector('p')?.textContent).toBe('ok')
  })

  it('a CSP é a da decisão: só blob:/data:, nenhum script', () => {
    expect(CSP_DO_CAPITULO).toBe(
      "default-src 'none'; img-src blob: data:; style-src blob: 'unsafe-inline'; font-src blob: data:; media-src blob: data:; script-src 'none'; object-src 'none'; base-uri 'none'; form-action 'none'",
    )
  })
})

describe('DOMPurify e mXSS (o capítulo sai como HTML montado por nós, com a CSP primeiro)', () => {
  const vivo = (html: string) => {
    const d = new DOMParser().parseFromString(html, 'text/html')
    return {
      d,
      ativo: [...d.querySelectorAll('*')].some(
        (el) =>
          /^(script|iframe|object|embed|base|form)$/i.test(el.localName) ||
          [...el.attributes].some((a) => /^on/i.test(a.name)),
      ),
    }
  }

  it('o <style> do XHTML com </style> dentro não escapa para o HTML (o diferencial XML→HTML)', () => {
    const x = `<?xml version="1.0"?><html xmlns="http://www.w3.org/1999/xhtml"><head><style>p{} &lt;/style&gt;&lt;img src=x onerror=alert(1)&gt;</style></head><body><p>ok</p></body></html>`
    const limpo = limparCapitulo(x, 'xhtml')!
    expect(vivo(limpo).ativo).toBe(false)
    expect(limpo).not.toMatch(/onerror/i)
  })

  it('noscript, xmp, noembed e title com marcação dentro não viram elementos ativos', () => {
    const h = `<!DOCTYPE html><html><head><title>&lt;/title&gt;&lt;img src=x onerror=alert(1)&gt;</title></head><body>
      <noscript><p title="</noscript><img src=x onerror=alert(1)>"></p></noscript>
      <xmp></xmp><img src=x onerror=alert(2)></xmp><noembed><img src=x onerror=alert(3)></noembed>
      <svg><style><img src=x onerror=alert(4)></style></svg>
      <math><mtext><table><mglyph><style><img src=x onerror=alert(5)></style></mglyph></table></mtext></math>
      <p>ok</p></body></html>`
    const limpo = limparCapitulo(h, 'html')!
    const { d, ativo } = vivo(limpo)
    expect(ativo).toBe(false)
    /* O <title> fica, mas só como TEXTO escapado (é inerte): nenhum elemento dentro dele. Fora dele, nada sobra. */
    expect(d.title).toContain('onerror')
    expect(d.head.querySelector('title')?.children.length).toBe(0)
    expect(limpo.replace(/<title>[^<]*<\/title>/, '')).not.toMatch(/onerror/i)
    expect(d.querySelectorAll('img').length).toBe(2)
  })

  it('confusão de namespace no XHTML: script SVG, script com prefixo e html dentro de svg saem', () => {
    const x = `<?xml version="1.0"?><html xmlns="http://www.w3.org/1999/xhtml" xmlns:h="http://www.w3.org/1999/xhtml" xmlns:s="http://www.w3.org/2000/svg"><head></head><body>
      <s:svg><s:script>alert(1)</s:script><s:foreignObject><h:script>alert(2)</h:script><h:img src="x" onerror="alert(3)"/></s:foreignObject></s:svg>
      <h:script>alert(4)</h:script><p>ok</p></body></html>`
    const limpo = limparCapitulo(x, 'xhtml')!
    expect(vivo(limpo).ativo).toBe(false)
    expect(limpo).not.toMatch(/alert/)
    expect(limpo).toContain('ok')
  })

  it('raiz SVG vira HTML com a CSP e sem a imagem remota; outra raiz XML é recusada', () => {
    const svg = `<?xml version="1.0"?><svg xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink"><image href="https://x.test/a.png"/><script>alert(1)</script><text>ok</text></svg>`
    const limpo = limparCapitulo(svg, 'svg')!
    const { d, ativo } = vivo(limpo)
    expect(ativo).toBe(false)
    expect(d.head.firstElementChild?.getAttribute('content')).toBe(CSP_DO_CAPITULO)
    expect(d.querySelector('svg')).not.toBeNull()
    expect(limpo).not.toMatch(/x\.test/)
    expect(limparCapitulo('<?xml version="1.0"?><capitulo><p>x</p></capitulo>', 'xhtml')).toBeNull()
    expect(limparCapitulo('<?xml version="1.0"?><capitulo/>', 'svg')).toBeNull()
  })

  it('a imagem SVG (não capítulo) sai sem script nem recurso remoto e continua SVG', () => {
    const s = limparSvgDeImagem(
      `<svg xmlns="http://www.w3.org/2000/svg"><script>alert(1)</script><image href="https://x.test/b.png"/><rect onload="alert(2)" width="1" height="1"/></svg>`,
    )!
    expect(s).toMatch(/^<svg/)
    expect(s).not.toMatch(/script|onload|x\.test/)
  })

  it('a saída é estável: limpar de novo não muda nada', () => {
    const h = `<!DOCTYPE html><html lang="en"><head><style>p{color:red}</style></head><body class="c"><p>a <a href="https://standardebooks.org">b</a></p></body></html>`
    const um = limparCapitulo(h, 'html')!
    expect(limparCapitulo(um, 'html')).toBe(um)
    expect(um).toContain('lang="en"')
    expect(um).toContain('class="c"')
    expect(um).toContain('data-href="https://standardebooks.org"')
  })
})
