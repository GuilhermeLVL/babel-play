import { mkdirSync, writeFileSync } from 'node:fs'
import path from 'node:path'

import { expect, test } from '@playwright/test'

/**
 * MEDIÇÃO DO CUSTO POR QUADRO COM FALA (M3). Só roda com `AVATAR_MEDIR=1` (não é teste de regressão: depende da
 * máquina). `AVATAR_CANAL=chrome` usa o Chrome instalado (com GPU real); `AVATAR_HEADED=1` abre a janela.
 * Sem eles, o Chromium do Playwright com SwiftShader (WebGL por software: custo de CPU MUITO maior que o real).
 *
 * Mede 600 quadros em sequência (`motor.medirQuadros`): média e p95 em ms, de duas formas: SUBMISSÃO de CPU
 * (como o protótipo, 0,06–0,18 ms/quadro) e COM ESPERA DA GPU (`gl.finish`). Resultado em
 * `$AVATAR_CAPTURAS/avatar-fala-medicoes.json`.
 */
const HARNESS = '/tests/e2e/avatar-harness/index.html'
const CAPTURAS = process.env.AVATAR_CAPTURAS || path.join(process.cwd(), 'tests', 'e2e', '__capturas__')
const canal = process.env.AVATAR_CANAL === 'chrome' ? 'chrome' : undefined

test.skip(!process.env.AVATAR_MEDIR, 'medição manual: AVATAR_MEDIR=1')
test.use({
  channel: canal,
  headless: !process.env.AVATAR_HEADED,
  launchOptions: {
    args: canal ? ['--ignore-gpu-blocklist'] : ['--use-angle=swiftshader', '--enable-unsafe-swiftshader'],
  },
})

interface LinhaDoLaco {
  tier: string
  fala: boolean
  quadrosPorSegundo: number
  mediaMs: number
  p95Ms: number
}

interface Linha {
  tier: string
  fala: boolean
  sincronizaGpu: boolean
  mediaMs: number
  p95Ms: number
  maxMs: number
  quadros: number
}

test('custo por quadro: tier forte e fraco, com e sem fala', async ({ page }) => {
  test.setTimeout(240_000)
  mkdirSync(CAPTURAS, { recursive: true })
  const linhas: Linha[] = []
  const laco: LinhaDoLaco[] = []
  let renderer = ''
  // Mede também o laço REAL: tempo dentro do callback de rAF dos quadros em que o motor desenhou.
  await page.addInitScript(() => {
    const w = window as unknown as { __rafLog: number[] }
    w.__rafLog = []
    const orig = window.requestAnimationFrame.bind(window)
    window.requestAnimationFrame = (cb) =>
      orig((t) => {
        const q = () => window.__avatarHarness?.quadros?.() ?? 0
        const q0 = q()
        const a = performance.now()
        cb(t)
        const d = performance.now() - a
        if (q() > q0) w.__rafLog.push(d)
      })
  })
  for (const tier of ['forte', 'fraco'] as const) {
    await page.goto('about:blank')
    await page.goto(`${HARNESS}?fonte=/avatares/dev/milk.vrm&tier=${tier}&tamanho=256&fala=1`)
    await expect(page.locator('[data-avatar-pronto="true"]')).toBeVisible({ timeout: 60_000 })
    if (!renderer) {
      renderer = await page.evaluate(() => {
        const gl = document.createElement('canvas').getContext('webgl2')!
        const ext = gl.getExtension('WEBGL_debug_renderer_info')
        return ext ? String(gl.getParameter(ext.UNMASKED_RENDERER_WEBGL)) : 'desconhecido'
      })
    }
    await page.waitForTimeout(500)
    for (const fala of [false, true]) {
      await page.evaluate((f) => {
        window.__avatarHarness!.bocaSintetica(f)
        window.__avatarHarness!.mudar(f ? 'falando' : 'parado', f ? 'feliz' : 'neutro')
      }, fala)
      await page.waitForTimeout(400)
      for (const gpu of [false, true]) {
        // aquecimento
        await page.evaluate(() => window.__avatarHarness!.medir(120, false))
        const r = await page.evaluate((g) => window.__avatarHarness!.medir(600, g), gpu)
        expect(r).not.toBeNull()
        linhas.push({ tier, fala, sincronizaGpu: gpu, ...r! })
      }
      await page.evaluate(() => ((window as unknown as { __rafLog: number[] }).__rafLog.length = 0))
      await page.waitForTimeout(3000)
      const log = await page.evaluate(() => (window as unknown as { __rafLog: number[] }).__rafLog.slice())
      const ord = [...log].sort((a, b) => a - b)
      laco.push({
        tier,
        fala,
        quadrosPorSegundo: log.length / 3,
        mediaMs: log.reduce((a, b) => a + b, 0) / Math.max(1, log.length),
        p95Ms: ord[Math.min(ord.length - 1, Math.floor(ord.length * 0.95))] ?? 0,
      })
    }
  }
  const saida = {
    quando: new Date().toISOString(),
    navegador: await page.evaluate(() => navigator.userAgent),
    canal: canal ?? 'chromium-do-playwright',
    headless: !process.env.AVATAR_HEADED,
    renderer,
    linhas,
    lacoReal: laco,
  }
  writeFileSync(path.join(CAPTURAS, 'avatar-fala-medicoes.json'), JSON.stringify(saida, null, 2))
  console.log(JSON.stringify(saida, null, 2))
})
