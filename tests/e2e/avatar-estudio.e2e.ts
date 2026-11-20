import { mkdirSync, readFileSync } from 'node:fs'
import path from 'node:path'

import { expect, type Page, test } from '@playwright/test'
import sharp from 'sharp'

/**
 * O ESTÚDIO DO AVATAR (M6), pelo harness `tests/e2e/avatar-harness/estudio.html`: as peças aparecem no canvas (lê os
 * pixels, comparando com o quadro sem peça), o tier fraco só mostra as de acessibilidade, exportar e importar fazem
 * ida e volta idempotente, receita hostil é recusada com mensagem clara, e nenhuma requisição sai da mesma origem.
 *
 * Capturas: `$AVATAR_CAPTURAS` (padrão `tests/e2e/__capturas__/`, fora do git).
 */
const HARNESS = '/tests/e2e/avatar-harness/estudio.html'
const CAPTURAS = process.env.AVATAR_CAPTURAS || path.join(process.cwd(), 'tests', 'e2e', '__capturas__')

// SwiftShader: WebGL2 por software, o que o Chromium headless do CI tem.
test.use({
  launchOptions: { args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] },
  // Quadro estável: sem respiração, piscar nem balanço, para comparar pixels.
  reducedMotion: 'reduce',
})

const pronto = (page: Page) => page.locator('[data-avatar-pronto="true"]')

async function abrir(page: Page, query = '') {
  const externas: string[] = []
  const origem = new URL(process.env.BASE_URL || 'http://localhost:3100').origin
  page.on('request', (r) => {
    const u = r.url()
    if (/^(data|blob|about):/.test(u)) return
    if (new URL(u).origin !== origem) externas.push(u)
  })
  const erros: string[] = []
  // O WebSocket do HMR do Vite (dev server) pode fechar sem abrir; não é do Estúdio.
  page.on('pageerror', (e) => !/WebSocket closed/.test(e.message) && erros.push(e.message))
  await page.goto(`${HARNESS}?${query}&tamanho=${/tamanho=/.test(query) ? query.match(/tamanho=(\d+)/)![1] : 280}`)
  await expect(pronto(page)).toBeVisible({ timeout: 60_000 })
  return { externas, erros }
}

/** Quadro da prévia como RGBA bruto (o canvas já composto, via captura do elemento). */
async function quadro(page: Page): Promise<{ dados: Buffer; w: number; h: number }> {
  await page.waitForTimeout(250)
  const png = await page.locator('[data-avatar-pronto="true"]').screenshot()
  const { data, info } = await sharp(png).ensureAlpha().raw().toBuffer({ resolveWithObject: true })
  return { dados: data, w: info.width, h: info.height }
}

function diferenca(a: Buffer, b: Buffer): number {
  let n = 0
  for (let i = 0; i < a.length; i += 4) {
    const d = Math.abs(a[i] - b[i]) + Math.abs(a[i + 1] - b[i + 1]) + Math.abs(a[i + 2] - b[i + 2])
    if (d > 24) n += 1
  }
  return n
}

const relatorio = (page: Page) => page.evaluate(() => window.__estudioHarness!.relatorio())
const receita = (page: Page) => page.evaluate(() => window.__estudioHarness!.receita())
const alternar = (page: Page, id: string) => page.locator(`[data-peca="${id}"]`).click()

