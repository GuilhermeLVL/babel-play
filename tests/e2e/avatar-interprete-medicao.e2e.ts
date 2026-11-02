import { mkdirSync, writeFileSync } from 'node:fs'
import path from 'node:path'

import { expect, type Page, test } from '@playwright/test'

import {
  abrirPeloMenu,
  comecarFalando,
  comFlagsEVozNatural,
  falsos,
  fase,
  porToque,
  semPreferenciasDeAvatar,
  wavComTom,
} from './_interprete'

/**
 * MEDIÇÃO DO CUSTO DOS AVATARES NO INTÉRPRETE (M4). Só roda com `AVATAR_MEDIR=1` (depende da máquina, não é regressão).
 * `AVATAR_CANAL=chrome` usa o Chrome instalado; `AVATAR_HEADED=1` abre a janela.
 *
 * O que mede, no app de verdade (Intérprete aberto, voz da nuvem com um áudio de tom de 6,5 s, 5 s por cenário), com o
 * `Performance.getMetrics` do CDP: fração de uma CPU gasta pela thread principal (`TaskDuration`), o tempo de script e de
 * layout, e os quadros por segundo do `requestAnimationFrame`. Cenários: A) sem a flag; B) 2 avatares parados + legenda;
 * C) 2 avatares com fala; D) como C, tier fraco (modo celular fraco simulado); E) modo economia (flag ligada, sem avatar).
 * Resultado em `$AVATAR_CAPTURAS/avatar-interprete-medicoes.json`.
 */
const CAPTURAS = process.env.AVATAR_CAPTURAS || path.join(process.cwd(), 'tests', 'e2e', '__capturas__')
const canal = process.env.AVATAR_CANAL === 'chrome' ? 'chrome' : undefined

test.skip(!process.env.AVATAR_MEDIR, 'medição manual: AVATAR_MEDIR=1')
test.use({
  channel: canal,
  headless: !process.env.AVATAR_HEADED,
  permissions: ['microphone'],
  launchOptions: {
    args: [
      '--autoplay-policy=no-user-gesture-required',
      ...(canal ? ['--ignore-gpu-blocklist'] : ['--use-angle=swiftshader', '--enable-unsafe-swiftshader']),
    ],
  },
})

interface Linha {
  cenario: string
  cpuDaThreadPrincipal: number
  scriptMs: number
  layoutMs: number
  quadrosPorSegundo: number
  segundos: number
}

async function janela(page: Page, segundos: number): Promise<Omit<Linha, 'cenario'>> {
  const cdp = await page.context().newCDPSession(page)
  await cdp.send('Performance.enable')
  const ler = async () =>
    Object.fromEntries(
      ((await cdp.send('Performance.getMetrics')) as { metrics: Array<{ name: string; value: number }> }).metrics.map(
        (m) => [m.name, m.value],
      ),
    ) as Record<string, number>
  await page.evaluate(() => {
    const w = window as unknown as { __quadros: number; __raf: boolean }
    w.__quadros = 0
    if (w.__raf) return
    w.__raf = true
    const passo = () => {
      w.__quadros++
      requestAnimationFrame(passo)
    }
    requestAnimationFrame(passo)
  })
  const a = await ler()
  const q0 = await page.evaluate(() => (window as unknown as { __quadros: number }).__quadros)
  await page.waitForTimeout(segundos * 1000)
  const b = await ler()
  const q1 = await page.evaluate(() => (window as unknown as { __quadros: number }).__quadros)
  await cdp.detach()
  const dt = b.Timestamp - a.Timestamp
  return {
    cpuDaThreadPrincipal: Number(((b.TaskDuration - a.TaskDuration) / dt).toFixed(3)),
    scriptMs: Math.round((b.ScriptDuration - a.ScriptDuration) * 1000),
    layoutMs: Math.round((b.LayoutDuration - a.LayoutDuration) * 1000),
    quadrosPorSegundo: Number(((q1 - q0) / dt).toFixed(1)),
    segundos: Number(dt.toFixed(1)),
  }
}

