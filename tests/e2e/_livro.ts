import { readFileSync } from 'node:fs'
import path from 'node:path'

import { expect, type Page } from '@playwright/test'
import { strToU8, zipSync } from 'fflate'

import { abrirTela, fecharSobreposicoes } from './_helpers'

/**
 * O LIVRO DE TESTE COM NARRAÇÃO FALSA, para os e2e do leitor (elenco e avatar nos modos): o catálogo, a ficha e o EPUB
 * respondidos pelo próprio teste, e a `speechSynthesis` TROCADA por uma de mentira (o teste decide quando cada frase
 * "termina"). Tirado de `avatar-elenco.e2e.ts` sem mudar nada do que ele prova.
 */
export const ID = 'se-teste-elenco'
export const EPUB_DO_SE = 'https://standardebooks.org/ebooks/teste/elenco/downloads/teste_elenco.epub'

export const CATALOGO = {
  versao: 1,
  ano: 2026,
  anoLimite: 1955,
  geradoEm: '2026-10-26T12:00:00.000Z',
  livros: [
    {
      id: ID,
      titulo: 'O Jardim de Ana e Bruno',
      autores: [{ nome: 'Autora Antiga', anoMorte: 1900, idiomas: ['en'] }],
      tradutores: [],
      idioma: 'en',
      fonte: 'standard-ebooks',
      fonteId: 'teste/elenco',
      formatos: { epub: EPUB_DO_SE, pagina: 'https://standardebooks.org/ebooks/teste/elenco' },
      categorias: ['aventura'],
      classificacao: 'livre',
      nivel: 'A2',
      nivelDetalhe: { cobertura: 'A2', legibilidade: 'A2', amostras: 3 },
      palavras: 15_000,
      minutosEstimados: 83,
      popularidade: 1,
      downloads: 10,
      credito: 'Edição do Standard Ebooks (CC0).',
      licenca: 'Domínio público no Brasil (Lei 9.610, art. 41): Autora Antiga †1900.',
    },
  ],
  exclusoes: [],
}

/** A ficha de verdade de outro livro, com o id e as personagens trocados (assim passa na validação do app). */
export function ficha() {
  const base = JSON.parse(readFileSync(path.resolve('public/catalogo/fichas/pg-1513.json'), 'utf8')) as Record<
    string,
    unknown
  >
  const p = (nome: string) => ({
    nome,
    texto: `${nome} é uma personagem deste livro de teste.`,
    spoiler: false,
    sensivel: false,
  })
  return { ...base, livroId: ID, titulo: CATALOGO.livros[0].titulo, personagens: [p('Ana'), p('Bruno')] }
}

export const FRASES = [
  'The evening settled over the quiet garden.',
  '"Come here, I am sad and lonely," said Ana.',
  '"I am coming now," said Bruno happily.',
  'The wind moved the leaves.',
]

export function epub(): Buffer {
  const corpo = `<h2>Chapter one</h2>${FRASES.map((f) => `<p>${f}</p>`).join('')}`
  return Buffer.from(
    zipSync({
      mimetype: strToU8('application/epub+zip'),
      'META-INF/container.xml': strToU8(
        '<?xml version="1.0"?><container version="1.0" xmlns="urn:oasis:names:tc:opendocument:xmlns:container"><rootfiles><rootfile full-path="OEBPS/c.opf" media-type="application/oebps-package+xml"/></rootfiles></container>',
      ),
      'OEBPS/c.opf': strToU8(
        '<?xml version="1.0"?><package xmlns="http://www.idpf.org/2007/opf" version="3.0" unique-identifier="u"><metadata xmlns:dc="http://purl.org/dc/elements/1.1/"><dc:identifier id="u">x</dc:identifier><dc:title>O Jardim de Ana e Bruno</dc:title><dc:creator>Autora Antiga</dc:creator><dc:language>en</dc:language></metadata><manifest><item id="c1" href="cap1.xhtml" media-type="application/xhtml+xml"/></manifest><spine><itemref idref="c1"/></spine></package>',
      ),
      'OEBPS/cap1.xhtml': strToU8(
        `<?xml version="1.0"?><html xmlns="http://www.w3.org/1999/xhtml"><head><title>1</title></head><body>${corpo}</body></html>`,
      ),
    }),
  )
}

