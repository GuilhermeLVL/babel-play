import { expect, type Frame, type Page, test } from '@playwright/test'
import { strToU8, zipSync } from 'fflate'

import { abrirTela, fecharSobreposicoes } from './_helpers'

/**
 * AS FERRAMENTAS DE IA À VISTA NO LEITOR (spec `docs/specs/2026-10-28-leitor-ia-visivel.md`): o painel "IA" lista
 * as quatro com o motivo; a barra do trecho mantém Explicar e Perguntar mesmo indisponíveis; o parceiro responde
 * (e recusa com frase humana); o capítulo é traduzido lado a lado, e dá para parar.
 *
 * AS FONTES E A IA SÃO RESPONDIDAS PELO PRÓPRIO TESTE (`page.route`): o catálogo, o EPUB do Standard Ebooks,
 * `/api/flags`, `/api/ai/leitura/parceiro` e `/api/ai/mt`. Nenhuma chamada real de IA.
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

async function prepararFontes(page: Page, flags: { estudo: boolean; parceiro: boolean }) {
  await page.route('**/catalogo/livros.json', (r) =>
    r.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(CATALOGO) }),
  )
  await page.route('https://standardebooks.org/**', (r) =>
    r.fulfill({ status: 200, headers: { ...CORS, 'content-type': 'application/epub+zip' }, body: epub() }),
  )
  await page.route('**/api/flags', (r) =>
    r.fulfill({
      json: { flags: { ia_de_estudo: { ligada: flags.estudo }, parceiro_de_leitura: { ligada: flags.parceiro } } },
    }),
  )
}

