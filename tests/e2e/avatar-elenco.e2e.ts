import { mkdirSync, readFileSync } from 'node:fs'
import path from 'node:path'

import { expect, type Page, test } from '@playwright/test'
import { strToU8, zipSync } from 'fflate'

import { abrirTela, fecharSobreposicoes } from './_helpers'

/**
 * O ELENCO NA NARRAÇÃO DO LEITOR (M5, flag `avatar_elenco`), no app de verdade, com a `speechSynthesis` TROCADA por uma de
 * mentira (4 vozes em inglês; o teste decide quando cada frase "termina"), o catálogo, a ficha e o EPUB respondidos pelo
 * próprio teste. Provado aqui: sem a flag nada aparece; com a flag o painel lista as personagens da ficha, a personagem fala
 * com a voz dela (`voiceName` no motor), a narração fica na voz de sempre, a emoção muda o ritmo/tom, o avatar-narrador
 * aparece com a legenda de quem fala, e desligar o elenco volta a uma voz só. NÃO provado: voz real do aparelho, Safari,
 * Firefox, celular real, timbres.
 *
 * Capturas: `$AVATAR_CAPTURAS` (padrão `tests/e2e/__capturas__/`, fora do git).
 */
const CAPTURAS = process.env.AVATAR_CAPTURAS || path.join(process.cwd(), 'tests', 'e2e', '__capturas__')
mkdirSync(CAPTURAS, { recursive: true })

test.use({
  launchOptions: {
    args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'],
  },
})

const ID = 'se-teste-elenco'
const EPUB_DO_SE = 'https://standardebooks.org/ebooks/teste/elenco/downloads/teste_elenco.epub'

