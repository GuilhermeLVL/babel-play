import { mkdirSync } from 'node:fs'
import path from 'node:path'

import { expect, type Page, test } from '@playwright/test'

import { semCapturaDeTela } from './_helpers'
import {
  abrirPeloMenu,
  comecarFalando,
  comFlags,
  comFlagsEVozNatural,
  estadosDoAvatar,
  falsos,
  fase,
  observarEstadosDoAvatar,
  porToque,
  semPreferenciasDeAvatar,
  wavComTom,
} from './_interprete'

/**
 * OS AVATARES NO INTÉRPRETE (M4), no app de verdade, com a Web Speech, o tradutor e a voz FALSOS (ver `_interprete.ts`).
 * Provado aqui: sem a flag nada muda; com a flag aparecem dois avatares (um por lado) e a legenda continua presente; os
 * estados acompanham a conversa; modo economia; sem WebGL cai na foto/iniciais; o painel (teclado, rótulos, Esc, foco);
 * o som da voz da nuvem (volume, mudo, pausa) e o analisador ligado dentro do gesto.
 * NÃO provado aqui: Safari, Firefox e celular reais; microfone e modelo de fala reais.
 *
 * Capturas: `$AVATAR_CAPTURAS` (padrão `tests/e2e/__capturas__/`, fora do git).
 */
const CAPTURAS = process.env.AVATAR_CAPTURAS || path.join(process.cwd(), 'tests', 'e2e', '__capturas__')
mkdirSync(CAPTURAS, { recursive: true })

test.use({
  launchOptions: {
    args: [
      '--use-angle=swiftshader',
      '--enable-unsafe-swiftshader',
      '--ignore-gpu-blocklist',
      '--autoplay-policy=no-user-gesture-required',
    ],
  },
  permissions: ['microphone'],
})

const foto = (page: Page, nome: string) =>
  page.screenshot({ path: path.join(CAPTURAS, `interprete-${test.info().project.name}-${nome}.png`) })

const avatar = (page: Page, lado: 'meu' | 'outro') => fase(page).getByTestId(`avatar-${lado}`)
const prontoDoAvatar = (page: Page, lado: 'meu' | 'outro') => avatar(page, lado).locator('[data-avatar-pronto="true"]')

test.beforeEach(async ({ page }) => {
  await semPreferenciasDeAvatar(page)
})

