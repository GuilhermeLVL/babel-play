/**
 * "TRAZER O SEU": a lógica pura (formato pelo conteúdo, DRM, link permitido), a leitura de EPUB com proteção, o
 * download por link (mock de fetch, `credentials: 'omit'`, teto) e a lista curada do guia (sem pirataria).
 */
import { strToU8, zipSync } from 'fflate'
import { describe, expect, it, vi } from 'vitest'

import { FONTES_LEGAIS, HOSTS_DO_GUIA } from '../src/core/livros/fontesLegais'
import { formatoPeloConteudo } from '../src/core/livros/formatos'
import { epubTemDrm, ErroDoLivro, HOSTS_DE_LIVRO_POR_LINK, TETO_DO_LINK_EM_BYTES } from '../src/core/livros/trazer'
import { extrairEpub } from '../src/lib/import/epub'
import { baixarLivroDoLink, comoErroDoLivro, lerArquivoTrazido, validarLinkDeLivro } from '../src/lib/livros/trazer'

const bytes = (s: string) => new TextEncoder().encode(s)

const CONTAINER = `<?xml version="1.0"?><container version="1.0" xmlns="urn:oasis:names:tc:opendocument:xmlns:container"><rootfiles><rootfile full-path="OEBPS/content.opf" media-type="application/oebps-package+xml"/></rootfiles></container>`
const OPF = `<?xml version="1.0"?><package xmlns="http://www.idpf.org/2007/opf" version="3.0" unique-identifier="id"><metadata xmlns:dc="http://purl.org/dc/elements/1.1/"><dc:title>Livro de Teste</dc:title><dc:language>pt</dc:language><dc:creator>Autora</dc:creator></metadata><manifest><item id="c1" href="c1.xhtml" media-type="application/xhtml+xml"/></manifest><spine><itemref idref="c1"/></spine></package>`

function epub(extras: Record<string, string> = {}): File {
  const z = zipSync({
    mimetype: strToU8('application/epub+zip'),
    'META-INF/container.xml': strToU8(CONTAINER),
    'OEBPS/content.opf': strToU8(OPF),
    'OEBPS/c1.xhtml': strToU8(`<html><body><p>Era uma vez um barco pequeno que queria ver o mar.</p></body></html>`),
    ...Object.fromEntries(Object.entries(extras).map(([k, v]) => [k, strToU8(v)])),
  })
  return new File([z], 'teste.epub', { type: 'application/epub+zip' })
}

const ENC_FONTE = `<encryption xmlns="urn:oasis:names:tc:opendocument:xmlns:container"><EncryptedData xmlns="http://www.w3.org/2001/04/xmlenc#"><EncryptionMethod Algorithm="http://www.idpf.org/2008/embedding"/><CipherData><CipherReference URI="OEBPS/f.otf"/></CipherData></EncryptedData></encryption>`
const ENC_ADEPT = `<encryption xmlns="urn:oasis:names:tc:opendocument:xmlns:container"><EncryptedData xmlns="http://www.w3.org/2001/04/xmlenc#"><EncryptionMethod Algorithm="http://www.w3.org/2001/04/xmlenc#aes128-cbc"/><CipherData><CipherReference URI="OEBPS/c1.xhtml"/></CipherData></EncryptedData></encryption>`

describe('formatoPeloConteudo: pela assinatura, não pela extensão', () => {
  it('zip → zip (o que há dentro decide), %PDF → pdf, texto limpo → txt', () => {
    expect(formatoPeloConteudo(new Uint8Array([0x50, 0x4b, 0x03, 0x04, 0, 0]))).toBe('zip')
    expect(formatoPeloConteudo(bytes('%PDF-1.7\n...'))).toBe('pdf')
    expect(formatoPeloConteudo(bytes('Capítulo 1\n\nEra uma vez.'))).toBe('txt')
  })
  it('binário qualquer e vazio não são livro; HTML solto agora é um documento HTML', () => {
    expect(formatoPeloConteudo(new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0, 0, 0]))).toBeNull()
    expect(formatoPeloConteudo(bytes('<!DOCTYPE html><html><body>loja</body></html>'))).toBe('html')
    expect(formatoPeloConteudo(new Uint8Array())).toBeNull()
  })
})

describe('epubTemDrm', () => {
  it('ofuscação de fonte NÃO é proteção', () => {
    expect(epubTemDrm(['META-INF/encryption.xml'], ENC_FONTE)).toBe(false)
    expect(epubTemDrm([], null)).toBe(false)
  })
  it('cifra de conteúdo (ADEPT/aes), rights.xml e sinf.xml são proteção', () => {
    expect(epubTemDrm(['META-INF/encryption.xml'], ENC_ADEPT)).toBe(true)
    expect(epubTemDrm(['META-INF/rights.xml'], null)).toBe(true)
    expect(epubTemDrm(['META-INF/sinf.xml'], null)).toBe(true)
  })
})

