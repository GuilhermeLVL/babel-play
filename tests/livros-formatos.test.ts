// @vitest-environment jsdom
/**
 * OS FORMATOS DE "TRAZER O SEU": detecção pelo CONTEÚDO (não pela extensão), DRM, codificação do TXT, conversão
 * de HTML/Markdown/DOCX/MHTML em capítulos, e a leitura de verdade de MOBI/FB2/CBZ pelo motor (foliate-js).
 * Os arquivos são construídos em `tests/harness/formatosDeTeste.ts`; nenhum livro real nem protegido.
 */
import { File as ArquivoDoNode } from 'node:buffer'

import { strToU8, zipSync } from 'fflate'
import { describe, expect, it } from 'vitest'

import { dividirEmCapitulos } from '../src/core/livros/capitulosDeTexto'
import { formatoDoZip, formatoPeloConteudo, mobiTemDrm, reconhecerPeloConteudo } from '../src/core/livros/formatos'
import { ErroDoLivro } from '../src/core/livros/trazer'
import {
  decodificarTexto,
  docxEmCapitulos,
  htmlDoMhtml,
  htmlEmCapitulos,
  markdownEmCapitulos,
} from '../src/lib/import/documentosEmCapitulos'
import { lerArquivoTrazido } from '../src/lib/livros/trazer'
import {
  cbzMinimo,
  docxMinimo,
  epubMinimo,
  fb2Minimo,
  mhtmlMinimo,
  mobiMinimo,
  TEXTO_DO_LIVRO,
} from './harness/formatosDeTeste'

const rotulo = (i: number) => `Parte ${i + 1}`
const bytes = (s: string) => new TextEncoder().encode(s)
/** O `File` do Node (o do jsdom não tem `stream()`), tipado como o do navegador. */
const arq = (conteudo: Uint8Array | string, nome: string) => new ArquivoDoNode([conteudo], nome) as unknown as File

describe('reconhecerPeloConteudo: pela assinatura, nunca pela extensão', () => {
  it.each([
    ['zip', new Uint8Array([0x50, 0x4b, 0x03, 0x04, 0, 0]), 'zip'],
    ['pdf', bytes('%PDF-1.7\n...'), 'pdf'],
    ['mobi', mobiMinimo(), 'mobi'],
    ['fb2', fb2Minimo(), 'fb2'],
    ['html', bytes('<!DOCTYPE html><html><body><p>oi</p></body></html>'), 'html'],
    ['html sem doctype', bytes('<html><body>oi</body></html>'), 'html'],
    ['txt', bytes('Capítulo 1\n\nEra uma vez.'), 'txt'],
    ['txt utf-16', new Uint8Array([0xff, 0xfe, 0x41, 0x00, 0x42, 0x00]), 'txt'],
  ])('%s', (_nome, conteudo, esperado) => {
    expect(formatoPeloConteudo(conteudo)).toBe(esperado)
  })

  it('a extensão só desempata texto puro: .md vira Markdown, e um .pdf que é texto é TXT', () => {
    expect(formatoPeloConteudo(bytes('# Título\n\ntexto'), 'a.md')).toBe('md')
    expect(formatoPeloConteudo(bytes('# Título\n\ntexto'), 'a.txt')).toBe('txt')
    expect(formatoPeloConteudo(bytes('só texto'), 'falso.pdf')).toBe('txt')
    expect(formatoPeloConteudo(mobiMinimo(), 'renomeado.txt')).toBe('mobi')
  })

  it('formatos conhecidos que não abrimos voltam com o NOME, para a frase útil', () => {
    const doc = new Uint8Array([0xd0, 0xcf, 0x11, 0xe0, 0xa1, 0xb1, 0x1a, 0xe1, 0, 0])
    expect(reconhecerPeloConteudo(doc)).toMatchObject({ ok: false, motivo: 'formato', nome: 'DOC' })
    expect(reconhecerPeloConteudo(bytes('{\\rtf1\\ansi texto}'))).toMatchObject({ nome: 'RTF' })
    expect(reconhecerPeloConteudo(bytes('AT&TFORM....DJVM'))).toMatchObject({ nome: 'DJVU' })
    expect(reconhecerPeloConteudo(bytes('Rar!\x1a\x07\x00'))).toMatchObject({ nome: 'RAR (CBR)' })
    expect(reconhecerPeloConteudo(new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0, 0, 0]))).toMatchObject({ nome: 'imagem' })
  })

  it('binário desconhecido e vazio são recusados; Kindle fechado (KFX, Topaz) conta como proteção', () => {
    expect(reconhecerPeloConteudo(new Uint8Array([1, 2, 3, 0, 5]))).toMatchObject({ ok: false, motivo: 'formato' })
    expect(reconhecerPeloConteudo(new Uint8Array())).toMatchObject({ ok: false, motivo: 'vazio' })
    expect(reconhecerPeloConteudo(new Uint8Array([0x43, 0x4f, 0x4e, 0x54, 2, 0, 0, 0]))).toMatchObject({
      motivo: 'drm',
    })
    expect(reconhecerPeloConteudo(bytes('TPZ0\x03'))).toMatchObject({ motivo: 'drm' })
  })
})

