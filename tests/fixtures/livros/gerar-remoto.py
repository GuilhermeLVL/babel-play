#!/usr/bin/env python3
"""
Gera tests/fixtures/livros/remoto.epub — o EPUB que tenta carregar coisas DE FORA (teste de privacidade do leitor).

Cada recurso aponta para `https://rastreio.example/<nome>`: imagem, `srcset`, `poster`, vídeo, áudio, `<source>`,
`<track>`, `<image>` de SVG, `<link>` de folha e de `preconnect`, `@import`, `@font-face`, `background` em
`<style>`, no atributo `style` e na folha do manifesto. O e2e `tests/e2e/leitor-seguranca.e2e.ts` abre o livro e
confere que NENHUM pedido sai da página para um host que não seja o do app. CC0 (fixture de teste).

  python3 tests/fixtures/livros/gerar-remoto.py
"""
import pathlib
import zipfile

SAIDA = pathlib.Path(__file__).resolve().parent / 'remoto.epub'
R = 'https://rastreio.example'

C1 = f'''<?xml version="1.0" encoding="utf-8"?>
<!DOCTYPE html>
<html xmlns="http://www.w3.org/1999/xhtml" xmlns:xlink="http://www.w3.org/1999/xlink" lang="en" xml:lang="en">
<head><meta charset="utf-8"/><title>Private chapter</title>
<link rel="stylesheet" type="text/css" href="estilo.css"/>
<link rel="stylesheet" href="{R}/folha.css"/>
<link rel="preconnect" href="{R}"/>
<style>@import url("{R}/import.css"); body {{ background-image: url({R}/fundo-style.png); }}</style>
</head>
<body>
<h1>Private chapter</h1>
<p>This book must not call anyone outside.</p>
<p><img src="{R}/pixel.png" alt="pixel"/></p>
<p><img src="capa.png" srcset="{R}/srcset.png 2x" alt="capa"/></p>
<p style="background: url('{R}/fundo-atributo.png')">Styled paragraph.</p>
<video poster="{R}/poster.jpg" src="{R}/video.mp4"><source src="{R}/video.webm"/><track src="{R}/legenda.vtt"/></video>
<audio src="{R}/audio.mp3"></audio>
<svg xmlns="http://www.w3.org/2000/svg" width="10" height="10"><image href="{R}/svg-image.png" width="10" height="10"/><image xlink:href="{R}/svg-xlink.png" width="10" height="10"/></svg>
<p>End of the private text.</p>
</body></html>'''

CSS = f'''@import "{R}/import-da-folha.css";
@font-face {{ font-family: Rastreio; src: url({R}/fonte.woff2) format("woff2"); }}
body {{ font-family: Rastreio, serif; }}
h1 {{ background: url("{R}/fundo-folha.png"); }}'''

# PNG de 1x1 (transparente): o recurso INTERNO que tem de continuar carregando.
PNG = bytes.fromhex(
    '89504e470d0a1a0a0000000d4948445200000001000000010806000000'
    '1f15c4890000000d49444154789c6360000002000154a24f5d0000000049454e44ae426082'
)

OPF = '''<?xml version="1.0" encoding="utf-8"?>
<package xmlns="http://www.idpf.org/2007/opf" version="3.0" unique-identifier="uid" xml:lang="en">
<metadata xmlns:dc="http://purl.org/dc/elements/1.1/">
<dc:identifier id="uid">urn:uuid:5a7c0e2b-remote-0000-0000-000000002026</dc:identifier>
<dc:title>Remote resources test book</dc:title>
<dc:language>en</dc:language>
<dc:rights>CC0 1.0 (test fixture)</dc:rights>
<meta property="dcterms:modified">2026-10-26T00:00:00Z</meta>
</metadata>
<manifest>
<item id="nav" href="nav.xhtml" media-type="application/xhtml+xml" properties="nav"/>
<item id="c1" href="c1.xhtml" media-type="application/xhtml+xml" properties="svg"/>
<item id="css" href="estilo.css" media-type="text/css"/>
<item id="capa" href="capa.png" media-type="image/png"/>
</manifest>
<spine><itemref idref="c1"/></spine>
</package>'''

NAV = '''<?xml version="1.0" encoding="utf-8"?>
<!DOCTYPE html>
<html xmlns="http://www.w3.org/1999/xhtml" xmlns:epub="http://www.idpf.org/2007/ops" lang="en" xml:lang="en">
<head><meta charset="utf-8"/><title>Contents</title></head>
<body><nav epub:type="toc"><ol><li><a href="c1.xhtml">Private chapter</a></li></ol></nav></body></html>'''

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
    escrever('OEBPS/capa.png', PNG)
print(SAIDA, SAIDA.stat().st_size, 'bytes')
