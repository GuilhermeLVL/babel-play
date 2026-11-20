#!/usr/bin/env python3
"""
Gera tests/fixtures/livros/mxss.epub — mXSS e confusão de namespace contra a limpeza do capítulo (DOMPurify):

  · c1.xhtml (XHTML): texto de `<style>`, `<xmp>`, `<noscript>` e `<noembed>` que, serializado como HTML (raw
    text), fecharia o elemento e abriria um `<img onerror>`; `h:script`/`s:script` com prefixo; `<h:img onerror>`
    dentro de `s:foreignObject`; o truque `math > mtext > table > mglyph > style`; imagem remota em `xl:href`.
  · c2.svg (capítulo com RAIZ SVG): `<script>` e `<image>` remota.

Cada vetor tentaria escrever em `window.top.__pwned` ou buscar `https://mxss.example/<nome>`. O e2e
`tests/e2e/leitor-seguranca.e2e.ts` abre o livro (Chromium e WebKit) e confere que nada roda e nenhum pedido sai
da página. CC0 (fixture de teste).

  python3 tests/fixtures/livros/gerar-mxss.py
"""
import pathlib
import zipfile

SAIDA = pathlib.Path(__file__).resolve().parent / 'mxss.epub'
M = 'https://mxss.example'
P = 'window.top.__pwned'

C1 = f'''<?xml version="1.0" encoding="utf-8"?>
<!DOCTYPE html>
<html xmlns="http://www.w3.org/1999/xhtml" xmlns:h="http://www.w3.org/1999/xhtml" xmlns:s="http://www.w3.org/2000/svg" xmlns:xl="http://www.w3.org/1999/xlink" xmlns:m="http://www.w3.org/1998/Math/MathML" lang="en" xml:lang="en">
<head><meta charset="utf-8"/><title>mXSS chapter</title>
<style>p {{ margin: 0 }} &lt;/style&gt;&lt;img src="{M}/style-quebra.png" onerror="{P}='style'"&gt;</style>
</head>
<body>
<h1>mXSS chapter</h1>
<p>The sanitizer must keep this text and nothing active.</p>
<xmp>&lt;/xmp&gt;&lt;img src="{M}/xmp-quebra.png" onerror="{P}='xmp'"&gt;</xmp>
<noscript>&lt;/noscript&gt;&lt;img src="{M}/noscript-quebra.png" onerror="{P}='noscript'"&gt;</noscript>
<noembed>&lt;/noembed&gt;&lt;img src="{M}/noembed-quebra.png" onerror="{P}='noembed'"&gt;</noembed>
<p title="&lt;/p&gt;&lt;img src=x onerror={P}='titulo'&gt;">Attribute text.</p>
<s:svg width="10" height="10"><s:script>{P}='s-script'</s:script><s:style>&lt;/style&gt;&lt;img src="{M}/svg-style.png" onerror="{P}='svg-style'"&gt;</s:style></s:svg>
<h:script>{P}='h-script'</h:script>
<s:svg width="10" height="10"><s:foreignObject width="10" height="10"><h:img src="{M}/foreign.png" onerror="{P}='foreign'"/></s:foreignObject></s:svg>
<s:svg width="10" height="10"><s:image xl:href="{M}/xl-href.png" width="10" height="10"/></s:svg>
<m:math><m:mtext><h:table><m:mglyph><h:style>&lt;img src="{M}/mglyph.png" onerror="{P}='mglyph'"&gt;</h:style></m:mglyph></h:table></m:mtext></m:math>
<p>End of the mXSS text.</p>
</body></html>'''

C2 = f'''<?xml version="1.0" encoding="utf-8"?>
<svg xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink" width="400" height="200" viewBox="0 0 400 200">
<script>{P}='svg-raiz'</script>
<image href="{M}/svg-raiz.png" width="10" height="10"/>
<image xlink:href="{M}/svg-raiz-xlink.png" width="10" height="10"/>
<text x="10" y="50" onclick="{P}='svg-onclick'">SVG root chapter text</text>
</svg>'''

OPF = '''<?xml version="1.0" encoding="utf-8"?>
<package xmlns="http://www.idpf.org/2007/opf" version="3.0" unique-identifier="uid" xml:lang="en">
<metadata xmlns:dc="http://purl.org/dc/elements/1.1/">
<dc:identifier id="uid">urn:uuid:6b8d1f3c-mxss-0000-0000-000000002026</dc:identifier>
<dc:title>mXSS test book</dc:title>
<dc:language>en</dc:language>
<dc:rights>CC0 1.0 (test fixture)</dc:rights>
<meta property="dcterms:modified">2026-10-26T00:00:00Z</meta>
</metadata>
<manifest>
<item id="nav" href="nav.xhtml" media-type="application/xhtml+xml" properties="nav"/>
<item id="c1" href="c1.xhtml" media-type="application/xhtml+xml" properties="svg mathml"/>
<item id="c2" href="c2.svg" media-type="image/svg+xml"/>
</manifest>
<spine><itemref idref="c1"/><itemref idref="c2"/></spine>
</package>'''

NAV = '''<?xml version="1.0" encoding="utf-8"?>
<!DOCTYPE html>
<html xmlns="http://www.w3.org/1999/xhtml" xmlns:epub="http://www.idpf.org/2007/ops" lang="en" xml:lang="en">
<head><meta charset="utf-8"/><title>Contents</title></head>
<body><nav epub:type="toc"><ol><li><a href="c1.xhtml">mXSS chapter</a></li><li><a href="c2.svg">SVG chapter</a></li></ol></nav></body></html>'''

CONTAINER = '''<?xml version="1.0" encoding="utf-8"?>
<container version="1.0" xmlns="urn:oasis:names:tc:opendocument:xmlns:container">
<rootfiles><rootfile full-path="OEBPS/content.opf" media-type="application/oebps-package+xml"/></rootfiles>
</container>'''

with zipfile.ZipFile(SAIDA, 'w') as z:
    DATA = (2026, 10, 26, 0, 0, 0)

    def escrever(nome, conteudo, comprimir=True):
        info = zipfile.ZipInfo(nome, date_time=DATA)
        info.compress_type = zipfile.ZIP_DEFLATED if comprimir else zipfile.ZIP_STORED
        z.writestr(info, conteudo)

    escrever('mimetype', 'application/epub+zip', comprimir=False)
    escrever('META-INF/container.xml', CONTAINER)
    escrever('OEBPS/content.opf', OPF)
    escrever('OEBPS/nav.xhtml', NAV)
    escrever('OEBPS/c1.xhtml', C1)
    escrever('OEBPS/c2.svg', C2)
print(SAIDA, SAIDA.stat().st_size, 'bytes')
