#!/usr/bin/env python3
"""
Gera tests/fixtures/livros/burlas.epub — os DESVIOS do filtro de recursos remotos (revisão de segurança de
26/10/2026), um por linha, todos para `https://burla.example/<nome>`:

  url() com escape · @import com escape · esquema com tab · barra invertida · `svg:style` com prefixo ·
  atributo `href` com prefixo de namespace qualquer · SMIL `<set>`/`<animate>` trocando `href` · `image-set()` ·
  escape no esquema dentro da folha do manifesto.

O e2e `tests/e2e/leitor-seguranca.e2e.ts` abre o livro (Chromium e WebKit) e confere que nenhum pedido sai da
página. CC0 (fixture de teste).

  python3 tests/fixtures/livros/gerar-burlas.py
"""
import pathlib
import zipfile

SAIDA = pathlib.Path(__file__).resolve().parent / 'burlas.epub'
B = 'https://burla.example'

C1 = f'''<?xml version="1.0" encoding="utf-8"?>
<!DOCTYPE html>
<html xmlns="http://www.w3.org/1999/xhtml" xmlns:svg="http://www.w3.org/2000/svg" xmlns:xl="http://www.w3.org/1999/xlink" lang="en" xml:lang="en">
<head><meta charset="utf-8"/><title>Bypass chapter</title>
<link rel="stylesheet" type="text/css" href="estilo.css"/>
<style>p.a {{ background: u\\72l({B}/escape-url.png); }}</style>
<style>@im\\70ort "{B}/escape-import.css";</style>
<style>p.b {{ background: url("ht\\74ps://burla.example/escape-esquema.png"); }}</style>
<style>p.c {{ background-image: image-set("{B}/image-set.png" 1x); }}</style>
</head>
<body>
<h1>Bypass chapter</h1>
<p class="a">Nothing here may reach the network.</p>
<p class="b">Escaped scheme.</p>
<p class="c">Image set.</p>
<p><img src="ht&#9;tps://burla.example/tab-esquema.png" alt="tab"/></p>
<p><img src="&#10;https://burla.example/quebra.png" alt="quebra"/></p>
<p><img src="\\\\burla.example\\barra-invertida.png" alt="barra"/></p>
<svg:svg width="10" height="10"><svg:style>rect {{ fill: url({B}/svg-style.png); }}</svg:style><svg:rect width="10" height="10"/></svg:svg>
<svg:svg width="10" height="10"><svg:image xl:href="{B}/prefixo-qualquer.png" width="10" height="10"/></svg:svg>
<svg xmlns="http://www.w3.org/2000/svg" width="10" height="10"><image href="data:," width="10" height="10"><set attributeName="href" to="{B}/smil-set.png"/></image></svg>
<svg xmlns="http://www.w3.org/2000/svg" width="10" height="10"><image href="data:," width="10" height="10"><animate attributeName="href" values="{B}/smil-animate.png" dur="1s"/></image></svg>
<p>End of the bypass text.</p>
</body></html>'''

CSS = f'''body {{ background: url(\\68ttps://burla.example/escape-folha.png); }}
@import url("\\68ttps://burla.example/escape-import-folha.css");
h1 {{ background-image: -webkit-image-set("{B}/webkit-image-set.png" 1x); }}'''

OPF = '''<?xml version="1.0" encoding="utf-8"?>
<package xmlns="http://www.idpf.org/2007/opf" version="3.0" unique-identifier="uid" xml:lang="en">
<metadata xmlns:dc="http://purl.org/dc/elements/1.1/">
<dc:identifier id="uid">urn:uuid:6b8d1f3c-bypass-0000-0000-000000002026</dc:identifier>
<dc:title>Bypass test book</dc:title>
<dc:language>en</dc:language>
<dc:rights>CC0 1.0 (test fixture)</dc:rights>
<meta property="dcterms:modified">2026-10-26T00:00:00Z</meta>
</metadata>
<manifest>
<item id="nav" href="nav.xhtml" media-type="application/xhtml+xml" properties="nav"/>
<item id="c1" href="c1.xhtml" media-type="application/xhtml+xml" properties="svg"/>
<item id="css" href="estilo.css" media-type="text/css"/>
</manifest>
<spine><itemref idref="c1"/></spine>
</package>'''

NAV = '''<?xml version="1.0" encoding="utf-8"?>
<!DOCTYPE html>
<html xmlns="http://www.w3.org/1999/xhtml" xmlns:epub="http://www.idpf.org/2007/ops" lang="en" xml:lang="en">
<head><meta charset="utf-8"/><title>Contents</title></head>
<body><nav epub:type="toc"><ol><li><a href="c1.xhtml">Bypass chapter</a></li></ol></nav></body></html>'''

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
    escrever('OEBPS/estilo.css', CSS)
print(SAIDA, SAIDA.stat().st_size, 'bytes')