describe('extrairEpub e lerArquivoTrazido', () => {
  it('um EPUB normal abre', async () => {
    const lido = await lerArquivoTrazido(epub(), (i) => `Parte ${i + 1}`)
    expect(lido.formato).toBe('epub')
    expect(lido.titulo).toBe('Livro de Teste')
    expect(lido.capitulos[0].texto).toContain('barco pequeno')
  })
  it('EPUB com fonte ofuscada abre; com encryption de conteúdo é recusado como DRM', async () => {
    await expect(extrairEpub(epub({ 'META-INF/encryption.xml': ENC_FONTE }))).resolves.toBeTruthy()
    await expect(extrairEpub(epub({ 'META-INF/encryption.xml': ENC_ADEPT }))).rejects.toMatchObject({
      motivo: 'drm',
    })
    await expect(extrairEpub(epub({ 'META-INF/rights.xml': '<rights/>' }))).rejects.toMatchObject({ motivo: 'drm' })
  })
  it('zip que não é EPUB, binário e vazio têm motivo próprio', async () => {
    const zipQualquer = new File([zipSync({ 'a.txt': strToU8('oi') })], 'x.epub')
    await expect(lerArquivoTrazido(zipQualquer, String)).rejects.toMatchObject({ motivo: 'formato' })
    const png = new File([new Uint8Array([0x89, 0x50, 0x4e, 0x47, 1, 2, 3])], 'x.epub')
    await expect(lerArquivoTrazido(png, String)).rejects.toMatchObject({ motivo: 'formato' })
    await expect(lerArquivoTrazido(new File([], 'x.epub'), String)).rejects.toMatchObject({ motivo: 'vazio' })
  })
  it('um texto vira capítulos, mesmo com nome sem extensão', async () => {
    const txt = new File(['Primeiro parágrafo.\n\nSegundo parágrafo.'], 'meu-livro')
    const lido = await lerArquivoTrazido(txt, (i) => `Parte ${i + 1}`)
    expect(lido.formato).toBe('txt')
    expect(lido.capitulos).toHaveLength(1)
  })
})

describe('comoErroDoLivro', () => {
  it('senha → senha; criptografia → drm; digitalizado → pdf-imagem; teto → grande', () => {
    const senha = Object.assign(new Error('No password given'), { name: 'PasswordException' })
    expect(comoErroDoLivro(senha).motivo).toBe('senha')
    expect(comoErroDoLivro(new Error('arquivo encrypted')).motivo).toBe('drm')
    expect(comoErroDoLivro(new Error('PDF sem texto selecionável (parece digitalizado).')).motivo).toBe('pdf-imagem')
    expect(comoErroDoLivro(new Error('o documento passa do limite de 30 MB')).motivo).toBe('grande')
    expect(comoErroDoLivro(new Error('qualquer coisa')).motivo).toBe('corrompido')
    const proprio = new ErroDoLivro('rede')
    expect(comoErroDoLivro(proprio)).toBe(proprio)
  })
})

describe('validarLinkDeLivro', () => {
  const RAW = 'https://raw.githubusercontent.com/usuario/repo/main/livros/o-livro.epub'
  it('aceita arquivo do raw.githubusercontent.com (epub, pdf, txt)', () => {
    expect(validarLinkDeLivro(RAW)).toMatchObject({ ok: true, url: RAW, formato: 'epub' })
    expect(validarLinkDeLivro(RAW.replace('.epub', '.PDF'))).toMatchObject({ ok: true, formato: 'pdf' })
    expect(validarLinkDeLivro(`  ${RAW.replace('.epub', '.txt')} `)).toMatchObject({ ok: true, formato: 'txt' })
  })
  it('github.com/blob e /raw viram o raw liberado', () => {
    expect(validarLinkDeLivro('https://github.com/usuario/repo/blob/main/livros/o-livro.epub')).toMatchObject({
      ok: true,
      url: RAW,
    })
    expect(validarLinkDeLivro('https://github.com/usuario/repo/raw/main/livros/o-livro.epub').url).toBe(RAW)
  })
  it('página do GitHub, página de loja, release e outro host de arquivo têm motivos próprios', () => {
    expect(validarLinkDeLivro('https://github.com/usuario/repo').motivo).toBe('pagina')
    expect(validarLinkDeLivro('https://github.com/usuario/repo/blob/main/README').motivo).toBe('pagina')
    expect(validarLinkDeLivro('https://www.amazon.com.br/dp/B000').motivo).toBe('pagina')
    expect(validarLinkDeLivro('https://raw.githubusercontent.com/u/r/main/README').motivo).toBe('pagina')
    expect(validarLinkDeLivro('https://github.com/u/r/releases/download/v1/livro.epub').motivo).toBe('release')
    expect(validarLinkDeLivro('https://exemplo.org/livro.epub').motivo).toBe('host')
  })
  it('lixo, http, javascript:, credenciais e host parecido não passam', () => {
    for (const ruim of [
      '',
      'livro.epub',
      'http://raw.githubusercontent.com/u/r/main/a.epub',
      'javascript:alert(1)',
      'https://user:senha@raw.githubusercontent.com/u/r/main/a.epub',
      'https://raw.githubusercontent.com.evil.test/u/r/main/a.epub',
      'https://evilraw.githubusercontent.com/u/r/main/a.epub',
    ]) {
      expect(validarLinkDeLivro(ruim).ok, ruim).toBe(false)
    }
  })
  it('os hosts baixáveis são só os da CSP', () => {
    expect([...HOSTS_DE_LIVRO_POR_LINK]).toEqual(['raw.githubusercontent.com'])
  })
})

