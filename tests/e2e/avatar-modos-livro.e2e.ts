import { mkdirSync } from 'node:fs'
import path from 'node:path'

import { expect, type Page, test } from '@playwright/test'

import { faladas, preparar, terminar } from './_livro'

/**
 * O AVATAR NO LIVRO / NARRAÇÃO (só a flag `avatar_3d`, sem o elenco), no app de verdade, com a voz de mentira de
 * `_livro.ts` (o teste decide quando cada frase "termina"; nenhum microfone). Provado, nos três tamanhos: sem a flag nada
 * aparece; com ela o botão "Avatar" (ícone + rótulo, alvo de 44 px) aparece ao lado de "Ouvir"; a dica da primeira vez
 * é dispensável e lembrada; ligar abre a faixa do avatar com o estado em texto (lendo/pausado) e a legenda da frase
 * SEMPRE presente; o avatar muda de estado com a narração; recolher deixa só a legenda; tamanho P/M/G; desligar em um
 * toque; a escolha é lembrada ao recarregar; o modo economia tira o avatar; o avatar não cobre o texto do livro.
 * NÃO provado: voz real, Safari, celular real, a boca em si (estimada pelo texto).
 *
 * Capturas: `$AVATAR_CAPTURAS` (padrão `tests/e2e/__capturas__/`, fora do git).
 */
const CAPTURAS = process.env.AVATAR_CAPTURAS || path.join(process.cwd(), 'tests', 'e2e', '__capturas__')
mkdirSync(CAPTURAS, { recursive: true })

test.use({
  launchOptions: {
    args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'],
  },
})

const foto = (page: Page, nome: string) =>
  page.screenshot({ path: path.join(CAPTURAS, `modos-livro-${test.info().project.name}-${nome}.png`) })

const faixa = (page: Page) => page.getByTestId('avatar-do-narrador')