describe('formatoDoZip', () => {
  it('EPUB, DOCX, CBZ e FB2.zip pelo que há dentro', () => {
    expect(formatoDoZip(['mimetype', 'META-INF/container.xml', 'OEBPS/a.xhtml'])).toMatchObject({ formato: 'epub' })
    expect(formatoDoZip(['[Content_Types].xml', 'word/document.xml'])).toMatchObject({ formato: 'docx' })
    expect(formatoDoZip(['001.jpg', '002.JPG', '__MACOSX/._001.jpg'])).toMatchObject({ formato: 'cbz' })
    expect(formatoDoZip(['livro.fb2'])).toMatchObject({ formato: 'fb2' })
  })
  it('ODT e zip qualquer não são aceitos e dizem o nome', () => {
    expect(formatoDoZip(['mimetype', 'content.xml', 'META-INF/manifest.xml'])).toMatchObject({ ok: false, nome: 'ODT' })
    expect(formatoDoZip(['a.bin'])).toMatchObject({ ok: false, nome: 'ZIP' })
  })
})

describe('DRM do MOBI/AZW (só reconhecer e recusar)', () => {
  it('mobiTemDrm: encryption 0 não, 1 e 2 sim; cabeça curta não decide', () => {
    expect(mobiTemDrm(mobiMinimo())).toBe(false)
    expect(mobiTemDrm(mobiMinimo({ encryption: 1 }))).toBe(true)
    expect(mobiTemDrm(mobiMinimo({ encryption: 2 }))).toBe(true)
    expect(mobiTemDrm(mobiMinimo({ encryption: 2 }).slice(0, 90))).toBe(false)
    expect(mobiTemDrm(bytes('texto qualquer'))).toBe(false)
  })

  it('MOBI com encryption != 0 é recusado com o motivo drm, antes de abrir o livro', async () => {
    await expect(lerArquivoTrazido(arq(mobiMinimo({ encryption: 2 }), 'comprado.azw3'), rotulo)).rejects.toMatchObject({
      motivo: 'drm',
    })
  })

  it('o motor também recusa (defesa em profundidade): DRMError no mobi.js', async () => {
    const { MOBI } = await import('../src/lib/leitor/foliate/mobi.js')
    const { unzlibSync } = await import('fflate')
    await expect(
      new MOBI({ unzlib: unzlibSync }).open(new File([mobiMinimo({ encryption: 1 }).slice().buffer], 'x.mobi')),
    ).rejects.toMatchObject({ name: 'DRMError' })
  })

  it('KFX é recusado como proteção', async () => {
    await expect(
      lerArquivoTrazido(arq(new Uint8Array([0x43, 0x4f, 0x4e, 0x54, 2, 0, 0, 0, 9]), 'livro.kfx'), rotulo),
    ).rejects.toMatchObject({ motivo: 'drm' })
  })
})