describe('baixarLivroDoLink', () => {
  const RAW = 'https://raw.githubusercontent.com/u/r/main/o-livro.epub'
  const resposta = (corpo: BlobPart, init: ResponseInit = {}) => new Response(corpo, { status: 200, ...init })

  it('baixa no navegador, sem cookie, e devolve um File com o nome do arquivo', async () => {
    const buscar = vi.fn(async () => resposta(epub()))
    const arquivo = await baixarLivroDoLink(RAW, buscar as unknown as typeof fetch)
    expect(arquivo.name).toBe('o-livro.epub')
    expect(buscar).toHaveBeenCalledWith(RAW, expect.objectContaining({ credentials: 'omit', mode: 'cors' }))
  })
  it('link inválido nem chama a rede', async () => {
    const buscar = vi.fn()
    await expect(baixarLivroDoLink('https://loja.exemplo/livro', buscar)).rejects.toMatchObject({ motivo: 'pagina' })
    expect(buscar).not.toHaveBeenCalled()
  })
  it('falha de rede, status ruim e arquivo acima do teto têm motivo', async () => {
    await expect(
      baixarLivroDoLink(RAW, (async () => {
        throw new TypeError('Failed to fetch')
      }) as unknown as typeof fetch),
    ).rejects.toMatchObject({ motivo: 'rede' })
    await expect(
      baixarLivroDoLink(RAW, (async () => resposta('', { status: 404 })) as unknown as typeof fetch),
    ).rejects.toMatchObject({ motivo: 'rede' })
    await expect(
      baixarLivroDoLink(RAW, (async () =>
        resposta('x', {
          headers: { 'content-length': String(TETO_DO_LINK_EM_BYTES + 1) },
        })) as unknown as typeof fetch),
    ).rejects.toMatchObject({ motivo: 'grande' })
  })
  it('o que baixou é conferido pela assinatura: um formato que não abrimos (RTF) não vira livro', async () => {
    const arquivo = await baixarLivroDoLink(RAW, (async () =>
      resposta('{\\rtf1\\ansi texto}')) as unknown as typeof fetch)
    await expect(lerArquivoTrazido(arquivo, String)).rejects.toMatchObject({ motivo: 'formato' })
  })
})

describe('o guia "Onde encontrar livros legais"', () => {
  const PROIBIDOS =
    /z-?\s?lib|zlibrary|libgen|library genesis|anna['’]?s|annas-archive|sci-?hub|pirat|torrent|dedrm|calibre|remover drm|tirar drm/i

  it('tem só os hosts da lista permitida, em https, sem rastreio e com nomes limpos', () => {
    expect(FONTES_LEGAIS.length).toBeGreaterThanOrEqual(10)
    for (const f of FONTES_LEGAIS) {
      const u = new URL(f.url)
      expect(u.protocol, f.id).toBe('https:')
      expect((HOSTS_DO_GUIA as readonly string[]).includes(u.hostname), `${f.id}: ${u.hostname}`).toBe(true)
      expect(u.search, f.id).toBe('')
      expect(JSON.stringify(f), f.id).not.toMatch(PROIBIDOS)
    }
  })
  it('as verdes e as amarelas existem, e a lista de hosts não tem sobra', () => {
    expect(FONTES_LEGAIS.some((f) => f.grupo === 'verde')).toBe(true)
    expect(FONTES_LEGAIS.some((f) => f.grupo === 'amarelo')).toBe(true)
    const usados = new Set(FONTES_LEGAIS.map((f) => new URL(f.url).hostname))
    expect([...HOSTS_DO_GUIA].sort()).toEqual([...usados].sort())
  })
})
