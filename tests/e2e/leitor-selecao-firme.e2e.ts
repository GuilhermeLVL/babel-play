import path from 'node:path'

import { type CDPSession, expect, type Frame, type Page, test } from '@playwright/test'

import { fecharSobreposicoes } from './_helpers'

/**
 * A SELEÇÃO FIRME (flag `leitor_selecao_firme`, openspec `leitura-assistida`, Fatia A; a queixa do dono, 27/11: a seleção "pula
 * colunas, pega texto a mais, exige retrabalho"). Com o mouse de verdade, no Chromium (ouvintes de ponteiro no capítulo) e no
 * WebKit (iframe sem script: o gesto é amostrado de fora). Cada teste mede o TEXTO que ficou selecionado no documento do livro.
 *
 * O portão de aceite do WebKit: `PORT=… BASE_URL=… npx playwright test -c playwright.webkit.config.ts leitor-selecao-firme`.
 */
const FIXTURE = path.resolve('tests', 'fixtures', 'livros', 'fabulas-cc0.epub')
const P1 =
  'One hot summer day a hungry fox was walking through an orchard. He saw a bunch of ripe grapes hanging from a high branch.'
const FRASE1 = 'One hot summer day a hungry fox was walking through an orchard.'

async function abrirLivro(page: Page, ligada = true): Promise<Frame> {
  await page.route('**/api/flags', (r) => r.fulfill({ json: { flags: { leitor_selecao_firme: { ligada } } } }))
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

/** O ponto (na página) da 2ª letra de `palavra`, a `fracao` da largura dela. */
async function ponto(f: Frame, palavra: string, fracao = 0.25) {
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
        return { x: b.left + b.width * (fr as number), y: b.top + b.height / 2, h: b.height }
      }
      return null
    },
    [palavra, fracao] as const,
  )
  const quadro = await (await f.frameElement()).boundingBox()
  if (!caixa || !quadro) throw new Error(`sem a palavra ${palavra}`)
  return { x: quadro.x + caixa.x, y: quadro.y + caixa.y, h: caixa.h }
}

const selecionado = (f: Frame) => f.evaluate(() => (getSelection()?.toString() ?? '').replace(/\s+/g, ' ').trim())