test.describe('Avatares no Intérprete', () => {
  test('sem a flag, nada muda: nenhum avatar, nenhum botão, a linha do idioma como sempre', async ({ page }) => {
    await falsos(page)
    await porToque(page)
    await comFlags(page, {})
    await abrirPeloMenu(page)
    await comecarFalando(page, /Falar em Português/)
    await expect(fase(page).getByTestId('interprete-outro').getByText('[trad] bom dia a todos')).toBeVisible({
      timeout: 10_000,
    })
    await expect(fase(page).locator('.int-topo, .int-avatar, [data-avatar-estado]')).toHaveCount(0)
    await expect(fase(page).getByTestId('avatares-da-conversa')).toHaveCount(0)
    // nenhum AudioContext do avatar: o analisador só nasce com a flag
    expect(await page.evaluate(() => (window as unknown as { __contextos: unknown[] }).__contextos.length)).toBe(0)
  })

  test('com a flag: dois avatares, a legenda sempre presente e os estados seguem a conversa', async ({ page }) => {
    test.slow()
    await falsos(page, { atrasoDaTraducaoMs: 700 })
    await porToque(page)
    await comFlags(page, { avatar_3d: true })
    await abrirPeloMenu(page)
    await comecarFalando(page, /Falar em Português/)
    await observarEstadosDoAvatar(page)

    await expect(avatar(page, 'meu')).toBeVisible()
    await expect(avatar(page, 'outro')).toBeVisible()
    await expect(prontoDoAvatar(page, 'meu')).toBeVisible({ timeout: 60_000 })
    await expect(prontoDoAvatar(page, 'outro')).toBeVisible({ timeout: 60_000 })
    await expect(fase(page).locator('[data-avatar-estado]')).toHaveCount(2)
    await foto(page, '1-dois-avatares')

    // A legenda (a fala e a tradução) está presente do começo ao fim: o avatar é complemento.
    await expect(fase(page).getByTestId('interprete-outro').getByText('[trad] bom dia a todos')).toBeVisible({
      timeout: 15_000,
    })
    await expect(fase(page).getByTestId('interprete-outro').getByText('bom dia a todos', { exact: true })).toBeVisible()
    await expect(fase(page)).toHaveAttribute('data-fase', 'parado', { timeout: 8_000 })

    const estados = await estadosDoAvatar(page)
    expect(estados.meu).toContain('ouvindo') // o microfone no meu lado
    expect(estados.meu).toContain('pensando') // traduzindo
    expect(estados.outro).not.toContain('falando')
    await foto(page, '2-depois-de-falar')
  })

  test('modo economia: sem avatares e o layout de antes; a escolha fica guardada', async ({ page }) => {
    await falsos(page)
    await porToque(page)
    await comFlags(page, { avatar_3d: true })
    await abrirPeloMenu(page)
    await comecarFalando(page, /Falar em Português/)
    await expect(avatar(page, 'meu')).toBeVisible()

    await page.getByTestId('avatares-da-conversa').click()
    const painel = page.getByRole('dialog', { name: 'Avatares da conversa' })
    await expect(painel).toBeVisible()
    await foto(page, '3-painel')
    await painel.getByTestId('avatar-economia').check()
    await expect(fase(page).locator('.int-topo, .int-avatar, [data-avatar-estado]')).toHaveCount(0)
    expect(await page.evaluate(() => localStorage.getItem('frasy.avatar.interprete.economia'))).toBe('1')
    await painel.getByTestId('avatar-economia').uncheck()
    await expect(avatar(page, 'meu')).toBeVisible()
  })

  test('painel: teclado, rótulos, Esc fecha e devolve o foco; "só mãos" desabilitado sem a flag dos sinais; "só o intérprete"', async ({
    page,
  }) => {
    await falsos(page)
    await porToque(page)
    await comFlags(page, { avatar_3d: true })
    await abrirPeloMenu(page)
    await comecarFalando(page, /Falar em Português/)
    await expect(prontoDoAvatar(page, 'meu')).toBeVisible({ timeout: 60_000 })
    const botao = page.getByTestId('avatares-da-conversa')
    await botao.focus()
    await page.keyboard.press('Enter')
    const painel = page.getByRole('dialog', { name: 'Avatares da conversa' })
    await expect(painel).toBeVisible()
    // o foco entrou no painel
    await expect
      .poll(() => page.evaluate(() => !!document.activeElement?.closest('[data-testid="painel-dos-avatares"]')))
      .toBe(true)
    await expect(painel.getByTestId('avatar-foco-maos')).toBeDisabled()
    await expect(painel.getByRole('radio', { name: 'Grande' })).toBeVisible()
    // região viva desligada por padrão
    await expect(painel.getByTestId('avatar-anunciar')).not.toBeChecked()
    await expect(fase(page).locator('[data-avatar-aviso]')).toHaveCount(0)

    // "Escolher voz" abre o seletor de voz que já existe (não há seletor novo)
    await painel.getByTestId('avatar-escolher-voz').click()
    await expect(painel).toBeHidden()
    await expect(page.getByRole('dialog', { name: /vozes|voz/i }).first()).toBeVisible()
    await page.keyboard.press('Escape')
    await botao.click()
    await painel.getByTestId('avatar-quem-interprete').check()
    await expect(fase(page).locator('[data-avatar-estado]')).toHaveCount(1)
    await painel.getByRole('radio', { name: 'Grande' }).check()
    expect(await page.evaluate(() => localStorage.getItem('frasy.avatar.interprete.tamanho'))).toBe('g')

    await page.keyboard.press('Escape')
    await expect(painel).toBeHidden()
    await expect(botao).toBeFocused()
    // a conversa continua aberta (o Esc era do painel)
    await expect(fase(page)).toBeVisible()
  })

  test('sem WebGL: cai na foto/iniciais, a legenda continua e o painel avisa', async ({ page }) => {
    await page.addInitScript(() => {
      const original = HTMLCanvasElement.prototype.getContext
      HTMLCanvasElement.prototype.getContext = function (this: HTMLCanvasElement, tipo: string, ...r: unknown[]) {
        if (tipo === 'webgl2' || tipo === 'webgl' || tipo === 'experimental-webgl') return null
        return (original as (...a: unknown[]) => unknown).call(this, tipo, ...r)
      } as typeof original
    })
    await falsos(page)
    await porToque(page)
    await comFlags(page, { avatar_3d: true })
    await abrirPeloMenu(page)
    await comecarFalando(page, /Falar em Português/)
    await expect(fase(page).locator('[data-avatar-fallback="sem_webgl2"]')).toHaveCount(2)
    await expect(fase(page).locator('canvas')).toHaveCount(0)
    await expect(fase(page).getByTestId('interprete-outro').getByText('[trad] bom dia a todos')).toBeVisible({
      timeout: 10_000,
    })
    await page.getByTestId('avatares-da-conversa').click()
    await expect(page.getByTestId('painel-dos-avatares')).toContainText('não mostra o avatar em 3D')
    await foto(page, '4-sem-webgl')
  })

  test('região viva opcional: ligada, existe uma por avatar (e desligada, nenhuma)', async ({ page }) => {
    await falsos(page)
    await porToque(page)
    await comFlags(page, { avatar_3d: true })
    await page.addInitScript(() => localStorage.setItem('frasy.avatar.interprete.anunciar', '1'))
    await abrirPeloMenu(page)
    await comecarFalando(page, /Falar em Português/)
    await expect(fase(page).locator('[data-avatar-aviso]')).toHaveCount(2)
  })
})

