/**
 * A VITRINE VIVA DA PORTA DE ENTRADA (`src/components/auth/quest/VitrineDaEntrada.tsx`).
 *
 * As bolinhas trocam o slide; sozinho, ele avança; com movimento reduzido não gira nem toca vídeo; no
 * celular a vitrine não monta e o formulário continua no alto da tela.
 */
import { expect, type Page, test } from '@playwright/test'

import { abrirPortaDeLogin } from './_porta'

const vitrine = (page: Page) => page.getByTestId('vitrine-da-entrada')
const bolinha = (page: Page, n: number, nome: string) =>
  vitrine(page).getByRole('button', { name: `Mostrar ${n} de 4: ${nome}` })

async function abrir(page: Page) {
  test.slow()
  await page.goto('/')
  await abrirPortaDeLogin(page)
  // O ponteiro longe da vitrine: em cima dela, o giro pausa.
  await page.mouse.move(1200, 20)
}

test('as bolinhas trocam o slide, e ele avança sozinho', async ({ page }) => {
  await abrir(page)
  await expect(vitrine(page)).toHaveAttribute('aria-roledescription', 'carrossel')
  await expect(bolinha(page, 1, 'Ouça')).toHaveAttribute('aria-current', 'true')

  await bolinha(page, 3, 'Jogue').click()
  await page.mouse.move(1200, 20)
  await expect(bolinha(page, 3, 'Jogue')).toHaveAttribute('aria-current', 'true')
  await expect(vitrine(page).getByRole('group', { name: '3 de 4: Jogue' })).toBeVisible()
  await expect(vitrine(page).getByText('Revise brincando.')).toBeVisible()
  await expect(vitrine(page).getByText('A legenda acompanha quem fala.')).toBeHidden()

  // Sem foco nem ponteiro em cima, o próximo vem em ~5 s.
  await page.locator('#auth-email').focus()
  await expect(bolinha(page, 4, 'Leia')).toHaveAttribute('aria-current', 'true', { timeout: 8_000 })

  // Pausado pela pessoa, fica.
  await vitrine(page).getByRole('button', { name: 'Pausar a apresentação' }).click()
  await page.locator('#auth-email').focus()
  await page.waitForTimeout(6_000)
  await expect(bolinha(page, 4, 'Leia')).toHaveAttribute('aria-current', 'true')
})

test.describe('com movimento reduzido', () => {
  test.use({ reducedMotion: 'reduce' })
  test('fica no primeiro, sem vídeo e sem giro; as bolinhas trocam à mão', async ({ page }) => {
    await abrir(page)
    await expect(vitrine(page).getByRole('img', { name: /ao vivo/ })).toBeVisible()
    await expect(vitrine(page).getByRole('button', { name: /apresentação/ })).toHaveCount(0)
    await page.waitForTimeout(6_000)
    await expect(bolinha(page, 1, 'Ouça')).toHaveAttribute('aria-current', 'true')
    await expect(vitrine(page).locator('video')).toHaveCount(0)

    await bolinha(page, 2, 'Guarde').click()
    await expect(vitrine(page).getByText('Toque na palavra e ela fica com você.')).toBeVisible()
    await expect(vitrine(page).locator('video')).toHaveCount(0)
  })
})

test.describe('no celular', () => {
  test.use({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true })
  test('a vitrine não monta e o formulário fica no alto', async ({ page }) => {
    test.slow()
    await page.goto('/')
    await abrirPortaDeLogin(page)
    await expect(vitrine(page)).toHaveCount(0)
    await expect(page.locator('#auth-email')).toBeInViewport()
    await expect(page.getByRole('button', { name: 'Entrar', exact: true })).toBeInViewport()
  })
})
