import { mkdirSync, writeFileSync } from 'node:fs'
import path from 'node:path'

import { expect, type Locator, type Page, test } from '@playwright/test'

import { violacoesGraves } from './_acessibilidade'
import { abrirPeloMenu, comecarFalando, comFlags, falsos, fase, porToque, semPreferenciasDeAvatar } from './_interprete'

/**
 * ACESSIBILIDADE MEDIDA DO AVATAR (M2.2): axe (WCAG 2.2 AA, impacto sério ou crítico, `_acessibilidade.ts`) na aba
 * Avatar (Escolher, Personalizar, Estúdio, Traga o seu, perfil protegido) e no Intérprete com avatares, no claro e no
 * escuro; contraste MEDIDO (razão WCAG) do botão "Salvar" desabilitado e dos botões secundários no escuro; e o foco
 * por teclado (Tab) completo na aba e no painel do Intérprete.
 *
 * O axe não mede controle desabilitado (a WCAG isenta), por isso o contraste do "Avatar já salvo" é medido aqui, com a
 * mesma fórmula, porque ele é a única explicação do estado e tem de ser legível.
 *
 * Os projetos do Playwright dão 375, 768 e 1280; a largura de 390 é imposta aqui no celular.
 */
test.use({
  launchOptions: { args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] },
  permissions: ['microphone'],
})

const CAPTURAS = process.env.AVATAR_CAPTURAS || path.join(process.cwd(), 'tests', 'e2e', '__capturas__')
mkdirSync(CAPTURAS, { recursive: true })

test.beforeEach(async ({ page }) => {
  // O projeto de celular é 375: aqui o celular é 390 (o aparelho mais comum); o computador fica como está.
  if ((page.viewportSize()?.width ?? 0) < 500) await page.setViewportSize({ width: 390, height: 844 })
  await semPreferenciasDeAvatar(page)
  await page.addInitScript(() => {
    if (sessionStorage.getItem('__limpo')) return
    sessionStorage.setItem('__limpo', '1')
    for (const k of Object.keys(localStorage)) if (k.startsWith('frasy.avatar')) localStorage.removeItem(k)
    indexedDB.deleteDatabase('frasy-avatar')
  })
})

const tema = (page: Page, escuro: boolean) =>
  page.evaluate((e) => document.documentElement.classList.toggle('dark', e), escuro)

async function abrirAvatar(page: Page) {
  await page.route('**/api/flags', (r) => r.fulfill({ json: { flags: { avatar_3d: { ligada: true } } } }))
  await page.goto('/perfil')
  await expect(page.getByTestId('perfil-do-quest')).toBeVisible()
  await page.getByRole('tab', { name: 'Avatar' }).click()
  await expect(page.getByTestId('aba-avatar')).toBeVisible()
}