const CATALOGO = {
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
function ficha() {
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

const FRASES = [
  'The evening settled over the quiet garden.',
  '"Come here, I am sad and lonely," said Ana.',
  '"I am coming now," said Bruno happily.',
  'The wind moved the leaves.',
]

function epub(): Buffer {
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
function vozDeMentira() {
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

type Fala = { texto: string; voz: string | null; rate: number; pitch: number }
const faladas = (page: Page) =>
  page.evaluate(() => (window as unknown as { __fala: { estado: { faladas: Fala[] } } }).__fala.estado.faladas)
const terminar = (page: Page) =>
  page.evaluate(() => (window as unknown as { __fala: { terminar: () => void } }).__fala.terminar())
const foto = (page: Page, nome: string) =>
  page.screenshot({ path: path.join(CAPTURAS, `elenco-${test.info().project.name}-${nome}.png`) })

async function preparar(page: Page, flags: Record<string, boolean>, opcoes: { semFicha?: boolean } = {}) {
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

test.describe('Elenco na narração do leitor', () => {
  test('sem a flag, nada do elenco aparece e a narração é a de sempre', async ({ page }) => {
    test.slow()
    await preparar(page, {})
    await page.getByTestId('leitor-ouvir').click()
    await page.getByRole('button', { name: /Voz e modo/ }).click()
    await expect(page.getByTestId('painel-narracao')).toBeVisible()
    await expect(page.getByTestId('painel-elenco')).toHaveCount(0)
    await expect(page.getByTestId('avatar-do-narrador')).toHaveCount(0)
    await expect.poll(async () => (await faladas(page)).length).toBeGreaterThan(0)
    expect((await faladas(page))[0].voz).not.toBe('Teste B')
  })

  test('com a flag: personagens da ficha, voz própria por personagem, emoção no ritmo, avatar com legenda e volta a uma voz só', async ({
    page,
  }) => {
    test.slow()
    await preparar(page, { avatar_elenco: true, avatar_3d: true })
    await page.getByTestId('leitor-ouvir').click()
    await page.getByRole('button', { name: /Voz e modo/ }).click()
    const painel = page.getByTestId('painel-elenco')
    await expect(painel).toBeVisible()

    // Desligado por padrão: uma voz só.
    await expect(page.getByTestId('elenco-resumo')).toContainText('uma voz só')
    await expect(page.getByTestId('avatar-do-narrador')).toHaveCount(0)

    // Teclado: o interruptor é focável e o Espaço liga.
    const ligar = page.getByTestId('elenco-ligar')
    await ligar.focus()
    await page.keyboard.press('Space')
    await expect(ligar).toBeChecked()
    await expect(page.getByTestId('elenco-resumo')).toContainText('2')
    await expect(page.getByLabel('Ana', { exact: true })).toBeVisible()
    await expect(page.getByLabel('Bruno', { exact: true })).toBeVisible()
    await foto(page, 'painel')

    // A narração recomeça com o elenco: percorre as 5 frases (título + 4) anotando voz, ritmo e tom.
    for (let i = 0; i < 6; i++) {
      if ((await faladas(page)).some((f) => f.texto.includes('I am coming now'))) break
      await terminar(page)
      await page.waitForTimeout(150)
    }
    const f = await faladas(page)
    const por = (trecho: string) => f.filter((x) => x.texto.includes(trecho)).at(-1)!
    const ana = por('Come here')
    const bruno = por('I am coming now')
    const narracao = por('The evening settled')
    expect(ana.voz).toMatch(/Teste [A-D]/)
    expect(bruno.voz).toMatch(/Teste [A-D]/)
    expect(ana.voz).not.toBe(bruno.voz)
    // A narração fica na voz da pessoa (a automática), que não é a de nenhuma personagem.
    expect([ana.voz, bruno.voz]).not.toContain(narracao.voz)
    // "sad and lonely": duas pistas, então a emoção muda ritmo e tom da fala da Ana.
    expect(ana.rate).toBeLessThan(narracao.rate)
    expect(ana.pitch).toBeLessThan(narracao.pitch)

    // O avatar-narrador aparece, com a legenda de quem fala (sempre em texto).
    const avatar = page.getByTestId('avatar-do-narrador')
    await expect(avatar).toBeVisible()
    await expect(avatar.getByTestId('avatar-do-narrador-legenda')).toContainText(/Narrador|Ana|Bruno/)
    await expect(avatar.getByTestId('avatar-do-narrador-rosto').locator('canvas')).toBeVisible({ timeout: 30_000 })
    await foto(page, 'avatar')

    // Trocar a voz da Ana vale na frase seguinte.
    await page.getByTestId('elenco-avatar').uncheck()
    await expect(page.getByTestId('avatar-do-narrador')).toHaveCount(0)
    await page.getByTestId('elenco-avatar').check()

    // Desligar o elenco: volta a uma voz só (nenhuma frase com voz de personagem).
    await ligar.uncheck()
    await expect(page.getByTestId('elenco-resumo')).toContainText('uma voz só')
    await expect(page.getByTestId('avatar-do-narrador')).toHaveCount(0)
    // A frase em curso (a do Bruno) recomeça já na voz do narrador.
    await expect
      .poll(async () => {
        const u = (await faladas(page)).at(-1)!
        return u.texto.includes('I am coming now') ? u.voz : 'ainda-nao'
      })
      .toBe(narracao.voz)
  })

  test('descoberta: botão Elenco, dica da primeira vez, elenco no topo e Experimentar voz', async ({ page }) => {
    test.slow()
    await preparar(page, { avatar_elenco: true })
    const botao = page.getByTestId('leitor-elenco')
    await expect(botao).toBeVisible()
    await expect(botao).toContainText('Elenco')
    await expect(botao).toContainText('2')
    await expect(botao).toHaveAttribute('aria-pressed', 'false')
    const caixa = (await botao.boundingBox())!
    expect(caixa.height).toBeGreaterThanOrEqual(44)
    expect(caixa.width).toBeGreaterThanOrEqual(44)

    // A dica da primeira vez: discreta, com a contagem, sem tirar o livro do lugar.
    const dica = page.getByTestId('dica-elenco')
    await expect(dica).toContainText('2 personagens')
    await page.waitForTimeout(600)
    await foto(page, 'descoberta-dica')

    // Teclado: Tab chega ao botão da dica, Enter abre o painel do elenco, no topo.
    await dica.getByRole('button', { name: 'Escolher as vozes' }).focus()
    await page.keyboard.press('Enter')
    await expect(dica).toHaveCount(0)
    const painel = page.getByTestId('painel-elenco')
    await expect(painel).toBeVisible()
    await expect(page.getByTestId('painel-narracao')).toBeVisible()
    const topoDoElenco = (await painel.boundingBox())!.y
    const topoDaNarracao = (await page.getByTestId('painel-narracao').boundingBox())!.y
    expect(topoDoElenco).toBeLessThan(topoDaNarracao)

    // Ligar o elenco: os seletores aparecem sem rolar demais (dentro da tela).
    await page.getByTestId('elenco-ligar').check()
    await expect(botao).toHaveAttribute('aria-pressed', 'true')
    const viewport = page.viewportSize()!
    const sel = page.getByTestId('elenco-voz-0')
    await expect(sel).toBeVisible()
    expect((await sel.boundingBox())!.y).toBeLessThan(viewport.height)
    await foto(page, 'descoberta-painel')

    // Experimentar voz: fala uma frase de exemplo com a voz escolhida, sem iniciar a narração do livro.
    await sel.selectOption('Teste C')
    await page.getByTestId('elenco-testar-0').click()
    await expect.poll(async () => (await faladas(page)).at(-1)?.texto ?? '').toContain('Ana')
    const amostra = (await faladas(page)).at(-1)!
    expect(amostra.voz).toBe('Teste C')
    expect(amostra.texto).toMatch(/Hello, I am Ana/)
    await foto(page, 'descoberta-experimentar')

    // Fechar e reabrir o livro não mostra a dica de novo (lembrada no aparelho).
    await page.reload()
    await expect(page.locator('[data-testid=leitor][data-estado=pronto]')).toBeVisible({ timeout: 30_000 })
    await expect(page.getByTestId('dica-elenco')).toHaveCount(0)
    await expect(botao).toBeVisible()
  })

  test('descoberta: dispensar a dica a esconde e o botão continua', async ({ page }) => {
    test.slow()
    await preparar(page, { avatar_elenco: true })
    await page.getByTestId('dica-elenco').getByRole('button', { name: 'Dispensar a dica' }).click()
    await expect(page.getByTestId('dica-elenco')).toHaveCount(0)
    await expect(page.getByTestId('leitor-elenco')).toBeVisible()
    await expect(page.getByTestId('painel-elenco')).toHaveCount(0)
  })

  test('descoberta: sem a flag não há botão nem dica', async ({ page }) => {
    test.slow()
    await preparar(page, {})
    await expect(page.getByTestId('leitor-elenco')).toHaveCount(0)
    await expect(page.getByTestId('dica-elenco')).toHaveCount(0)
  })

  test('descoberta: livro sem personagens não tem botão e o painel diz que só há o narrador', async ({ page }) => {
    test.slow()
    await preparar(page, { avatar_elenco: true }, { semFicha: true })
    await expect(page.getByTestId('leitor-elenco')).toHaveCount(0)
    await expect(page.getByTestId('dica-elenco')).toHaveCount(0)
    await page.getByTestId('leitor-ouvir').click()
    await page.getByRole('button', { name: /Voz e modo/ }).click()
    await expect(page.getByTestId('elenco-so-narrador')).toContainText('Só há o narrador')
    await page.getByTestId('elenco-so-narrador').scrollIntoViewIfNeeded()
    await foto(page, 'descoberta-so-narrador')
  })
})
