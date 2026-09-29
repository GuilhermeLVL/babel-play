import { expect, type Page, test } from '@playwright/test'

import { clicarRobusto, fecharSobreposicoes } from './_helpers'

/**
 * AS LEGENDAS FLUTUANTES COM RITMO (ei/leg), na janela que flutua dentro do app (o caminho sem
 * Document Picture-in-Picture: Firefox, Safari, celular). O relato do dono era "a legenda some
 * rápido demais"; aqui, com a captura de verdade e as falas entrando por `window.__simFalas`:
 *  - a fala nova ESPERA a atual cumprir o tempo de leitura, em vez de empurrá-la;
 *  - "Pausar legendas" congela a janela (a captura segue) e mostra "N novas ↓";
 *  - tocar uma palavra abre o cartão dela dentro da janela.
 *
 * `LEG_SHOTS=<pasta>` grava as capturas de tela da janela (antes/depois da mudança).
 */
test.use({
  permissions: ['microphone'],
  launchOptions: {
    args: [
      '--use-fake-ui-for-media-stream',
      '--use-fake-device-for-media-stream',
      '--auto-select-desktop-capture-source=Entire screen',
    ],
  },
})

test.beforeEach(async ({ page }, info) => {
  test.skip(info.project.name === 'tablet-768', 'a janela flutuante não depende de largura intermediária')
  // Sem a API da janela sempre-no-topo: a janelinha flutua dentro do app, que é o que se testa.
  await page.addInitScript(() => {
    delete (window as unknown as { documentPictureInPicture?: unknown }).documentPictureInPicture
  })
  // Nenhum modelo de fala/tradução é baixado: as falas entram prontas.
  await page.route(/huggingface\.co|hf\.co|cdn-lfs/, (r) => r.abort())
})

const falar = (page: Page, texto: string) =>
  page.evaluate((x) => (window as unknown as { __simFalas: (t: string[]) => number }).__simFalas([x]), texto)
const aVista = (page: Page) => page.locator('#leg-flut .leg-o').allTextContents()
const foto = async (page: Page, nome: string, projeto: string) => {
  if (process.env.LEG_SHOTS) await page.locator('#leg-flut').screenshot({ path: `${process.env.LEG_SHOTS}/depois-${nome}-${projeto}.png` })
}

test('legendas flutuantes: ritmo de leitura, pausar e tocar uma palavra', async ({ page }, info) => {
  test.slow()
  await page.goto('/capturar')
  await expect(page.getByRole('main')).toBeVisible()
  await fecharSobreposicoes(page)
  await clicarRobusto(page, page.getByRole('button', { name: /Iniciar captura|Iniciar a gravação de áudio|Começar a gravar/ }).first())
  const baixar = page.getByRole('button', { name: /Baixar e iniciar/ })
  if (await baixar.waitFor({ state: 'visible', timeout: 2500 }).then(() => true, () => false)) await baixar.click()
  await expect(page.getByRole('button', { name: /Parar/ }).first()).toBeVisible({ timeout: 15_000 })

  await clicarRobusto(page, page.getByRole('switch', { name: /Legendas flutuantes/ }).first())
  const janela = page.getByRole('region', { name: 'Legendas flutuantes' })
  await expect(janela).toBeVisible()
  await expect(janela).toBeInViewport()
  // O mouse longe da janela: passar por cima dela pausa (é o padrão).
  await page.mouse.move(2, 2)

  // A fila: a segunda fala espera a primeira cumprir o tempo de leitura (≥ 1,5 s).
  const primeira = 'Hello there, how are you doing today?'
  const segunda = 'I was thinking about going to the beach.'
  await falar(page, primeira)
  await expect.poll(() => aVista(page)).toEqual([primeira])
  await falar(page, segunda)
  await page.waitForTimeout(400)
  expect(await aVista(page)).toEqual([primeira])
  await expect.poll(() => aVista(page), { timeout: 10_000 }).toEqual([primeira, segunda])
  await expect(janela.locator('.leg-fala.atual .leg-o')).toHaveText(segunda)
  await falar(page, 'The weather looks great this weekend.')
  await expect.poll(async () => (await aVista(page)).length, { timeout: 10_000 }).toBe(3)
  await foto(page, 'tres-falas', info.project.name)

  // Pausar: a captura segue, a janela não muda, e o "1 nova" aparece; continuar pula para ela.
  await janela.getByRole('button', { name: 'Pausar legendas' }).click()
  await falar(page, 'Nobody expected that answer.')
  await expect(janela.getByRole('button', { name: /1 nova/ })).toBeVisible()
  expect(await aVista(page)).not.toContain('Nobody expected that answer.')
  await foto(page, 'pausada', info.project.name)
  await janela.getByRole('button', { name: 'Continuar as legendas' }).click()
  await expect(janela.locator('.leg-fala.atual .leg-o')).toHaveText('Nobody expected that answer.')

  // Tocar uma palavra: o cartão abre dentro da janela, com Ouvir e Salvar no vocabulário.
  await janela.locator('.leg-fala.atual [data-palavra="answer"]').click()
  const cartao = janela.getByRole('dialog', { name: 'Palavra: answer' })
  await expect(cartao).toBeVisible()
  await expect(cartao.getByRole('button', { name: 'Ouvir' })).toBeVisible()
  await expect(cartao.getByRole('button', { name: 'Salvar no vocabulário' })).toBeVisible()
  await expect(cartao).toBeInViewport()
  await foto(page, 'cartao', info.project.name)
  await page.keyboard.press('Escape')
  await expect(cartao).toBeHidden()

  // O Personalizar guarda o que saiu da barra (modo, quantas falas…).
  await janela.getByRole('button', { name: 'Personalizar' }).click()
  await expect(janela.getByRole('combobox', { name: 'Modo da janela' })).toBeVisible()
  await expect(janela.getByRole('radiogroup', { name: 'Falas à vista' })).toBeVisible()
  await foto(page, 'personalizar', info.project.name)
  await janela.getByRole('button', { name: 'Personalizar' }).click()

  if (info.project.name === 'desktop-1280') {
    // Teclado com o foco na janela: ← volta uma fala, → volta a seguir o fim.
    await janela.focus()
    await page.keyboard.press('ArrowLeft')
    await expect(janela.locator('.leg-fala.atual .leg-o')).toHaveText('The weather looks great this weekend.')
    await expect(janela.getByRole('button', { name: /1 nova/ })).toBeVisible()
    await page.keyboard.press('ArrowRight')
    await expect(janela.locator('.leg-fala.atual .leg-o')).toHaveText('Nobody expected that answer.')
  }

  // Nenhuma rolagem lateral da página por causa da janela.
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1)).toBe(true)
})