async function cenario(
  page: Page,
  o: { flag: boolean; economia?: boolean; fraco?: boolean; falando: boolean },
): Promise<Omit<Linha, 'cenario'>> {
  await falsos(page, { atrasoDaTraducaoMs: 100 })
  await porToque(page)
  await semPreferenciasDeAvatar(page)
  if (o.economia) await page.addInitScript(() => localStorage.setItem('frasy.avatar.interprete.economia', '1'))
  if (o.fraco)
    await page.addInitScript(() => {
      Object.defineProperty(navigator, 'hardwareConcurrency', { get: () => 2 })
    })
  await comFlagsEVozNatural(page, { avatar_3d: o.flag })
  await page.route('**/api/ai/tts', (r) => r.fulfill({ status: 200, contentType: 'audio/wav', body: wavComTom(6.5) }))
  await abrirPeloMenu(page)
  await page.evaluate(async () => {
    for (let i = 0; i < 20 && !localStorage.getItem('babel.flags')?.includes('voz_natural'); i++)
      await new Promise((r) => setTimeout(r, 100))
  })
  await comecarFalando(page, /Falar em Português/)
  if (o.flag && !o.economia)
    await expect(fase(page).getByTestId('avatar-meu').locator('[data-avatar-pronto="true"]')).toBeVisible({
      timeout: 60_000,
    })
  if (o.falando) {
    await expect
      .poll(
        () =>
          page.evaluate(() =>
            (window as unknown as { __audios: HTMLAudioElement[] }).__audios.some(
              (a) => !a.paused && !!a.src && !a.src.startsWith('data:'),
            ),
          ),
        { timeout: 20_000 },
      )
      .toBe(true)
    await page.waitForTimeout(500)
  } else {
    await expect(fase(page)).toHaveAttribute('data-fase', 'parado', { timeout: 20_000 })
    await page.waitForTimeout(8000) // o áudio de 6,5 s termina antes de medir o parado
  }
  return janela(page, 5)
}

test('custo por cenário', async ({ browser }) => {
  test.setTimeout(480_000)
  mkdirSync(CAPTURAS, { recursive: true })
  const linhas: Linha[] = []
  let renderer = ''
  const cenarios: Array<[string, Parameters<typeof cenario>[1]]> = [
    ['A) sem a flag, parado', { flag: false, falando: false }],
    ['B) 2 avatares + legenda, parados', { flag: true, falando: false }],
    ['C) 2 avatares + legenda, voz da nuvem falando', { flag: true, falando: true }],
    ['D) como C, aparelho fraco (2 núcleos: tier fraco)', { flag: true, falando: true, fraco: true }],
    ['E) modo economia (flag ligada, sem avatar), falando', { flag: true, economia: true, falando: true }],
  ]
  for (const [nome, o] of cenarios) {
    const contexto = await browser.newContext({
      baseURL: process.env.BASE_URL || 'http://localhost:3100',
      viewport: { width: 1280, height: 800 },
      permissions: ['microphone'],
    })
    const page = await contexto.newPage()
    const r = await cenario(page, o)
    if (!renderer)
      renderer = await page.evaluate(() => {
        const gl = document.createElement('canvas').getContext('webgl2')
        const ext = gl?.getExtension('WEBGL_debug_renderer_info')
        return gl && ext ? String(gl.getParameter(ext.UNMASKED_RENDERER_WEBGL)) : 'sem WebGL2'
      })
    linhas.push({ cenario: nome, ...r })
    console.log(JSON.stringify({ cenario: nome, ...r }))
    await contexto.close()
  }
  writeFileSync(
    path.join(CAPTURAS, 'avatar-interprete-medicoes.json'),
    JSON.stringify(
      { quando: new Date().toISOString(), canal: canal ?? 'chromium-playwright', renderer, linhas },
      null,
      2,
    ),
  )
  expect(linhas.length).toBe(cenarios.length)
})
