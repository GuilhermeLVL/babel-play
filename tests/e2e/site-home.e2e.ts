import { readFileSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

import { expect, type Page, test } from '@playwright/test'

import { gerarSite, opcoesDoAmbiente } from '../../scripts/site/gerar'

/**
 * A HOME DO SITE PÚBLICO NO NAVEGADOR (`scripts/site/home.ts` + `public/site/rolo.js`), depois do relato
 * do Windows em 19/11/2026: com "Efeitos de animação" desligado (`prefers-reduced-motion: reduce`) o filme
 * nem era criado; sem isso, ficava parado no primeiro quadro até a pessoa rolar; e em notebook de tela
 * baixa (1536×730 com escala 125%) o rótulo do primeiro capítulo subia para cima do logo.
 *
 * A página vem do próprio gerador e é servida por `page.route` numa origem de mentira, com `public/` e as
 * fontes do disco: não depende do build nem do servidor de dev.
 */
const RAIZ = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..')
const ORIGEM = 'http://site-publico.teste'
const PAGINAS = gerarSite(
  opcoesDoAmbiente({ VITE_PUBLIC_URL: 'https://frasy.com.br' }, path.join(RAIZ, 'content', 'guias'), '5.3.0', '5.3.0')
    .opcoes,
)
const FONTES: Record<string, string> = {
  archivo: 'node_modules/@fontsource-variable/archivo/files/archivo-latin-wdth-normal.woff2',
  inter: 'node_modules/@fontsource-variable/inter/files/inter-latin-wght-normal.woff2',
}
const TIPOS: Record<string, string> = {
  '.js': 'text/javascript',
  '.mp4': 'video/mp4',
  '.jpg': 'image/jpeg',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.woff2': 'font/woff2',
}

async function abrirHome(page: Page) {
  await page.route(`${ORIGEM}/**`, async (rota) => {
    const caminho = new URL(rota.request().url()).pathname
    if (caminho === '/')
      return rota.fulfill({ contentType: 'text/html; charset=utf-8', body: PAGINAS.get('inicio.html') })
    const fonte = Object.entries(FONTES).find(([nome]) => caminho.startsWith(`/fontes/${nome}`))
    const arquivo = fonte ? path.join(RAIZ, fonte[1]) : path.join(RAIZ, 'public', caminho)
    try {
      return await rota.fulfill({
        body: readFileSync(arquivo),
        contentType: TIPOS[path.extname(arquivo)] ?? 'application/octet-stream',
      })
    } catch {
      return rota.fulfill({ status: 404, body: '' })
    }
  })
  await page.goto(`${ORIGEM}/`)
}

const filme = (page: Page) => page.locator('[data-filme-camada] video')
const tempoDoFilme = (page: Page) => filme(page).evaluate((v: HTMLVideoElement) => v.currentTime)

test.describe('home do site público', () => {
  test('movimento reduzido: o filme existe e segue a rolagem, sem tocar sozinho', async ({ page }, info) => {
    test.skip(info.project.name !== 'desktop-1280', 'o filme é o mesmo nas três telas')
    await page.emulateMedia({ reducedMotion: 'reduce' })
    await abrirHome(page)
    await expect(filme(page)).toHaveCount(1, { timeout: 30_000 })
    await expect(page.locator('[data-filme-camada]')).toHaveAttribute('data-pintado', '', { timeout: 15_000 })
    // Parado no topo, o filme não anda (nada se mexe sozinho).
    const t0 = await tempoDoFilme(page)
    await page.waitForTimeout(1500)
    expect(await tempoDoFilme(page)).toBe(t0)
    expect(await filme(page).evaluate((v: HTMLVideoElement) => v.paused)).toBe(true)
    // Rolando, o quadro acompanha.
    await page.evaluate(() => scrollTo(0, innerHeight * 3))
    await expect.poll(() => tempoDoFilme(page), { timeout: 10_000 }).toBeGreaterThan(4)
  })

  test('topo vivo: sem rolar, o primeiro trecho toca sozinho e em laço; rolando, a rolagem manda', async ({
    page,
  }, info) => {
    test.skip(info.project.name !== 'desktop-1280', 'o filme é o mesmo nas três telas')
    await page.emulateMedia({ reducedMotion: 'no-preference' })
    await abrirHome(page)
    await expect(page.locator('[data-filme-camada]')).toHaveAttribute('data-pintado', '', { timeout: 30_000 })
    // Começa pelo de 720p (metade do tamanho), em qualquer tela.
    await expect(filme(page)).toHaveAttribute('data-fonte', /filme-m\.mp4$/)
    const t0 = await tempoDoFilme(page)
    await expect.poll(() => tempoDoFilme(page), { timeout: 5_000 }).toBeGreaterThan(t0 + 0.5)
    expect(await page.evaluate(() => scrollY)).toBe(0)
    // O laço não passa do fim do primeiro capítulo (`data-ate`).
    const ate = Number(await page.locator('[data-capitulo]').first().getAttribute('data-ate'))
    for (let i = 0; i < 12; i++) {
      expect(await tempoDoFilme(page)).toBeLessThanOrEqual(ate + 0.1)
      await page.waitForTimeout(500)
    }
    await page.evaluate(() => scrollTo(0, innerHeight * 3))
    await expect.poll(() => filme(page).evaluate((v: HTMLVideoElement) => v.paused)).toBe(true)
    await expect.poll(() => tempoDoFilme(page), { timeout: 10_000 }).toBeGreaterThan(ate)
  })

  for (const [largura, altura] of [
    [1366, 768],
    [1536, 730],
    [1280, 720],
    [1440, 900],
    [1920, 1080],
  ]) {
    test(`${largura}×${altura}: o primeiro capítulo cabe entre o cabeçalho e o pé da tela`, async ({ page }, info) => {
      test.skip(info.project.name !== 'desktop-1280', 'telas de computador')
      await page.setViewportSize({ width: largura, height: altura })
      await page.emulateMedia({ reducedMotion: 'reduce' })
      await page.route('**/*.mp4', (r) => r.abort())
      await abrirHome(page)
      await caberNoTopo(page, altura)
    })
  }

  test('celular: o primeiro capítulo cabe entre o cabeçalho e o pé da tela', async ({ page }, info) => {
    test.skip(info.project.name !== 'mobile-375', 'tela de celular')
    await page.emulateMedia({ reducedMotion: 'reduce' })
    await page.route('**/*.mp4', (r) => r.abort())
    await abrirHome(page)
    await caberNoTopo(page, page.viewportSize()!.height)
  })
})

async function caberNoTopo(page: Page, altura: number) {
  await page.evaluate(() => document.fonts.ready)
  const capitulo = page.locator('[data-capitulo]').first()
  const topo = (await page.locator('header.topo').boundingBox())!
  const kicker = (await capitulo.locator('.kicker').boundingBox())!
  const legenda = (await capitulo.locator('.leg').boundingBox())!
  const botao = (await capitulo.locator('.acoes .botao').boundingBox())!
  // O rótulo começa abaixo do cabeçalho (não cobre o logo) e a legenda e o botão terminam dentro da tela.
  expect(kicker.y).toBeGreaterThanOrEqual(topo.y + topo.height)
  expect(legenda.y + legenda.height).toBeLessThanOrEqual(altura)
  expect(botao.y + botao.height).toBeLessThanOrEqual(altura)
}
