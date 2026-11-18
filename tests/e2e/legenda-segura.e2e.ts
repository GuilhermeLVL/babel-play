import { expect, type Page, test } from '@playwright/test'

import { iniciarCaptura } from './_captura'
import { abrirTela, clicarRobusto } from './_helpers'

/**
 * A LEGENDA SEGURA NA CAPTURA DE VERDADE (change `legenda-segura-para-menores`, achado COMP-02).
 *
 * A fala é a da auditoria: o reconhecimento ouviu "review the pull request together" e escreveu "reveal the porn quest
 * together"; a tradução saiu "revelar a busca pornô juntos". O STT não reproduz o erro sob demanda, então a fala entra
 * pela bancada da tela (`window.__simFalas`), que escreve pelo MESMO setter do pipeline (o envolvido pela política).
 *
 * O servidor do e2e é o self-host (sem login): lá `perfilProtegido()` é falso, como para o adulto declarado. A suíte
 * liga a opção do adulto em Ajustes (o caminho de ponta a ponta) e confere a lista e o painel flutuante (PiP). O perfil
 * protegido (ligado e travado) é coberto pelos testes de unidade (`legendaSeguraAjustes.test.tsx`).
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

const FALA: [string, string] = ['reveal the porn quest together', 'revelar a busca pornô juntos']
/* As palavras das listas que esta fala pode mostrar, em qualquer forma. */
const TERMO = /porn/i

/** A Document PiP simulada (a mesma ideia de `legenda-pip.e2e.ts`): a janela de um iframe por cima da página. */
function simularDocumentPiP() {
  const api = {
    window: null as Window | null,
    requestWindow({ width, height }: { width: number; height: number }) {
      const f = document.createElement('iframe')
      f.id = 'pip-simulada'
      f.title = 'PiP simulada'
      f.style.cssText = `position:fixed;left:16px;top:16px;width:${width}px;height:${height}px;border:0;z-index:2147483647`
      document.body.appendChild(f)
      const w = f.contentWindow!
      Object.defineProperty(w, 'outerWidth', { configurable: true, get: () => w.innerWidth })
      Object.defineProperty(w, 'outerHeight', { configurable: true, get: () => w.innerHeight })
      ;(w as unknown as { resizeTo: (a: number, b: number) => void }).resizeTo = (a, b) => {
        f.style.width = `${a}px`
        f.style.height = `${b}px`
      }
      ;(w as unknown as { close: () => void }).close = () => {
        f.remove()
        api.window = null
      }
      api.window = w
      return Promise.resolve(w)
    },
  }
  Object.defineProperty(window, 'documentPictureInPicture', { configurable: true, value: api })
}

const falarTraduzido = (page: Page, par: [string, string]) =>
  page.evaluate(
    (p) =>
      (window as unknown as { __simFalas: (t: string[], f?: string, l?: string, tr?: string[]) => number }).__simFalas(
        [p[0]],
        undefined,
        'en',
        [p[1]],
      ),
    par,
  )

test.beforeEach(async ({ page }) => {
  await page.route(/huggingface\.co|hf\.co|cdn-lfs/, (r) => r.abort())
})

test('a fala da auditoria chega com ••• na lista e no PiP, e o aviso aparece', async ({ page }) => {
  test.slow()
  await abrirTela(page, '/ajustes/privacidade')
  const opcao = page.getByRole('switch', { name: 'Ocultar palavras sensíveis na legenda' })
  if ((await opcao.getAttribute('aria-checked')) !== 'true') await clicarRobusto(page, opcao)
  await expect(opcao).toHaveAttribute('aria-checked', 'true')

  await page.addInitScript(simularDocumentPiP)
  await abrirTela(page, '/capturar')
  await iniciarCaptura(page)
  await falarTraduzido(page, FALA)

  /* A lista: o marcador rotulado, nenhum termo. */
  const main = page.getByRole('main')
  await expect(main.getByRole('img', { name: /Palavra ocultada/ }).first()).toBeVisible({ timeout: 20_000 })
  await expect(main).not.toContainText(TERMO)
  await expect(main).toContainText('•••')
  await expect(page.getByText('Uma palavra foi ocultada pela proteção.', { exact: false })).toBeVisible()

  /* O painel flutuante (PiP). ABAIXO DE 720 px a faixa da captura não tem o botão das Legendas flutuantes e a
     janela não tem porta no celular (ver `legendas-flutuantes.e2e.ts`): lá a lista acima é a única saída da legenda,
     e o que se confere é que nenhuma janela abriu. */
  const botaoFlutuantes = page
    .getByRole('toolbar', { name: 'Controles da captura' })
    .getByRole('button', { name: 'Legendas flutuantes' })
  if ((page.viewportSize()?.width ?? 0) < 720) {
    await expect(botaoFlutuantes).toBeHidden()
    await expect(page.locator('#pip-simulada')).toHaveCount(0)
  } else {
    await clicarRobusto(page, botaoFlutuantes)
    const pip = page.frameLocator('#pip-simulada')
    const regiao = pip.getByRole('region', { name: 'Legendas flutuantes' })
    await expect(regiao).toBeVisible()
    await expect(regiao).toContainText('•••', { timeout: 20_000 })
    await expect(regiao).not.toContainText(TERMO)
    expect(await pip.getByRole('img', { name: /Palavra ocultada/ }).count()).toBeGreaterThanOrEqual(1)
  }

  /* Desliga de novo: o padrão do adulto é desligado, e a suíte não deixa a opção ligada para as outras. */
  await abrirTela(page, '/ajustes/privacidade')
  await clicarRobusto(page, opcao)
  await expect(opcao).toHaveAttribute('aria-checked', 'false')
})
