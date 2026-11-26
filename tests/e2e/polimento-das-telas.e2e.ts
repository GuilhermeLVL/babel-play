import { mkdirSync } from 'node:fs'
import { join } from 'node:path'

import { type APIRequestContext, expect, type Frame, type Locator, type Page, test } from '@playwright/test'

import { FRASES as FRASES_DO_LIVRO, preparar } from './_livro'

/**
 * POLIMENTO DAS TELAS (capturas 10 a 14 do dono, 26/11): nenhum flutuante cobre controle ou texto, e o texto de UI
 * não vaza em inglês. Cada teste mede as caixas (sem comparar pixel), no computador e no celular.
 *
 * Com `POLIMENTO_TELAS=<pasta>`, fotografa cada tela.
 */
const PASTA = process.env.POLIMENTO_TELAS
const foto = async (page: Page, nome: string) => {
  if (!PASTA) return
  mkdirSync(PASTA, { recursive: true })
  await page.waitForTimeout(300)
  await page.screenshot({ path: join(PASTA, `${nome}-${test.info().project.name}.png`) })
}

/** As caixas se cruzam (com 1 px de tolerância)? */
const cruza = (a: { x: number; y: number; width: number; height: number }, b: typeof a) =>
  a.x < b.x + b.width - 1 && b.x < a.x + a.width - 1 && a.y < b.y + b.height - 1 && b.y < a.y + a.height - 1

const caixa = async (l: Locator) => {
  const b = await l.boundingBox()
  expect(b, 'o elemento precisa estar na tela').not.toBeNull()
  return b!
}

const FRASES = Array.from({ length: 30 }, (_, i) => [
  `This is sentence number ${i} about grammar and opinion.`,
  `Esta é a frase número ${i} sobre gramática e opinião.`,
])

async function criarSessao(request: APIRequestContext) {
  const criada = await request.post('/api/sessions', {
    data: {
      title: 'Polimento das telas',
      kind: 'live',
      sourceLang: 'en',
      targetLang: 'pt-BR',
      status: 'done',
      durationMs: 120000,
      utterances: FRASES.map(([o, tr], idx) => ({
        idx,
        source: 'system',
        sourceLang: 'en',
        sourceText: o,
        targetLang: 'pt-BR',
        translatedText: tr,
        tStartMs: idx * 4000,
        tEndMs: idx * 4000 + 3500,
      })),
    },
  })
  expect(criada.ok()).toBe(true)
  return ((await criada.json()) as { id: string }).id
}

/** A conquista que abre sozinha no banco de dev atrapalha a medida: dispensa se aparecer. */
async function dispensarConquista(page: Page) {
  const resgatar = page.getByRole('button', { name: 'Resgatar e continuar' })
  if (await resgatar.isVisible().catch(() => false)) await resgatar.click()
  await page.waitForTimeout(600)
}

async function abrirSessao(page: Page, id: string) {
  await page.goto(`/sessao/${id}`)
  await expect(page.locator('.qs-fala').first()).toBeVisible({ timeout: 20_000 })
  await page.waitForTimeout(1500)
  await dispensarConquista(page)
}

test.beforeEach(async ({ page }, info) => {
  test.skip(info.project.name === 'tablet-768', 'computador e celular bastam')
  await page.route(/huggingface\.co|hf\.co|cdn-lfs/, (r) => r.abort())
  await page.addInitScript(() => {
    const vozes = [{ name: 'Teste', lang: 'en-US', default: true, localService: true, voiceURI: 'teste' }]
    try {
      Object.defineProperty(window.speechSynthesis, 'getVoices', { configurable: true, value: () => vozes })
    } catch {
      /* noop */
    }
  })
})

test('sessão: o player da escuta guiada reserva o espaço e o iChat não o cobre', async ({ page, request }) => {
  const id = await criarSessao(request)
  await abrirSessao(page, id)
  await foto(page, 'sessao-player')
  const player = page.getByRole('group', { name: 'Player' })
  await expect(player).toBeVisible()

  /* Rola até o fim: a última fala tem de poder subir acima do player. */
  await page.evaluate(() => {
    const falas = document.querySelectorAll<HTMLElement>('.qs-fala')
    for (let e: HTMLElement | null = falas[falas.length - 1]; e; e = e.parentElement) {
      if (e.scrollHeight > e.clientHeight + 1 && /(auto|scroll)/.test(getComputedStyle(e).overflowY))
        e.scrollTop = e.scrollHeight
    }
  })
  await page.waitForTimeout(400)
  await foto(page, 'sessao-player-fim')
  const ultima = await caixa(page.locator('.qs-fala').last())
  const p = await caixa(player)
  expect(ultima.y + ultima.height, 'a última fala fica acima do player').toBeLessThanOrEqual(p.y + 1)

  /* O iChat não cobre nenhum controle do player. */
  const fab = page.locator('#fab')
  if (await fab.isVisible()) {
    const f = await caixa(fab)
    for (const c of await player.locator('button, select, input').all()) {
      if (await c.isVisible()) expect(cruza(f, await caixa(c)), 'o iChat não cobre controle do player').toBe(false)
    }
  }

  /* Compacto: no celular não passa de 150 px de altura. */
  if (test.info().project.name === 'mobile-375') expect(p.height).toBeLessThanOrEqual(150)
})