/** A voz de mentira: 4 vozes em inglês; guarda o que foi falado (texto, voz, ritmo, tom). */
export function vozDeMentira() {
  const vozes = ['Teste A', 'Teste B', 'Teste C', 'Teste D'].map((name, i) => ({
    name,
    lang: 'en-US',
    localService: true,
    default: i === 0,
    voiceURI: name,
  }))
  class Utterance {
    text: string
    lang = ''
    rate = 1
    pitch = 1
    volume = 1
    voice: { name: string } | null = null
    onstart?: () => void
    onend?: () => void
    onerror?: (e: unknown) => void
    onboundary = null
    constructor(text: string) {
      this.text = text
    }
  }
  const estado = {
    faladas: [] as Array<{ texto: string; voz: string | null; rate: number; pitch: number }>,
    atual: null as Utterance | null,
  }
  const synth = {
    speaking: false,
    paused: false,
    pending: false,
    onvoiceschanged: null,
    getVoices: () => vozes,
    speak(u: Utterance) {
      estado.faladas.push({ texto: u.text, voz: u.voice?.name ?? null, rate: u.rate, pitch: u.pitch })
      estado.atual = u
      synth.speaking = true
      setTimeout(() => u.onstart?.(), 0)
    },
    cancel() {
      const u = estado.atual
      estado.atual = null
      synth.speaking = false
      if (u) setTimeout(() => u.onerror?.({ error: 'interrupted' }), 0)
    },
    pause() {},
    resume() {},
    addEventListener() {},
    removeEventListener() {},
  }
  Object.defineProperty(window, 'speechSynthesis', { value: synth, configurable: true })
  Object.defineProperty(window, 'SpeechSynthesisUtterance', { value: Utterance, configurable: true })
  ;(window as unknown as { __fala: unknown }).__fala = {
    estado,
    terminar() {
      const u = estado.atual
      estado.atual = null
      synth.speaking = false
      u?.onend?.()
    },
  }
}

export type Fala = { texto: string; voz: string | null; rate: number; pitch: number }
export const faladas = (page: Page) =>
  page.evaluate(() => (window as unknown as { __fala: { estado: { faladas: Fala[] } } }).__fala.estado.faladas)
export const terminar = (page: Page) =>
  page.evaluate(() => (window as unknown as { __fala: { terminar: () => void } }).__fala.terminar())
export async function preparar(page: Page, flags: Record<string, boolean>, opcoes: { semFicha?: boolean } = {}) {
  await page.addInitScript(vozDeMentira)
  await page.route('**/catalogo/livros.json', (r) =>
    r.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(CATALOGO) }),
  )
  await page.route('**/catalogo/fichas/indice.json', (r) =>
    r.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({ versao: 1, fichas: opcoes.semFicha ? [] : [ID] }),
    }),
  )
  await page.route(`**/catalogo/fichas/${ID}.json`, (r) =>
    opcoes.semFicha
      ? r.fulfill({ status: 404, body: '' })
      : r.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(ficha()) }),
  )
  await page.route('https://standardebooks.org/**', (r) =>
    r.fulfill({
      status: 200,
      headers: { 'access-control-allow-origin': '*', 'content-type': 'application/epub+zip' },
      body: epub(),
    }),
  )
  const todas: Record<string, { ligada: boolean }> = {}
  for (const [k, v] of Object.entries(flags)) todas[k] = { ligada: v }
  await page.route('**/api/flags', (r) => r.fulfill({ json: { flags: todas } }))
  await page.addInitScript(() => {
    try {
      if (sessionStorage.getItem('__limpo')) return // só na primeira carga: recarregar mantém o que ficou guardado
      sessionStorage.setItem('__limpo', '1')
      for (const k of Object.keys(localStorage))
        if (
          k.startsWith('leitor:elenco') ||
          k.startsWith('leitor:dica') ||
          k.startsWith('leitor:narracao') ||
          k.includes('avatar')
        )
          localStorage.removeItem(k)
      localStorage.setItem('leitor:narracao:opcoes', JSON.stringify({ pausaParagrafo: 0, pausaFrase: 0 }))
    } catch {
      /* sem armazenamento */
    }
  })
  await abrirTela(page, `/livros/${ID}/ler`)
  await expect(page.locator('[data-testid=leitor][data-estado=pronto]')).toBeVisible({ timeout: 30_000 })
  await fecharSobreposicoes(page)
}
