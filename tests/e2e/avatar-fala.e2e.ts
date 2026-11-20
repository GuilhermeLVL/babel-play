import { mkdirSync } from 'node:fs'
import path from 'node:path'

import { expect, type Page, test } from '@playwright/test'

/**
 * O AVATAR QUE FALA (M3), pelo harness `tests/e2e/avatar-harness` com `?fala=1`: áudio sintético (WAV gerado por
 * código) tocado pelo elemento compartilhado da voz, boca guiada pela amplitude; fala do aparelho simulada
 * (start/boundary/end); movimento reduzido; região viva opcional; sem erro de console e sem requisição externa.
 *
 * Capturas: `$AVATAR_CAPTURAS` (padrão `tests/e2e/__capturas__/`, fora do git).
 */
const HARNESS = '/tests/e2e/avatar-harness/index.html'
const CAPTURAS = process.env.AVATAR_CAPTURAS || path.join(process.cwd(), 'tests', 'e2e', '__capturas__')

test.use({
  launchOptions: {
    args: [
      '--use-angle=swiftshader',
      '--enable-unsafe-swiftshader',
      '--ignore-gpu-blocklist',
      '--autoplay-policy=no-user-gesture-required',
    ],
  },
})

interface Coleta {
  consoleErros: string[]
  externas: string[]
}

function coletar(page: Page): Coleta {
  const c: Coleta = { consoleErros: [], externas: [] }
  const origem = new URL(page.url() === 'about:blank' ? 'http://localhost:3100' : page.url()).origin
  page.on('console', (m) => {
    if (m.type() === 'error') c.consoleErros.push(m.text())
  })
  page.on('pageerror', (e) => c.consoleErros.push(`pageerror: ${e.message}`))
  page.on('request', (r) => {
    const u = r.url()
    if (/^(data|blob|about):/.test(u)) return
    if (new URL(u).origin !== origem) c.externas.push(u)
  })
  return c
}

const pronto = (page: Page) => page.locator('[data-avatar-pronto="true"]')
const CLIP = { x: 0, y: 0, width: 400, height: 420 }

async function abrir(page: Page, extra = '') {
  await page.goto('about:blank')
  await page.goto(`${HARNESS}?fonte=/avatares/dev/milk.vrm&tier=medio&tamanho=256&fala=1${extra}`)
  const c = coletar(page)
  await expect(pronto(page)).toBeVisible({ timeout: 60_000 })
  return c
}

