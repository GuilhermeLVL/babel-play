import { mkdirSync } from 'node:fs'
import path from 'node:path'

import { expect, type Page, test } from '@playwright/test'

import { assentar } from './_helpers'
import { comFlags, falsos, porToque, pronta, semModelos, semPreferenciasDeAvatar } from './_interprete'

/**
 * OS AVATARES VISÍVEIS SEM COMEÇAR A FALAR. Nenhum teste aqui toca em "Falar"/"Ouvir": a pessoa abre a Home, toca em
 * "Conversar" e tudo tem de estar à vista na tela inicial do Intérprete.
 * Provado: (a) o botão "Avatares" (rótulo à vista, alvo de 44 px) e a prévia dos dois avatares; (b) o atalho "Soletrar nomes
 * (Libras/ASL)" que alterna, com os dois avisos fixos; (c) o botão "Janela flutuante" que aciona o Document PiP SIMULADO
 * (um `<iframe>`, como em `avatar-interprete-sinais.e2e.ts`) e mostra o avatar-intérprete e os avisos lá dentro; (d) sem
 * as flags nada disso aparece; e o cartão "Seu avatar" na Home.
 * NÃO provado: Document PiP real (janela nativa), Safari, celular real. No celular a legenda fica no painel da página
 * (`caminhoDaJanela`): lá o botão da janela NÃO existe, e isto é provado.
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
  page.screenshot({ path: path.join(CAPTURAS, `visivel-${test.info().project.name}-${nome}.png`) })

/** A Document PiP simulada por um `<iframe>` (mesma simulação de `avatar-interprete-sinais.e2e.ts`). */
function simularDocumentPiP() {
  const api = {
    requestWindow({ width, height }: { width: number; height: number }) {
      const f = document.createElement('iframe')
      f.id = 'pip-simulada'
      f.style.cssText = `position:fixed;left:16px;top:16px;width:${width}px;height:${height}px;border:0;z-index:2147483647;box-shadow:0 0 0 1px #888`
      document.body.appendChild(f)
      const w = f.contentWindow!
      Object.defineProperty(w, 'outerWidth', { configurable: true, get: () => w.innerWidth })
      Object.defineProperty(w, 'outerHeight', { configurable: true, get: () => w.innerHeight })
      ;(w as unknown as { resizeTo: (a: number, b: number) => void }).resizeTo = (a, b) => {
        f.style.width = `${a}px`
        f.style.height = `${b}px`
      }
      ;(w as unknown as { close: () => void }).close = () => {
        if (!f.isConnected) return
        w.dispatchEvent(new Event('pagehide'))
        f.remove()
      }
      return Promise.resolve(w)
    },
  }
  Object.defineProperty(window, 'documentPictureInPicture', { configurable: true, value: api })
}

/** Home -> "Conversar" -> a tela inicial do Intérprete. NUNCA toca em Falar/Ouvir. */
async function daHomeAoInterprete(page: Page, { aoVerAHome }: { aoVerAHome?: () => Promise<void> } = {}) {
  await semModelos(page)
  await page.goto('/')
  await expect(page.getByRole('main')).toBeVisible()
  await assentar(page)
  if (aoVerAHome) await aoVerAHome()
  await page
    .getByRole('button', { name: /^Conversar/ })
    .first()
    .click()
  await expect(page).toHaveURL(/\/interprete$/, { timeout: 10_000 })
  await expect(pronta(page)).toBeVisible({ timeout: 15_000 })
  await page.waitForTimeout(900) // a animação de entrada termina antes de medir os alvos
}

async function preparar(page: Page, flags: Record<string, boolean>, pip = false) {
  await semPreferenciasDeAvatar(page)
  if (pip) await page.addInitScript(simularDocumentPiP)
  await falsos(page)
  await porToque(page)
  await comFlags(page, flags)
}

const mobile = () => test.info().project.name === 'mobile-375'

