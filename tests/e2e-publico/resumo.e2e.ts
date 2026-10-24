/**
 * PLANOS V4, ETAPA 2 (Task 3) — "RESUMIR A SESSÃO" NA REVISÃO, ponta a ponta.
 *
 * Roda com `playwright.publico.config.ts`: login de verdade no Supabase falso, a flag `ia_de_estudo` ligada NA
 * PÁGINA (`/api/flags`) e a rota `POST /api/ai/resumir` SIMULADA — nenhum pedido de IA de verdade sai
 * (`semIaDeVerdade`). O bulk-add também é simulado (o banco do e2e é reaproveitado: a palavra já guardada numa
 * rodada anterior voltaria como repetida). O que se prova:
 *
 *   1. flag desligada: a revisão é a de sempre, sem o resumo;
 *   2. computador (1280), Grátis: "Resumir a sessão" pede com a sessão e o idioma, mostra os 3 pontos e os cartões
 *      marcados; "Adicionar N cartões" manda só os marcados e diz quantos entraram e quais ficaram de fora; o
 *      contador da amostra semanal; o 2º resumo da semana diz só que acabou, sem número, com o link neutro;
 *   3. celular (375), Premium: o mesmo resumo na revisão, sem contador.
 *
 * Fotos de conferência só com `FOTOS_DIR` (o resumo na revisão, no 375 e no 1280).
 *
 *   npx playwright test -c playwright.publico.config.ts resumo
 */
import { devices, expect, type Page, test } from '@playwright/test'

import { chegarEm, clicar, entrar, postsDeIa, semIaDeVerdade } from './_nuance'

const PONTOS = [
  'A Ana chamou o Beto para um café.',
  'O Beto estava atrasado para a reunião.',
  'A tarefa da semana foi bem fácil.',
]
const CARTOES = [
  {
    word: 'grab a coffee',
    back: 'tomar um café',
    sentence: 'We should grab a coffee sometime.',
    srcLang: 'en',
    tgtLang: 'pt-BR',
  },
  {
    word: 'running late',
    back: 'atrasado',
    sentence: 'I am running late for the meeting.',
    srcLang: 'en',
    tgtLang: 'pt-BR',
  },
  {
    word: 'piece of cake',
    back: 'moleza',
    sentence: 'Honestly, it was a piece of cake.',
    srcLang: 'en',
    tgtLang: 'pt-BR',
  },
]
const FALAS = [
  ['We should grab a coffee sometime.', 'A gente devia tomar um café qualquer dia.'],
  ['I am running late for the meeting.', 'Estou atrasado para a reunião.'],
  ['Honestly, it was a piece of cake.', 'Sinceramente, foi moleza.'],
  ['Let me know when you are free.', 'Me avisa quando estiver livre.'],
  ['See you on Monday, then.', 'Até segunda, então.'],
]

async function flagIaDeEstudo(page: Page, ligada: boolean) {
  await page.route('**/api/flags', (r) => r.fulfill({ json: { flags: { ia_de_estudo: { ligada } } } }))
}

async function foto(page: Page, nome: string) {
  const dir = process.env.FOTOS_DIR
  if (dir) await page.screenshot({ path: `${dir}/${nome}.png`, fullPage: false })
}

async function semearSessao(page: Page, authorization: string): Promise<string> {
  const criada = await page.request.post('/api/sessions', {
    headers: { authorization },
    data: {
      title: `Café com a Ana ${Date.now()}`,
      kind: 'live',
      sourceLang: 'en',
      targetLang: 'pt',
      utterances: FALAS.map(([sourceText, translatedText], i) => ({
        idx: i,
        sourceLang: 'en',
        targetLang: 'pt',
        speakerName: i % 2 ? 'Beto' : 'Ana',
        sourceText,
        translatedText,
        tStartMs: i * 2000,
        tEndMs: i * 2000 + 1500,
      })),
    },
  })
  expect(criada.ok(), await criada.text()).toBe(true)
  const corpo = (await criada.json()) as { id?: string; session?: { id?: string } }
  const id = corpo.id ?? corpo.session?.id
  expect(id, JSON.stringify(corpo).slice(0, 200)).toBeTruthy()
  return id as string
}

async function abrirRevisao(page: Page, id: string) {
  await page.goto(`/sessao/${id}`)
  await chegarEm(page, page.getByRole('group', { name: 'Transcrição da sessão' }))
  await expect(page.locator('.qs-fala .qs-t').first()).toHaveText(FALAS[0][1], { timeout: 30_000 })
}

async function autorizarSePedir(page: Page, secao: ReturnType<Page['getByRole']>) {
  const autorizar = secao.getByRole('button', { name: /Autorizar IA de nuvem/ })
  if (await autorizar.isVisible().catch(() => false)) await clicar(page, autorizar)
}

