import { mkdirSync } from 'node:fs'
import path from 'node:path'

import { expect, type Page, test } from '@playwright/test'

import { abrirPeloMenu, comecarFalando, comFlags, falsos, fase, porToque, semPreferenciasDeAvatar } from './_interprete'

/**
 * POLIMENTO DA SOLETRAÇÃO NO CELULAR (defeitos 2 e 3): em 375, 768 e 1280 px a metade espelhada com os dois avisos fixos
 * cabe sem rolagem horizontal, o círculo do avatar não é maior que o necessário, o botão do assistente e a barra
 * inferior não cobrem o fim da conversa, e "Progresso" não é cortado nas abas do Perfil.
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

const AVISO_1 = 'Soletração do alfabeto manual: não é tradução para Libras'
const AVISO_2 = 'Poses de DEMONSTRAÇÃO: ainda NÃO revisadas por pessoas surdas'

const foto = (page: Page, nome: string) =>
  page.screenshot({ path: path.join(CAPTURAS, `polimento-${test.info().project.name}-${nome}.png`) })

test.beforeEach(async ({ page }) => {
  await semPreferenciasDeAvatar(page)
})

test.describe('Polimento no celular, tablet e desktop', () => {
  test('conversa com soletração ligada: sem rolagem lateral, avisos à vista, nada coberto', async ({ page }) => {
    test.slow()
    await falsos(page, { atrasoDaTraducaoMs: 60_000 })
    await porToque(page)
    await comFlags(page, { avatar_3d: true, avatar_sinais: true })
    await page.addInitScript(() => localStorage.setItem('frasy.avatar.interprete.soletrar', '1'))
    await abrirPeloMenu(page)
    await comecarFalando(page, /Falar em Português/)
    await expect(fase(page).getByTestId('avatar-outro').locator('[data-avatar-pronto="true"]').first()).toBeVisible({
      timeout: 60_000,
    })
    const conversa = fase(page).getByTestId('soletracao-na-conversa')
    await expect(conversa.getByText(AVISO_1)).toBeVisible({ timeout: 30_000 })
    await expect(conversa.getByText(AVISO_2)).toBeVisible()
    // os avisos já aparecem com as mãos em repouso, antes de a animação de entrada da tela acabar: espera-a para medir
    await page.waitForTimeout(1_200)
    await foto(page, '1-conversa')

    // sem rolagem horizontal da página
    const sobra = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth)
    expect(sobra).toBeLessThanOrEqual(0)
    // o `main` (overflow oculto) também não pode ter sido rolado de lado pelo foco/toque: tudo deslizaria para a esquerda
    expect(await page.evaluate(() => document.querySelector('main')?.scrollLeft ?? 0)).toBe(0)

    // os dois avisos (os quatro, nas duas metades) cabem dentro da tela
    const dentro = await page.evaluate(() =>
      [...document.querySelectorAll('[data-aviso-fixo]')].every((e) => {
        const r = e.getBoundingClientRect()
        return r.left >= 0 && r.right <= window.innerWidth + 0.5
      }),
    )
    expect(dentro).toBe(true)

    // a área da frase de cada metade não é espremida pelos avisos e pelo círculo: cabem ao menos 2 linhas de tradução
    const alturas = await page.evaluate(() =>
      [...document.querySelectorAll('.int-metade .int-frase')].map((e) => Math.round(e.getBoundingClientRect().height)),
    )
    console.log('alturas da frase', test.info().project.name, alturas)
    for (const h of alturas.filter((x) => x > 0)) expect(h).toBeGreaterThanOrEqual(58)

    // o fim da conversa não fica sob a barra inferior nem sob o botão do assistente
    const coberto = await page.evaluate(() => {
      const raiz = document.querySelector('[data-testid="modo-interprete"]')
      if (!raiz) return 'sem raiz'
      const ultimos = [...raiz.querySelectorAll('[data-testid="interprete-meu"], [data-testid="interprete-outro"]')]
      const base = Math.max(...ultimos.map((e) => e.getBoundingClientRect().bottom))
      const cobertores = [...document.querySelectorAll('nav, [data-testid="assistente-fab"], [data-assistente-fab]')]
        .filter((e) => getComputedStyle(e).position === 'fixed')
        .map((e) => e.getBoundingClientRect())
        .filter((r) => r.width > 0 && r.height > 0)
      const topo = cobertores.length ? Math.min(...cobertores.map((r) => r.top)) : Infinity
      return base <= topo + 0.5 ? 'ok' : `conteúdo termina em ${base} e a barra começa em ${topo}`
    })
    expect(coberto).toBe('ok')
  })
  test('abas do Perfil com o avatar ligado: as quatro à vista, nenhuma cortada (inclusive "Progresso")', async ({
    page,
  }) => {
    await comFlags(page, { avatar_3d: true })
    await page.goto('/perfil')
    await expect(page.getByTestId('perfil-do-quest')).toBeVisible()
    const abas = page.getByRole('tab')
    await expect(abas).toHaveCount(4)
    await expect(page.getByRole('tab', { name: 'Progresso' })).toBeVisible()
    const medidas = await page.evaluate(() =>
      [...document.querySelectorAll('[role="tablist"][aria-label="Seções do perfil"] [role="tab"]')].map((e) => {
        const r = e.getBoundingClientRect()
        const el = e as HTMLElement
        return { nome: el.textContent?.trim(), esq: r.left, dir: r.right, cortada: el.scrollWidth > el.clientWidth }
      }),
    )
    const largura = await page.evaluate(() => window.innerWidth)
    for (const m of medidas) {
      expect(m.esq, m.nome).toBeGreaterThanOrEqual(0)
      expect(m.dir, m.nome).toBeLessThanOrEqual(largura)
      expect(m.cortada, m.nome).toBe(false)
    }
    await foto(page, '2-perfil-abas')
    // a escolhida continua sendo a única na ordem de tabulação, e trocar de aba funciona
    await page.getByRole('tab', { name: 'Progresso' }).click()
    await expect(page.getByRole('tab', { name: 'Progresso' })).toHaveAttribute('aria-selected', 'true')
  })
})