const AGORA = Date.now()
const cartao = (word: string, fase: 'nova' | 'aprendendo' | 'dominada', sessionId: string) => ({
  id: `pol-${word}`,
  word,
  back: `tradução de ${word}`,
  sentence: null,
  srcLang: 'en',
  tgtLang: 'pt-BR',
  clozePrompt: null,
  clozeAnswer: null,
  box: 1,
  dueAt: AGORA + 3 * 86_400_000,
  createdAt: AGORA - 86_400_000,
  stability: fase === 'nova' ? null : fase === 'aprendendo' ? 2 : 400,
  difficulty: 5,
  reps: fase === 'nova' ? 0 : fase === 'aprendendo' ? 1 : 6,
  lapses: 0,
  lastReview: AGORA - 3_600_000,
  sessionId,
  inDeck: 1,
  cefrLevel: 'B1',
  cefrConfidence: 1,
})

test('Palavras desta sessão: as abas não cobrem o primeiro item e a ativa é legível', async ({ page, request }) => {
  const id = await criarSessao(request)
  await page.route(/\/api\/vocab(\?.*)?$/, (r) =>
    r.request().method() === 'GET'
      ? r.fulfill({
          json: ['grammar', 'opinion', 'sentence', 'number', 'press', 'sort', 'usage', 'precision'].map((w, i) =>
            cartao(w, (['nova', 'aprendendo', 'dominada'] as const)[i % 3], id),
          ),
        })
      : r.continue(),
  )
  await abrirSessao(page, id)
  await page.getByRole('button', { name: /Palavras desta sessão/ }).click()
  const dialogo = page.getByRole('dialog', { name: 'Palavras desta sessão' })
  await expect(dialogo.locator('.q-linha').first()).toBeVisible()
  await page.waitForTimeout(900)
  await foto(page, 'palavras-da-sessao')
  const abas = await caixa(dialogo.locator('.q-abas'))
  const primeira = await caixa(dialogo.locator('.q-linha').first())
  expect(abas.y + abas.height, 'as abas ficam acima do primeiro item').toBeLessThanOrEqual(primeira.y + 1)
  for (const rotulo of ['Todas', 'Salvas', 'Aprendendo', 'Dominadas']) {
    const aba = await caixa(dialogo.getByRole('button', { name: rotulo, exact: true }))
    expect(aba.height, `a aba ${rotulo} tem alvo de toque`).toBeGreaterThanOrEqual(36)
    expect(cruza(aba, primeira), `a aba ${rotulo} não cobre o item`).toBe(false)
  }
})

/** Seleciona `trecho` dentro do parágrafo que o contém, no documento do capítulo (como o arrastar do dedo). */
async function selecionar(page: Page, paragrafo: string, trecho: string) {
  const quadro = page.frames().find((f: Frame) => f.url().startsWith('blob:'))!
  await quadro.evaluate(
    ([par, alvo]) => {
      const p = [...document.querySelectorAll('p')].find((x) => x.textContent?.includes(par))
      if (!p) throw new Error(`sem parágrafo com "${par}"`)
      const no = p.firstChild as Text
      const ini = (no.textContent ?? '').indexOf(alvo)
      const r = document.createRange()
      r.setStart(no, ini)
      r.setEnd(no, ini + alvo.length)
      const sel = getSelection()!
      sel.removeAllRanges()
      sel.addRange(r)
      document.dispatchEvent(new PointerEvent('pointerup', { bubbles: true }))
    },
    [paragrafo, trecho],
  )
}