test.describe('estúdio do avatar (harness)', () => {
  test.beforeAll(() => mkdirSync(CAPTURAS, { recursive: true }))

  test('cada peça muda os pixels do canvas e nenhuma requisição sai da mesma origem', async ({ page }) => {
    const { externas, erros } = await abrir(page)
    const base = await quadro(page)
    const ids = [
      'oculos-redondo',
      'oculos-quadrado',
      'fone-de-ouvido',
      'aparelho-auditivo-esq',
      'aparelho-auditivo-dir',
      'implante-coclear-esq',
      'implante-coclear-dir',
      'bone',
      'chapeu-simples',
      'faixa-de-cabelo',
      'balao-de-fala',
    ]
    const mudou: Record<string, number> = {}
    for (const id of ids) {
      await alternar(page, id)
      await expect(page.locator(`[data-em-uso="${id}"]`)).toBeVisible()
      await expect.poll(async () => (await relatorio(page))?.montadas.includes(id)).toBe(true)
      mudou[id] = diferenca(base.dados, (await quadro(page)).dados)
      await alternar(page, id)
      await expect(page.locator(`[data-em-uso="${id}"]`)).toHaveCount(0)
    }
    console.log('pixels que mudam por peça:', JSON.stringify(mudou))
    for (const id of ids)
      expect(mudou[id], id).toBeGreaterThan(id.includes('auditivo') || id.includes('implante') ? 5 : 40)

    // Desligadas, o quadro volta ao de antes (as peças saíram da cena).
    expect(diferenca(base.dados, (await quadro(page)).dados)).toBeLessThan(300)
    expect(externas).toEqual([])
    expect(erros).toEqual([])
  })

  test('lenço e capa (peças do pescoço) aparecem num modelo com pescoço visível', async ({ page }) => {
    await abrir(page, 'fonte=/avatares/dev/bullidan.vrm&posse=capa')
    const base = await quadro(page)
    await alternar(page, 'lenco')
    await expect.poll(async () => (await relatorio(page))?.montadas).toEqual(['lenco'])
    expect(diferenca(base.dados, (await quadro(page)).dados)).toBeGreaterThan(200)
  })

  test('tier fraco: só aparelho auditivo, implante e óculos; o resto fica salvo mas não aparece', async ({ page }) => {
    await abrir(page, 'tier=fraco&pecas=oculos-redondo,bone,aparelho-auditivo-dir,balao-de-fala')
    await expect
      .poll(async () => (await relatorio(page))?.montadas.sort())
      .toEqual(['aparelho-auditivo-dir', 'oculos-redondo'])
    const r = await relatorio(page)
    expect(r?.omitidas.map((o) => o.id).sort()).toEqual(['balao-de-fala', 'bone'])
    expect(r?.omitidas.every((o) => o.motivo === 'tier')).toBe(true)
    await expect(page.getByTestId('estudio-tier-fraco')).toBeVisible()
    // A receita guarda as quatro: nada se perde.
    expect((await receita(page)).pecas).toEqual(['oculos-redondo', 'bone', 'aparelho-auditivo-dir', 'balao-de-fala'])
    /* Cada troca de peça redesenha o quadro, e o primeiro redesenho assenta a pose de repouso (as bordas finas dos
       braços mudam alguns pixels). Por isso as comparações são entre quadros JÁ redesenhados, nunca com o primeiro. */
    await alternar(page, 'bone')
    await alternar(page, 'balao-de-fala')
    const semOmitidas = await quadro(page)
    // Pôr e tirar de novo uma peça cortada pelo tier não muda o quadro; tirar as duas de acessibilidade, sim.
    await alternar(page, 'bone')
    await alternar(page, 'bone')
    expect(diferenca(semOmitidas.dados, (await quadro(page)).dados)).toBeLessThan(30)
    await alternar(page, 'oculos-redondo')
    await alternar(page, 'aparelho-auditivo-dir')
    expect(diferenca(semOmitidas.dados, (await quadro(page)).dados)).toBeGreaterThan(40)
  })

  test('cor da peça, ordem, desfazer e restaurar', async ({ page }) => {
    await abrir(page, 'pecas=oculos-quadrado,bone')
    const antes = await quadro(page)
    await page.locator('[data-cor-da-peca="bone:rosa"]').click()
    expect((await receita(page)).coresDasPecas).toEqual({ bone: 'rosa' })
    await expect(page.locator('[data-cor-da-peca="bone:rosa"]')).toHaveAttribute('aria-checked', 'true')
    expect(diferenca(antes.dados, (await quadro(page)).dados)).toBeGreaterThan(80)

    await page.getByRole('button', { name: 'Subir Boné na lista' }).click()
    expect((await receita(page)).pecas).toEqual(['bone', 'oculos-quadrado'])
    await page.getByRole('button', { name: 'Desfazer' }).click()
    expect((await receita(page)).pecas).toEqual(['oculos-quadrado', 'bone'])

    // Duas peças no mesmo lugar: a nova tira a antiga, e a tela diz.
    await alternar(page, 'chapeu-simples')
    expect((await receita(page)).pecas).toEqual(['oculos-quadrado', 'chapeu-simples'])
    await expect(page.getByTestId('estudio-mensagem')).toContainText('Saiu para dar lugar')

    await page.getByRole('button', { name: 'Restaurar' }).click()
    expect((await receita(page)).pecas).toEqual([])
    await expect(page.getByTestId('estudio-vazio')).toBeVisible()
    await page.getByRole('button', { name: 'Desfazer' }).click()
    expect((await receita(page)).pecas).toEqual(['oculos-quadrado', 'chapeu-simples'])
  })

  test('peça da loja sem posse fica trancada; com posse, entra', async ({ page }) => {
    await abrir(page, 'posse=capa')
    await page.locator('[data-peca="cartola"]').click({ force: true })
    expect((await receita(page)).pecas).toEqual([])
    await expect(page.getByTestId('estudio-mensagem')).toContainText('item da loja que você ainda não tem')
    await expect(page.locator('[data-peca="cartola"]')).toContainText('Na loja: 400 Seeds')
    // Acessibilidade nunca é trancada.
    for (const id of ['oculos-redondo', 'aparelho-auditivo-esq', 'implante-coclear-dir']) {
      await expect(page.locator(`[data-peca="${id}"]`)).not.toHaveAttribute('aria-disabled', 'true')
    }
    await alternar(page, 'capa')
    expect((await receita(page)).pecas).toEqual(['capa'])
  })

  test('exportar e importar: ida e volta idempotente, miniatura de 192 px', async ({ page }) => {
    await abrir(page, 'pecas=oculos-redondo,implante-coclear-esq,bone')
    await page.locator('[data-cor-da-peca="oculos-redondo:roxo"]').click()

    const [download] = await Promise.all([page.waitForEvent('download'), page.getByTestId('estudio-exportar').click()])
    expect(download.suggestedFilename()).toBe('avatar-ana-souza.frasy.json')
    const arquivo = path.join(CAPTURAS, 'receita-exportada.json')
    await download.saveAs(arquivo)
    const texto = readFileSync(arquivo, 'utf8')
    const obj = JSON.parse(texto)
    expect(Object.keys(obj)).toEqual(['ajustes', 'base', 'coresDasPecas', 'meta', 'paleta', 'pecas', 'versao'])
    expect(obj.versao).toBe(2)
    expect(obj.coresDasPecas).toEqual({ 'oculos-redondo': 'roxo' })

    // Limpa e importa de volta: a receita fica idêntica e um novo export é byte a byte o mesmo.
    const original = await receita(page)
    await page.getByRole('button', { name: 'Restaurar' }).click()
    expect((await receita(page)).pecas).toEqual([])
    await page.getByTestId('estudio-arquivo').setInputFiles(arquivo)
    await expect(page.getByTestId('estudio-mensagem')).toContainText('Receita aberta')
    expect(await receita(page)).toEqual(original)
    const [outro] = await Promise.all([page.waitForEvent('download'), page.getByTestId('estudio-exportar').click()])
    const arquivo2 = path.join(CAPTURAS, 'receita-exportada-2.json')
    await outro.saveAs(arquivo2)
    expect(readFileSync(arquivo2, 'utf8')).toBe(texto)

    // Miniatura de 192 px pelo mesmo caminho do M2 (`capturarMiniatura`).
    await page.getByTestId('estudio-miniatura-botao').click()
    const mini = page.getByTestId('estudio-miniatura')
    await expect(mini).toBeVisible()
    const lado = await mini.evaluate((i: HTMLImageElement) => [i.naturalWidth, i.naturalHeight])
    expect(lado).toEqual([192, 192])
    expect(await page.evaluate(() => window.__estudioHarness!.miniaturas().length)).toBe(1)
  })

  test('receita hostil é recusada com mensagem clara e nada muda', async ({ page }) => {
    const { externas } = await abrir(page, 'pecas=bone')
    const antes = await receita(page)
    const casos: Array<[string, string | Buffer, RegExp]> = [
      ['nao-json.json', 'isto nao e json', /não é um JSON válido/],
      ['proto.json', '{"__proto__":{"admin":true},"versao":2}', /campo que o Frasy não conhece/],
      [
        'url.json',
        JSON.stringify({ versao: 2, meta: { nome: 'http://evil.example' } }),
        /endereços da internet|incompleta/,
      ],
      ['grande.json', Buffer.alloc(20_000, 0x20), /grande demais/],
      ['fundo.json', '['.repeat(500) + ']'.repeat(500), /estrutura complicada/],
      [
        'peca-desconhecida.json',
        JSON.stringify({
          versao: 2,
          base: { origem: 'colecao', id: 'milk' },
          paleta: { pele: 'padrao', cabelo: 'padrao', olhos: 'padrao' },
          pecas: ['jetpack'],
          coresDasPecas: {},
          ajustes: {},
          meta: { nome: 'x', criadoEm: 1 },
        }),
        /peça que o Frasy não conhece/,
      ],
    ]
    for (const [nome, conteudo, mensagem] of casos) {
      await page.getByTestId('estudio-arquivo').setInputFiles({
        name: nome,
        mimeType: 'application/json',
        buffer: Buffer.isBuffer(conteudo) ? conteudo : Buffer.from(conteudo),
      })
      await expect(page.getByTestId('estudio-mensagem')).toContainText('Esta receita não foi aberta')
      await expect(page.getByTestId('estudio-mensagem')).toContainText(mensagem)
      expect(await receita(page), nome).toEqual(antes)
    }
    expect(externas).toEqual([])
  })

  test('base importada que não existe neste aparelho: avisa "modelo não encontrado"', async ({ page }) => {
    await abrir(page)
    const receitaComBaseImportada = JSON.stringify({
      versao: 2,
      base: { origem: 'importado', id: 'meu-modelo-que-nao-existe' },
      paleta: { pele: 'padrao', cabelo: 'padrao', olhos: 'padrao' },
      pecas: ['oculos-redondo'],
      coresDasPecas: {},
      ajustes: {},
      meta: { nome: 'Sem arquivo', criadoEm: 1 },
    })
    await page
      .getByTestId('estudio-arquivo')
      .setInputFiles({ name: 'r.json', mimeType: 'application/json', buffer: Buffer.from(receitaComBaseImportada) })
    await expect(page.getByTestId('estudio-mensagem')).toContainText('Modelo não encontrado neste aparelho')
    expect((await receita(page)).base).toEqual({ origem: 'importado', id: 'meu-modelo-que-nao-existe' })
  })

  test('teclado: Tab alcança as peças e Enter liga; leitor de tela recebe o estado', async ({ page }) => {
    await abrir(page)
    const peca = page.locator('[data-peca="oculos-redondo"]')
    await peca.focus()
    await expect(peca).toBeFocused()
    await expect(peca).toHaveAttribute('aria-pressed', 'false')
    await page.keyboard.press('Enter')
    await expect(peca).toHaveAttribute('aria-pressed', 'true')
    await expect(peca).toContainText('Em uso')
    await expect(page.getByRole('status')).toContainText('entrou no avatar')
    await page.keyboard.press('Space')
    await expect(peca).toHaveAttribute('aria-pressed', 'false')
  })

  test('capturas: desktop 1280 e celular 390, com peças', async ({ page }) => {
    const pecas = 'oculos-redondo,aparelho-auditivo-dir,implante-coclear-esq,bone,lenco'
    for (const [nome, w, h] of [
      ['desktop-1280', 1280, 1500],
      ['celular-390', 390, 2200],
    ] as const) {
      await page.setViewportSize({ width: w, height: h })
      await abrir(page, `pecas=${pecas}&tamanho=${w < 500 ? 260 : 320}`)
      await page.waitForTimeout(500)
      await page.screenshot({ path: path.join(CAPTURAS, `estudio-${nome}.png`), fullPage: true })
    }
    await page.setViewportSize({ width: 1280, height: 900 })
    for (const modelo of ['bullidan', 'milk']) {
      for (const [nome, ids] of [
        ['oculos-fone', 'oculos-quadrado,fone-de-ouvido'],
        ['faixa-balao', 'faixa-de-cabelo,balao-de-fala'],
        ['chapeu-capa', 'chapeu-simples,capa'],
        ['aparelhos', 'aparelho-auditivo-esq,implante-coclear-dir,oculos-redondo'],
        ['bone-lenco', 'bone,lenco'],
        ['cartola-explorador', 'cartola'],
      ] as const) {
        await abrir(
          page,
          `fonte=/avatares/dev/${modelo}.vrm&pecas=${ids}&posse=capa,cartola,chapeu-de-explorador&tamanho=320`,
        )
        await page.waitForTimeout(500)
        await page
          .locator('[data-avatar-pronto="true"]')
          .screenshot({ path: path.join(CAPTURAS, `peca-${modelo}-${nome}.png`) })
      }
    }
  })
})