/** A razão de contraste WCAG entre duas cores CSS quaisquer (resolvidas por um canvas, inclusive `color-mix`). */
async function razoes(alvo: Locator) {
  return alvo.evaluate((el) => {
    const c = document.createElement('canvas')
    c.width = c.height = 1
    const ctx = c.getContext('2d', { willReadFrequently: true })!
    const rgba = (css: string): [number, number, number, number] => {
      ctx.clearRect(0, 0, 1, 1)
      ctx.fillStyle = '#000'
      ctx.fillStyle = css
      ctx.fillRect(0, 0, 1, 1)
      const d = ctx.getImageData(0, 0, 1, 1).data
      return [d[0], d[1], d[2], d[3] / 255]
    }
    const sobre = (f: [number, number, number, number], b: [number, number, number]): [number, number, number] => [
      f[0] * f[3] + b[0] * (1 - f[3]),
      f[1] * f[3] + b[1] * (1 - f[3]),
      f[2] * f[3] + b[2] * (1 - f[3]),
    ]
    const lum = ([r, g, b]: number[]) => {
      const l = [r, g, b].map((v) => {
        const s = v / 255
        return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4
      })
      return 0.2126 * l[0] + 0.7152 * l[1] + 0.0722 * l[2]
    }
    const razao = (a: number[], b: number[]) => {
      const [x, y] = [lum(a), lum(b)].sort((p, q) => q - p)
      return (x + 0.05) / (y + 0.05)
    }
    // O fundo de verdade: do elemento para cima, compondo as camadas até achar uma opaca.
    const camadas: [number, number, number, number][] = []
    const fundoDe = (no: Element | null): [number, number, number] => {
      const pilha: [number, number, number, number][] = []
      for (let n = no; n; n = n.parentElement) {
        const f = rgba(getComputedStyle(n).backgroundColor)
        if (f[3] > 0) pilha.push(f)
        if (f[3] >= 1) break
      }
      let base: [number, number, number] = rgba(getComputedStyle(document.body).backgroundColor).slice(0, 3) as [
        number,
        number,
        number,
      ]
      for (const f of pilha.reverse()) base = sobre(f, base)
      return base
    }
    void camadas
    const e = getComputedStyle(el)
    const pai = fundoDe(el.parentElement)
    const fundo = fundoDe(el)
    const opac = Number(e.opacity)
    const texto = sobre(
      [...(rgba(e.color).slice(0, 3) as [number, number, number]), rgba(e.color)[3] * opac] as [
        number,
        number,
        number,
        number,
      ],
      fundo,
    )
    const bordaCss = rgba(e.borderTopColor)
    const temBorda = parseFloat(e.borderTopWidth) > 0 && bordaCss[3] > 0
    const borda = temBorda ? sobre(bordaCss, pai) : null
    return {
      texto: Math.round(razao(texto, fundo) * 100) / 100,
      componenteContraFundo: Math.round(razao(fundo, pai) * 100) / 100,
      borda: borda ? Math.round(razao(borda, pai) * 100) / 100 : null,
      cores: { texto: texto.map(Math.round), fundo: fundo.map(Math.round), pai: pai.map(Math.round) },
    }
  })
}

const relatorio: Record<string, unknown> = {}
test.afterAll(() => {
  if (Object.keys(relatorio).length)
    writeFileSync(path.join(CAPTURAS, `a11y-${test.info().project.name}.json`), JSON.stringify(relatorio, null, 2))
})

const aba = (page: Page, nome: string) => page.getByRole('tab', { name: nome, exact: true }).click()

for (const escuro of [false, true]) {
  const nomeDoTema = escuro ? 'escuro' : 'claro'

  test(`axe na aba Avatar (${nomeDoTema}): Escolher, Personalizar, Estúdio, Traga o seu`, async ({ page }) => {
    test.slow()
    await abrirAvatar(page)
    await tema(page, escuro)
    await expect(page.locator('[data-avatar-pronto="true"]').first()).toBeVisible({ timeout: 30_000 })
    await page.getByTestId('avatar-sortear').click()
    const achados: Record<string, string[]> = {}
    for (const [nome, id] of [
      ['Escolher', 'escolher'],
      ['Personalizar', 'personalizar'],
      ['Estúdio', 'estudio'],
      ['Traga o seu', 'traga'],
    ] as const) {
      await aba(page, nome)
      await expect(page.locator(`#painel-${id}`)).toBeVisible()
      await page.waitForTimeout(400)
      achados[nome] = await violacoesGraves(page, ['[data-testid="aba-avatar"]'])
    }
    relatorio[`aba-${nomeDoTema}-${page.viewportSize()?.width}`] = achados
    expect(achados).toEqual({ Escolher: [], Personalizar: [], Estúdio: [], 'Traga o seu': [] })
  })

  test(`axe no perfil protegido (${nomeDoTema})`, async ({ page }) => {
    await page.addInitScript(() => sessionStorage.setItem('frasy.avatar.protegido', '1'))
    await abrirAvatar(page)
    await tema(page, escuro)
    await expect(page.getByTestId('avatar-so-colecao')).toBeVisible()
    await page.waitForTimeout(400)
    const achados = await violacoesGraves(page, ['[data-testid="aba-avatar"]'])
    relatorio[`protegido-${nomeDoTema}-${page.viewportSize()?.width}`] = achados
    expect(achados).toEqual([])
  })

  test(`axe no Intérprete com avatares (${nomeDoTema}), com o painel aberto`, async ({ page }) => {
    test.slow()
    await falsos(page)
    await porToque(page)
    await comFlags(page, { avatar_3d: true })
    await abrirPeloMenu(page)
    await tema(page, escuro)
    await comecarFalando(page, /Falar em Português/)
    await expect(fase(page).locator('[data-avatar-estado]')).toHaveCount(2)
    await expect(fase(page).locator('[data-avatar-pronto="true"]').first()).toBeVisible({ timeout: 60_000 })
    await page.waitForTimeout(500)
    const tela = await violacoesGraves(page)
    await page.getByTestId('avatares-da-conversa').click()
    const painel = page.getByRole('dialog', { name: 'Avatares da conversa' })
    await expect(painel).toBeVisible()
    await page.waitForTimeout(400)
    const comPainel = await violacoesGraves(page, ['[data-testid="painel-dos-avatares"]'])
    relatorio[`interprete-${nomeDoTema}-${page.viewportSize()?.width}`] = { tela, painel: comPainel }
    expect({ tela, painel: comPainel }).toEqual({ tela: [], painel: [] })
  })
}