test('computador, Grátis: resume, adiciona só os marcados e, no 2º da semana, só "já foi usado"', async ({ page }) => {
  test.slow()
  const escapadas = await semIaDeVerdade(page)
  await flagIaDeEstudo(page, true)
  const authorization = await entrar(page, { premium: false })
  const pedidos: Array<Record<string, unknown>> = []
  let chamada = 0
  await page.route('**/api/ai/resumir', async (route) => {
    pedidos.push(route.request().postDataJSON() as Record<string, unknown>)
    chamada += 1
    if (chamada === 1) {
      await route.fulfill({ json: { pontos: PONTOS, cartoes: CARTOES, origem: 'amostra', restanteNaAmostra: 0 } })
    } else {
      await route.fulfill({
        status: 402,
        json: { error: 'O resumo desta semana já foi usado.', code: 'amostra_acabou' },
      })
    }
  })
  const lotes: Array<Array<Record<string, unknown>>> = []
  await page.route('**/api/vocab/bulk-add', async (route) => {
    const corpo = route.request().postDataJSON() as { cards: Array<Record<string, unknown>> }
    lotes.push(corpo.cards)
    await route.fulfill({
      json: {
        cards: [
          {
            id: `e2e-${Date.now()}`,
            word: 'grab a coffee',
            back: 'tomar um café',
            sentence: 'We should grab a coffee sometime.',
            srcLang: 'en',
            tgtLang: 'pt-BR',
            sessionId: null,
          },
        ],
        skipped: [{ word: 'piece of cake', motivo: 'duplicada' }],
      },
    })
  })
  const id = await semearSessao(page, authorization)

  await abrirRevisao(page, id)
  const secao = page.getByRole('region', { name: 'Resumo da sessão' })
  await expect(secao).toBeVisible({ timeout: 15_000 })
  await autorizarSePedir(page, secao)
  await clicar(page, secao.getByRole('button', { name: 'Resumir a sessão' }))
  await expect(secao.getByTestId('resumo-da-sessao')).toBeVisible({ timeout: 15_000 })
  for (const p of PONTOS) await expect(secao).toContainText(p)
  expect(pedidos[0]).toEqual({ sessionId: id, lang: expect.stringMatching(/^pt/) })
  await expect(secao.getByRole('checkbox')).toHaveCount(3)
  await expect(secao).toContainText('Você usou 1 de 1 resumo nesta semana.')
  await expect(secao).toContainText('Isto é uma IA')
  /* A foto mostra os pontos e o botão de adicionar acima do player preso embaixo. */
  await secao.getByTestId('resumo-da-sessao').evaluate((el) => el.scrollIntoView({ block: 'center' }))
  await foto(page, 'task-3-resumo-na-revisao-1280')

  // Desmarca um e adiciona os outros dois.
  await clicar(page, secao.getByRole('checkbox', { name: /running late/ }))
  await clicar(page, secao.getByRole('button', { name: 'Adicionar 2 cartões' }))
  await expect(secao).toContainText('1 cartão entrou no seu baralho.')
  await expect(secao).toContainText('piece of cake: Já está no seu baralho')
  expect(lotes).toHaveLength(1)
  expect(lotes[0].map((c) => c.word)).toEqual(['grab a coffee', 'piece of cake'])
  expect(lotes[0][0]).toMatchObject({ sentence: CARTOES[0].sentence, srcLang: 'en', sessionId: id })

  // Outra visita: o resumo da semana já foi usado. Frase neutra, sem número; o adulto vê o link para os Planos.
  await page.reload()
  await abrirRevisao(page, id)
  const secao2 = page.getByRole('region', { name: 'Resumo da sessão' })
  await clicar(page, secao2.getByRole('button', { name: 'Resumir a sessão' }))
  await expect(secao2).toContainText('O resumo desta semana já foi usado')
  expect(await secao2.getByRole('status').textContent()).not.toMatch(/\d|R\$|%/)
  await clicar(page, secao2.getByRole('button', { name: 'Ver os planos' }))
  await expect(page).toHaveURL(/\/plano(\/|$)/, { timeout: 15_000 })

  expect(postsDeIa(escapadas), 'nenhum pedido de IA de verdade pode sair').toEqual([])
})

test('flag desligada: a revisão não tem o resumo e nada é pedido', async ({ page }) => {
  test.slow()
  const escapadas = await semIaDeVerdade(page)
  await flagIaDeEstudo(page, false)
  const authorization = await entrar(page, { premium: false })
  const id = await semearSessao(page, authorization)
  await abrirRevisao(page, id)
  await expect(page.getByRole('region', { name: 'Resumo da sessão' })).toHaveCount(0)
  await expect(page.getByRole('button', { name: 'Resumir a sessão' })).toHaveCount(0)
  expect(postsDeIa(escapadas)).toEqual([])
})

test.describe('celular', () => {
  const { defaultBrowserType: _navegador, ...pixel7 } = devices['Pixel 7']
  test.use({ ...pixel7, viewport: { width: 375, height: 812 } })

  test('Premium: o resumo na revisão, sem contador', async ({ page }) => {
    test.slow()
    const escapadas = await semIaDeVerdade(page)
    await flagIaDeEstudo(page, true)
    const authorization = await entrar(page, { premium: true })
    await page.route('**/api/ai/resumir', (route) =>
      route.fulfill({ json: { pontos: PONTOS, cartoes: CARTOES, origem: 'plano', restanteNaAmostra: null } }),
    )
    const id = await semearSessao(page, authorization)
    await abrirRevisao(page, id)
    const secao = page.getByRole('region', { name: 'Resumo da sessão' })
    await secao.scrollIntoViewIfNeeded()
    await autorizarSePedir(page, secao)
    await clicar(page, secao.getByRole('button', { name: 'Resumir a sessão' }))
    await expect(secao.getByTestId('resumo-da-sessao')).toBeVisible({ timeout: 15_000 })
    await expect(secao).toContainText(PONTOS[0])
    await expect(secao.getByRole('button', { name: 'Adicionar 3 cartões' })).toBeVisible()
    await expect(secao).not.toContainText(/de 1 resumo/)
    /* Nada vaza para o lado no celular. */
    const largura = await page.evaluate(() => document.documentElement.scrollWidth)
    expect(largura).toBeLessThanOrEqual(375)
    /* A foto mostra os pontos e o botão de adicionar acima do player preso embaixo. */
    await secao.getByTestId('resumo-da-sessao').evaluate((el) => el.scrollIntoView({ block: 'center' }))
    await foto(page, 'task-3-resumo-na-revisao-375')
    expect(postsDeIa(escapadas)).toEqual([])
  })
})
