import { mkdirSync } from 'node:fs'
import path from 'node:path'

import { expect, type Page, test } from '@playwright/test'

/**
 * O AVATAR 3D (M1), pelo harness `tests/e2e/avatar-harness`: carrega o VRM CC0 de teste (milk), confirma que o
 * canvas WebGL desenha, alterna estado e emoção sem erro de console, simula a perda do contexto e confere que
 * nenhuma requisição sai da mesma origem.
 *
 * Capturas: `$AVATAR_CAPTURAS` (padrão `tests/e2e/__capturas__/`, fora do git).
 */
const HARNESS = '/tests/e2e/avatar-harness/index.html'
const CAPTURAS = process.env.AVATAR_CAPTURAS || path.join(process.cwd(), 'tests', 'e2e', '__capturas__')

// SwiftShader: WebGL2 por software, o que o Chromium headless do CI tem.
test.use({
  launchOptions: { args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] },
})

interface Coleta {
  consoleErros: string[]
  externas: string[]
  csp: string[]
}

function coletar(page: Page): Coleta {
  const c: Coleta = { consoleErros: [], externas: [], csp: [] }
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

/** Quantos pixels do canvas WebGL não são transparentes, lendo o buffer dentro de um rAF logo após o desenho do motor. */
async function pixelsDesenhados(page: Page): Promise<number> {
  return page.evaluate(
    () =>
      new Promise<number>((resolve) => {
        const canvas = document.querySelector('canvas') as HTMLCanvasElement | null
        const gl = canvas?.getContext('webgl2') as WebGL2RenderingContext | null
        if (!canvas || !gl) return resolve(-1)
        let tentativas = 0
        const ler = () => {
          const w = gl.drawingBufferWidth
          const h = gl.drawingBufferHeight
          const px = new Uint8Array(w * h * 4)
          gl.readPixels(0, 0, w, h, gl.RGBA, gl.UNSIGNED_BYTE, px)
          let n = 0
          for (let i = 3; i < px.length; i += 4) if (px[i] > 0) n++
          // No tier fraco o laço pula quadros (30 fps) e o buffer de um quadro sem desenho vem vazio: tenta de novo.
          if (n > 0 || ++tentativas >= 12) return resolve(n)
          requestAnimationFrame(ler)
        }
        requestAnimationFrame(ler)
      }),
  )
}

const pronto = (page: Page) => page.locator('[data-avatar-pronto="true"]')

test.describe('avatar 3D (harness)', () => {
  test.beforeAll(() => mkdirSync(CAPTURAS, { recursive: true }))

  test('carrega o VRM, desenha, alterna estado e emoção, e só fala com a mesma origem', async ({ page }) => {
    await page.goto('about:blank')
    await page.goto(`${HARNESS}?fonte=/avatares/dev/milk.vrm&tier=medio&tamanho=256`)
    const c = coletar(page)
    await page.evaluate(() => {
      document.addEventListener('securitypolicyviolation', (e) => {
        ;(window as unknown as { __csp: string[] }).__csp ??= []
        ;(window as unknown as { __csp: string[] }).__csp.push(`${e.violatedDirective} ${e.blockedURI}`)
      })
    })

    await expect(pronto(page)).toBeVisible({ timeout: 60_000 })
    // O fallback saiu de cena e o canvas está dentro do componente.
    await expect(page.locator('[data-avatar-fallback]')).toHaveCount(0)
    expect(await pixelsDesenhados(page)).toBeGreaterThan(2000)

    // aria: imagem descrita, sem foco.
    const img = page.getByRole('img', { name: 'Avatar em repouso' })
    await expect(img).toBeVisible()
    expect(await page.evaluate(() => document.activeElement === document.body)).toBe(true)
    expect(await page.locator('canvas').getAttribute('aria-hidden')).toBe('true')
    await page.screenshot({
      path: path.join(CAPTURAS, 'avatar-milk-parado.png'),
      clip: { x: 0, y: 0, width: 400, height: 420 },
    })

    // Alterna estados e emoções (todas as combinações) sem erro.
    for (const estado of ['ouvindo', 'pensando', 'falando', 'parado'] as const) {
      for (const emocao of ['neutro', 'feliz', 'triste', 'bravo', 'surpreso', 'relaxado']) {
        await page.evaluate(([e, em]) => window.__avatarHarness!.mudar(e as never, em as never), [estado, emocao])
        await page.waitForTimeout(40)
      }
    }
    await page.evaluate(() => window.__avatarHarness!.mudar('falando', 'feliz'))
    await expect(page.getByRole('img', { name: 'Avatar falando' })).toBeVisible()
    await page.waitForTimeout(600)
    expect(await pixelsDesenhados(page)).toBeGreaterThan(2000)
    await page.screenshot({
      path: path.join(CAPTURAS, 'avatar-milk-falando-feliz.png'),
      clip: { x: 0, y: 0, width: 400, height: 420 },
    })

    expect(await page.evaluate(() => (window as unknown as { __csp?: string[] }).__csp ?? [])).toEqual([])
    expect(c.consoleErros).toEqual([])
    expect(await page.evaluate(() => window.__avatarHarness!.erros)).toEqual([])
    expect(c.externas).toEqual([])
  })

  test('desmontar libera o contexto WebGL e não deixa requisição a terceiros', async ({ page }) => {
    await page.goto('about:blank')
    await page.goto(`${HARNESS}?fonte=/avatares/dev/bullidan.vrm&tier=fraco&tamanho=160`)
    const c = coletar(page)
    await expect(pronto(page)).toBeVisible({ timeout: 60_000 })
    expect(await pixelsDesenhados(page)).toBeGreaterThan(500)
    await page.evaluate(() => {
      const canvas = document.querySelector('canvas') as HTMLCanvasElement
      ;(window as unknown as { __gl: WebGL2RenderingContext }).__gl = canvas.getContext(
        'webgl2',
      ) as WebGL2RenderingContext
      window.__avatarHarness!.desmontar()
    })
    await expect(page.locator('#desmontado')).toBeVisible()
    await expect(page.locator('canvas')).toHaveCount(0)
    expect(
      await page.evaluate(() => (window as unknown as { __gl: WebGL2RenderingContext }).__gl.isContextLost()),
    ).toBe(true)
    await page.goto('about:blank')
    expect(c.externas).toEqual([])
    expect(c.consoleErros).toEqual([])
  })

  test('perda e restauração do contexto: o motor volta a desenhar', async ({ page }) => {
    await page.goto('about:blank')
    await page.goto(`${HARNESS}?fonte=/avatares/dev/milk.vrm&tier=medio&tamanho=200`)
    const c = coletar(page)
    await expect(pronto(page)).toBeVisible({ timeout: 60_000 })
    expect(await pixelsDesenhados(page)).toBeGreaterThan(1000)

    await page.evaluate(() => {
      const gl = (document.querySelector('canvas') as HTMLCanvasElement).getContext('webgl2')!
      const ext = gl.getExtension('WEBGL_lose_context')!
      ;(window as unknown as { __ext: WEBGL_lose_context }).__ext = ext
      ext.loseContext()
    })
    await page.waitForTimeout(300)
    expect(
      await page.evaluate(() =>
        (document.querySelector('canvas') as HTMLCanvasElement).getContext('webgl2')!.isContextLost(),
      ),
    ).toBe(true)
    await page.evaluate(() => (window as unknown as { __ext: WEBGL_lose_context }).__ext.restoreContext())
    await page.waitForTimeout(500)
    expect(await pixelsDesenhados(page)).toBeGreaterThan(1000)
    // Voltou sozinho: sem fallback e sem erro reportado.
    await expect(page.locator('[data-avatar-fallback]')).toHaveCount(0)
    expect(await page.evaluate(() => window.__avatarHarness!.erros)).toEqual([])
    expect(c.consoleErros).toEqual([])
  })

  test('contexto perdido sem restauração: cai no fallback 2D e avisa', async ({ page }) => {
    await page.goto('about:blank')
    await page.goto(`${HARNESS}?fonte=/avatares/dev/milk.vrm&tier=medio&tamanho=200&nome=Ana%20Souza`)
    await expect(pronto(page)).toBeVisible({ timeout: 60_000 })
    await page.evaluate(() => {
      const gl = (document.querySelector('canvas') as HTMLCanvasElement).getContext('webgl2')!
      gl.getExtension('WEBGL_lose_context')!.loseContext()
    })
    const fallback = page.locator('[data-avatar-fallback="contexto_perdido"]')
    await expect(fallback).toBeVisible({ timeout: 8000 })
    await expect(fallback).toHaveText('AS')
    expect(await page.evaluate(() => window.__avatarHarness!.erros)).toContain('contexto_perdido')
    await page.screenshot({
      path: path.join(CAPTURAS, 'avatar-fallback-iniciais.png'),
      clip: { x: 0, y: 0, width: 400, height: 260 },
    })
  })

  test('sem WebGL2: mostra as iniciais e reporta, sem erro no console', async ({ page }) => {
    await page.addInitScript(() => {
      const original = HTMLCanvasElement.prototype.getContext
      HTMLCanvasElement.prototype.getContext = function (this: HTMLCanvasElement, tipo: string, ...r: unknown[]) {
        if (tipo === 'webgl2') return null
        return (original as (...a: unknown[]) => unknown).call(this, tipo, ...r)
      } as typeof original
    })
    await page.goto(`${HARNESS}?fonte=/avatares/dev/milk.vrm&tamanho=160&nome=Bia%20Lima`)
    const c = coletar(page)
    const fallback = page.locator('[data-avatar-fallback="sem_webgl2"]')
    await expect(fallback).toBeVisible({ timeout: 15_000 })
    await expect(fallback).toHaveText('BL')
    await expect(page.locator('canvas')).toHaveCount(0)
    expect(await page.evaluate(() => window.__avatarHarness!.erros)).toContain('sem_webgl2')
    expect(c.consoleErros).toEqual([])
  })

  test('arquivo que não existe: fallback de erro de carga, sem travar', async ({ page }) => {
    await page.goto(`${HARNESS}?fonte=/avatares/dev/nao-existe.vrm&tamanho=160`)
    await expect(page.locator('[data-avatar-fallback="erro_de_carga"]')).toBeVisible({ timeout: 15_000 })
    expect(await page.evaluate(() => window.__avatarHarness!.erros)).toContain('erro_de_carga')
  })
})