test('contraste medido: "Avatar já salvo" (desabilitado) e botões secundários no escuro, em 3:1 de componente e 4,5:1 de texto', async ({
  page,
}) => {
  await abrirAvatar(page)
  await tema(page, true)
  await expect(page.locator('[data-avatar-pronto="true"]').first()).toBeVisible({ timeout: 30_000 })
  await page.getByTestId('avatar-sortear').click()
  await page.getByTestId('avatar-salvar').click()
  await expect(page.getByTestId('avatar-status')).toContainText('Avatar salvo')
  await expect(page.getByTestId('avatar-salvar')).toBeDisabled()
  await page.waitForTimeout(500)
  const medidas = {
    salvarDesabilitado: await razoes(page.getByTestId('avatar-salvar')),
    sortear: await razoes(page.getByTestId('avatar-sortear')),
    dispensar: await razoes(page.getByTestId('avatar-dispensar')),
    apagar: await razoes(page.getByTestId('avatar-apagar')),
  }
  relatorio[`contraste-escuro-${page.viewportSize()?.width}`] = medidas
  console.log('CONTRASTE', JSON.stringify(medidas))
  await page.screenshot({ path: path.join(CAPTURAS, `a11y-escuro-salvo-${page.viewportSize()?.width}.png`) })
  // Texto: 4,5:1 (inclusive do desabilitado, que é a única explicação do estado).
  for (const [nome, m] of Object.entries(medidas)) expect(m.texto, `texto de ${nome}`).toBeGreaterThanOrEqual(4.5)
  // Componente: o botão se distingue do que está em volta (a borda OU o fundo) em 3:1.
  for (const [nome, m] of Object.entries(medidas)) {
    expect(Math.max(m.borda ?? 0, m.componenteContraFundo), `componente ${nome}`).toBeGreaterThanOrEqual(3)
  }
})

/** Os controles que o Tab alcança: visíveis, não desabilitados, com tabindex >= 0. */
const ALCANCAVEIS =
  'a[href], button:not([disabled]), input:not([disabled]):not([type=hidden]), select:not([disabled]), textarea:not([disabled]), summary, [tabindex]:not([tabindex="-1"])'