test.describe('leitor', () => {
  test.beforeEach(async ({ page }) => {
    await preparar(page, { ia_de_estudo: false, parceiro_de_leitura: false })
    await expect(async () => {
      const quadro = page.frames().find((f) => f.url().startsWith('blob:'))
      expect(quadro).toBeTruthy()
      await expect(quadro!.getByText(FRASES_DO_LIVRO[0])).toBeVisible({ timeout: 1000 })
    }).toPass({ timeout: 15_000 })
  })

  test('iChat: rótulo traduzido e sem cobrir a barra do trecho; Explicar/Perguntar indisponíveis sem borda tracejada', async ({
    page,
  }) => {
    const fab = page.locator('#fab')
    await expect(fab).toBeVisible()
    await expect(fab).not.toContainText(/\bContext\b/)
    await foto(page, 'leitor-pagina')

    await selecionar(page, FRASES_DO_LIVRO[0], FRASES_DO_LIVRO[0])
    const barra = page.getByTestId('barra-da-selecao')
    await expect(barra).toBeVisible()
    await foto(page, 'leitor-selecao')
    const b = await caixa(barra)
    if (await fab.isVisible()) expect(cruza(await caixa(fab), b), 'o iChat não cobre a barra do trecho').toBe(false)

    for (const id of ['selecao-explicar', 'selecao-parceiro']) {
      const botao = page.getByTestId(id)
      await expect(botao).toHaveCSS('border-top-style', 'solid')
      await expect(botao).toHaveAttribute('aria-disabled', 'true')
      await expect(botao).toHaveAttribute('title', /.+/)
    }
    for (const botao of await barra.locator('button').all()) {
      if (await botao.isVisible()) expect((await caixa(botao)).height, 'alvo de toque').toBeGreaterThanOrEqual(40)
    }
    const quadro = await caixa(barra.locator('.leitor-selecao-trecho'))
    expect(quadro.height).toBeLessThanOrEqual(2 * 14 * 1.4 + 2)

    /* Fechar a barra devolve o iChat. */
    await barra.getByRole('button', { name: 'Fechar' }).click()
    await expect(fab).toBeVisible()
  })

  test('painéis do leitor: o iChat não cobre nenhum controle visível do painel aberto', async ({ page }) => {
    const fab = page.locator('#fab')
    for (const nome of ['IA', 'Sumário', 'Aparência', 'Anotações']) {
      await page.getByRole('button', { name: nome, exact: true }).first().click()
      await page.waitForTimeout(400)
      await foto(page, `leitor-painel-${nome}`)
      if (await fab.isVisible()) {
        const f = await caixa(fab)
        const painel = page.locator('.leitor-painel, [role=dialog]').last()
        if (await painel.isVisible().catch(() => false)) {
          for (const c of await painel.locator('button, select, input, a').all()) {
            if (await c.isVisible()) expect(cruza(f, await caixa(c)), `${nome}: o iChat cobre um controle`).toBe(false)
          }
        }
      }
      await page.keyboard.press('Escape')
      await page.waitForTimeout(200)
    }
  })

  test('cartão da palavra: Salvar e Já sei à vista, alvos de 44 px e cabe na tela', async ({ page }) => {
    await selecionar(page, FRASES_DO_LIVRO[0], 'garden')
    await page.getByTestId('barra-da-selecao').getByRole('button', { name: 'Ver a palavra' }).click()
    const cartao = page.getByTestId('folha-da-palavra')
    await expect(cartao).toBeVisible()
    await foto(page, 'leitor-cartao-da-palavra')
    const c = await caixa(cartao)
    const vp = page.viewportSize()!
    expect(c.x).toBeGreaterThanOrEqual(0)
    expect(c.x + c.width).toBeLessThanOrEqual(vp.width + 1)
    expect(c.y + c.height).toBeLessThanOrEqual(vp.height + 1)
    const principais = cartao.getByRole('group', { name: 'Guardar a palavra' })
    for (const nome of ['Salvar', 'Já sei']) {
      const botao = principais.getByRole('button', { name: nome, exact: true })
      await expect(botao).toBeVisible()
      expect((await caixa(botao)).height, `${nome} tem alvo de 44 px`).toBeGreaterThanOrEqual(44)
    }
    for (const botao of await cartao.locator('.cartao-palavra-acoes button').all()) {
      expect((await caixa(botao)).height).toBeGreaterThanOrEqual(44)
    }
    const fab = page.locator('#fab')
    if (await fab.isVisible()) expect(cruza(await caixa(fab), c), 'o iChat não cobre o cartão').toBe(false)
  })
})

test('varredura: em Biblioteca e livros o iChat não deixa botão nem link por baixo no fim da rolagem', async ({
  page,
  request,
}) => {
  await criarSessao(request)
  for (const rota of ['/biblioteca', '/livros']) {
    await page.goto(rota)
    await page.waitForTimeout(1800)
    await dispensarConquista(page)
    const fab = page.locator('#fab')
    if (!(await fab.isVisible())) continue
    const f = await caixa(fab)
    await page.evaluate(() => {
      for (const e of document.querySelectorAll<HTMLElement>('main, .q-palco')) e.scrollTop = e.scrollHeight
    })
    await page.waitForTimeout(300)
    await foto(page, `varredura-${rota.slice(1)}`)
    const sob = await page.evaluate((r) => {
      const achados: string[] = []
      for (const e of document.querySelectorAll<HTMLElement>('main button, main a, main select, main input')) {
        const b = e.getBoundingClientRect()
        if (!b.width || !b.height) continue
        if (b.left < r.x + r.width && r.x < b.right && b.top < r.y + r.height && r.y < b.bottom)
          achados.push((e.textContent || e.getAttribute('aria-label') || e.tagName).trim().slice(0, 30))
      }
      return achados
    }, f)
    expect(sob, `${rota}: controles sob o iChat no fim da rolagem`).toEqual([])
  }
})
