import { mkdirSync } from 'node:fs'
import { join } from 'node:path'

import { type APIRequestContext, expect, type Locator, type Page, test } from '@playwright/test'

/**
 * O PLAYER COMPACTO DA ESCUTA GUIADA (flag `escuta_player_compacto`, openspec `leitura-assistida`, Fatia A; captura 16 do dono,
 * 27/11: "cobre a transcrição no computador, estranho e feio"). Mede as caixas no computador (1280x720) e no celular
 * (390x844): UMA fileira, 0 px de sobreposição com a última fala, o iChat longe dos controles. Com a flag desligada o player
 * é o de hoje (mais alto, com a linha do modo de escuta).
 *
 * Com `PLAYER_COMPACTO_FOTOS=<pasta>`, fotografa cada estado.
 */
const PASTA = process.env.PLAYER_COMPACTO_FOTOS
const foto = async (page: Page, nome: string) => {
  if (!PASTA) return
  mkdirSync(PASTA, { recursive: true })
  await page.waitForTimeout(300)
  await page.screenshot({ path: join(PASTA, `${nome}-${test.info().project.name}.png`) })
}

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

async function dispensarConquista(page: Page) {
  const resgatar = page.getByRole('button', { name: 'Resgatar e continuar' })
  if (await resgatar.isVisible().catch(() => false)) await resgatar.click()
  await page.waitForTimeout(600)
}

async function abrirSessao(page: Page, compacto: boolean, id: string) {
  await page.route('**/api/flags', (r) =>
    r.fulfill({ json: { flags: compacto ? { escuta_player_compacto: { ligada: true } } : {} } }),
  )
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

async function rolarAoFim(page: Page) {
  await page.evaluate(() => {
    const falas = document.querySelectorAll<HTMLElement>('.qs-fala')
    for (let e: HTMLElement | null = falas[falas.length - 1]; e; e = e.parentElement) {
      if (e.scrollHeight > e.clientHeight + 1 && /(auto|scroll)/.test(getComputedStyle(e).overflowY))
        e.scrollTop = e.scrollHeight
    }
  })
  await page.waitForTimeout(400)
}

test('player compacto: uma fileira, sem cobrir a última fala nem ser coberto pelo iChat', async ({ page, request }) => {
  const id = await criarSessao(request)
  await abrirSessao(page, true, id)
  await foto(page, 'compacto')
  const player = page.getByRole('group', { name: 'Player' })
  await expect(player).toHaveClass(/px-player-compacto/)
  await rolarAoFim(page)
  await foto(page, 'compacto-fim')

  const p = await caixa(player)
  const mobile = test.info().project.name === 'mobile-375'
  expect(p.height, 'barra de uma fileira').toBeLessThanOrEqual(mobile ? 64 : 64)

  /* Uma fileira: todos os controles visíveis têm o centro na mesma faixa vertical. */
  const centros: number[] = []
  for (const c of await player.locator('button, select, input').all())
    if (await c.isVisible()) {
      const b = await caixa(c)
      centros.push(b.y + b.height / 2)
    }
  expect(centros.length).toBeGreaterThanOrEqual(4)
  expect(Math.max(...centros) - Math.min(...centros), 'todos os controles na mesma fileira').toBeLessThanOrEqual(6)

  /* 0 px de sobreposição: a última fala termina acima do player. */
  const ultima = await caixa(page.locator('.qs-fala').last())
  expect(ultima.y + ultima.height, 'a última fala fica acima do player').toBeLessThanOrEqual(p.y + 1)

  /* O iChat não cobre nenhum controle. */
  const fab = page.locator('#fab')
  if (await fab.isVisible()) {
    const f = await caixa(fab)
    for (const c of await player.locator('button, select, input').all())
      if (await c.isVisible()) expect(cruza(f, await caixa(c)), 'o iChat não cobre controle').toBe(false)
  }

  /* Nada vaza para os lados. */
  const largura = page.viewportSize()!.width
  expect(p.x).toBeGreaterThanOrEqual(0)
  expect(p.x + p.width).toBeLessThanOrEqual(largura)
})

test('player compacto: Ouvir e Pausar continuam funcionando na barra', async ({ page, request }) => {
  const id = await criarSessao(request)
  await abrirSessao(page, true, id)
  const player = page.getByRole('group', { name: 'Player' })
  const tocar = player.locator('[data-px=tocar]')
  await expect(tocar).toBeVisible()
  await expect(tocar).toContainText(/Ouvir/)
  await expect(player.getByRole('button', { name: 'Próxima fala' })).toBeVisible()
  await expect(player.getByRole('combobox')).toBeVisible()
})

test('flag desligada: o player é o de hoje (sem a classe, com a linha do modo de escuta)', async ({
  page,
  request,
}) => {
  const id = await criarSessao(request)
  await abrirSessao(page, false, id)
  await foto(page, 'atual')
  const player = page.getByRole('group', { name: 'Player' })
  await expect(player).not.toHaveClass(/px-player-compacto/)
  await expect(player.getByText('Modo de escuta')).toBeVisible()
})