async function tabularPor(page: Page, raiz: string, max = 120) {
  const esperados: string[] = await page.evaluate(
    ([r, sel]) =>
      [...document.querySelectorAll<HTMLElement>(sel)]
        .filter((el) => {
          if (!el.closest(r)) return false
          // Grupo de rádio: o Tab para só no marcado (os outros se alcançam com as setas).
          if (el instanceof HTMLInputElement && el.type === 'radio' && !el.checked && el.name) {
            const grupo = [...document.querySelectorAll<HTMLInputElement>(`input[type=radio][name="${el.name}"]`)]
            if (grupo.some((g) => g.checked)) return false
          }
          const c = el.getBoundingClientRect()
          const e = getComputedStyle(el)
          return c.width > 0 && c.height > 0 && e.visibility !== 'hidden' && e.display !== 'none' && el.tabIndex >= 0
        })
        .map((el, i) => {
          el.setAttribute('data-a11y-i', String(i))
          return `${i}:${(el.getAttribute('aria-label') || el.textContent || el.tagName).trim().slice(0, 28)}`
        }),
    [raiz, ALCANCAVEIS] as const,
  )
  const nomesEsperados = new Map(esperados.map((e) => [e.split(':')[0], e]))
  const vistos = new Set<string>()
  const semFoco: string[] = []
  for (let n = 0; n < max && vistos.size < esperados.length; n++) {
    await page.keyboard.press('Tab')
    const r = await page.evaluate((r0) => {
      const el = document.activeElement as HTMLElement | null
      if (!el || !el.closest(r0)) return null
      const e = getComputedStyle(el)
      const visivel =
        (e.outlineStyle !== 'none' && parseFloat(e.outlineWidth) > 0) || (e.boxShadow && e.boxShadow !== 'none')
      return {
        i: el.getAttribute('data-a11y-i'),
        visivel: !!visivel,
        nome: (el.textContent || el.tagName).trim().slice(0, 30),
      }
    }, raiz)
    if (!r || r.i === null) continue
    vistos.add(r.i)
    if (!r.visivel) semFoco.push(r.nome)
  }
  const faltaram = [...nomesEsperados].filter(([i]) => !vistos.has(i)).map(([, nome]) => nome)
  return { esperados: esperados.length, vistos: vistos.size, semFoco, faltaram }
}

test('foco por teclado (Tab): a aba Avatar inteira se alcança, com foco visível', async ({ page }) => {
  await abrirAvatar(page)
  await expect(page.locator('[data-avatar-pronto="true"]').first()).toBeVisible({ timeout: 30_000 })
  await page.getByTestId('avatar-sortear').click()
  await page.getByRole('tab', { name: 'Escolher', exact: true }).focus()
  const r = await tabularPor(page, '[data-testid="aba-avatar"]')
  relatorio[`tab-aba-${page.viewportSize()?.width}`] = r
  expect(r.vistos, JSON.stringify(r)).toBe(r.esperados)
  expect(r.semFoco, 'controles sem foco visível').toEqual([])
})

test('foco por teclado (Tab): o painel dos avatares do Intérprete prende o foco dentro e o mostra', async ({
  page,
}) => {
  test.slow()
  await falsos(page)
  await porToque(page)
  await comFlags(page, { avatar_3d: true })
  await abrirPeloMenu(page)
  await comecarFalando(page, /Falar em Português/)
  await expect(fase(page).locator('[data-avatar-estado]')).toHaveCount(2)
  await page.getByTestId('avatares-da-conversa').click()
  const painel = page.getByRole('dialog', { name: 'Avatares da conversa' })
  await expect(painel).toBeVisible()
  const r = await tabularPor(page, '[data-testid="painel-dos-avatares"]')
  relatorio[`tab-painel-${page.viewportSize()?.width}`] = r
  expect(r.vistos, JSON.stringify(r)).toBe(r.esperados)
  expect(r.semFoco, 'controles sem foco visível').toEqual([])
  // Continuando a tabular, o foco não escapa do painel (ou ele fecha e devolve o foco a quem abriu).
  for (let i = 0; i < r.esperados + 2; i++) {
    await page.keyboard.press('Tab')
    const dentro = await page.evaluate(() => !!document.activeElement?.closest('[data-testid="painel-dos-avatares"]'))
    expect(dentro, 'o foco continua dentro do painel').toBe(true)
  }
})
