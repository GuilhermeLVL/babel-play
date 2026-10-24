/**
 * PLANOS V4, ETAPA 2 (Task 2) — "EXPLICAR ESTA FRASE" NA FOLHA DA FRASE, ponta a ponta.
 *
 * Roda com `playwright.publico.config.ts`: login de verdade no Supabase falso, a flag `ia_de_estudo`
 * ligada NA PÁGINA (`/api/flags`, como os outros e2e) e a rota `POST /api/ai/explicar` SIMULADA — nenhum
 * pedido de IA de verdade sai (`semIaDeVerdade`). O que se prova:
 *
 *   1. flag desligada: a folha da frase é a de sempre, sem a seção;
 *   2. computador (1280), Grátis, na Sessão: o botão pede a explicação (com a tradução, os idiomas e o
 *      contexto), os blocos aparecem, "Isto é uma IA" e o contador da amostra; a 6ª diz só "a amostra de
 *      hoje acabou", sem número, e o adulto vê o link neutro para os Planos;
 *   3. celular (375), Premium, na captura: o mesmo botão na folha e os mesmos blocos, sem contador.
 *
 * Fotos de conferência só com `FOTOS_DIR` (a folha com a explicação, no 375 e no 1280).
 *
 *   npx playwright test -c playwright.publico.config.ts explicacao
 */
import { devices, expect, type Page, test } from '@playwright/test'

import { chegarEm, clicar, entrar, postsDeIa, semIaDeVerdade } from './_nuance'

const EXPLICACAO = {
  porQue: 'Mantive o condicional do original com "teria ido".',
  gramatica: 'Terceiro condicional: would have mais o particípio.',
  registro: 'Neutro, serve na fala e na escrita.',
  girias: [{ termo: 'gonna', sentido: 'forma falada de going to' }],
}

async function flagIaDeEstudo(page: Page, ligada: boolean) {
  await page.route('**/api/flags', (r) => r.fulfill({ json: { flags: { ia_de_estudo: { ligada } } } }))
}

async function foto(page: Page, nome: string) {
  const dir = process.env.FOTOS_DIR
  if (dir) await page.screenshot({ path: `${dir}/${nome}.png` })
}

async function semearSessao(page: Page, authorization: string, n: number) {
  const title = `Aula da explicação ${Date.now()}`
  const criada = await page.request.post('/api/sessions', {
    headers: { authorization },
    data: {
      title,
      kind: 'live',
      sourceLang: 'en',
      targetLang: 'pt',
      utterances: Array.from({ length: n }, (_, i) => ({
        idx: i,
        sourceLang: 'en',
        targetLang: 'pt',
        speakerName: 'Ana',
        sourceText: `sentence number ${i}`,
        translatedText: `frase número ${i}`,
        tStartMs: i * 2000,
        tEndMs: i * 2000 + 1500,
      })),
    },
  })
  expect(criada.ok(), await criada.text()).toBe(true)
  return title
}

async function abrirSessao(page: Page, titulo: string) {
  await page.goto('/biblioteca')
  const busca = page.getByLabel('Buscar por título')
  await chegarEm(page, busca)
  await busca.fill(titulo)
  const linha = page.getByRole('group', { name: 'Gravações' }).locator('.q-linha').filter({ hasText: titulo })
  await clicar(page, linha)
  const selecionada = page.getByRole('region', { name: 'Gravação selecionada' })
  await expect(selecionada.getByRole('heading', { name: titulo })).toBeVisible()
  await clicar(page, selecionada.getByRole('button', { name: 'Abrir', exact: true }))
  await chegarEm(page, page.getByRole('group', { name: 'Transcrição da sessão' }))
  await expect(page.locator('.qs-fala .qs-t').first()).toHaveText('frase número 0', { timeout: 30_000 })
}

