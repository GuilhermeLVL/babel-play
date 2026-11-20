#!/usr/bin/env python3
"""
Gera tests/fixtures/livros/fabulas-cc0.epub — o EPUB minúsculo dos testes do leitor (L2).

Texto: fábulas de Esopo (domínio público), recontadas em inglês simples para este arquivo e dedicadas
ao domínio público (CC0 1.0). EPUB 3: `mimetype` primeiro e sem compressão, OPF, nav e dois capítulos com
texto bastante para paginar no celular. Datas fixas: rodar de novo gera o mesmo arquivo.

  python3 tests/fixtures/livros/gerar-fabulas.py
"""
import pathlib
import zipfile

SAIDA = pathlib.Path(__file__).resolve().parent / 'fabulas-cc0.epub'

FABULAS = {
    'The Fox and the Grapes': [
        'One hot summer day a hungry fox was walking through an orchard. He saw a bunch of ripe grapes hanging from a high branch.',
        'The fox jumped as high as he could, but he did not reach the grapes. He walked back, ran, and jumped again. He missed again.',
        'He tried many times until his legs were tired. At last he walked away with his nose in the air.',
        '"I am sure those grapes are sour," he said. It is easy to despise what you cannot have.',
    ],
    'The Tortoise and the Hare': [
        'A hare was always laughing at a tortoise because the tortoise was so slow. One day the tortoise said, "Let us run a race."',
        'The hare agreed at once. He ran far ahead, and then he stopped under a tree. "I have plenty of time," he thought, and he fell asleep.',
        'The tortoise kept walking, slowly and steadily, step after step. He passed the sleeping hare and did not stop.',
        'When the hare woke up, the tortoise was already near the finish line. The hare ran as fast as he could, but it was too late.',
        'Slow and steady wins the race.',
    ],
    'The Lion and the Mouse': [
        'A lion was sleeping in the forest when a little mouse ran across his face. The lion woke up and caught the mouse under his paw.',
        '"Please let me go," said the mouse. "One day I will help you." The lion laughed, because a mouse could never help a lion, but he let it go.',
        "Some days later the lion was caught in a hunter's net. He roared and pulled, but the ropes were too strong.",
        'The mouse heard the roar and came running. It bit the ropes, one by one, until the lion was free.',
        '"You laughed at me," said the mouse, "but now you know that even a little mouse can help a lion." No act of kindness is ever wasted.',
    ],
    'The Crow and the Pitcher': [
        'A thirsty crow found a pitcher with a little water at the bottom. The crow put its beak into the pitcher, but the water was too low.',
        'The crow tried to push the pitcher over, but it was too heavy. Then the crow had an idea.',
        'It picked up a small stone and dropped it into the pitcher. Then another stone, and another. Slowly the water came up.',
        'At last the water was high enough, and the crow could drink. Little by little does the trick.',
    ],
    'The Ant and the Grasshopper': [
        'All summer long the grasshopper sang in the sun, while the ant carried grain to its nest, one piece at a time.',
        '"Why do you work so hard?" asked the grasshopper. "Come and sing with me." The ant said, "I am saving food for the winter."',
        'When winter came, the fields were white with snow. The grasshopper had nothing to eat, and it was very cold.',
        'It went to the ant and asked for some grain. There is a time for work and a time for play.',
    ],
    'The North Wind and the Sun': [
        'The north wind and the sun argued about which of them was stronger. They saw a traveller walking along the road in a warm coat.',
        '"Whoever makes him take off his coat is the stronger," said the sun. The wind blew as hard as it could, but the traveller held his coat tighter.',
        'Then the sun shone gently. The traveller grew warm, and soon he took off his coat and sat in the shade.',
        'Gentle persuasion often does more than force.',
    ],
}

ITENS = list(FABULAS.items())
CAPITULOS = [('Part One', ITENS[:3]), ('Part Two', ITENS[3:])]


def xhtml(titulo, fabulas):
    corpo = ''.join(
        f'<section><h2>{t}</h2>' + ''.join(f'<p>{p}</p>' for p in ps) + '</section>' for t, ps in fabulas
    )
    return f'''<?xml version="1.0" encoding="utf-8"?>
<!DOCTYPE html>
<html xmlns="http://www.w3.org/1999/xhtml" xmlns:epub="http://www.idpf.org/2007/ops" lang="en" xml:lang="en">
<head><meta charset="utf-8"/><title>{titulo}</title></head>
<body><h1>{titulo}</h1>{corpo}</body></html>'''


OPF = '''<?xml version="1.0" encoding="utf-8"?>
<package xmlns="http://www.idpf.org/2007/opf" version="3.0" unique-identifier="uid" xml:lang="en">
<metadata xmlns:dc="http://purl.org/dc/elements/1.1/">
<dc:identifier id="uid">urn:uuid:4f0c8f0e-5c0a-4d55-9c1e-0f5a5b1e2026</dc:identifier>
<dc:title>Aesop's Fables (tiny edition)</dc:title>
<dc:creator>Aesop</dc:creator>
<dc:language>en</dc:language>
<dc:rights>Public domain. Retold for the Frasy test suite and dedicated to the public domain (CC0 1.0).</dc:rights>
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
<body><nav epub:type="toc"><h1>Contents</h1><ol>
<li><a href="c1.xhtml">Part One</a></li>
<li><a href="c2.xhtml">Part Two</a></li>
</ol></nav></body></html>'''

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
    for i, (titulo, fabulas) in enumerate(CAPITULOS, 1):
        escrever(f'OEBPS/c{i}.xhtml', xhtml(titulo, fabulas))
print(SAIDA, SAIDA.stat().st_size, 'bytes')