const RESPOSTA_DO_PARCEIRO = {
  resposta: {
    texto: 'O barco pequeno queria conhecer o mar.',
    pontos: ['O barco é o personagem', 'O mar é o desejo dele'],
    citacoes: [{ trechoId: 'selecao', exato: 'wanted to see the sea' }],
    naoEstaNoTrecho: false,
  },
  origem: 'modelo',
  restanteHoje: 39,
  textoConferido: false,
  aviso: 'Gerado por IA a partir do texto e da ficha do livro.',
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

test.describe('Leitor: ferramentas de IA', () => {
  test('desligadas: continuam à vista, e cada uma diz por quê', async ({ page }) => {
    await prepararFontes(page, { estudo: false, parceiro: false })
    await abrirOLivro(page)

    await page.getByTestId('leitor-ia').click()
    const lista = page.getByTestId('ia-lista')
    await expect(lista.locator('[data-ferramenta]')).toHaveCount(4)
    await expect(lista.locator('[data-ferramenta=explicar] .leitor-ia-motivo')).toContainText('Em breve')
    await expect(lista.locator('[data-ferramenta=parceiro] .leitor-ia-motivo')).toContainText('Em breve')
    await expect(lista.locator('[data-ferramenta=traduzir-capitulo] button')).toBeVisible()
    await page.getByRole('button', { name: 'Fechar o painel' }).click()

    /* A barra do trecho mantém os dois botões: desabilitados para o leitor de tela, focáveis e com a razão. */
    await selecionar(page, FRASE)
    const explicar = page.getByTestId('selecao-explicar')
    const perguntar = page.getByTestId('selecao-parceiro')
    await expect(explicar).toHaveAttribute('aria-disabled', 'true')
    await expect(perguntar).toHaveAttribute('aria-disabled', 'true')
    await expect(explicar).toHaveAttribute('title', /Em breve/)
    await expect(page.getByTestId('selecao-motivo')).toHaveText('')
    await explicar.click({ force: true })
    await expect(page.getByTestId('selecao-motivo')).toContainText('Em breve')
    await expect(explicar).toHaveAttribute('aria-describedby', /.+/)
    await expect(page.getByTestId('explicacao-da-frase')).toHaveCount(0)
  })

  test('parceiro: pergunta sobre o trecho, mostra a resposta com a citação e o aviso de IA', async ({ page }) => {
    await prepararFontes(page, { estudo: true, parceiro: true })
    await comNuvemAutorizada(page)
    const pedidos: Array<Record<string, unknown>> = []
    await page.route('**/api/ai/leitura/parceiro', (r) => {
      pedidos.push(r.request().postDataJSON())
      return r.fulfill({ status: 200, json: RESPOSTA_DO_PARCEIRO, headers: { 'x-ia-modelo': 'teste' } })
    })
    await abrirOLivro(page)
    await selecionar(page, FRASE)

    await page.getByTestId('selecao-parceiro').click()
    const painel = page.getByTestId('painel-do-parceiro')
    await expect(painel).toBeVisible()
    /* "Perguntar" na barra abre o parceiro já no modo pergunta; troca para Explicar e pede. */
    await painel.locator('[data-modo=explicar]').click()
    await page.getByTestId('parceiro-pedir').click()
    const resposta = page.getByTestId('parceiro-resposta')
    await expect(resposta).toContainText('O barco pequeno queria conhecer o mar.')
    await expect(resposta).toContainText('“wanted to see the sea”')
    await expect(resposta).toContainText('Gerado por IA')
    await expect(resposta).toContainText('Restam 39 hoje')

    expect(pedidos).toHaveLength(1)
    expect(pedidos[0]).toMatchObject({
      modo: 'explicar',
      livro: { origem: 'catalogo', id: ID },
      idiomaDoLivro: 'en',
    })
    expect(String(pedidos[0].selecao)).toContain('little boat')
    expect(JSON.stringify(pedidos[0].trechos)).toContain('old lighthouse')
  })

  test('parceiro: o 402 do plano vira frase humana, sem oferta e sem "tentar de novo"', async ({ page }) => {
    await prepararFontes(page, { estudo: true, parceiro: true })
    await comNuvemAutorizada(page)
    await page.route('**/api/ai/leitura/parceiro', (r) =>
      r.fulfill({ status: 402, json: { error: 'o plano não inclui', code: 'sem_plano' } }),
    )
    await abrirOLivro(page)
    await selecionar(page, FRASE)
    await page.getByTestId('selecao-parceiro').click()
    await page.getByTestId('painel-do-parceiro').locator('[data-modo=explicar]').click()
    await page.getByTestId('parceiro-pedir').click()
    await expect(page.getByTestId('parceiro-status')).toContainText('planos pagos')
    await expect(page.getByTestId('parceiro-status')).not.toContainText(/R\$|corra|últim/i)
    await expect(page.getByRole('button', { name: 'Tentar de novo' })).toHaveCount(0)
  })

  test('parceiro: nuvem ocupada oferece tentar de novo e a segunda vez funciona', async ({ page }) => {
    await prepararFontes(page, { estudo: true, parceiro: true })
    await comNuvemAutorizada(page)
    let n = 0
    await page.route('**/api/ai/leitura/parceiro', (r) =>
      ++n === 1
        ? r.fulfill({ status: 429, json: { error: 'ocupada', code: 'nuvem_ocupada' } })
        : r.fulfill({ status: 200, json: RESPOSTA_DO_PARCEIRO, headers: { 'x-ia-modelo': 'teste' } }),
    )
    await abrirOLivro(page)
    await selecionar(page, FRASE)
    await page.getByTestId('selecao-parceiro').click()
    await page.getByTestId('painel-do-parceiro').locator('[data-modo=explicar]').click()
    await page.getByTestId('parceiro-pedir').click()
    await expect(page.getByTestId('parceiro-status')).toContainText('nuvem está ocupada')
    await page.getByRole('button', { name: 'Tentar de novo' }).click()
    await expect(page.getByTestId('parceiro-resposta')).toContainText('O barco pequeno')
  })

  test('traduz o capítulo lado a lado, com progresso, e dá para parar', async ({ page }) => {
    test.setTimeout(240_000)
    await prepararFontes(page, { estudo: true, parceiro: true })
    await comNuvemAutorizada(page)
    /* O motor é o do leitor (no aparelho; a nuvem só de reserva). Se o aparelho não tiver o modelo, a nuvem é este
       mock; o teste vale para os dois caminhos e só olha o que a TELA faz. Devagar o bastante para dar tempo de parar. */
    await page.route('**/api/ai/mt', async (r) => {
      await new Promise((ok) => setTimeout(ok, 400))
      const { text } = r.request().postDataJSON() as { text: string }
      await r.fulfill({ status: 200, json: { text: `PT: ${text}` } })
    })
    await abrirOLivro(page)
    await page.getByTestId('leitor-ia').click()
    await page.locator('[data-ferramenta=traduzir-capitulo] button').click()
    const painel = page.getByTestId('painel-da-traducao')
    await expect(painel).toBeVisible()
    const pares = painel.locator('.leitor-bilingue-par')
    await expect(pares).toHaveCount(4) // título + 3 parágrafos
    await expect(pares.nth(1)).toContainText(FRASE)

    await page.getByTestId('traduzir-capitulo').click()
    const parar = page.getByTestId('cancelar-traducao')
    await expect(parar).toBeVisible()
    await expect(page.getByTestId('traducao-progresso')).toBeVisible()
    /* O primeiro parágrafo traduzido aparece ao lado do original. */
    await expect(painel.locator('.leitor-bilingue-traducao').first()).toBeVisible({ timeout: 120_000 })
    await parar.click()
    await expect(page.getByTestId('traducao-status')).toContainText('Parei')
    await expect(page.getByRole('button', { name: 'Continuar a tradução' })).toBeVisible()
    const feitos = await painel.locator('.leitor-bilingue-traducao').count()
    expect(feitos).toBeGreaterThanOrEqual(1)

    /* Continuar termina o que faltava. */
    await page.getByRole('button', { name: 'Continuar a tradução' }).click()
    await expect(page.getByTestId('traducao-status')).toContainText('Capítulo traduzido', { timeout: 120_000 })
    await expect(painel.locator('.leitor-bilingue-traducao')).toHaveCount(4)

    /* O texto do livro não mudou: o capítulo continua em inglês, sem a tradução. */
    const quadro = page.frames().find((f) => f.url().startsWith('blob:'))!
    await expect(quadro.getByText(FRASE)).toBeVisible()
    await expect(quadro.getByText('PT: ', { exact: false })).toHaveCount(0)
  })
})