test('computador, Grátis: explica a frase na folha, mostra o contador e, na 6ª, só "a amostra acabou"', async ({
  page,
}) => {
  test.slow()
  const escapadas = await semIaDeVerdade(page)
  await flagIaDeEstudo(page, true)
  const authorization = await entrar(page, { premium: false })
  const pedidos: Array<Record<string, unknown>> = []
  let chamada = 0
  await page.route('**/api/ai/explicar', async (route) => {
    pedidos.push(route.request().postDataJSON() as Record<string, unknown>)
    chamada += 1
    if (chamada === 1) {
      await route.fulfill({ json: { explicacao: EXPLICACAO, origem: 'amostra', restanteNaAmostra: 4 } })
    } else {
      /* O pool global esgotado vem com sobra individual: a tela nunca diz o número. */
      await route.fulfill({
        status: 402,
        json: { error: 'A amostra de hoje acabou.', code: 'amostra_acabou', restanteNaAmostra: 3 },
      })
    }
  })
  const titulo = await semearSessao(page, authorization, 3)

  await abrirSessao(page, titulo)
  await clicar(page, page.locator('.qs-fala .qs-fala-texto').first())
  const folha = page.getByRole('dialog', { name: 'Ações', exact: true })
  await expect(folha).toBeVisible()
  const secao = folha.getByRole('region', { name: 'Explicar esta frase' })
  await expect(secao).toBeVisible({ timeout: 15_000 })

  // A nuvem autorizada (o banco do e2e é reaproveitado), e o pedido.
  const autorizar = secao.getByRole('button', { name: /Autorizar IA de nuvem/ })
  if (await autorizar.isVisible().catch(() => false)) await clicar(page, autorizar)
  await clicar(page, secao.getByRole('button', { name: 'Explicar esta frase' }))
  await expect(secao.getByTestId('explicacao-da-frase')).toBeVisible({ timeout: 15_000 })
  await expect(secao).toContainText('Por que essa tradução')
  await expect(secao).toContainText(EXPLICACAO.porQue)
  await expect(secao).toContainText('Gramática')
  await expect(secao).toContainText('Registro')
  await expect(secao).toContainText('Gíria')
  await expect(secao).toContainText('gonna')
  await expect(secao).toContainText('Isto é uma IA')
  await expect(secao).toContainText('1 de 5')
  expect(pedidos[0]).toMatchObject({
    texto: 'sentence number 0',
    traducao: 'frase número 0',
    lang: expect.stringMatching(/^en/),
    langDaTraducao: expect.stringMatching(/^pt/),
  })
  await secao.scrollIntoViewIfNeeded()
  await foto(page, 'task-2-folha-com-explicacao-1280')

  // Outra frase: a amostra acabou. Frase neutra, sem número; o adulto vê o link para os Planos.
  await page.keyboard.press('Escape')
  await expect(folha).toBeHidden()
  await clicar(page, page.locator('.qs-fala .qs-fala-texto').nth(1))
  const secao2 = page
    .getByRole('dialog', { name: 'Ações', exact: true })
    .getByRole('region', { name: 'Explicar esta frase' })
  await clicar(page, secao2.getByRole('button', { name: 'Explicar esta frase' }))
  await expect(secao2).toContainText('A amostra de hoje acabou')
  expect(await secao2.textContent()).not.toMatch(/\d|R\$|%/)
  await clicar(page, secao2.getByRole('button', { name: 'Ver os planos' }))
  await expect(page).toHaveURL(/\/plano(\/|$)/, { timeout: 15_000 })

  expect(postsDeIa(escapadas), 'nenhum pedido de IA de verdade pode sair').toEqual([])
})

test('flag desligada: a folha da frase não tem a seção e nada é pedido', async ({ page }) => {
  test.slow()
  const escapadas = await semIaDeVerdade(page)
  await flagIaDeEstudo(page, false)
  const authorization = await entrar(page, { premium: false })
  const titulo = await semearSessao(page, authorization, 2)
  await abrirSessao(page, titulo)
  await clicar(page, page.locator('.qs-fala .qs-fala-texto').first())
  const folha = page.getByRole('dialog', { name: 'Ações', exact: true })
  await expect(folha).toBeVisible()
  await expect(folha.locator('.folha-frase')).toHaveText('sentence number 0')
  await expect(folha.getByRole('region', { name: 'Explicar esta frase' })).toHaveCount(0)
  await expect(folha.getByRole('button', { name: 'Explicar esta frase' })).toHaveCount(0)
  expect(postsDeIa(escapadas)).toEqual([])
})

test.describe('celular', () => {
  const { defaultBrowserType: _navegador, ...pixel7 } = devices['Pixel 7']
  test.use({ ...pixel7, viewport: { width: 375, height: 812 } })

  test('Premium: a folha da frase da captura explica a frase', async ({ page }) => {
    test.slow()
    const escapadas = await semIaDeVerdade(page)
    await flagIaDeEstudo(page, true)
    await entrar(page, { premium: true })
    const pedidos: Array<Record<string, unknown>> = []
    await page.route('**/api/ai/mt', (route) =>
      route.fulfill({
        json: { text: 'Eu teria ido se soubesse.', engine: 'server-llm-mt', provenance: { kind: 'ai', origin: 'e2e' } },
      }),
    )
    await page.route('**/api/ai/explicar', async (route) => {
      pedidos.push(route.request().postDataJSON() as Record<string, unknown>)
      await route.fulfill({ json: { explicacao: EXPLICACAO, origem: 'plano', restanteNaAmostra: null } })
    })

    await page.goto('/capturar')
    await chegarEm(page, page.getByTestId('captura-do-prototipo'))
    await page.waitForFunction(() => typeof (window as unknown as { __simFalas?: unknown }).__simFalas === 'function')
    await page.evaluate(
      (falas) => (window as unknown as { __simFalas: (t: string[]) => number }).__simFalas(falas),
      ['Hello there, how are you?', 'I would have gone if I had known.'],
    )
    const balao = page.locator('.q-linha-da-fala').filter({ hasText: 'would have gone' })
    await chegarEm(page, balao)
    await clicar(page, balao.locator('.q-fala'))
    const folha = page.getByRole('dialog', { name: 'Ações', exact: true })
    await expect(folha).toBeVisible()
    const secao = folha.getByRole('region', { name: 'Explicar esta frase' })
    await secao.scrollIntoViewIfNeeded()
    const autorizar = secao.getByRole('button', { name: /Autorizar IA de nuvem/ })
    if (await autorizar.isVisible().catch(() => false)) await clicar(page, autorizar)
    await clicar(page, secao.getByRole('button', { name: 'Explicar esta frase' }))
    await expect(secao.getByTestId('explicacao-da-frase')).toBeVisible({ timeout: 15_000 })
    await expect(secao).toContainText(EXPLICACAO.gramatica)
    await expect(secao).toContainText('Isto é uma IA')
    await expect(secao).not.toContainText(/de 5/)
    expect(pedidos[0]).toMatchObject({
      texto: 'I would have gone if I had known.',
      langDaTraducao: expect.stringMatching(/^pt/),
    })
    await secao.scrollIntoViewIfNeeded()
    await foto(page, 'task-2-folha-com-explicacao-375')
    expect(postsDeIa(escapadas)).toEqual([])
  })
})