test.describe('Celular (390 x 844)', () => {
  test.use({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true })
  test.beforeEach(() => {
    test.skip(test.info().project.name !== 'mobile-375', 'o celular de 390 roda uma vez, no projeto móvel')
  })

  test('as duas metades com avatar: a de cima virada, o texto legível, o painel cabe', async ({ page }) => {
    test.slow()
    await semCapturaDeTela(page)
    await falsos(page)
    await porToque(page)
    await comFlags(page, { avatar_3d: true })
    await abrirPeloMenu(page)
    await comecarFalando(page, /Falar em Português/)
    await expect(prontoDoAvatar(page, 'meu')).toBeVisible({ timeout: 60_000 })
    await expect(fase(page).getByTestId('interprete-outro').getByText('[trad] bom dia a todos')).toBeVisible({
      timeout: 15_000,
    })
    await foto(page, '6-celular')
    // nada estoura para os lados
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true)
    await page.getByTestId('avatares-da-conversa').click()
    const painel = page.getByTestId('painel-dos-avatares')
    await expect(painel).toBeVisible()
    await foto(page, '7-celular-painel')
    const caixa = await painel.locator('.int-folha-corpo').boundingBox()
    expect(caixa!.x).toBeGreaterThanOrEqual(0)
    expect(caixa!.x + caixa!.width).toBeLessThanOrEqual(390)
  })
})

test.describe('Voz natural com avatar (som, eco e gesto)', () => {
  test.beforeEach(() => {
    test.skip(test.info().project.name !== 'desktop-1280', 'uma vez, no projeto de desktop')
  })

  test('a voz da nuvem soa inteira (volume, mudo, pausa), o analisador nasce no gesto e a boca anda', async ({
    page,
  }) => {
    test.slow()
    await falsos(page)
    await porToque(page)
    await comFlagsEVozNatural(page, { avatar_3d: true })
    const pedidos: string[] = []
    await page.route('**/api/ai/tts', (r) => {
      pedidos.push(String(r.request().postDataJSON()?.texto))
      return r.fulfill({ status: 200, contentType: 'audio/wav', body: wavComTom(1.6) })
    })
    await abrirPeloMenu(page)
    await page.evaluate(async () => {
      for (let i = 0; i < 20 && !localStorage.getItem('babel.flags')?.includes('voz_natural'); i++)
        await new Promise((r) => setTimeout(r, 100))
    })

    // Nenhum contexto antes do gesto.
    expect(await page.evaluate(() => (window as unknown as { __contextos: unknown[] }).__contextos.length)).toBe(0)
    await comecarFalando(page, /Falar em Português/)
    await observarEstadosDoAvatar(page)
    await expect(prontoDoAvatar(page, 'meu')).toBeVisible({ timeout: 60_000 })
    await expect.poll(() => pedidos.length, { timeout: 15_000 }).toBe(1)

    // Enquanto a voz toca: o elemento está tocando, no volume 1, sem mudo, e o avatar de quem disse "fala".
    await expect
      .poll(
        () =>
          page.evaluate(() => {
            const el = (window as unknown as { __audios: HTMLAudioElement[] }).__audios.find(
              (a) => !!a.src && !a.src.startsWith('data:') && !a.paused,
            )
            return el ? { volume: el.volume, muted: el.muted, paused: el.paused } : null
          }),
        { timeout: 15_000 },
      )
      .toEqual({ volume: 1, muted: false, paused: false })
    await expect(avatar(page, 'meu').locator('[data-avatar-estado="falando"]')).toBeVisible({ timeout: 5_000 })
    await expect(avatar(page, 'outro').locator('[data-avatar-estado="ouvindo"]')).toBeVisible()
    await foto(page, '5-falando')

    // O analisador foi ligado UMA vez, e o som segue pelo grafo (contexto rodando).
    const ctx = await page.evaluate(() => (window as unknown as { __contextos: unknown[] }).__contextos.length)
    expect(ctx).toBe(1)
    await expect(fase(page)).toHaveAttribute('data-fase', 'parado', { timeout: 12_000 })
    const depois = await page.evaluate(() => {
      const el = (window as unknown as { __audios: HTMLAudioElement[] }).__audios.find(
        (a) => !!a.src && !a.src.startsWith('data:'),
      )
      return el ? { volume: el.volume, muted: el.muted, terminou: el.ended || el.paused } : null
    })
    expect(depois).toMatchObject({ volume: 1, muted: false, terminou: true })
    const estados = await estadosDoAvatar(page)
    expect(estados.meu).toContain('falando')
    expect(estados.meu.at(-1)).toBe('parado')
    // a legenda ficou à vista o tempo todo
    await expect(fase(page).getByTestId('interprete-outro').getByText('[trad] bom dia a todos')).toBeVisible()
  })
})
