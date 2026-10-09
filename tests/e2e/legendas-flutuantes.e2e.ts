import { expect, type Page, test } from '@playwright/test'

import { falar, iniciarCaptura } from './_captura'
import { abrirTela, clicarRobusto } from './_helpers'

/**
 * AS LEGENDAS FLUTUANTES na janela que flutua DENTRO do app (o caminho sem Document
 * Picture-in-Picture: Firefox, Safari), com a captura de verdade e as falas entrando por
 * `window.__simFalas`.
 *
 * NO DESENHO NOVO (09/10/2026) essa janela é a do protótipo (`LegendaFlutuanteDoPrototipo`): vidro
 * escuro que se arrasta, com o ESPELHO DAS DUAS ÚLTIMAS falas, "Pausar legendas"/"Continuar legendas"
 * e fechar. A janela completa (`LegendasFlutuantes`: fila com ritmo de leitura, "N novas ↓", cartão da
 * palavra, Personalizar, histórico pelo teclado) só existe agora dentro da janela sempre-no-topo
 * (Chrome/Edge), que este teste não alcança.
 *
 * O que se prova:
 *  - a janela abre pelo botão da faixa da captura, dentro da tela, e mostra as falas que chegam (só as
 *    duas últimas);
 *  - "Pausar legendas" congela a janela enquanto a captura segue, e "Continuar" volta ao fim;
 *  - fechar tira a janela, e nada disso faz a página rolar de lado.
 *
 * O RITMO: o relato do dono que deu origem a este arquivo era "a legenda some rápido demais", e a
 * correção foi a fala nova ESPERAR a atual cumprir o tempo de leitura (≥ 1,5 s,
 * `lib/captura/ritmoDaLegenda`). A janela do protótipo usa a mesma fila.
 *
 * SAÍRAM DESTE ARQUIVO, por não existirem mais na janela de dentro do app: o "N novas ↓" da pausa, o
 * cartão da palavra tocada (Ouvir / Salvar no vocabulário), o painel Personalizar (modo da janela,
 * falas à vista) e o histórico pelas setas do teclado.
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

test.beforeEach(async ({ page }) => {
  // Sem a API da janela sempre-no-topo: a janelinha flutua dentro do app, que é o que se testa.
  await page.addInitScript(() => {
    delete (window as unknown as { documentPictureInPicture?: unknown }).documentPictureInPicture
  })
  // Nenhum modelo de fala/tradução é baixado: as falas entram prontas.
  await page.route(/huggingface\.co|hf\.co|cdn-lfs/, (r) => r.abort())
})

const botaoDasFlutuantes = (page: Page) =>
  page.getByRole('toolbar', { name: 'Controles da captura' }).getByRole('button', { name: 'Legendas flutuantes' })
const aVista = (page: Page) => page.locator('#leg-flut .leg-o').allTextContents()
const foto = async (page: Page, nome: string, projeto: string) => {
  if (process.env.LEG_SHOTS)
    await page.locator('#leg-flut').screenshot({ path: `${process.env.LEG_SHOTS}/depois-${nome}-${projeto}.png` })
}

test('legendas flutuantes: espelho das últimas falas, pausar, continuar e fechar', async ({ page }, info) => {
  test.slow()
  await abrirTela(page, '/capturar')
  await iniciarCaptura(page)

  /* ABAIXO DE 720 px a faixa da captura só guarda o principal (Iniciar/Encerrar e a letra): o botão
     das Legendas flutuantes não aparece, e a janela não tem porta no celular. É isso que se confere lá. */
  if ((page.viewportSize()?.width ?? 0) < 720) {
    await expect(botaoDasFlutuantes(page)).toBeHidden()
    await expect(page.locator('#leg-flut')).toHaveCount(0)
    return
  }

  await clicarRobusto(page, botaoDasFlutuantes(page))
  const janela = page.getByRole('region', { name: 'Legendas flutuantes' })
  await expect(janela).toBeVisible()
  await expect(janela).toBeInViewport()
  await expect(janela.getByText('Esperando a primeira fala')).toBeVisible()
  await page.mouse.move(2, 2)

  const primeira = 'Hello there, how are you doing today?'
  const segunda = 'I was thinking about going to the beach.'
  const terceira = 'The weather looks great this weekend.'
  await falar(page, [primeira])
  await expect.poll(() => aVista(page)).toEqual([primeira])
  await falar(page, [segunda])
  await page.waitForTimeout(400)
  expect(await aVista(page), 'a fala nova ESPERA a atual cumprir o tempo de leitura (≥ 1,5 s)').toEqual([primeira])
  await expect.poll(() => aVista(page), { timeout: 10_000 }).toEqual([primeira, segunda])
  await expect(janela.locator('.leg-fala.atual .leg-o')).toHaveText(segunda)

  // Só as duas últimas ficam à vista.
  await falar(page, [terceira])
  await expect.poll(() => aVista(page), { timeout: 10_000 }).toEqual([segunda, terceira])
  await foto(page, 'duas-falas', info.project.name)

  // Pausar: a captura segue, a janela não muda; continuar volta ao fim.
  await janela.getByRole('button', { name: 'Pausar legendas' }).click()
  const quarta = 'Nobody expected that answer.'
  await falar(page, [quarta])
  // A fala chegou à captura (está na tela da legenda), e a janela pausada não a mostra.
  await expect(page.getByTestId('captura-do-prototipo').getByText(quarta).first()).toBeVisible()
  expect(await aVista(page)).toEqual([segunda, terceira])
  await foto(page, 'pausada', info.project.name)
  await janela.getByRole('button', { name: 'Continuar legendas' }).click()
  await expect(janela.locator('.leg-fala.atual .leg-o')).toHaveText(quarta)
  await expect.poll(() => aVista(page)).toEqual([terceira, quarta])

  // Nenhuma rolagem lateral da página por causa da janela.
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1)).toBe(true)

  // Fechar tira a janela; a captura continua.
  await janela.getByRole('button', { name: 'Fechar as legendas flutuantes' }).click()
  await expect(janela).toBeHidden()
  await expect(page.getByTestId('encerrar-captura')).toBeVisible()
})
