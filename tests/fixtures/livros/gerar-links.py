#!/usr/bin/env python3
"""
Gera tests/fixtures/livros/links.epub — os LINKS do livro: um externo (`https://links.example/fonte`), um
`javascript:` e um interno (para o fim do capítulo 2). O e2e `tests/e2e/leitor-seguranca.e2e.ts` confere, no
Chromium e no WebKit, que clicar no link nunca navega o iframe do capítulo nem pede nada para fora; o externo só
abre pela folha da palavra ("Abrir link"), em aba nova sem opener; o interno leva ao capítulo 2. CC0.

  python3 tests/fixtures/livros/gerar-links.py
"""
import pathlib
import zipfile

SAIDA = pathlib.Path(__file__).resolve().parent / 'links.epub'

C1 = '''<?xml version="1.0" encoding="utf-8"?>
<!DOCTYPE html>
<html xmlns="http://www.w3.org/1999/xhtml" lang="en" xml:lang="en">
<head><meta charset="utf-8"/><title>Links</title></head>
<body>
<h1>Links chapter</h1>
<p>Read the original at <a id="externo" href="https://links.example/fonte">Wikisource</a> today.</p>
<p>A bad one: <a id="js" href="javascript:window.top.__pwned=1">trap</a>.</p>
<p>Jump to <a id="interno" href="c2.xhtml#fim">ending</a> now.</p>
</body></html>'''

C2 = '''<?xml version="1.0" encoding="utf-8"?>
<!DOCTYPE html>
<html xmlns="http://www.w3.org/1999/xhtml" lang="en" xml:lang="en">
<head><meta charset="utf-8"/><title>Second</title></head>
<body>
<h1>Second chapter</h1>
<p id="fim">The end of the links book.</p>
</body></html>'''

OPF = '''<?xml version="1.0" encoding="utf-8"?>
<package xmlns="http://www.idpf.org/2007/opf" version="3.0" unique-identifier="uid" xml:lang="en">
<metadata xmlns:dc="http://purl.org/dc/elements/1.1/">
<dc:identifier id="uid">urn:uuid:6b8d1f3c-links-0000-0000-000000002026</dc:identifier>
<dc:title>Links test book</dc:title>
<dc:language>en</dc:language>
<dc:rights>CC0 1.0 (test fixture)</dc:rights>
<meta property="dcterms:modified">2026-10-26T00:00:00Z</meta>
</metadata>
<manifest>
<item id="nav" href="nav.xhtml" media-type="application/xhtml+xml" properties="nav"/>
<item id="c1" href="c1.xhtml" media-type="application/xhtml+xml"/>
<item id="c2" href="c2.xhtml" media-type="application/xhtml+xml"/>
</manifest>
<spine><itemref idref="c1"/><itemref idref="c2"/></spine>
</package>'''

NAV = '''<?xml version="1.0" encoding="utf-8"?>
<!DOCTYPE html>
<html xmlns="http://www.w3.org/1999/xhtml" xmlns:epub="http://www.idpf.org/2007/ops" lang="en" xml:lang="en">
<head><meta charset="utf-8"/><title>Contents</title></head>
<body><nav epub:type="toc"><ol><li><a href="c1.xhtml">Links chapter</a></li><li><a href="c2.xhtml">Second chapter</a></li></ol></nav></body></html>'''

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
    escrever('OEBPS/c2.xhtml', C2)
print(SAIDA, SAIDA.stat().st_size, 'bytes')
