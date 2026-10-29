import { mkdirSync } from 'node:fs'
import path from 'node:path'

import { expect, type Page, test } from '@playwright/test'

import { construirGlb, META1_BASE, pngBomba, vrm1Vroid } from '../harness/avatarFixtures'

/**
 * "MEU AVATAR" (M2) no app de verdade: Perfil > Avatar atrás da flag `avatar_3d` (ligada por interceptação de
 * `GET /api/flags`, como os outros e2e de flag). Escolher, personalizar, salvar, recarregar e ver persistido;
 * importar um arquivo válido (com o validador da Khronos num Worker de verdade) e um hostil; perfil protegido
 * (sem importar e sem galeria); sem WebGL (fallback de iniciais); a galeria só depois do opt-in.
 *
 * Capturas: `$CLAUDE_JOB_DIR/tmp` (ou `tests/e2e/__capturas__/`, fora do git).
 */
const PASTA = process.env.AVATAR_CAPTURAS
  ? process.env.AVATAR_CAPTURAS
  : process.env.CLAUDE_JOB_DIR
    ? path.join(process.env.CLAUDE_JOB_DIR, 'tmp')
    : path.join(process.cwd(), 'tests', 'e2e', '__capturas__')
mkdirSync(PASTA, { recursive: true })

// SwiftShader: WebGL2 por software, o que o Chromium headless do CI tem.
test.use({
  launchOptions: { args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] },
})

const foto = (page: Page, nome: string) =>
  page.screenshot({ path: path.join(PASTA, `avatar-${nome}.png`), fullPage: true })

async function abrirAvatar(page: Page) {
  await page.route('**/api/flags', (r) => r.fulfill({ json: { flags: { avatar_3d: { ligada: true } } } }))
  await page.goto('/perfil')
  await expect(page.getByTestId('perfil-do-quest')).toBeVisible()
  await page.getByRole('tab', { name: 'Avatar' }).click()
  await expect(page.getByTestId('aba-avatar')).toBeVisible()
}

/** A prévia viva terminou de carregar (o canvas desenhou) ou caiu no fallback. */
const previaPronta = (page: Page) => page.locator('[data-avatar-pronto="true"]')

test.beforeEach(async ({ page }) => {
  // Cada teste começa sem avatar nem trava guardados neste navegador.
  await page.addInitScript(() => {
    if (sessionStorage.getItem('__limpo')) return
    sessionStorage.setItem('__limpo', '1')
    for (const k of Object.keys(localStorage)) if (k.startsWith('frasy.avatar')) localStorage.removeItem(k)
    indexedDB.deleteDatabase('frasy-avatar')
  })
})

