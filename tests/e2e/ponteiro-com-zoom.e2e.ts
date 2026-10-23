import { expect, type Page, test } from '@playwright/test'

import { falar, iniciarCaptura } from './_captura'
import { semearCartoes, semearSessaoComCartoes } from './_fixtures'
import { abrirTela, clicarRobusto, fecharSobreposicoes } from './_helpers'
import { abrirLobbyDoCaderno, entrarNoJogo, semExplicacao } from './_jogos'

/**
 * COORDENADAS DO PONTEIRO COM O TAMANHO DO TEXTO (P/M/G).
 *
 * O tamanho do texto é `zoom` no `document.body` (`useAparencia.ts`). `clientX/Y` e
 * `getBoundingClientRect()` vêm em px da JANELA; um `px` escrito dentro do body vale `zoom` px da janela.
 * Gravar uma coordenada como a outra desloca o que acompanha o ponteiro (ver `lib/zoomDoCorpo.ts`).
 *
 * Aqui, nos tamanhos P e G, o que a pessoa vê tem de ficar sob o ponteiro:
 *  - arrastar a legenda flutuante: a janela anda o mesmo tanto que o mouse;
 *  - caça-palavras: a seleção começa na letra clicada e segue o arrasto;
 *  - desenho livre: o traço sai sob o ponteiro.
 */
const ESCALAS = [
  ['sm', 'P'],
  ['xl', 'G'],
] as const

/* A captura de verdade, com microfone falso: as falas entram por `window.__simFalas`. */
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

test.beforeEach(({ browserName: _ }, info) => {
  test.skip(info.project.name !== 'desktop-1280', 'fixa a janela sozinho')
})

async function noTamanho(page: Page, escala: string) {
  await page.addInitScript((e) => localStorage.setItem('babel.font_scale', e), escala)
  await page.setViewportSize({ width: 1280, height: 800 })
}

test.describe('tamanho do texto: legenda flutuante', () => {
  for (const [escala, rotulo] of ESCALAS) {
    test(`tamanho ${rotulo}: a janela acompanha o mouse ao ser arrastada`, async ({ page }) => {
      test.slow()
      await page.addInitScript(() => {
        delete (window as unknown as { documentPictureInPicture?: unknown }).documentPictureInPicture
      })
      await page.route(/huggingface\.co|hf\.co|cdn-lfs/, (r) => r.abort())
      await noTamanho(page, escala)
      await abrirTela(page, '/capturar')
      await iniciarCaptura(page)
      await clicarRobusto(
        page,
        page
          .getByRole('toolbar', { name: 'Controles da captura' })
          .getByRole('button', { name: 'Legendas flutuantes' }),
      )
      const janela = page.locator('#leg-flut')
      await expect(janela).toBeVisible()
      await falar(page, ['Hello there, how are you doing today?'])
      await page.waitForTimeout(800) // a entrada (escala/desfoque) termina antes de medir

      const caixa = () =>
        janela.evaluate((el) => {
          const r = el.getBoundingClientRect()
          /* o centro: a janela cresce um pouco ao ser pega (`px-pegou`), e a escala é em torno dele */
          return { x: r.left + r.width / 2, y: r.top + r.height / 2 }
        })
      // Pega num ponto vazio do vidro (fora dos botões): o topo da janela.
      const b = (await janela.boundingBox())!
      const [px, py] = [b.x + b.width / 2, b.y + 6]
      const [dx, dy] = [-220, 140]
      await page.mouse.move(px, py)
      await page.mouse.down()
      // Pegada, a janela cresce um pouco (`px-pegou`): mede-se já assentada, para comparar igual com igual.
      await page.waitForTimeout(500)
      const antes = await caixa()
      await page.mouse.move(px + dx / 2, py + dy / 2, { steps: 6 })
      await page.mouse.move(px + dx, py + dy, { steps: 6 })
      await page.waitForTimeout(200)
      const durante = await caixa()
      await page.mouse.up()

      /* A janela pegada ganha um `scale` (`px-pegou`) que também estica o deslocamento (~4%): daí a folga de 6%.
         O erro que se caça é do zoom (30% no G), muito acima disso. */
      expect(Math.abs(durante.x - antes.x - dx), `deslocamento em x (${rotulo})`).toBeLessThanOrEqual(
        Math.abs(dx) * 0.06,
      )
      expect(Math.abs(durante.y - antes.y - dy), `deslocamento em y (${rotulo})`).toBeLessThanOrEqual(
        Math.abs(dy) * 0.06,
      )
    })
  }
})

