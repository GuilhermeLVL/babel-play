// @vitest-environment jsdom
/**
 * SEGURANÇA DOS FORMATOS RELIGADOS: MOBI/KF8/FB2/CBZ hostis passam pela MESMA limpeza do EPUB antes de virar
 * `blob:` (nenhum rastreador, CSS remoto, script, iframe, onerror, @import ou javascript: chega ao iframe), nada
 * é buscado na rede, e o motor RECUSA (falha fechada) o livro que não sabe limpar. Também: zip bomba, zip slip e
 * arquivos truncados com mensagem de arquivo corrompido.
 */
import { File as ArquivoDoNode } from 'node:buffer'

import { strToU8, zipSync } from 'fflate'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { ErroDoLivro } from '../src/core/livros/trazer'
import type { LivroDoFoliate } from '../src/lib/leitor/foliate/view.js'
import { makeBook } from '../src/lib/leitor/foliate/view.js'
import { MotorDoLeitor } from '../src/lib/leitor/motor'
import { lerArquivoTrazido } from '../src/lib/livros/trazer'
import { cbzMinimo, epubMinimo, mobiMinimo } from './harness/formatosDeTeste'

const arq = (c: Uint8Array | string, nome: string) => new ArquivoDoNode([c], nome) as unknown as File

const HOSTIL_HTML =
  `<html><head><link rel="stylesheet" href="//evil.exemplo/a.css"><style>@import url(http://evil.exemplo/b.css); p{background:url(https://rastreador.exemplo/css.gif)}</style>` +
  `<script>fetch('https://rastreador.exemplo/js')</script></head><body>` +
  `<p>Texto de verdade do livro.</p><img src="https://rastreador.exemplo/x.gif" onerror="alert(1)">` +
  `<iframe src="https://evil.exemplo/f"></iframe><a href="javascript:alert(1)">clique</a></body></html>`

const HOSTIL_FB2 =
  `<?xml version="1.0" encoding="utf-8"?><FictionBook xmlns="http://www.gribuser.ru/xml/fictionbook/2.0" xmlns:l="http://www.w3.org/1999/xlink">` +
  `<description><title-info><genre>prose</genre><author><first-name>A</first-name><last-name>B</last-name></author><book-title>Hostil</book-title><lang>pt</lang></title-info></description>` +
  `<body><section><title><p>Cap</p></title><p>Texto de verdade do livro.</p>` +
  `<image l:href="https://rastreador.exemplo/x.gif"/><image l:href="//evil.exemplo/y.gif"/>` +
  `<p><a l:href="javascript:alert(1)">clique</a></p></section></body></FictionBook>`

const PROIBIDO = /rastreador|evil\.exemplo|<script|onerror|<iframe|@import|javascript:|(?:href|src)="(?:https?:)?\/\//i

let blobs: Map<string, Blob>
let contador: number
let fetchEspiao: ReturnType<typeof vi.fn>
const original = { cria: URL.createObjectURL, revoga: URL.revokeObjectURL }

beforeEach(() => {
  blobs = new Map()
  contador = 0
  URL.createObjectURL = ((b: Blob) => {
    const u = `blob:teste/${contador++}`
    blobs.set(u, b)
    return u
  }) as typeof URL.createObjectURL
  URL.revokeObjectURL = () => {}
  fetchEspiao = vi.fn(async () => {
    throw new Error('rede proibida')
  })
  vi.stubGlobal('fetch', fetchEspiao)
})
afterEach(() => {
  URL.createObjectURL = original.cria
  URL.revokeObjectURL = original.revoga
  vi.unstubAllGlobals()
})

const textoDe = async (url: string) => (await blobs.get(url)!.text()) as string

describe('capítulos de MOBI e FB2 hostis são limpos antes de virar blob:', () => {
  it('MOBI6: nada de rastreador, script, iframe, onerror, @import ou javascript:', async () => {
    const livro = (await makeBook(arq(mobiMinimo({ texto: HOSTIL_HTML }), 'h.mobi'))) as LivroDoFoliate
    MotorDoLeitor.blindar(livro)
    const url = (await livro.sections[0].load()) as string
    const html = await textoDe(url)
    expect(html).toContain('Texto de verdade do livro.')
    expect(html).not.toMatch(PROIBIDO)
    expect(fetchEspiao).not.toHaveBeenCalled()
  })

  it('FB2: imagem que não é #id vira data:, e nada remoto ou javascript: sobrevive', async () => {
    const livro = (await makeBook(arq(HOSTIL_FB2, 'h.fb2'))) as LivroDoFoliate
    MotorDoLeitor.blindar(livro)
    const url = (await livro.sections[0].load()) as string
    const html = await textoDe(url)
    expect(html).toContain('Texto de verdade do livro.')
    expect(html).not.toMatch(PROIBIDO)
    expect(fetchEspiao).not.toHaveBeenCalled()
  })

  it('FB2: a capa só vem de #id local (nada de fetch)', async () => {
    const fb2 = HOSTIL_FB2.replace(
      '<book-title>',
      '<coverpage><image l:href="https://rastreador.exemplo/capa.jpg"/></coverpage><book-title>',
    )
    const livro = (await makeBook(arq(fb2, 'h.fb2'))) as LivroDoFoliate
    expect(await livro.getCover?.()).toBeNull()
    expect(fetchEspiao).not.toHaveBeenCalled()
  })

  it('FALHA FECHADA no vendor: sem a limpeza do motor, o capítulo é recusado (nada vira blob:)', async () => {
    const mobi = (await makeBook(arq(mobiMinimo({ texto: HOSTIL_HTML }), 'h.mobi'))) as LivroDoFoliate
    await expect(Promise.resolve(mobi.sections[0].load())).rejects.toThrow(/sem limpeza/)
    const fb2 = (await makeBook(arq(HOSTIL_FB2, 'h.fb2'))) as LivroDoFoliate
    await expect(Promise.resolve(fb2.sections[0].load())).rejects.toThrow(/sem limpeza/)
    expect(blobs.size).toBe(0)
  })
})