describe('lerArquivoTrazido: cada formato abre (ou é recusado com motivo próprio)', () => {
  it('MOBI sem proteção abre no motor, com título', async () => {
    const lido = await lerArquivoTrazido(arq(mobiMinimo({ titulo: 'Meu Mobi' }), 'x.mobi'), rotulo)
    expect(lido).toMatchObject({ formato: 'mobi', titulo: 'Meu Mobi' })
    expect(lido.arquivo?.size).toBeGreaterThan(0)
  })

  it('MOBI com a extensão trocada para .txt ainda é MOBI', async () => {
    const lido = await lerArquivoTrazido(arq(mobiMinimo(), 'disfarçado.txt'), rotulo)
    expect(lido.formato).toBe('mobi')
  })

  it('FB2 abre no motor com título e autor', async () => {
    const lido = await lerArquivoTrazido(arq(fb2Minimo({ titulo: 'Meu FB2' }), 'x.fb2'), rotulo)
    expect(lido).toMatchObject({ formato: 'fb2', titulo: 'Meu FB2' })
    expect(lido.autor).toMatch(/Autora/)
  })

  it('FB2 dentro de um zip (.fb2.zip) também', async () => {
    const z = zipSync({ 'livro.fb2': fb2Minimo({ titulo: 'Zipado' }) })
    expect((await lerArquivoTrazido(arq(z, 'x.fb2.zip'), rotulo)).formato).toBe('fb2')
  })

  it('CBZ abre no motor; o título é o nome do arquivo', async () => {
    const lido = await lerArquivoTrazido(arq(cbzMinimo(), 'Gibi Legal.cbz'), rotulo)
    expect(lido).toMatchObject({ formato: 'cbz', titulo: 'Gibi Legal' })
  })

  it('CBZ renomeado para .zip continua CBZ (conteúdo manda)', async () => {
    expect((await lerArquivoTrazido(arq(cbzMinimo(), 'gibi.zip'), rotulo)).formato).toBe('cbz')
  })

  it('EPUB segue funcionando', async () => {
    const lido = await lerArquivoTrazido(arq(epubMinimo(), 'a.epub'), rotulo)
    expect(lido).toMatchObject({ formato: 'epub', titulo: 'Livro EPUB de Teste' })
  })

  it('zip que não é livro: formato não aceito com o nome', async () => {
    const z = zipSync({ 'a.bin': strToU8('x') })
    await expect(lerArquivoTrazido(arq(z, 'a.zip'), rotulo)).rejects.toMatchObject({
      motivo: 'formato',
      message: 'ZIP',
    })
  })

  it('DOC antigo: formato não aceito, com o nome', async () => {
    const doc = new Uint8Array([0xd0, 0xcf, 0x11, 0xe0, 0xa1, 0xb1, 0x1a, 0xe1, 0, 0, 0])
    const erro = await lerArquivoTrazido(arq(doc, 'velho.doc'), rotulo).catch((e: unknown) => e)
    expect(erro).toBeInstanceOf(ErroDoLivro)
    expect(erro).toMatchObject({ motivo: 'formato', message: 'DOC' })
  })

  it('MOBI corrompido (cabeçalho sem registros) vira "corrompido"', async () => {
    const quebrado = mobiMinimo().slice(0, 100)
    await expect(lerArquivoTrazido(arq(quebrado, 'quebrado.mobi'), rotulo)).rejects.toMatchObject({
      motivo: 'corrompido',
    })
  })

  it('arquivo vazio, e documento acima do teto', async () => {
    await expect(lerArquivoTrazido(arq('', 'a.txt'), rotulo)).rejects.toMatchObject({ motivo: 'vazio' })
    const grande = arq('x', 'grande.txt')
    Object.defineProperty(grande, 'size', { value: 31 * 1024 * 1024 })
    await expect(lerArquivoTrazido(grande, rotulo)).rejects.toMatchObject({ motivo: 'grande' })
  })
})

describe('TXT: codificação e capítulos', () => {
  it('UTF-8, UTF-8 com BOM e UTF-16 (BOM) decodificam', async () => {
    expect(await decodificarTexto(bytes('ação'))).toBe('ação')
    expect(await decodificarTexto(new Uint8Array([0xef, 0xbb, 0xbf, ...bytes('ação')]))).toBe('ação')
    const u16 = new Uint8Array([0xff, 0xfe, ...[...'ação'].flatMap((c) => [c.charCodeAt(0), 0])])
    expect(await decodificarTexto(u16)).toBe('ação')
  })

  it('Windows-1252 (sem BOM, não é UTF-8) é detectado: acentos sobrevivem', async () => {
    const latin1 = new Uint8Array(
      [...'Não há coração que não ame. São João e a açorda de pão. '.repeat(4)].map((c) => c.charCodeAt(0)),
    )
    expect(await decodificarTexto(latin1)).toContain('Não há coração')
    const lido = await lerArquivoTrazido(arq(latin1, 'antigo.txt'), rotulo)
    expect(lido.capitulos[0].texto).toContain('açorda')
  })

  it('capítulos por marcas ("Capítulo N") e por tamanho quando não há marcas', () => {
    const texto = `Capítulo 1\n\n${TEXTO_DO_LIVRO}\n\nCapítulo 2\n\nOutra parte da história.\n\nCAPÍTULO III\n\nFim.`
    const caps = dividirEmCapitulos(texto, rotulo)
    expect(caps.map((c) => c.titulo)).toEqual(['Capítulo 1', 'Capítulo 2', 'CAPÍTULO III'])
    const longo = Array.from({ length: 700 }, (_, i) => `Parágrafo ${i} com cinco palavras aqui.`).join('\n\n')
    const porTamanho = dividirEmCapitulos(longo, rotulo)
    expect(porTamanho.length).toBeGreaterThan(1)
    expect(porTamanho[0].titulo).toBe('Parte 1')
  })

  it('texto sem marcas pequeno é um capítulo só', () => {
    expect(dividirEmCapitulos('Um parágrafo.\n\nOutro.', rotulo)).toHaveLength(1)
    expect(dividirEmCapitulos('   ', rotulo)).toEqual([])
  })
})