test.describe('Leitor: a seleção firme', () => {
  test('o arrasto que solta no meio da palavra termina no fim dela', async ({ page, browserName }) => {
    test.slow()
    const f = await abrirLivro(page)
    const m = await mouse(page, browserName)
    const de = await ponto(f, 'hungry', 0.25)
    const ate = await ponto(f, 'orchard', 0.3)
    await m.descer(de.x, de.y)
    await page.waitForTimeout(150)
    for (let i = 1; i <= 8; i++) await m.mover(de.x + ((ate.x - de.x) * i) / 8, de.y + ((ate.y - de.y) * i) / 8)
    await m.subir(ate.x, ate.y)
    await expect(page.getByTestId('barra-da-selecao')).toBeVisible({ timeout: 5000 })
    await expect.poll(() => selecionado(f)).toBe('hungry fox was walking through an orchard')
  })

  test('o arrasto que escorrega para o parágrafo de baixo não leva texto a mais', async ({ page, browserName }) => {
    test.slow()
    const f = await abrirLivro(page)
    const m = await mouse(page, browserName)
    const de = await ponto(f, 'hungry', 0.25)
    const ate = await ponto(f, 'jumped', 0.5) // o 2º parágrafo
    await m.descer(de.x, de.y)
    await page.waitForTimeout(150)
    for (let i = 1; i <= 10; i++) await m.mover(de.x + ((ate.x - de.x) * i) / 10, de.y + ((ate.y - de.y) * i) / 10)
    await m.subir(ate.x, ate.y)
    await expect(page.getByTestId('barra-da-selecao')).toBeVisible({ timeout: 5000 })
    await page.waitForTimeout(400)
    const texto = await selecionado(f)
    expect(texto.startsWith('hungry')).toBe(true)
    expect(texto).not.toContain('jumped')
    expect(P1.includes(texto), `"${texto}" fica dentro do 1º parágrafo`).toBe(true)
    // bordas de palavra: o texto termina numa palavra inteira do parágrafo
    expect(P1.endsWith(texto) || P1.includes(`${texto} `) || P1.includes(`${texto}.`)).toBe(true)
  })

  test('o arrasto que solta na margem (sem texto) termina na última palavra realmente tocada', async ({
    page,
    browserName,
  }) => {
    test.skip(
      browserName !== 'chromium',
      'No WebKit o iframe não entrega os pontos do arrasto ao app: lá o fim vem do motor (melhor esforço).',
    )
    test.slow()
    const f = await abrirLivro(page)
    const m = await mouse(page, browserName)
    const de = await ponto(f, 'hungry', 0.25)
    const ate = await ponto(f, 'was walking', 0.5)
    const margem = { x: 4, y: ate.y } // a borda esquerda da janela: nenhum texto ali
    await m.descer(de.x, de.y)
    await page.waitForTimeout(150)
    for (let i = 1; i <= 6; i++) await m.mover(de.x + ((ate.x - de.x) * i) / 6, de.y + ((ate.y - de.y) * i) / 6)
    await m.mover(margem.x, margem.y)
    await m.subir(margem.x, margem.y)
    await expect(page.getByTestId('barra-da-selecao')).toBeVisible({ timeout: 5000 })
    await page.waitForTimeout(400)
    const texto = await selecionado(f)
    expect(texto.startsWith('hungry')).toBe(true)
    expect(texto.endsWith('was') || texto.endsWith('walking')).toBe(true)
  })

  test('toque duplo seleciona a frase', async ({ page, browserName }) => {
    test.slow()
    const f = await abrirLivro(page)
    const m = await mouse(page, browserName)
    const p = await ponto(f, 'orchard', 0.5)
    await m.descer(p.x, p.y, 1)
    await m.subir(p.x, p.y, 1)
    await page.waitForTimeout(60)
    await m.descer(p.x, p.y, 2)
    await m.subir(p.x, p.y, 2)
    await expect(page.getByTestId('barra-da-selecao')).toBeVisible({ timeout: 5000 })
    await expect.poll(() => selecionado(f)).toBe(FRASE1)
  })

  test('toque triplo seleciona o parágrafo', async ({ page, browserName }) => {
    test.slow()
    const f = await abrirLivro(page)
    const m = await mouse(page, browserName)
    const p = await ponto(f, 'orchard', 0.5)
    // os três toques seguidos, como a mão faz (sem esperar a tela entre eles)
    for (const n of [1, 2, 3]) {
      await m.descer(p.x, p.y, n)
      await m.subir(p.x, p.y, n)
    }
    await expect.poll(() => selecionado(f)).toBe(P1)
  })

  test('as alças movem o fim palavra a palavra e atualizam a barra', async ({ page, browserName }) => {
    test.slow()
    const f = await abrirLivro(page)
    const m = await mouse(page, browserName)
    const p = await ponto(f, 'orchard', 0.5)
    await m.descer(p.x, p.y, 1)
    await m.subir(p.x, p.y, 1)
    await page.waitForTimeout(60)
    await m.descer(p.x, p.y, 2)
    await m.subir(p.x, p.y, 2)
    await expect.poll(() => selecionado(f)).toBe(FRASE1)
    const alca = page.getByTestId('alca-fim')
    await expect(alca).toBeVisible({ timeout: 5000 })
    const a = (await alca.boundingBox())!
    // o dedo está na alça (abaixo da linha); a palavra lida é a da linha, acima do dedo
    const alvo = await ponto(f, 'He saw', 0.5)
    await page.mouse.move(a.x + a.width / 2, a.y + a.height / 2)
    await page.mouse.down()
    await page.mouse.move(alvo.x, alvo.y + 22 + alvo.h / 2, { steps: 6 })
    await page.mouse.up()
    await expect.poll(() => selecionado(f)).toBe(`${FRASE1} He`.replace('orchard. He', 'orchard. He'))
    // teclado: → avança mais uma palavra
    await alca.focus()
    await page.keyboard.press('ArrowRight')
    await expect.poll(() => selecionado(f)).toBe(`${FRASE1} He saw`)
    await expect(page.getByTestId('barra-da-selecao')).toContainText('He saw')
  })

  test('com a flag desligada a alça não existe', async ({ page }) => {
    await page.route('**/api/flags', (r) => r.fulfill({ json: { flags: {} } }))
    await page.goto('/leitor')
    await expect(page.getByTestId('estante')).toBeVisible({ timeout: 30_000 })
    await page.getByTestId('abrir-arquivo').setInputFiles(FIXTURE)
    await expect(page.locator('[data-testid=leitor][data-estado=pronto]')).toBeVisible({ timeout: 30_000 })
    await expect(page.getByTestId('alca-fim')).toHaveCount(0)
  })
})

