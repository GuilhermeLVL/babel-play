import { mkdirSync } from 'node:fs'
import path from 'node:path'

import { expect, type Page, test } from '@playwright/test'

/**
 * O AVATAR QUE SOLETRA (M4b), pelo harness `tests/e2e/avatar-harness` com `?sinais=1`: dedos independentes nos dois
 * VRM de teste, "Conceição" em Libras e ASL sem erro, avisos fixos que voltam se removidos, movimento reduzido,
 * câmera só das mãos, alto contraste, modelo sem dedos. Sem requisição externa.
 *
 * SOLETRAÇÃO, não tradução; poses de demonstração NÃO revisadas por pessoas surdas.
 * Capturas: `$AVATAR_CAPTURAS` (padrão `tests/e2e/__capturas__/`, fora do git).
 */
const HARNESS = '/tests/e2e/avatar-harness/index.html'
const CAPTURAS = process.env.AVATAR_CAPTURAS || path.join(process.cwd(), 'tests', 'e2e', '__capturas__')
const MODELOS = ['milk', 'bullidan'] as const

test.setTimeout(120_000)
test.use({
  launchOptions: { args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] },
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

const AVISO_1 = 'Soletração do alfabeto manual: não é tradução para Libras'
const AVISO_2 = 'Poses de DEMONSTRAÇÃO: ainda NÃO revisadas por pessoas surdas'

async function abrir(page: Page, params = '', modelo: (typeof MODELOS)[number] = 'milk') {
  await page.goto('about:blank')
  await page.goto(`${HARNESS}?sinais=1&fonte=/avatares/dev/${modelo}.vrm&tier=medio&tamanho=360${params}`)
  const c = coletar(page)
  await expect(page.locator('[data-sinais-pronto="true"]')).toBeVisible({ timeout: 90_000 })
  return c
}
const terminou = (page: Page) =>
  page.waitForFunction(() => window.__avatarHarness?.sinais?.terminou() === true, null, { timeout: 60_000 })

test.describe('avatar soletrando (harness)', () => {
  test.beforeAll(() => mkdirSync(CAPTURAS, { recursive: true }))

  for (const modelo of MODELOS) {
    test(`${modelo}: cada dedo se move sozinho nas duas mãos (>= 8 cm; os outros <= 1 cm)`, async ({ page }) => {
      const c = await abrir(page, '&pausado=1', modelo)
      const r = await page.evaluate(() => window.__avatarHarness?.sinais?.testeDedos())
      const resumo = (['R', 'L'] as const).map(
        (l) =>
          `${l} (mão ${((r?.[l].maoDoModeloM ?? 0) * 100).toFixed(1)} cm): ` +
          (r?.[l].dedos ?? [])
            .map(
              (d) =>
                `${d.dedo} ${(d.andouM * 100).toFixed(1)}cm (rel ${(d.andouRelM * 100).toFixed(1)})/outros ${(d.outrosMaxM * 100).toFixed(2)}cm${d.ok ? '' : ' <8cm'}`,
            )
            .join(' | '),
      )
      console.log(`[independência ${modelo}]\n  ${resumo.join('\n  ')}`)
      expect(r, resumo.join('\n')).not.toBeNull()
      // independência: os outros dedos nunca andam mais de 1 cm, em qualquer modelo
      expect(r?.R.independentes, resumo.join('\n')).toBe(true)
      expect(r?.L.independentes, resumo.join('\n')).toBe(true)
      // o dedo acionado anda >= 8 cm: pela mão do próprio modelo (mão de 19 cm)...
      expect(r?.R.okRelativo, resumo.join('\n')).toBe(true)
      expect(r?.L.okRelativo, resumo.join('\n')).toBe(true)
      // ...e, pelo critério estrito por altura (1,7 m), só nos modelos de proporção humana
      if (modelo === 'bullidan') {
        expect(r?.R.ok, resumo.join('\n')).toBe(true)
        expect(r?.L.ok, resumo.join('\n')).toBe(true)
      }
      expect(c.consoleErros).toEqual([])
    })
  }

  for (const alfabeto of ['libras', 'asl'] as const) {
    test(`soletra "Conceição" em ${alfabeto} sem erro, com legenda e palavra atual`, async ({ page }, info) => {
      const c = await abrir(page, `&alfabeto=${alfabeto}&texto=${encodeURIComponent('Conceição')}&vel=2`)
      const legenda = page.locator('[data-sinais-legenda]')
      await expect(legenda).toContainText('Conceição')
      await expect(page.locator('[data-palavra-atual]')).toHaveText('Conceição', { timeout: 15_000 })
      await page.screenshot({ path: path.join(CAPTURAS, `soletrando-${alfabeto}-${info.project.name}.png`) })
      await terminou(page)
      const letras = await page.evaluate(() => window.__avatarHarness?.sinais?.letrasVistas())
      expect(letras).toBe(alfabeto === 'libras' ? 'CONCEIÇÃO' : 'CONCEICAO')
      const clamp = await page.evaluate(() => window.__avatarHarness?.sinais?.controle()?.clamp.vezes)
      expect(clamp).toBe(0)
      await expect(legenda).toContainText('Conceição')
      expect(c.consoleErros).toEqual([])
      expect(c.externas).toEqual([])
    })
  }

  test('os dois avisos estão sempre presentes: voltam se removidos ou adulterados', async ({ page }, info) => {
    await abrir(page, '&texto=Ana&vel=2')
    const avisos = page.locator('[data-aviso-fixo]')
    await expect(avisos).toHaveCount(2)
    await expect(page.locator('[data-avisos-fixos]')).toContainText(AVISO_1)
    await expect(page.locator('[data-avisos-fixos]')).toContainText(AVISO_2)
    await page.evaluate(() => window.__avatarHarness?.sinais?.removerAvisos())
    await expect(avisos).toHaveCount(2)
    await expect(avisos.nth(0)).toHaveText(AVISO_1)
    await expect(avisos.nth(1)).toHaveText(AVISO_2)
    await page.evaluate(() => window.__avatarHarness?.sinais?.adulterarAvisos())
    await expect(avisos.nth(0)).toHaveText(AVISO_1)
    await expect(avisos.nth(1)).toBeVisible()
    await expect(avisos.nth(1)).toHaveText(AVISO_2)
    // nenhum botão fecha os avisos
    await expect(page.locator('[data-avisos-fixos] button')).toHaveCount(0)
    await page.screenshot({ path: path.join(CAPTURAS, `avisos-${info.project.name}.png`) })
  })

  test('movimento reduzido: sem erro, a legenda segue e a mão salta de letra em letra', async ({ page }, info) => {
    await page.emulateMedia({ reducedMotion: 'reduce' })
    const c = await abrir(page, `&texto=${encodeURIComponent('Zé Ana')}&vel=2`)
    await expect(page.locator('[data-palavra-atual]')).toBeVisible({ timeout: 15_000 })
    await page.screenshot({ path: path.join(CAPTURAS, `reduzido-${info.project.name}.png`) })
    await terminou(page)
    expect(c.consoleErros).toEqual([])
    const sem = await page.evaluate(() => window.__avatarHarness?.sinais?.naoSuportou())
    expect(sem).toBeNull()
  })

  test('câmera só das mãos e alto contraste', async ({ page }, info) => {
    const c = await abrir(page, '&cam=maos&contraste=1&alfabeto=asl&texto=Mia&vel=1')
    const sec = page.locator('section[data-sinais-camera]')
    await expect(sec).toHaveAttribute('data-sinais-camera', 'maos')
    expect(Number(await sec.getAttribute('data-sinais-contraste'))).toBeGreaterThanOrEqual(3)
    await expect(page.locator('[data-palavra-atual]')).toBeVisible({ timeout: 15_000 })
    await page.waitForTimeout(1500)
    await page.screenshot({ path: path.join(CAPTURAS, `maos-contraste-${info.project.name}.png`) })
    expect(c.consoleErros).toEqual([])
  })

  test('canhoto (espelhado) soletra sem erro', async ({ page }, info) => {
    const c = await abrir(page, '&cam=maos&espelhar=1&alfabeto=libras&texto=Leo&vel=1')
    await expect(page.locator('[data-palavra-atual]')).toBeVisible({ timeout: 15_000 })
    await page.waitForTimeout(1200)
    await page.screenshot({ path: path.join(CAPTURAS, `canhoto-${info.project.name}.png`) })
    expect(c.consoleErros).toEqual([])
  })

  test('texto com número, emoji e palavra de uma letra: números 0-9 soletram; marca o que não soletrou', async ({
    page,
  }) => {
    // "٢٠٢٥" são dígitos Unicode que NÃO são 0-9: seguem pulados e marcados como número
    await abrir(page, `&texto=${encodeURIComponent('a Rita 2025 😀 ٢٠٢٥')}&vel=2`)
    const estados = await page
      .locator('[data-palavra]')
      .evaluateAll((els) =>
        els.map((e) => [e.textContent, e.getAttribute('data-palavra-estado'), e.getAttribute('title')]),
      )
    expect(estados[0]).toEqual(['a', 'nao_soletrada', 'Palavra de uma letra: não soletrada'])
    expect(estados[1][1]).toBe('soletrada')
    // os algarismos 0-9 têm pose própria: "2025" é soletrado
    expect(estados[2][0]).toBe('2025')
    expect(estados[2][1]).toBe('soletrada')
    expect(estados[3][1]).toBe('nao_soletrada')
    expect(estados[4]).toEqual(['٢٠٢٥', 'nao_soletrada', 'Números não são soletrados'])
    await expect(page.locator('[data-sinais-legenda]')).toHaveAttribute('aria-live', 'off')
  })
})