test.describe('Avatar no livro e na narração', () => {
  test('sem a flag nada aparece: nem botão, nem dica, nem faixa', async ({ page }) => {
    test.slow()
    await preparar(page, {})
    await expect(page.getByTestId('botao-avatar-livro')).toHaveCount(0)
    await expect(page.getByTestId('dica-avatar-livro')).toHaveCount(0)
    await page.getByTestId('leitor-ouvir').click()
    await expect(page.getByTestId('barra-do-narrador')).toBeVisible()
    await expect(faixa(page)).toHaveCount(0)
    await expect(page.getByTestId('ajustes-avatar-livro')).toHaveCount(0)
  })

  test('com só avatar_3d: botão claro, dica, estados, legenda sempre, recolher, tamanho, desligar e lembrar', async ({
    page,
  }) => {
    test.slow()
    await preparar(page, { avatar_3d: true })

    // O botão: ícone + rótulo "Avatar", alvo de 44 px, ao lado de "Ouvir".
    const botao = page.getByTestId('botao-avatar-livro')
    await expect(botao).toBeVisible()
    await expect(botao).toContainText('Avatar')
    await expect(botao).toHaveAttribute('aria-pressed', 'false')
    const caixa = (await botao.boundingBox())!
    expect(caixa.height).toBeGreaterThanOrEqual(44)
    expect(caixa.width).toBeGreaterThanOrEqual(44)
    const ouvir = (await page.getByTestId('leitor-ouvir').boundingBox())!
    expect(Math.abs(caixa.y - ouvir.y)).toBeLessThan(80) // na mesma barra (no celular o título desce)

    // A dica da primeira vez: discreta, sem pop-up.
    const dica = page.getByTestId('dica-avatar-livro')
    await expect(dica).toBeVisible()
    await expect(page.getByRole('dialog')).toHaveCount(0)
    await page.waitForTimeout(500)
    await foto(page, '1-dica')

    // Ligar pela dica: abre a faixa (sem começar a tocar), a dica some e fica lembrada.
    await dica.getByRole('button', { name: 'Ligar o avatar' }).click()
    await expect(dica).toHaveCount(0)
    await expect(botao).toHaveAttribute('aria-pressed', 'true')
    await expect(faixa(page)).toBeVisible()
    await expect(faixa(page).getByTestId('avatar-do-narrador-estado')).toContainText('Pronto para ouvir')
    await expect(faixa(page)).toHaveAttribute('data-estado', 'parado')
    expect(await faladas(page)).toHaveLength(0)
    // O rosto: 3D (canvas) ou, se o aparelho de teste não der WebGL, a foto/iniciais; nunca vazio.
    const rosto = faixa(page).getByTestId('avatar-do-modo')
    await expect(rosto).toBeVisible()
    await expect(rosto.locator('[data-avatar-pronto="true"]')).toBeVisible({ timeout: 60_000 })
    await expect(rosto.locator('canvas')).toBeAttached()

    // Tocar: estado "falando" e a legenda com a frase, SEMPRE em texto.
    await page.getByRole('button', { name: 'Ouvir a narração' }).click()
    await expect(faixa(page)).toHaveAttribute('data-estado', 'falando')
    await expect(faixa(page).getByTestId('avatar-do-narrador-estado')).toContainText('Lendo')
    const legenda = faixa(page).getByTestId('avatar-do-narrador-legenda')
    await expect(legenda).toContainText('Narrador')
    await expect
      .poll(async () => (await legenda.textContent())?.length ?? 0)
      .toBeGreaterThan('NarradorLendo'.length + 5)
    await foto(page, '2-lendo')

    // Pausar: repouso.
    await page.getByRole('button', { name: 'Pausar a narração' }).click()
    await expect(faixa(page)).toHaveAttribute('data-estado', 'parado')
    await expect(faixa(page).getByTestId('avatar-do-narrador-estado')).toContainText('Pausado')

    // A faixa não cobre o texto: fica no fluxo, acima da barra e do rodapé, e o livro continua à vista.
    const f = (await faixa(page).boundingBox())!
    const motor = (await page.locator('.leitor-motor').boundingBox())!
    const barra = (await page.getByTestId('barra-do-narrador').boundingBox())!
    expect(f.y + f.height).toBeLessThanOrEqual(barra.y + 1)
    expect(motor.y + motor.height).toBeLessThanOrEqual(f.y + 2)
    expect(motor.height).toBeGreaterThan(150)

    // Ajustes: o mesmo painel; tamanho muda o círculo; teclado fecha com Esc.
    const antes = (await rosto.boundingBox())!.width
    await page.getByTestId('ajustes-avatar-livro').click()
    const painel = page.getByTestId('painel-do-avatar')
    await expect(painel).toBeVisible()
    await foto(page, '3-painel')
    await page.getByTestId('avm-tamanho-g').check()
    await expect.poll(async () => (await rosto.boundingBox())!.width).toBeGreaterThan(antes)
    await page.getByTestId('avm-tamanho-p').check()
    await expect.poll(async () => (await rosto.boundingBox())!.width).toBeLessThan(antes)
    await page.keyboard.press('Escape')
    await expect(painel).toHaveCount(0)

    // Recolher: sobra só a legenda (e o canvas é descartado).
    await faixa(page).getByTestId('avatar-do-narrador-recolher').click()
    await expect(rosto).toHaveCount(0)
    await expect(faixa(page).getByTestId('avatar-do-narrador-legenda')).toBeVisible()
    await foto(page, '4-recolhido')
    await faixa(page).getByTestId('avatar-do-narrador-recolher').click()
    await expect(rosto).toBeVisible()

    // Lembrado: recarregar mantém ligado e a dica não volta.
    await page.reload()
    await expect(page.locator('[data-testid=leitor][data-estado=pronto]')).toBeVisible({ timeout: 30_000 })
    await expect(page.getByTestId('botao-avatar-livro')).toHaveAttribute('aria-pressed', 'true')
    await expect(page.getByTestId('dica-avatar-livro')).toHaveCount(0)
    await page.getByTestId('leitor-ouvir').click()
    await expect(faixa(page)).toBeVisible()

    // Desligar em um toque: a faixa some e a barra de narração segue.
    await page.getByTestId('botao-avatar-livro').click()
    await expect(page.getByTestId('botao-avatar-livro')).toHaveAttribute('aria-pressed', 'false')
    await expect(faixa(page)).toHaveCount(0)
    await expect(page.getByTestId('barra-do-narrador')).toBeVisible()
  })

  test('modo economia tira o avatar e um toque em "Avatar" traz de volta', async ({ page }) => {
    test.slow()
    await preparar(page, { avatar_3d: true })
    await page.getByTestId('botao-avatar-livro').click()
    await expect(faixa(page)).toBeVisible()
    await page.getByTestId('ajustes-avatar-livro').click()
    await page.getByTestId('avm-economia').click()
    await expect(faixa(page)).toHaveCount(0)
    await expect(page.getByTestId('botao-avatar-livro')).toHaveAttribute('aria-pressed', 'false')
    await page.getByTestId('botao-avatar-livro').click()
    await expect(faixa(page)).toBeVisible()
    await foto(page, '5-economia-de-volta')
  })

  test('com o elenco ligado o falante da vez ganha o seu rosto', async ({ page }) => {
    test.slow()
    await preparar(page, { avatar_3d: true, avatar_elenco: true })
    await page.getByTestId('botao-avatar-livro').click()
    await page.getByTestId('leitor-ouvir').click()
    await page.getByRole('button', { name: /Voz e modo/ }).click()
    await page.getByTestId('elenco-ligar').check()
    for (let i = 0; i < 6; i++) {
      if ((await faladas(page)).some((f) => f.texto.includes('Come here'))) break
      await terminar(page)
      await page.waitForTimeout(150)
    }
    await expect(faixa(page).getByTestId('avatar-do-narrador-legenda')).toContainText('Ana')
    await expect(faixa(page).getByTestId('avatar-do-modo')).toBeVisible()
    await foto(page, '6-elenco')
  })
})