test.describe('Meu avatar', () => {
  test('sem a flag, a aba nem aparece e a moldura não muda', async ({ page }) => {
    await page.route('**/api/flags', (r) => r.fulfill({ json: { flags: {} } }))
    await page.goto('/perfil')
    await expect(page.getByTestId('perfil-do-quest')).toBeVisible()
    await expect(page.getByRole('tab', { name: 'Avatar' })).toHaveCount(0)
    await expect(page.locator('[data-avatar-do-usuario]')).toHaveCount(0)
  })

  test('leigo: abrir, escolher para mim e salvar em 3 toques; recarregar e ver persistido; apagar', async ({
    page,
  }) => {
    await abrirAvatar(page) // toque 1: a aba "Avatar"
    await expect(previaPronta(page)).toBeVisible({ timeout: 30_000 })
    await foto(page, '1-sugestao')

    await page.getByTestId('avatar-sortear').click() // toque 2
    await page.getByTestId('avatar-salvar').click() // toque 3
    await expect(page.getByTestId('avatar-status')).toContainText('Avatar salvo neste aparelho')
    await expect(page.getByTestId('avatar-credito')).toContainText('Salvo neste aparelho')
    await foto(page, '2-salvo')

    // A miniatura estática foi guardada, e é uma imagem (nenhum canvas na moldura do perfil).
    const miniatura = await page.evaluate(() =>
      localStorage.getItem(
        'frasy.avatar.miniatura.' +
          (Object.keys(localStorage)
            .find((k) => k.startsWith('frasy.avatar.miniatura.'))
            ?.split('.')
            .pop() ?? 'local'),
      ),
    )
    expect(miniatura).toMatch(/^data:image\/(webp|png);base64,/)

    // Recarregar: o mesmo avatar volta, e a moldura do cabeçalho mostra a miniatura.
    await page.reload()
    await expect(page.locator('header [data-avatar-do-usuario="avatar"]')).toBeVisible()
    await page.getByRole('tab', { name: 'Avatar' }).click()
    await expect(page.getByTestId('avatar-credito')).toContainText('Salvo neste aparelho')
    await expect(page.locator('header canvas')).toHaveCount(0)
    await foto(page, '3-recarregado')

    // A moldura GRANDE da aba "Você" mostra o rosto do avatar (192 px, imagem, sem WebGL) em vez de "?", e
    // "Enviar foto" continua ali como alternativa.
    await page.getByRole('tab', { name: 'Você' }).click()
    const grande = page.locator('.qc-foto-avatar')
    await expect(grande).toBeVisible()
    expect(await grande.evaluate((el) => (el as HTMLImageElement).naturalWidth)).toBe(192)
    await expect(page.getByText('Enviar foto')).toBeVisible()
    await expect(page.locator('.qc-foto canvas')).toHaveCount(0)
    await foto(page, '3b-voce-com-avatar')
    await page.getByRole('tab', { name: 'Avatar' }).click()

    // Apagar volta à foto/iniciais: a miniatura some.
    await page.getByTestId('avatar-apagar').click()
    await page.getByTestId('avatar-apagar-confirma').click()
    await expect(page.getByTestId('avatar-status')).toContainText('Avatar apagado')
    await expect(page.locator('header [data-avatar-do-usuario="avatar"]')).toHaveCount(0)
    await page.reload()
    await page.getByRole('tab', { name: 'Avatar' }).click()
    await expect(page.getByTestId('avatar-credito')).toContainText('Sugerido para você')
  })

  test('estúdio no Perfil: peça entra, a receita salva é v2 com a peça e volta depois de recarregar', async ({
    page,
  }) => {
    await abrirAvatar(page)
    await page.getByTestId('avatar-sortear').click()
    await page.getByRole('tab', { name: 'Estúdio' }).click()
    await expect(page.getByTestId('estudio-do-avatar')).toBeVisible()
    await page.locator('[data-peca="oculos-redondo"]').click()
    await expect(page.getByTestId('estudio-mensagem')).toContainText('entrou no avatar')
    await page.getByTestId('avatar-salvar').click()
    await expect(page.getByTestId('avatar-status')).toContainText('Avatar salvo')
    const guardada = await page.evaluate(() => {
      const k = Object.keys(localStorage).find((x) => x.startsWith('frasy.avatar.receita.'))
      return k ? JSON.parse(localStorage.getItem(k) as string) : null
    })
    expect(guardada?.versao).toBe(2)
    expect(guardada?.pecas).toEqual(['oculos-redondo'])
    await page.reload()
    await page.getByRole('tab', { name: 'Avatar' }).click()
    await page.getByRole('tab', { name: 'Estúdio' }).click()
    await expect(page.locator('[data-peca="oculos-redondo"]')).toHaveAttribute('aria-pressed', 'true')
  })

  test('personalizar: ajustes com prévia, desfazer, restaurar; a paleta some onde o modelo não permite; persiste', async ({
    page,
  }) => {
    await abrirAvatar(page)
    await page.getByTestId('avatar-sortear').click()
    await page.getByRole('tab', { name: 'Personalizar' }).click()
    // O modelo da coleção tem uma textura só: o controle de cores é escondido e a tela explica.
    await expect(page.getByTestId('avatar-sem-paleta')).toBeVisible()
    await expect(page.locator('[data-cor]')).toHaveCount(0)

    const altura = page.locator('[data-ajuste="altura"]')
    await altura.fill('1.1')
    await expect(page.getByText('110%')).toBeVisible()
    await page.locator('[data-ajuste="escala"]').fill('0.8')
    await page.getByRole('textbox', { name: /Nome do avatar/ }).fill('Alex')
    await foto(page, '4-personalizado')

    await page.getByRole('button', { name: /Desfazer/ }).click() // desfaz o nome (o último passo)
    await page.getByRole('button', { name: /Desfazer/ }).click() // desfaz a escala
    await expect(page.locator('[data-ajuste="escala"]')).toHaveValue('1')
    await page.locator('[data-ajuste="escala"]').fill('0.8')
    await page.getByTestId('avatar-salvar').click()
    await expect(page.getByTestId('avatar-status')).toContainText('Avatar salvo')

    await page.reload()
    await page.getByRole('tab', { name: 'Avatar' }).click()
    await page.getByRole('tab', { name: 'Personalizar' }).click()
    await expect(page.locator('[data-ajuste="altura"]')).toHaveValue('1.1')
    await expect(page.locator('[data-ajuste="escala"]')).toHaveValue('0.8')

    await page.getByRole('button', { name: /Restaurar padrão/ }).click()
    await expect(page.locator('[data-ajuste="altura"]')).toHaveValue('1')
    await expect(page.getByTestId('avatar-credito')).toContainText('Alterações não salvas')
  })

  test('traga o seu: arquivo válido passa pelo validador da Khronos, mostra o crédito e fica só no aparelho', async ({
    page,
  }) => {
    const externas: string[] = []
    const origem = new URL(process.env.BASE_URL || 'http://localhost:3100').origin
    page.on('request', (r) => {
      const u = r.url()
      if (!/^(data|blob|about):/.test(u) && new URL(u).origin !== origem) externas.push(u)
    })
    // Corpos enviados pelo navegador: o app tem telemetria própria (presença), mas NADA com o arquivo do avatar.
    const corpos: Array<{ url: string; tamanho: number; temModelo: boolean }> = []
    page.on('request', (r) => {
      if (r.method() === 'GET' || r.method() === 'OPTIONS' || r.method() === 'HEAD') return
      const buf = r.postDataBuffer()
      corpos.push({ url: r.url(), tamanho: buf?.length ?? 0, temModelo: !!buf && buf.includes('glTF') })
    })

    await abrirAvatar(page)
    await page.getByRole('tab', { name: 'Traga o seu' }).click()
    await expect(page.getByTestId('avatar-passos').locator('[data-passo]')).toHaveCount(4)
    await foto(page, '5-traga-o-seu')

    await page.getByTestId('avatar-arquivo').setInputFiles({
      name: 'vroid.vrm',
      mimeType: 'model/gltf-binary',
      buffer: Buffer.from(vrm1Vroid()),
    })
    const ok = page.getByTestId('avatar-importador-ok')
    await expect(ok).toBeVisible({ timeout: 30_000 })
    await expect(ok).toContainText('Autora Teste')
    // O validador rodou de verdade (sem "não pôde rodar").
    await expect(ok).not.toContainText('não pôde rodar neste navegador')
    await expect(page.locator(':focus')).toHaveText(/O arquivo passou na conferência/)
    await foto(page, '6-importado-ok')

    // A prévia já mostra o arquivo aceito, dito "não salvo", com como voltar ao anterior; salvar fica desligado.
    await expect(page.getByTestId('avatar-credito')).toContainText('Prévia, ainda não usada nem salva')
    await expect(page.getByTestId('avatar-credito')).toContainText('Modelo de teste')
    await expect(page.getByTestId('avatar-salvar')).toBeDisabled()
    await expect(page.locator('[data-avatar-pronto="true"]')).toBeVisible({ timeout: 30_000 })
    await foto(page, '6b-importado-previa')
    await page.getByTestId('avatar-previa-voltar').click()
    await expect(page.getByTestId('avatar-credito')).not.toContainText('Prévia')
    await expect(page.getByTestId('avatar-previa-voltar')).toHaveCount(0)
    // O visto fica alinhado ao título e "Ver a licença" não quebra de linha.
    const titulo = page.locator('.av-titulo-ok')
    const [caixaDoVisto, caixaDoTexto] = await Promise.all([
      titulo.locator('svg').boundingBox(),
      titulo.locator('span').boundingBox(),
    ])
    expect(
      Math.abs(caixaDoVisto!.y + caixaDoVisto!.height / 2 - (caixaDoTexto!.y + caixaDoTexto!.height / 2)),
    ).toBeLessThan(6)
    const link = page.locator('.av-link-licenca')
    if (await link.count()) {
      // Uma linha só: a altura da caixa do link é a de uma linha de texto (quebrado, passaria de 1,5 linha).
      const caixaDoLink = (await link.first().boundingBox())!
      const linha = await link.first().evaluate((el) => parseFloat(getComputedStyle(el).lineHeight) || 24)
      expect(caixaDoLink.height, '"Ver a licença" não quebra de linha').toBeLessThan(linha * 1.6)
    }

    await page.getByTestId('avatar-usar-modelo').click()
    await expect(page.getByTestId('avatar-credito')).toContainText(/Modelo de teste|Meu modelo/)
    await page.getByTestId('avatar-salvar').click()
    await expect(page.getByTestId('avatar-status')).toContainText('Avatar salvo')

    // O arquivo está no IndexedDB deste aparelho...
    const noDisco = await page.evaluate(
      () =>
        new Promise<number>((resolve) => {
          const rq = indexedDB.open('frasy-avatar')
          rq.onsuccess = () => {
            const get = rq.result.transaction('modelos').objectStore('modelos').getAll()
            get.onsuccess = () => resolve((get.result as Array<{ bytes: ArrayBuffer }>)[0]?.bytes.byteLength ?? 0)
          }
        }),
    )
    expect(noDisco).toBeGreaterThan(100)
    // ...e NENHUMA requisição o levou a lugar nenhum: nada de POST/PUT e nada de fora da origem.
    expect(corpos.filter((c) => c.temModelo || c.tamanho > 20_000)).toEqual([])
    expect(externas).toEqual([])

    await page.reload()
    await page.getByRole('tab', { name: 'Avatar' }).click()
    await expect(page.getByTestId('avatar-credito')).toContainText('Salvo neste aparelho')
    await expect(page.getByTestId('avatar-credito-linha')).toContainText('Autora Teste')
  })

  test('traga o seu: arquivo hostil é recusado com aviso para leitor de tela, no passo certo, e nada é salvo', async ({
    page,
  }) => {
    await abrirAvatar(page)
    await page.getByRole('tab', { name: 'Traga o seu' }).click()
    await page.getByTestId('avatar-arquivo').setInputFiles({
      name: 'bomba.glb',
      mimeType: 'model/gltf-binary',
      buffer: Buffer.from(construirGlb({ imagens: [pngBomba(20000, 20000)] })),
    })
    const recusa = page.getByTestId('avatar-importador-recusado')
    await expect(recusa).toBeVisible()
    await expect(recusa).toHaveAttribute('role', 'alert')
    await expect(recusa).toContainText('grande demais')
    await expect(recusa.locator('[data-recusa-passo="encontre"]')).toBeVisible()
    await expect(page.locator(':focus')).toHaveText(/Esse arquivo não pode ser usado/)
    await expect(page.getByTestId('avatar-usar-modelo')).toHaveCount(0)
    await foto(page, '7-recusado')

    // Licença não declarada: o adulto precisa marcar a confirmação antes de usar.
    await page.getByTestId('avatar-arquivo').setInputFiles({
      name: 'semlicenca.glb',
      mimeType: 'model/gltf-binary',
      buffer: Buffer.from(construirGlb()),
    })
    await expect(page.getByTestId('avatar-importador-ok')).toBeVisible()
    await expect(page.getByTestId('avatar-usar-modelo')).toBeDisabled()
    await page.getByLabel('Confirmo que tenho direito de usar este modelo').check()
    await expect(page.getByTestId('avatar-usar-modelo')).toBeEnabled()

    // Um .zip renomeado: explica o que fazer.
    await page.getByTestId('avatar-arquivo').setInputFiles({
      name: 'pacote.vrm',
      mimeType: 'model/gltf-binary',
      buffer: Buffer.from([0x50, 0x4b, 3, 4, ...new Array(64).fill(0)]),
    })
    await expect(page.getByTestId('avatar-importador-recusado')).toContainText('.zip')
    expect(META1_BASE).toBeTruthy()
  })

  test('perfil protegido (menor): só a coleção, sem importar, sem galeria e sem requisição a terceiros', async ({
    page,
  }) => {
    await page.addInitScript(() => sessionStorage.setItem('frasy.avatar.protegido', '1'))
    const terceiros: string[] = []
    page.on('request', (r) => {
      if (/githubusercontent|arweave/.test(r.url())) terceiros.push(r.url())
    })
    await abrirAvatar(page)
    await expect(page.getByRole('tab', { name: 'Traga o seu' })).toHaveCount(0)
    await expect(page.getByTestId('avatar-traga')).toHaveCount(0)
    await expect(page.getByTestId('avatar-galeria-optin')).toHaveCount(0)
    await expect(page.getByTestId('avatar-arquivo')).toHaveCount(0)
    await expect(page.getByTestId('avatar-so-colecao')).toContainText('coleção do Frasy')
    // O texto está à vista (inclusive no celular, sem rolar até o fim da grade) e há uma linha para o responsável.
    await expect(page.getByTestId('avatar-so-colecao')).toBeInViewport()
    await expect(page.getByTestId('avatar-responsavel')).toContainText('Responsável')
    await foto(page, '8-menor')
    // O menor ainda escolhe e salva dentro da coleção curada.
    await page.getByTestId('avatar-sortear').click()
    await page.getByTestId('avatar-salvar').click()
    await expect(page.getByTestId('avatar-status')).toContainText('Avatar salvo')
    expect(terceiros).toEqual([])
  })

  test('galeria ao vivo: nada é pedido antes do opt-in; depois, sem cookie nem referer', async ({ page }) => {
    const pedidos: Array<{ url: string; referer?: string; cookie?: string }> = []
    await page.route(/raw\.githubusercontent\.com|arweave\.net/, async (r) => {
      const url = r.request().url()
      const h = r.request().headers()
      pedidos.push({ url, referer: h['referer'], cookie: h['cookie'] })
      const cors = { 'access-control-allow-origin': '*' }
      if (url.endsWith('projects.json'))
        return r.fulfill({
          headers: cors,
          json: [
            {
              id: '100avatars-r1',
              creator_id: 'Polygonal-Mind',
              is_public: true,
              license: 'CC0',
              storage_type: 'arweave',
            },
          ],
        })
      if (url.includes('/avatars/100avatars-r1.json'))
        return r.fulfill({
          headers: cors,
          json: [
            {
              name: 'Devil',
              project_id: '100avatars-r1',
              format: 'VRM',
              is_public: true,
              is_draft: false,
              model_file_url: 'https://arweave.net/gfVzs1oH_aPaHVxpQK86HT_rqzyrFPOUKUrDJ30yprs',
              thumbnail_url: 'https://arweave.net/llxwUMPCfar71x4hLTU4f1-pcsYeGDUD4Gxm1dhWaDg',
              metadata: { number: '031' },
            },
          ],
        })
      return r.fulfill({
        headers: cors,
        contentType: 'image/gif',
        body: Buffer.from('R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7', 'base64'),
      })
    })
    await abrirAvatar(page)
    await page.getByRole('tab', { name: 'Traga o seu' }).click()
    await expect(page.getByTestId('avatar-galeria-optin')).toBeVisible()
    await expect(page.locator('.av-galeria')).toHaveCount(0)
    expect(pedidos).toEqual([])
    await foto(page, '9-galeria-optin')

    await page.getByTestId('avatar-galeria-abrir').click()
    await expect(page.getByTestId('avatar-galeria').getByRole('heading', { name: 'Devil' })).toBeVisible()
    expect(pedidos.length).toBeGreaterThanOrEqual(2)
    for (const p of pedidos) {
      expect(p.referer, p.url).toBeUndefined()
      expect(p.cookie, p.url).toBeUndefined()
    }
    await foto(page, '10-galeria-aberta')
  })

  test('sem WebGL: cai no fallback (iniciais) com aviso, e dá para escolher e salvar mesmo assim', async ({ page }) => {
    await page.addInitScript(() => {
      const original = HTMLCanvasElement.prototype.getContext
      HTMLCanvasElement.prototype.getContext = function (this: HTMLCanvasElement, tipo: string, ...resto: unknown[]) {
        if (tipo === 'webgl2' || tipo === 'webgl') return null
        return (original as (...a: unknown[]) => unknown).call(this, tipo, ...resto) as never
      } as typeof original
    })
    await abrirAvatar(page)
    await expect(page.locator('[data-avatar-fallback="sem_webgl2"]')).toBeVisible()
    await expect(page.getByTestId('avatar-sem-3d')).toBeVisible()
    await page.getByTestId('avatar-sortear').click()
    await page.getByTestId('avatar-salvar').click()
    await expect(page.getByTestId('avatar-status')).toContainText('Avatar salvo')
    await foto(page, '11-sem-webgl')
    // Sem WebGL não há miniatura: a moldura do perfil fica como era (foto ou iniciais).
    await page.reload()
    await expect(page.locator('header [data-avatar-do-usuario="avatar"]')).toHaveCount(0)
  })

  test('"Escolher para mim" sorteia entre os 6 modelos da coleção (todos passam no enquadramento)', async ({
    page,
  }) => {
    await abrirAvatar(page)
    await expect(page.locator('[data-modelo]')).toHaveCount(6)
    const vistos = new Set<string>()
    for (let i = 0; i < 14; i++) {
      await page.getByTestId('avatar-sortear').click()
      vistos.add((await page.locator('[data-modelo][aria-checked="true"]').getAttribute('data-modelo')) ?? '')
    }
    expect(vistos.size).toBeGreaterThanOrEqual(3)
    for (const id of vistos) expect(id).toMatch(/^(milk|bullidan|100avatars-r[12]-[a-z]+)$/)
    // O modo "Rosto" troca o enquadramento da prévia sem reabrir o modelo.
    await page.locator('[data-modo-da-previa="rosto"]').click()
    await expect(page.locator('[data-modo-da-previa="rosto"]')).toHaveAttribute('aria-pressed', 'true')
    await expect(previaPronta(page)).toBeVisible({ timeout: 30_000 })
    await foto(page, '12-modo-rosto')
  })

  test('celular: a prévia fica fixa no topo (até 40% da altura) e não cobre os controles nem a barra inferior', async ({
    page,
  }) => {
    const vp = page.viewportSize()!
    test.skip(vp.width >= 880, 'a prévia só fica fixa no celular')
    await abrirAvatar(page)
    await expect(previaPronta(page)).toBeVisible({ timeout: 30_000 })
    await page.getByTestId('avatar-sortear').click()
    // A aba "Traga o seu" é comprida: rolada, a prévia tem de ficar colada no topo.
    await page.getByRole('tab', { name: 'Traga o seu' }).click()
    await page.evaluate(() => {
      let el: HTMLElement | null = document.querySelector('[data-testid="avatar-previa"]')
      while (el && el.scrollHeight <= el.clientHeight + 4) el = el.parentElement
      ;(el ?? document.documentElement).scrollBy(0, 900)
    })
    await page.waitForTimeout(300)
    const previa = page.getByTestId('avatar-previa')
    const caixa = (await previa.boundingBox())!
    expect(caixa.y, 'colada no topo').toBeGreaterThanOrEqual(0)
    expect(caixa.y).toBeLessThan(40)
    expect(caixa.height, 'no máximo 40% da altura').toBeLessThanOrEqual(vp.height * 0.4 + 1)
    await expect(previa).toBeInViewport()
    await foto(page, '13-celular-previa-fixa-traga')
    await page.getByRole('tab', { name: 'Personalizar' }).click()
    const altura = page.locator('[data-ajuste="altura"]')
    await altura.scrollIntoViewIfNeeded()
    await foto(page, '13-celular-previa-fixa')
    // Os controles continuam alcançáveis (nada os cobre), no meio e no fim da tela.
    await altura.click({ trial: true })
    await altura.fill('1.1')
    await expect(previa).toBeInViewport()
    const restaurar = page.getByRole('button', { name: /Restaurar padrão/ })
    await restaurar.click({ trial: true })
    await page.evaluate(() => window.scrollTo(0, document.documentElement.scrollHeight))
    await restaurar.click({ trial: true })
    await foto(page, '14-celular-fim-da-tela')
    // Nada alarga a página: sem rolagem de lado, e a prévia (com o botão de salvar) cabe na largura.
    const largura = await page.evaluate(() => ({
      pagina: document.documentElement.scrollWidth,
      janela: document.documentElement.clientWidth,
    }))
    expect(largura.pagina).toBeLessThanOrEqual(largura.janela)
    const salvar = (await page.getByTestId('avatar-salvar').boundingBox())!
    const cartao = (await previa.boundingBox())!
    expect(salvar.x + salvar.width).toBeLessThanOrEqual(cartao.x + cartao.width + 1)
  })

  test('estúdio: UMA prévia viva (um contexto WebGL), com "Salvar" e o crédito à mão; a miniatura salva vem do Estúdio', async ({
    page,
  }) => {
    await abrirAvatar(page)
    await expect(previaPronta(page).first()).toBeVisible({ timeout: 30_000 })
    await page.getByTestId('avatar-sortear').click()
    await expect(page.getByTestId('aba-avatar').locator('canvas')).toHaveCount(1)
    await foto(page, '16-estudio-antes-escolher')
    await page.getByRole('tab', { name: 'Estúdio' }).click()
    await expect(page.getByTestId('estudio-do-avatar')).toBeVisible()
    await expect(page.getByTestId('avatar-previa')).toHaveAttribute('data-previa-viva', 'false')
    await expect(previaPronta(page)).toHaveCount(1) // a do Estúdio; a da tela saiu
    await expect(page.getByTestId('aba-avatar').locator('canvas')).toHaveCount(1)
    // O principal e o crédito continuam alcançáveis.
    await expect(page.getByTestId('avatar-salvar')).toBeVisible()
    await expect(page.getByTestId('avatar-credito')).toBeVisible()
    await expect(page.getByTestId('avatar-credito-linha')).toBeVisible()
    await foto(page, '16-estudio-uma-previa')
    await page.getByTestId('avatar-salvar').click()
    await expect(page.getByTestId('avatar-status')).toContainText('Avatar salvo')
    const miniatura = await page.evaluate(() => {
      const k = Object.keys(localStorage).find((x) => x.startsWith('frasy.avatar.miniatura.'))
      return k ? localStorage.getItem(k) : null
    })
    expect(miniatura).toMatch(/^data:image\/(webp|png);base64,/)
    // Voltar a Escolher traz a prévia da tela de volta (ainda um canvas só).
    await page.getByRole('tab', { name: 'Escolher' }).click()
    await expect(page.getByTestId('avatar-previa')).toHaveAttribute('data-previa-viva', 'true')
    await expect(page.getByTestId('aba-avatar').locator('canvas')).toHaveCount(1)
  })

  for (const largura of [390, 375]) {
    test(`celular ${largura}: as 4 abas internas aparecem TODAS, sem rolar de lado e sem texto cortado`, async ({
      page,
    }) => {
      test.skip((page.viewportSize()?.width ?? 0) >= 880, 'só no celular')
      await page.setViewportSize({ width: largura, height: 844 })
      await abrirAvatar(page)
      const lista = page.getByRole('tablist', { name: 'Seções do avatar' })
      const medidas = await lista.evaluate((el) => ({ rolagem: el.scrollWidth, visivel: el.clientWidth }))
      expect(medidas.rolagem, 'a faixa não rola de lado').toBeLessThanOrEqual(medidas.visivel + 1)
      const caixaLista = (await lista.boundingBox())!
      for (const nome of ['Escolher', 'Personalizar', 'Estúdio', 'Traga o seu']) {
        const aba = page.getByRole('tab', { name: nome, exact: true })
        await expect(aba).toBeVisible()
        const c = (await aba.boundingBox())!
        expect(c.x, `${nome} dentro da faixa (esq)`).toBeGreaterThanOrEqual(caixaLista.x - 1)
        expect(c.x + c.width, `${nome} dentro da faixa (dir)`).toBeLessThanOrEqual(caixaLista.x + caixaLista.width + 1)
        expect(c.x + c.width, `${nome} dentro da tela`).toBeLessThanOrEqual(largura)
        expect(c.height, `${nome} é alvo de toque`).toBeGreaterThanOrEqual(44)
        // O texto cabe no botão (sem reticências nem corte).
        const corta = await aba.evaluate((el) => el.scrollWidth > el.clientWidth + 1)
        expect(corta, `${nome} sem texto cortado`).toBe(false)
      }
      // Papéis e teclado continuam: setas movem a aba e o foco.
      await page.getByRole('tab', { name: 'Escolher' }).focus()
      await page.keyboard.press('ArrowRight')
      await expect(page.getByRole('tab', { name: 'Personalizar' })).toBeFocused()
      await expect(page.getByRole('tab', { name: 'Personalizar' })).toHaveAttribute('aria-selected', 'true')
      await foto(page, `17-celular-${largura}-abas-em-grade`)
    })
  }

  test('abas internas: a aba escolhida vem inteira para a vista (sem texto cortado)', async ({ page }) => {
    await abrirAvatar(page)
    const dentro = async (lista: string, aba: string) => {
      const l = (await page.getByRole('tablist', { name: lista }).boundingBox())!
      const a = (await page.getByRole('tab', { name: aba, exact: true }).boundingBox())!
      expect(a.x, `${aba} começa dentro da faixa`).toBeGreaterThanOrEqual(l.x - 1)
      expect(a.x + a.width, `${aba} termina dentro da faixa`).toBeLessThanOrEqual(l.x + l.width + 1)
    }
    await dentro('Seções do perfil', 'Avatar')
    await page.getByRole('tab', { name: 'Traga o seu' }).click()
    await dentro('Seções do avatar', 'Traga o seu')
    await page.getByRole('tab', { name: 'Você' }).click()
    await dentro('Seções do perfil', 'Você')
    // Trocar de aba rola SÓ a faixa: o conteúdo da página nunca é empurrado de lado.
    const empurrado = await page.evaluate(() =>
      [...document.querySelectorAll('main, [data-testid="perfil-do-quest"]')].map((e) => e.scrollLeft),
    )
    expect(empurrado.every((x) => x === 0)).toBe(true)
    await foto(page, '15-abas')
  })

  test('só com o teclado: abas, grade e botões se alcançam e o foco fica visível', async ({ page }) => {
    await abrirAvatar(page)
    await page.getByRole('tab', { name: 'Escolher' }).focus()
    await page.keyboard.press('ArrowRight')
    await expect(page.getByRole('tab', { name: 'Personalizar' })).toHaveAttribute('aria-selected', 'true')
    await page.keyboard.press('ArrowLeft')
    await expect(page.getByRole('tab', { name: 'Escolher' })).toHaveAttribute('aria-selected', 'true')
    const primeiro = page.locator('[data-modelo]').first()
    await primeiro.focus()
    await page.keyboard.press('ArrowRight')
    await expect(page.locator('[data-modelo][aria-checked="true"]')).toHaveCount(1)
    const alvo = await page.getByTestId('avatar-sortear').boundingBox()
    expect(alvo?.height ?? 0).toBeGreaterThanOrEqual(44)
    await page.getByTestId('avatar-sortear').focus()
    const contorno = await page.getByTestId('avatar-sortear').evaluate((el) => getComputedStyle(el).outlineStyle)
    expect(contorno).not.toBe('none')
  })
})