test.describe('Avatares visíveis na tela inicial do Intérprete (sem começar a falar)', () => {
  test('(d) sem nenhuma flag a tela é a de sempre: nem Avatares, nem soletrar, nem janela, nem cartão na Home', async ({
    page,
  }) => {
    await preparar(page, {}, true)
    await daHomeAoInterprete(page, {
      aoVerAHome: async () => {
        await expect(page.getByTestId('avatar-no-inicio')).toHaveCount(0)
      },
    })
    await expect(page.getByTestId('avatares-da-conversa')).toHaveCount(0)
    await expect(page.getByTestId('atalho-soletrar')).toHaveCount(0)
    await expect(page.getByTestId('janela-flutuante')).toHaveCount(0)
    await expect(page.getByTestId('linha-dos-avatares')).toHaveCount(0)
    await expect(page.locator('.int-faixa[data-com-avatares]')).toHaveCount(0)
    await expect(pronta(page).locator('[data-testid^="avatar-"]')).toHaveCount(0)
    await foto(page, '0-sem-flags')
  })

  test('(a) com avatar_3d: Avatares à vista com 44 px, prévia dos dois avatares, painel abre; cartão na Home', async ({
    page,
  }) => {
    test.slow()
    await preparar(page, { avatar_3d: true })
    await daHomeAoInterprete(page, {
      aoVerAHome: async () => {
        const cartao = page.getByTestId('avatar-no-inicio')
        await expect(cartao).toBeVisible()
        await expect(cartao.getByRole('button', { name: 'Conversar com avatar' })).toBeVisible()
        await expect(cartao.getByRole('button', { name: 'Meu avatar' })).toBeVisible()
        await cartao.scrollIntoViewIfNeeded()
        await page.waitForTimeout(600)
        await foto(page, '1-home')
      },
    })
    const botao = pronta(page).getByTestId('avatares-da-conversa')
    await expect(botao).toBeVisible()
    await expect(botao).toContainText('Avatares')
    const caixa = (await botao.boundingBox())!
    expect(caixa.height).toBeGreaterThanOrEqual(44)
    expect(caixa.width).toBeGreaterThanOrEqual(44)
    // a prévia: o avatar da pessoa e o do intérprete, antes de qualquer fala
    await expect(pronta(page).getByTestId('avatar-meu').locator('[data-avatar-pronto="true"]')).toBeVisible({
      timeout: 60_000,
    })
    await expect(pronta(page).getByTestId('avatar-outro').locator('[data-avatar-pronto="true"]')).toBeVisible({
      timeout: 60_000,
    })
    // sem avatar_sinais não há atalho de soletrar
    await expect(page.getByTestId('atalho-soletrar')).toHaveCount(0)
    await page.waitForTimeout(900) // a entrada da tela termina antes da foto
    await foto(page, '2-interprete-pronto')
    // o mesmo painel da conversa
    await botao.click()
    const painel = page.getByTestId('painel-dos-avatares')
    await expect(painel).toBeVisible()
    await foto(page, '3-painel')
    await page.keyboard.press('Escape')
    await expect(painel).toHaveCount(0)
  })

  test('(a) o cartão da Home leva ao Intérprete e pode ser dispensado para sempre', async ({ page }) => {
    await preparar(page, { avatar_3d: true })
    await semModelos(page)
    await page.goto('/')
    await expect(page.getByRole('main')).toBeVisible()
    await assentar(page)
    await page.getByTestId('avatar-no-inicio-dispensar').click()
    await expect(page.getByTestId('avatar-no-inicio')).toHaveCount(0)
    expect(await page.evaluate(() => localStorage.getItem('frasy.avatar.dica.inicio'))).toBe('1')
    await page.reload()
    await expect(page.getByRole('main')).toBeVisible()
    await expect(page.getByTestId('avatar-no-inicio')).toHaveCount(0)
  })

  test('(a) "Conversar com avatar" na Home abre o Intérprete já com o botão Avatares', async ({ page }) => {
    await preparar(page, { avatar_3d: true })
    await semModelos(page)
    await page.goto('/')
    await expect(page.getByRole('main')).toBeVisible()
    await assentar(page)
    await page.getByTestId('avatar-no-inicio-conversar').click()
    await expect(page).toHaveURL(/\/interprete$/, { timeout: 10_000 })
    await expect(pronta(page).getByTestId('avatares-da-conversa')).toBeVisible({ timeout: 15_000 })
  })

  test('(b) avatar_sinais: o atalho de soletrar está à vista e alterna, com os dois avisos fixos', async ({ page }) => {
    test.slow()
    await preparar(page, { avatar_3d: true, avatar_sinais: true })
    await daHomeAoInterprete(page)
    const atalho = pronta(page).getByTestId('atalho-soletrar')
    await expect(atalho).toBeVisible()
    await expect(atalho).toContainText('Soletrar nomes (Libras/ASL)')
    // o modelo do intérprete carrega e a verificação dos dedos termina
    await expect(atalho).toHaveAttribute('aria-pressed', 'false', { timeout: 60_000 })
    expect((await atalho.boundingBox())!.height).toBeGreaterThanOrEqual(44)
    await expect(page.locator('[data-aviso-fixo]')).toHaveCount(0)
    await atalho.click()
    await expect(atalho).toHaveAttribute('aria-pressed', 'true')
    const conversa = pronta(page).getByTestId('soletracao-na-conversa')
    await expect(conversa.getByText(AVISO_1)).toBeVisible()
    await expect(conversa.getByText(AVISO_2)).toBeVisible()
    // sem nenhum nome: o palco das mãos em repouso e o estado claro, antes de qualquer fala
    await expect(pronta(page).getByTestId('soletracao-aguardando')).toHaveText(/^Aguardando um nome/)
    const palco = pronta(page).getByTestId('soletracao-palco')
    await expect(palco).toBeVisible()
    await expect(palco.locator('[data-sinais-camera]')).toBeVisible({ timeout: 60_000 })
    await expect(palco.locator('[data-sinais-pronto="true"]')).toBeVisible({ timeout: 60_000 })
    await page.waitForTimeout(900)
    await foto(page, '4-soletrar-ligado')
    await atalho.click()
    await expect(atalho).toHaveAttribute('aria-pressed', 'false')
    await expect(page.locator('[data-aviso-fixo]')).toHaveCount(0)
  })

  test('(c) Janela flutuante: botão visível que abre o Document PiP simulado com o avatar-intérprete', async ({
    page,
  }) => {
    test.slow()
    await preparar(page, { avatar_3d: true, avatar_sinais: true }, true)
    await daHomeAoInterprete(page)
    const botao = pronta(page).getByTestId('janela-flutuante')
    if (mobile()) {
      // no celular a legenda fica no painel da página: nada de botão que não abre a janela
      await expect(botao).toHaveCount(0)
      return
    }
    await expect(botao).toBeVisible()
    await expect(botao).toContainText('Janela flutuante')
    await expect(botao).toHaveAttribute('aria-label', 'Janela flutuante')
    await expect(botao).toHaveAttribute('aria-keyshortcuts', 'Alt+L')
    await expect(botao).toHaveAttribute('title', /Alt\+L/)
    expect((await botao.boundingBox())!.height).toBeGreaterThanOrEqual(44)
    // liga a soletração antes de abrir: o PiP deve mostrar os dois avisos fixos
    const atalho = pronta(page).getByTestId('atalho-soletrar')
    await expect(atalho).toHaveAttribute('aria-pressed', 'false', { timeout: 60_000 })
    await atalho.click()
    await expect(atalho).toHaveAttribute('aria-pressed', 'true')
    await foto(page, '5-antes-da-janela')

    await botao.click()
    const pip = page.frameLocator('#pip-simulada')
    await expect(pip.getByRole('region', { name: 'Legendas flutuantes' })).toBeVisible()
    const avatarNoPip = pip.getByTestId('avatar-no-pip')
    await expect(avatarNoPip).toBeVisible()
    await expect(avatarNoPip).toHaveAttribute('data-dono', 'outro')
    await expect(avatarNoPip.locator('[data-avatar-pronto="true"]')).toBeVisible({ timeout: 60_000 })
    const avisos = pip.getByTestId('avisos-da-soletracao-no-pip')
    await expect(avisos.getByText(AVISO_1)).toBeVisible()
    await expect(avisos.getByText(AVISO_2)).toBeVisible()
    await expect(botao).toHaveAttribute('aria-pressed', 'true')
    // sem nome a soletrar, o PiP também mostra as mãos em repouso e o estado claro
    await expect(pip.getByTestId('soletracao-no-pip')).toBeVisible()
    await expect(pip.getByTestId('aguardando-no-pip')).toHaveText('Aguardando um nome…')
    await expect(pip.locator('[data-sinais-pronto="true"]')).toBeVisible({ timeout: 60_000 })
    await foto(page, '6-pip-simulado')

    // o mesmo botão fecha a janela
    await botao.click()
    await expect(page.locator('#pip-simulada')).toHaveCount(0)
    await expect(botao).toHaveAttribute('aria-pressed', 'false')
  })

  test('(c) onde o navegador não abre janela (sem Document PiP nem PiP de vídeo) o botão não existe', async ({
    page,
  }) => {
    await preparar(page, { avatar_3d: true })
    await page.addInitScript(() => {
      delete (window as unknown as { documentPictureInPicture?: unknown }).documentPictureInPicture
      Object.defineProperty(document, 'pictureInPictureEnabled', { configurable: true, get: () => false })
    })
    await daHomeAoInterprete(page)
    await expect(pronta(page).getByTestId('avatares-da-conversa')).toBeVisible()
    await expect(page.getByTestId('janela-flutuante')).toHaveCount(0)
  })
})
