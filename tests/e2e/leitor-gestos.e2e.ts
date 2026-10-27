import path from 'node:path'

import { type CDPSession, expect, type Frame, type Page, test } from '@playwright/test'

import { fecharSobreposicoes } from './_helpers'

/**
 * O GESTO NO TEXTO DO LIVRO (a queixa do dono: "quero selecionar um trecho e pega uma palavra, já abre tudo em
 * tela"). Só o toque LIMPO abre a folha da palavra; arrastar, segurar e o toque duplo são seleção. Com o mouse
 * de verdade, no Chromium (ouvintes de ponteiro no capítulo) e no WebKit (o iframe sem script não entrega
 * eventos: o gesto é amostrado de fora, `src/lib/leitor/selecao.ts`).
 *
 * No Chromium o arrasto vai pelo CDP (`Input.dispatchMouseEvent`): o `page.mouse.move` com o botão descido
 * passa pelo interceptador de arrastar do Playwright, que espera cada quadro responder — e o quadro sem script
 * do livro demora segundos a cada passo. O evento que chega ao navegador é o mesmo.
 */

const FIXTURE = path.resolve('tests', 'fixtures', 'livros', 'fabulas-cc0.epub')

async function abrirLivro(page: Page): Promise<Frame> {
  await page.goto('/leitor')
  await expect(page.getByTestId('estante')).toBeVisible({ timeout: 30_000 })
  await page.getByTestId('abrir-arquivo').setInputFiles(FIXTURE)
  await expect(page.locator('[data-testid=leitor][data-estado=pronto]')).toBeVisible({ timeout: 30_000 })
  await fecharSobreposicoes(page)
  let achado: Frame | undefined
  await expect(async () => {
    for (const f of page.frames())
      if (
        f.url().startsWith('blob:') &&
        (await f
          .getByText('orchard', { exact: false })
          .count()
          .catch(() => 0))
      )
        achado = f
    if (!achado) throw new Error('o capítulo ainda não abriu')
  }).toPass({ timeout: 15_000 })
  return achado!
}

/** O mouse "de verdade": no Chromium pelo CDP, no WebKit pelo `page.mouse`. */
async function mouse(page: Page, browserName: string) {
  const cdp: CDPSession | null = browserName === 'chromium' ? await page.context().newCDPSession(page) : null
  const enviar = (
    type: 'mousePressed' | 'mouseReleased' | 'mouseMoved',
    x: number,
    y: number,
    extra: Record<string, unknown> = {},
  ) =>
    cdp!.send('Input.dispatchMouseEvent', {
      type,
      x,
      y,
      button: 'left',
      buttons: type === 'mouseReleased' ? 0 : 1,
      clickCount: 1,
      ...extra,
    })
  return {
    async descer(x: number, y: number, cliques = 1) {
      if (cdp) {
        await cdp.send('Input.dispatchMouseEvent', { type: 'mouseMoved', x, y, button: 'none', buttons: 0 })
        await enviar('mousePressed', x, y, { clickCount: cliques })
      } else {
        await page.mouse.move(x, y)
        await page.mouse.down({ clickCount: cliques })
      }
    },
    async mover(x: number, y: number) {
      if (cdp) await enviar('mouseMoved', x, y)
      else await page.mouse.move(x, y)
    },
    async subir(x: number, y: number, cliques = 1) {
      if (cdp) await enviar('mouseReleased', x, y, { clickCount: cliques })
      else await page.mouse.up({ clickCount: cliques })
    },
  }
}

/**
 * O ponto (na página) da 2ª letra de `palavra`, a `fracao` da largura dela (0,5 = o centro).
 *
 * O CENTRO EXATO DE UMA LETRA É UM EMPATE para o Chromium no Linux: apertar o botão ali e arrastar deixa a
 * seleção em caret que acompanha o ponteiro (nunca vira trecho), embora cada ponto 0,5 px ao lado funcione
 * (varredura de 366 a 400 px a cada 0,5 px, no 768: só o 380,0 falhava). Não há chamada à API de seleção,
 * script nem ouvinte do app no caminho (falha igual com `ouvirGestos` desligado): é o motor. Quem arrasta
 * de verdade nunca cai no empate; o teste, que calcula o centro, cai. Por isso o ARRASTO sai de 25 % da
 * letra; o toque (que não depende disso) segue no centro.
 */