test.describe('tamanho do texto: caça-palavras', () => {
  test.beforeAll(async () => {
    await semearCartoes()
  })

  for (const [escala, rotulo] of ESCALAS) {
    test(`tamanho ${rotulo}: a seleção começa na letra clicada e segue o arrasto`, async ({ page }) => {
      test.slow()
      await semExplicacao(page, ['wordsearch'])
      await noTamanho(page, escala)
      await abrirLobbyDoCaderno(page)
      await entrarNoJogo(page, 'wordsearch')
      const grade = page.locator('.grade-caca')
      await expect(grade).toBeVisible()
      const n = await grade.locator('[data-c]').count()
      expect(n).toBeGreaterThan(20)
      const lado = Math.round(Math.sqrt(n))
      const celula = (i: number) => grade.locator(`[data-c="${i}"]`)
      const centro = async (i: number) => {
        const b = (await celula(i).boundingBox())!
        return { x: b.x + b.width / 2, y: b.y + b.height / 2 }
      }
      const marcadas = () =>
        grade.locator('[data-c].sel').evaluateAll((els) => els.map((e) => Number((e as HTMLElement).dataset.c)))

      const ini = 1 * lado + 1
      const fim = ini + 2 // duas letras à direita
      const a = await centro(ini)
      await page.mouse.move(a.x, a.y)
      await page.mouse.down()
      expect(await marcadas(), `só a letra clicada (${rotulo})`).toEqual([ini])
      const f = await centro(fim)
      await page.mouse.move(f.x, f.y, { steps: 6 })
      expect(await marcadas(), `a seleção segue até a letra sob o ponteiro (${rotulo})`).toEqual([ini, ini + 1, fim])
      await page.mouse.up()
    })
  }
})

test.describe('tamanho do texto: desenho livre', () => {
  let sessionId = ''
  test.beforeAll(async () => {
    ;({ sessionId } = await semearSessaoComCartoes())
  })

  for (const [escala, rotulo] of ESCALAS) {
    test(`tamanho ${rotulo}: o traço sai sob o ponteiro`, async ({ page }) => {
      await noTamanho(page, escala)
      await abrirTela(page, `/sessao/${sessionId}/leitura`)
      await fecharSobreposicoes(page)
      await page.getByRole('radio', { name: 'Desenho livre' }).click()
      const tela = page.getByLabel('Área de desenho')
      await expect(tela).toBeVisible()
      await tela.scrollIntoViewIfNeeded()
      await page.waitForTimeout(600) // a rolagem suave termina antes de medir
      const b = (await tela.boundingBox())!
      // Dentro da janela: a tela do desenho cobre o texto inteiro, que pode passar da dobra.
      const alvo = { x: b.x + b.width * 0.4, y: Math.max(b.y, 0) + 150 }
      await page.mouse.move(alvo.x, alvo.y)
      await page.mouse.down()
      await page.mouse.move(alvo.x + 60, alvo.y + 20, { steps: 8 })
      await page.mouse.up()
      /* O ponto mais próximo do começo do traço, medido DENTRO da tela do desenho (em px da janela): ao soltar,
         a barra ganha a fileira "Últimas" e empurra a tela para baixo, então a posição da página não serve. */
      const local = { x: alvo.x - b.x, y: alvo.y - b.y }
      const marca = await tela.evaluate((c: HTMLCanvasElement, p) => {
        const r = c.getBoundingClientRect()
        const ex = c.width / r.width
        const ey = c.height / r.height
        const d = c.getContext('2d')!.getImageData(0, 0, c.width, c.height).data
        let melhor = Infinity
        for (let y = 0; y < c.height; y++)
          for (let x = 0; x < c.width; x++)
            if (d[(y * c.width + x) * 4 + 3] > 0) melhor = Math.min(melhor, Math.hypot(x / ex - p.x, y / ey - p.y))
        return melhor
      }, local)
      expect(marca, `o traço começa sob o ponteiro (${rotulo})`).toBeLessThanOrEqual(6)
    })
  }
})