/**
 * A BATERIA DE 100 GESTOS SINTÉTICOS (tarefa A8; meta: no máximo 5% de seleções que a pessoa teria de REFAZER). Cada gesto
 * arrasta de uma palavra a outra do 1º parágrafo (qualquer direção), solta num ponto aleatório da palavra final e, em 30% dos
 * casos, ainda deriva: escorrega para a margem ou para o parágrafo de baixo antes de soltar. "Refazer" = o texto selecionado
 * difere das palavras pretendidas (a de partida até a de chegada). `SELECAO_FIRME=off` mede o comportamento de hoje, para comparar.
 */
test('bateria de 100 gestos: no máximo 5% precisam ser refeitos', async ({ page, browserName }, info) => {
  test.skip(
    browserName !== 'chromium' || info.project.name !== 'desktop-1280',
    'a bateria roda uma vez, no Chromium de 1280',
  )
  test.setTimeout(400_000)
  const ligada = process.env.SELECAO_FIRME !== 'off'
  const f = await abrirLivro(page, ligada)
  const m = await mouse(page, browserName)
  const quadro = (await (await f.frameElement()).boundingBox())!
  const palavras = await f.evaluate((p1) => {
    const w = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT)
    for (let n = w.nextNode(); n; n = w.nextNode()) {
      if (!n.textContent!.startsWith(p1.slice(0, 20))) continue
      const out: { t: string; x: number; y: number; w: number; h: number }[] = []
      for (const mt of n.textContent!.matchAll(/[A-Za-z]+/g)) {
        const r = document.createRange()
        r.setStart(n, mt.index!)
        r.setEnd(n, mt.index! + mt[0].length)
        const b = r.getBoundingClientRect()
        out.push({ t: mt[0], x: b.left, y: b.top, w: b.width, h: b.height })
      }
      return out
    }
    return []
  }, P1)
  expect(palavras.length).toBeGreaterThan(15)
  let semente = 20261127
  const alea = () => (semente = (semente * 1664525 + 1013904223) >>> 0) / 2 ** 32
  const baixo = await ponto(f, 'jumped', 0.5)
  let refazer = 0
  const N = 100
  for (let g = 0; g < N; g++) {
    let a = Math.floor(alea() * palavras.length)
    let b = Math.floor(alea() * palavras.length)
    if (Math.abs(a - b) < 1) b = (a + 3) % palavras.length
    const pa = palavras[a]
    const pb = palavras[b]
    const de = { x: quadro.x + pa.x + pa.w * (0.15 + 0.2 * alea()), y: quadro.y + pa.y + pa.h / 2 }
    const ate = { x: quadro.x + pb.x + pb.w * (0.15 + 0.7 * alea()), y: quadro.y + pb.y + pb.h / 2 }
    if (a > b) [a, b] = [b, a]
    const esperado = palavras
      .slice(a, b + 1)
      .map((x) => x.t)
      .join(' ')
    await m.descer(de.x, de.y)
    await page.waitForTimeout(120)
    for (let i = 1; i <= 6; i++) await m.mover(de.x + ((ate.x - de.x) * i) / 6, de.y + ((ate.y - de.y) * i) / 6)
    let solta = ate
    if (alea() < 0.3) {
      solta = alea() < 0.5 ? { x: 4, y: ate.y } : { x: baixo.x, y: baixo.y }
      await m.mover(solta.x, solta.y)
    }
    await m.subir(solta.x, solta.y)
    await page.waitForTimeout(260)
    const texto = (await selecionado(f))
      .replace(/[^A-Za-z ]/g, ' ')
      .replace(/\s+/g, ' ')
      .trim()
    if (texto !== esperado) refazer++
    await f.evaluate(() => getSelection()?.removeAllRanges())
    await page.waitForTimeout(400)
  }
  const taxa = (refazer / N) * 100
  info.annotations.push({
    type: 'taxa-de-refazer',
    description: `${taxa.toFixed(1)}% (${refazer} de ${N}), flag ${ligada ? 'ligada' : 'desligada'}`,
  })
  console.log(`TAXA DE REFAZER: ${taxa.toFixed(1)}% (${refazer}/${N}), flag ${ligada ? 'ligada' : 'desligada'}`)
  if (ligada) expect(taxa).toBeLessThanOrEqual(5)
})