describe('HTML, MHTML, Markdown e DOCX viram capítulos de texto', () => {
  it('HTML: títulos viram capítulos; script, estilo e imagem remota não passam', async () => {
    const html = `<html lang="pt"><head><title>Meu Doc</title><style>p{color:red}</style><script>alert(1)</script></head><body>
      <h1>Um</h1><p>${TEXTO_DO_LIVRO}</p><img src="https://x.invalid/a.png"><script>evil()</script>
      <h2>Dois</h2><div>Texto solto <b>em negrito</b></div><p onclick="x()">Outro <a href="javascript:alert(1)">link</a></p></body></html>`
    const doc = await htmlEmCapitulos(html, rotulo)
    expect(doc.titulo).toBe('Meu Doc')
    expect(doc.idioma).toBe('pt')
    expect(doc.capitulos.map((c) => c.titulo)).toEqual(['Um', 'Dois'])
    const tudo = doc.capitulos.map((c) => c.texto).join('\n')
    expect(tudo).toContain(TEXTO_DO_LIVRO)
    expect(tudo).toContain('Texto solto em negrito')
    expect(tudo).not.toMatch(/alert|evil|color:red|x\.invalid|javascript/)
  })

  it('HTML solto vira livro pelo conteúdo (lerArquivoTrazido)', async () => {
    const lido = await lerArquivoTrazido(
      arq('<html><body><h1>Casa</h1><p>Era uma casa muito engraçada.</p></body></html>', 'casa.html'),
      rotulo,
    )
    expect(lido).toMatchObject({ formato: 'html', titulo: 'Casa' })
    expect(lido.copia?.size).toBeGreaterThan(0)
    expect(lido.arquivo).toBeUndefined()
  })

  it('MHTML: acha a parte HTML (quoted-printable) e converte', async () => {
    const html = htmlDoMhtml(mhtmlMinimo())
    expect(html).toContain('<h1>Título da página</h1>')
    expect(html).toContain('Café')
    const lido = await lerArquivoTrazido(arq(mhtmlMinimo(), 'pagina.mhtml'), rotulo)
    expect(lido.formato).toBe('html')
    expect(lido.capitulos.map((c) => c.texto).join(' ')).toContain('Café')
  })

  it('Markdown: títulos, listas e HTML cru malicioso sanitizado', async () => {
    const md = `# Livro\n\n## Capítulo A\n\nTexto **forte** do capítulo.\n\n- item um\n- item dois\n\n## Capítulo B\n\n<script>alert(1)</script>\n\nFim <img src=x onerror=alert(2)>.`
    const doc = await markdownEmCapitulos(md, rotulo)
    expect(doc.capitulos.map((c) => c.titulo)).toEqual(['Capítulo A', 'Capítulo B'])
    expect(doc.capitulos[0].texto).toContain('Texto forte do capítulo.')
    expect(doc.capitulos[0].texto).toContain('item dois')
    expect(doc.capitulos.map((c) => c.texto).join('')).not.toMatch(/alert|onerror/)
    const lido = await lerArquivoTrazido(arq(md, 'notas.md'), rotulo)
    expect(lido.formato).toBe('md')
  })

  it('DOCX estruturado: os Heading 1 viram capítulos (não texto cru)', async () => {
    /* Só no jsdom: o `arrayBuffer()` do File do Node vem de outro realm e o JSZip do mammoth não o reconhece. */
    const docx = arq(docxMinimo(), 'trabalho.docx')
    Object.defineProperty(docx, 'arrayBuffer', { value: async () => docxMinimo().slice().buffer })
    const lido = await lerArquivoTrazido(docx, rotulo)
    expect(lido.formato).toBe('docx')
    expect(lido.capitulos.map((c) => c.titulo)).toEqual(['Primeiro capítulo', 'Segundo capítulo'])
    expect(lido.capitulos[0].texto).toBe(TEXTO_DO_LIVRO)
    const direto = await docxEmCapitulos(docxMinimo().slice().buffer, rotulo)
    expect(direto.capitulos).toHaveLength(2)
  })

  it('HTML sem texto: vazio, com mensagem própria', async () => {
    await expect(
      lerArquivoTrazido(arq('<html><body><script>1</script></body></html>', 'vazio.html'), rotulo),
    ).rejects.toMatchObject({ motivo: 'vazio' })
  })
})