describe('MotorDoLeitor.blindar: recusa o livro que não sabe limpar', () => {
  it('sem transformTarget e sem a marca de confiança: ErroDoLivro', () => {
    const livro = { sections: [{ id: 0, size: 1, load: () => 'blob:x' }] } as unknown as LivroDoFoliate
    expect(() => MotorDoLeitor.blindar(livro)).toThrow(ErroDoLivro)
  })
  it('livro montado por nós (texto, PDF, CBZ) passa; o CBZ real traz a marca', async () => {
    const cbz = (await makeBook(arq(cbzMinimo(), 'g.cbz'))) as LivroDoFoliate
    expect(cbz.frasyConfiavel).toBe(true)
    expect(() => MotorDoLeitor.blindar(cbz)).not.toThrow()
  })
  it('CBZ: a página só referencia a imagem local (blob:), nunca texto do arquivo', async () => {
    const cbz = (await makeBook(arq(cbzMinimo(), 'g.cbz'))) as LivroDoFoliate
    const pagina = await textoDe((await cbz.sections[0].load()) as string)
    expect(pagina).toMatch(/<img src="blob:teste\/\d+">/)
    expect(pagina).not.toMatch(/http|script/i)
  })
})

describe('zip não confiável: bomba, zip slip, truncado', () => {
  it('bomba de descompressão (100 MB de zeros em ~100 KB) é recusada como "grande" sem estourar a memória', async () => {
    const bomba = zipSync({ 'ZEROS.bin': new Uint8Array(100 * 1024 * 1024) }, { level: 9 })
    expect(bomba.length).toBeLessThan(300 * 1024)
    const docx = zipSync({
      '[Content_Types].xml': strToU8('<Types/>'),
      'word/document.xml': new Uint8Array(100 * 1024 * 1024),
    })
    await expect(lerArquivoTrazido(arq(docx, 'bomba.docx'), String)).rejects.toMatchObject({ motivo: 'grande' })
    await expect(lerArquivoTrazido(arq(bomba, 'bomba.zip'), String)).rejects.toMatchObject({ motivo: 'grande' })
    // Teto próprio: monta e descomprime 3 × 100 MB. Medido: ~1,8 s sem cobertura, ~7,6 s com cobertura na máquina de dev e
    // 28 s no runner da CI (cobertura + fatia vizinha), que estourava os 20 s padrão sem que nada tivesse regredido.
  }, 90_000)

  it('CBZ com mais páginas que o teto, ou entrada com ../ (zip slip), é recusado', async () => {
    const muitas: Record<string, Uint8Array> = {}
    for (let i = 0; i < 3001; i++) muitas[`p${i}.png`] = new Uint8Array([1])
    await expect(lerArquivoTrazido(arq(zipSync(muitas), 'enorme.cbz'), String)).rejects.toMatchObject({
      motivo: 'grande',
    })
    const slip = zipSync({ '../evil.png': new Uint8Array([1]), '001.png': new Uint8Array([1]) })
    await expect(lerArquivoTrazido(arq(slip, 'slip.cbz'), String)).rejects.toMatchObject({ motivo: 'corrompido' })
  })

  it('EPUB, MOBI e FB2 truncados dão "corrompido", não exceção solta', async () => {
    const epub = epubMinimo()
    await expect(lerArquivoTrazido(arq(epub.slice(0, 200), 'cortado.epub'), String)).rejects.toMatchObject({
      motivo: 'corrompido',
    })
    await expect(lerArquivoTrazido(arq(mobiMinimo().slice(0, 120), 'cortado.mobi'), String)).rejects.toMatchObject({
      motivo: 'corrompido',
    })
    await expect(
      lerArquivoTrazido(
        arq(HOSTIL_FB2.slice(0, 200).replace(/<description>.*$/, '<description><title'), 'c.fb2'),
        String,
      ),
    ).rejects.toBeInstanceOf(ErroDoLivro)
  })
})