async function pontoDaPalavra(f: Frame, palavra = 'orchard', fracao = 0.5) {
  const caixa = await f.evaluate(
    ([p, fr]) => {
      const w = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT)
      for (let n = w.nextNode(); n; n = w.nextNode()) {
        const i = n.textContent!.indexOf(p as string)
        if (i < 0) continue
        const r = document.createRange()
        r.setStart(n, i + 1)
        r.setEnd(n, i + 2)
        const b = r.getBoundingClientRect()
        return { x: b.left + b.width * (fr as number), y: b.top + b.height / 2 }
      }
      return null
    },
    [palavra, fracao] as const,
  )
  const quadro = await (await f.frameElement()).boundingBox()
  if (!caixa || !quadro) throw new Error(`sem a palavra ${palavra}`)
  return { x: quadro.x + caixa.x, y: quadro.y + caixa.y }
}

test.describe('Leitor — o gesto no texto', () => {
  test('arrastar para selecionar NÃO abre a folha da palavra; segurar também não; o toque limpo abre', async ({
    page,
    browserName,
  }) => {
    test.slow()
    const f = await abrirLivro(page)
    const folha = page.getByTestId('folha-da-palavra')
    const barra = page.getByTestId('barra-da-selecao')
    const m = await mouse(page, browserName)
    const p = await pontoDaPalavra(f)

    // ── arrastar: desce numa palavra ("hungry"), segura um instante e arrasta até outra ("orchard") — é seleção ──
    const de = await pontoDaPalavra(f, 'hungry', 0.25)
    await m.descer(de.x, de.y)
    await page.waitForTimeout(150)
    for (let i = 1; i <= 8; i++) await m.mover(de.x + ((p.x - de.x) * i) / 8, de.y + ((p.y - de.y) * i) / 8)
    await page.waitForTimeout(350) // mais que a janela do toque duplo: a folha teria aberto aqui
    await expect(folha).toBeHidden()
    await m.subir(p.x, p.y)
    await expect(barra).toBeVisible({ timeout: 5000 })
    await page.waitForTimeout(600)
    await expect(folha).toBeHidden()
    await barra.getByRole('button', { name: 'Fechar' }).click()
    await expect(barra).toBeHidden()
    await page.waitForTimeout(500) // a janela depois de a seleção sumir

    // ── segurar parado (toque longo): nunca abre a folha ──
    await m.descer(p.x, p.y)
    await page.waitForTimeout(700)
    await expect(folha).toBeHidden()
    await m.subir(p.x, p.y)
    await page.waitForTimeout(700)
    await expect(folha).toBeHidden()
    await page.waitForTimeout(400)

    // ── o toque limpo: abre a folha da palavra ──
    await m.descer(p.x, p.y)
    await m.subir(p.x, p.y)
    await expect(folha).toBeVisible({ timeout: 5000 })
    await expect(folha).toContainText('orchard')
  })

  test('o toque duplo seleciona a palavra (barra do trecho) sem abrir a folha; "Ver a palavra" abre', async ({
    page,
    browserName,
  }) => {
    test.slow()
    const f = await abrirLivro(page)
    const folha = page.getByTestId('folha-da-palavra')
    const barra = page.getByTestId('barra-da-selecao')
    const m = await mouse(page, browserName)
    const p = await pontoDaPalavra(f)

    await m.descer(p.x, p.y, 1)
    await m.subir(p.x, p.y, 1)
    await page.waitForTimeout(60)
    await m.descer(p.x, p.y, 2)
    await m.subir(p.x, p.y, 2)
    await expect(barra).toBeVisible({ timeout: 5000 })
    await expect(barra).toContainText('orchard')
    await page.waitForTimeout(700)
    await expect(folha).toBeHidden()

    // O caminho do teclado (e do toque duplo) para a folha: "Ver a palavra" na barra do trecho.
    const ver = barra.getByRole('button', { name: 'Ver a palavra' })
    await ver.focus()
    await page.keyboard.press('Enter')
    await expect(folha).toBeVisible({ timeout: 5000 })
    await expect(folha).toContainText('orchard')
  })
})
