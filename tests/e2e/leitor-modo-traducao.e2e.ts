import { expect, type Frame, type Page, test } from '@playwright/test'
import { strToU8, zipSync } from 'fflate'

import { abrirTela, fecharSobreposicoes } from './_helpers'

/**
 * O MODO TRADUÇÃO DO LEITOR (openspec `leitura-assistida`, fatia B): com a flag `leitor_modo_traducao` ligada, soltar a
 * seleção traduz sozinho num balão ancorado ao trecho, que NUNCA o cobre; sem a flag, nada muda (a barra traduz como sempre).
 *
 * AS FONTES E A TRADUÇÃO SÃO RESPONDIDAS PELO PRÓPRIO TESTE (`page.route`): o catálogo, o EPUB, `/api/flags` e `/api/ai/mt`.
 */

const EPUB_DO_SE = 'https://standardebooks.org/ebooks/teste/pequena-viagem/downloads/teste_pequena-viagem.epub'
const ID = 'se-teste-pequena-viagem'
const FRASE = 'The little boat wanted to see the sea.'

const CATALOGO = {
  versao: 1,
  ano: 2026,
  anoLimite: 1955,
  geradoEm: '2026-10-26T12:00:00.000Z',
  livros: [
    {
      id: ID,
      titulo: 'A Pequena Viagem',
      autores: [{ nome: 'Autora Antiga', anoMorte: 1900, idiomas: ['en'] }],
      tradutores: [],
      idioma: 'en',
      fonte: 'standard-ebooks',
      fonteId: 'teste/pequena-viagem',
      formatos: { epub: EPUB_DO_SE, pagina: 'https://standardebooks.org/ebooks/teste/pequena-viagem' },
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

/** Um EPUB mínimo, em inglês, com três parágrafos. */
function epub(): Buffer {
  const corpo = `<h2>Chapter one</h2><p>${FRASE}</p><p>It sailed past the old lighthouse.</p><p>Nobody on the shore noticed it.</p>`
  return Buffer.from(
    zipSync({
      mimetype: strToU8('application/epub+zip'),
      'META-INF/container.xml': strToU8(
        '<?xml version="1.0"?><container version="1.0" xmlns="urn:oasis:names:tc:opendocument:xmlns:container"><rootfiles><rootfile full-path="OEBPS/c.opf" media-type="application/oebps-package+xml"/></rootfiles></container>',
      ),
      'OEBPS/c.opf': strToU8(
        '<?xml version="1.0"?><package xmlns="http://www.idpf.org/2007/opf" version="3.0" unique-identifier="u"><metadata xmlns:dc="http://purl.org/dc/elements/1.1/"><dc:identifier id="u">x</dc:identifier><dc:title>A Pequena Viagem</dc:title><dc:creator>Autora Antiga</dc:creator><dc:language>en</dc:language></metadata><manifest><item id="c1" href="cap1.xhtml" media-type="application/xhtml+xml"/></manifest><spine><itemref idref="c1"/></spine></package>',
      ),
      'OEBPS/cap1.xhtml': strToU8(
        `<?xml version="1.0"?><html xmlns="http://www.w3.org/1999/xhtml"><head><title>1</title></head><body>${corpo}</body></html>`,
      ),
    }),
  )
}

const CORS = { 'access-control-allow-origin': '*' }

async function prepararFontes(page: Page, flags: { balao: boolean }) {
  await page.route('**/catalogo/livros.json', (r) =>
    r.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(CATALOGO) }),
  )
  await page.route('https://standardebooks.org/**', (r) =>
    r.fulfill({ status: 200, headers: { ...CORS, 'content-type': 'application/epub+zip' }, body: epub() }),
  )
  await page.route('**/api/flags', (r) =>
    r.fulfill({
      json: { flags: { leitor_modo_traducao: { ligada: flags.balao } } },
    }),
  )
}

async function abrirOLivro(page: Page) {
  await abrirTela(page, `/livros/${ID}/ler`)
  await expect(page.locator('[data-testid=leitor][data-estado=pronto]')).toBeVisible({ timeout: 30_000 })
  await fecharSobreposicoes(page)
  await expect(async () => {
    const quadro = page.frames().find((f) => f.url().startsWith('blob:'))
    expect(quadro).toBeTruthy()
    await expect(quadro!.getByText(FRASE)).toBeVisible({ timeout: 1000 })
  }).toPass({ timeout: 15_000 })
}

/** Seleciona o parágrafo no documento do capítulo (como o arrastar do dedo). */
async function selecionar(page: Page, texto: string) {
  const quadro = page.frames().find((f: Frame) => f.url().startsWith('blob:'))!
  await quadro.evaluate((t) => {
    const p = [...document.querySelectorAll('p')].find((x) => x.textContent?.includes(t))
    if (!p) throw new Error(`sem parágrafo com "${t}"`)
    const r = document.createRange()
    r.selectNodeContents(p)
    const s = getSelection()!
    s.removeAllRanges()
    s.addRange(r)
    document.dispatchEvent(new PointerEvent('pointerup', { bubbles: true }))
  }, texto)
}

/**
 * A IA de nuvem AUTORIZADA neste aparelho, só na resposta do GET `/api/settings`. SEMPRE um GET ao servidor: repassar
 * o PUT gravaria o consentimento no banco, e a suíte seguinte (mesmo banco) herdaria a nuvem autorizada.
 */
async function comNuvemAutorizada(page: Page) {
  await page.route('**/api/settings', async (route) => {
    const pedido = route.request()
    const resposta = await route.fetch({ method: 'GET', postData: undefined })
    const s = (await resposta.json().catch(() => ({}))) as Record<string, unknown>
    if (pedido.method() !== 'GET') {
      const corpo = (pedido.postDataJSON() ?? {}) as { ui?: unknown }
      return route.fulfill({ json: { ...s, ui: JSON.stringify(corpo.ui ?? {}) } })
    }
    try {
      const ui = typeof s.ui === 'string' ? (JSON.parse(s.ui) as Record<string, unknown>) : {}
      const p = (ui.preferencias ?? {}) as Record<string, unknown>
      p.consentimentos = { ...((p.consentimentos as object) ?? {}), nuvem: true }
      ui.preferencias = p
      s.ui = JSON.stringify(ui)
    } catch {
      /* ui ilegível: fica como veio */
    }
    return route.fulfill({ response: resposta, json: s })
  })
}

async function mockMt(page: Page) {
  await page.route('**/api/ai/mt', async (r) => {
    const { text } = r.request().postDataJSON() as { text: string }
    /* Não pode conter o original: o gateway recusa tradução que é eco do texto. */
    await r.fulfill({ status: 200, json: { text: `Tradução: ${text.split(' ').reverse().join(' ')}` } })
  })
}

test.describe('Leitor: modo tradução', () => {
  test('com a flag: soltar a seleção traduz num balão que não cobre o trecho', async ({ page }) => {
    test.setTimeout(120_000)
    await prepararFontes(page, { balao: true })
    await comNuvemAutorizada(page)
    await mockMt(page)
    await abrirOLivro(page)
    await selecionar(page, FRASE)
    await page.getByTestId('selecao-modo-traducao').click() // liga o modo (fica no aparelho)
    await expect(page.getByTestId('selecao-modo-traducao')).toHaveAttribute('aria-checked', 'true')
    await selecionar(page, 'It sailed past the old lighthouse.')
    const balao = page.getByTestId('balao-da-traducao')
    await expect(balao).toBeVisible({ timeout: 15_000 })
    await expect(page.getByTestId('balao-traducao-texto')).toContainText('Tradução:', { timeout: 15_000 })

    /* O balão não pode tocar o trecho selecionado (caixa do trecho na janela do app). */
    const quadro = page.frames().find((f: Frame) => f.url().startsWith('blob:'))!
    const trecho = await quadro.evaluate((t) => {
      const p = [...document.querySelectorAll('p')].find((x) => x.textContent?.includes(t))!
      const b = p.getBoundingClientRect()
      return { x: b.left, y: b.top, w: b.width, h: b.height }
    }, 'It sailed past the old lighthouse.')
    const moldura = (await (await quadro.frameElement()).boundingBox())!
    const b = (await balao.boundingBox())!
    const t = { x: trecho.x + moldura.x, y: trecho.y + moldura.y, w: trecho.w, h: trecho.h }
    const sobrepoe = b.x < t.x + t.w && t.x < b.x + b.width && b.y < t.y + t.h && t.y < b.y + b.height
    expect(sobrepoe, 'o balão cobriu o trecho').toBe(false)
    /* E cabe na tela. */
    const vp = page.viewportSize()!
    expect(b.x).toBeGreaterThanOrEqual(0)
    expect(b.x + b.width).toBeLessThanOrEqual(vp.width)

    /* Atalho C copia; Esc fecha tudo. */
    await page.keyboard.press('Escape')
    await expect(balao).toBeHidden()
  })

  test('sem a flag: nenhum interruptor e nenhum balão; "Traduzir" traduz na barra', async ({ page }) => {
    test.setTimeout(120_000)
    await prepararFontes(page, { balao: false })
    await comNuvemAutorizada(page)
    await mockMt(page)
    await abrirOLivro(page)
    await selecionar(page, FRASE)
    await expect(page.getByTestId('barra-da-selecao')).toBeVisible()
    await expect(page.getByTestId('selecao-modo-traducao')).toHaveCount(0)
    await page.getByRole('button', { name: 'Traduzir', exact: true }).click()
    await expect(page.getByTestId('barra-da-selecao').getByRole('status')).toContainText('Tradução:', {
      timeout: 15_000,
    })
    await expect(page.getByTestId('balao-da-traducao')).toHaveCount(0)
  })
})
