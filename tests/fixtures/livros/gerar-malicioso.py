#!/usr/bin/env python3
"""
Gera tests/fixtures/livros/malicioso.epub — o EPUB HOSTIL dos testes de segurança do leitor (L2).

Cada vetor tenta escrever em `window.parent.__pwned` (ou `window.top.__pwned`) com um nome próprio; o e2e
`tests/e2e/leitor-seguranca.e2e.ts` abre o livro, passa pelos dois capítulos, clica no link `javascript:` e
confere que `__pwned` continua `undefined`. Vetores: `<script>` inline, `<script src>` do manifesto, `onload`
no body, `onerror` em imagem, link `javascript:`, `<script>` dentro de SVG inline, SVG com script (como
imagem, `<object>` e `<iframe>`), `<iframe srcdoc>`, um capítulo XML com XSLT e o próprio XSL no manifesto.

  python3 tests/fixtures/livros/gerar-malicioso.py
"""
import pathlib
import zipfile

SAIDA = pathlib.Path(__file__).resolve().parent / 'malicioso.epub'

P = "(window.top.__pwned = (window.top.__pwned || []).concat('{v}'))"

C1 = f'''<?xml version="1.0" encoding="utf-8"?>
<?xml-stylesheet type="text/xsl" href="evil.xsl"?>
<!DOCTYPE html>
<html xmlns="http://www.w3.org/1999/xhtml" lang="en" xml:lang="en">
<head><meta charset="utf-8"/><title>Safe chapter</title>
<script>{P.format(v='script-inline')}</script>
<script src="evil.js"></script>
</head>
<body onload="{P.format(v='onload')}">
<h1>Safe chapter</h1>
<p>This is the safe text of the hostile book.</p>
<p><img src="nao-existe.png" alt="x" onerror="{P.format(v='onerror')}"/></p>
<p><a id="link-js" href="javascript:{P.format(v='javascript-link')}">javascript link</a></p>
<svg xmlns="http://www.w3.org/2000/svg" width="10" height="10"><script>{P.format(v='svg-inline')}</script><rect width="10" height="10"/></svg>
<p><img src="evil.svg" alt="svg"/></p>
<object data="evil.svg" type="image/svg+xml"></object>
<iframe src="evil.svg"></iframe>
<iframe srcdoc="&lt;script&gt;{P.format(v='srcdoc')}&lt;/script&gt;"></iframe>
<p>End of the safe text.</p>
</body></html>'''

EVIL_JS = P.format(v='script-src') + ';'
EVIL_SVG = f'''<?xml version="1.0" encoding="utf-8"?>
<svg xmlns="http://www.w3.org/2000/svg" width="10" height="10" onload="{P.format(v='svg-file-onload')}">
<script>{P.format(v='svg-file')}</script><rect width="10" height="10"/></svg>'''
EVIL_XSL = f'''<?xml version="1.0" encoding="utf-8"?>
<xsl:stylesheet version="1.0" xmlns:xsl="http://www.w3.org/1999/XSL/Transform" xmlns="http://www.w3.org/1999/xhtml">
<xsl:template match="/"><html><body><p>xslt</p><script>{P.format(v='xslt')}</script></body></html></xsl:template>
</xsl:stylesheet>'''
C2_XML = '''<?xml version="1.0" encoding="utf-8"?>
<?xml-stylesheet type="text/xsl" href="evil.xsl"?>
<capitulo><p>xml chapter</p></capitulo>'''

OPF = '''<?xml version="1.0" encoding="utf-8"?>
<package xmlns="http://www.idpf.org/2007/opf" version="3.0" unique-identifier="uid" xml:lang="en">
<metadata xmlns:dc="http://purl.org/dc/elements/1.1/">
<dc:identifier id="uid">urn:uuid:0b1f7c2e-hostile-0000-0000-000000002026</dc:identifier>
<dc:title>Hostile test book</dc:title>
<dc:language>en</dc:language>
<dc:rights>CC0 1.0 (test fixture)</dc:rights>
<meta property="dcterms:modified">2026-10-26T00:00:00Z</meta>
</metadata>
<manifest>
<item id="nav" href="nav.xhtml" media-type="application/xhtml+xml" properties="nav"/>
<item id="c1" href="c1.xhtml" media-type="application/xhtml+xml" properties="scripted svg"/>
<item id="c2" href="c2.xml" media-type="application/xml"/>
<item id="js" href="evil.js" media-type="application/javascript"/>
<item id="svg" href="evil.svg" media-type="image/svg+xml"/>
<item id="xsl" href="evil.xsl" media-type="application/xslt+xml"/>
</manifest>
<spine><itemref idref="c1"/><itemref idref="c2"/></spine>
</package>'''

NAV = '''<?xml version="1.0" encoding="utf-8"?>
<!DOCTYPE html>
<html xmlns="http://www.w3.org/1999/xhtml" xmlns:epub="http://www.idpf.org/2007/ops" lang="en" xml:lang="en">
<head><meta charset="utf-8"/><title>Contents</title></head>
<body><nav epub:type="toc"><ol><li><a href="c1.xhtml">Safe chapter</a></li><li><a href="c2.xml">XML</a></li></ol></nav></body></html>'''

CONTAINER = '''<?xml version="1.0" encoding="utf-8"?>
<container version="1.0" xmlns="urn:oasis:names:tc:opendocument:xmlns:container">
<rootfiles><rootfile full-path="OEBPS/content.opf" media-type="application/oebps-package+xml"/></rootfiles>
</container>'''

with zipfile.ZipFile(SAIDA, 'w') as z:
    DATA = (2026, 10, 26, 0, 0, 0)

    def escrever(nome, texto, comprimir=True):
        info = zipfile.ZipInfo(nome, date_time=DATA)
        info.compress_type = zipfile.ZIP_DEFLATED if comprimir else zipfile.ZIP_STORED
        z.writestr(info, texto)

    escrever('mimetype', 'application/epub+zip', comprimir=False)
    escrever('META-INF/container.xml', CONTAINER)
    escrever('OEBPS/content.opf', OPF)
    escrever('OEBPS/nav.xhtml', NAV)
    escrever('OEBPS/c1.xhtml', C1)
    escrever('OEBPS/c2.xml', C2_XML)
    escrever('OEBPS/evil.js', EVIL_JS)
    escrever('OEBPS/evil.svg', EVIL_SVG)
    escrever('OEBPS/evil.xsl', EVIL_XSL)
print(SAIDA, SAIDA.stat().st_size, 'bytes')