test.describe('avatar falando (harness)', () => {
  test.beforeAll(() => mkdirSync(CAPTURAS, { recursive: true }))

  test('voz em áudio: o envelope é maior que zero, a boca mexe, o som sai e nada vai para fora', async ({ page }) => {
    const c = await abrir(page)
    await page.evaluate(() => window.__avatarHarness!.limparAmostras())
    await page.evaluate(() => window.__avatarHarness!.falar('nuvem', 'Muito obrigado pela ajuda de hoje', 'feliz'))
    await expect.poll(() => page.evaluate(() => window.__avatarHarness!.falando())).toBe(true)
    await expect(page.getByRole('img', { name: 'Avatar falando' })).toBeVisible()
    await page.waitForTimeout(2600)

    const amostras = await page.evaluate(() => window.__avatarHarness!.amostras())
    expect(amostras.length).toBeGreaterThan(30)
    const porAmplitude = amostras.filter((a) => a.origem === 'amplitude')
    expect(porAmplitude.length).toBeGreaterThan(20)
    expect(Math.max(...porAmplitude.map((a) => a.abertura))).toBeGreaterThan(0.4)
    // há momentos de boca fechada (o WAV tem silêncio e entre sílabas) e de boca aberta
    expect(porAmplitude.some((a) => a.abertura === 0)).toBe(true)
    expect(new Set(amostras.map((a) => a.vogal)).size).toBeGreaterThan(1)

    // o som continua saindo pelo elemento: não ficou mudo nem pausado no meio da fala
    const el = await page.evaluate(() => window.__avatarHarness!.volumeDoElemento())
    expect(el).toMatchObject({ volume: 1, muted: false, tocando: true })

    // ao fim do áudio o avatar para de falar
    await expect.poll(() => page.evaluate(() => window.__avatarHarness!.falando()), { timeout: 6000 }).toBe(false)
    expect(c.consoleErros).toEqual([])
    expect(await page.evaluate(() => window.__avatarHarness!.erros)).toEqual([])
    expect(c.externas).toEqual([])
  })

  test('fala do aparelho: boundary amarra a boca e as vogais variam', async ({ page }) => {
    const c = await abrir(page)
    await page.evaluate(() => window.__avatarHarness!.limparAmostras())
    await page.evaluate(() =>
      window.__avatarHarness!.falar('aparelho', 'Bom dia pessoal vamos começar a aula', 'triste'),
    )
    await page.waitForTimeout(1800)
    const amostras = await page.evaluate(() => window.__avatarHarness!.amostras())
    expect(amostras.some((a) => a.origem === 'eventos')).toBe(true)
    expect(Math.max(...amostras.map((a) => a.abertura))).toBeGreaterThan(0.5)
    expect(new Set(amostras.map((a) => a.vogal)).size).toBeGreaterThan(2)
    await expect.poll(() => page.evaluate(() => window.__avatarHarness!.falando()), { timeout: 6000 }).toBe(false)
    expect(c.consoleErros).toEqual([])
    expect(c.externas).toEqual([])
  })

  test('capturas: boca aberta e boca fechada', async ({ page }) => {
    const c = await abrir(page)
    await page.evaluate(() => window.__avatarHarness!.mudar('falando', 'neutro'))
    await page.evaluate(() => window.__avatarHarness!.congelarBoca({ vogal: 'F', abertura: 0, acabou: false }))
    await page.waitForTimeout(700)
    await page.screenshot({ path: path.join(CAPTURAS, 'avatar-fala-boca-fechada.png'), clip: CLIP })
    await page.evaluate(() => window.__avatarHarness!.congelarBoca({ vogal: 'A', abertura: 1, acabou: false }))
    await page.waitForTimeout(700)
    await page.screenshot({ path: path.join(CAPTURAS, 'avatar-fala-boca-aberta.png'), clip: CLIP })
    await page.evaluate(() => window.__avatarHarness!.mudar('falando', 'feliz'))
    await page.evaluate(() => window.__avatarHarness!.congelarBoca({ vogal: 'O', abertura: 0.8, acabou: false }))
    await page.waitForTimeout(700)
    await page.screenshot({ path: path.join(CAPTURAS, 'avatar-fala-boca-O-feliz.png'), clip: CLIP })
    expect(c.consoleErros).toEqual([])
  })

  test('movimento reduzido: sem animação ociosa; falando, a boca desenha no máximo ~12 quadros/s', async ({ page }) => {
    await page.emulateMedia({ reducedMotion: 'reduce' })
    const c = await abrir(page)
    await page.waitForTimeout(300)
    const q0 = await page.evaluate(() => window.__avatarHarness!.quadros())
    await page.waitForTimeout(1500)
    const q1 = await page.evaluate(() => window.__avatarHarness!.quadros())
    expect(q1 - q0).toBeLessThanOrEqual(1) // parado: nada se mexe sozinho (sem respiração, piscar, olhar)

    await page.evaluate(() => window.__avatarHarness!.bocaSintetica(true))
    await page.evaluate(() => window.__avatarHarness!.mudar('falando', 'feliz'))
    const f0 = await page.evaluate(() => window.__avatarHarness!.quadros())
    await page.waitForTimeout(1500)
    const f1 = await page.evaluate(() => window.__avatarHarness!.quadros())
    expect((f1 - f0) / 1.5).toBeLessThanOrEqual(14)
    expect(f1 - f0).toBeGreaterThan(5)

    await page.evaluate(() => window.__avatarHarness!.bocaSintetica(false))
    await page.evaluate(() => window.__avatarHarness!.mudar('parado', 'neutro'))
    await page.waitForTimeout(400)
    const p0 = await page.evaluate(() => window.__avatarHarness!.quadros())
    await page.waitForTimeout(1000)
    expect((await page.evaluate(() => window.__avatarHarness!.quadros())) - p0).toBeLessThanOrEqual(1)
    expect(c.consoleErros).toEqual([])
  })

  test('região viva: ausente por padrão; com `anunciar` avisa só a mudança de fala', async ({ page }) => {
    await abrir(page)
    await expect(page.locator('[data-avatar-aviso]')).toHaveCount(0)

    await page.goto(`${HARNESS}?fonte=/avatares/dev/milk.vrm&tier=medio&tamanho=200&fala=1&anunciar=1`)
    await expect(pronto(page)).toBeVisible({ timeout: 60_000 })
    const aviso = page.locator('[data-avatar-aviso]')
    await expect(aviso).toHaveAttribute('aria-live', 'polite')
    await expect(aviso).toHaveText('')
    await page.evaluate(() => window.__avatarHarness!.falar('aparelho', 'oi pessoal', 'neutro'))
    await expect(aviso).toHaveText('Avatar falando')
    await expect(aviso).toHaveText('', { timeout: 6000 })
  })
})
