import { expect, type Locator, type Page, test } from '@playwright/test'

import { violacoesGraves } from './_acessibilidade'
import { assentar, clicarRobusto, fecharSobreposicoes, verSemSobreposicao } from './_helpers'

/**
 * O PAINEL DA FRASE (pedido do dono, 24/10/2026): tocar numa frase da legenda não cobre mais a tela com uma
 * folha modal e fundo escuro. O que se prova, na Captura ao vivo com falas (o gancho `__simFalas`):
 *
 *   · 1280: o painel abre À DIREITA, sem diálogo; NENHUMA linha da legenda fica por baixo dele (caixas);
 *     a legenda continua clicável: tocar noutra frase troca o conteúdo do mesmo painel; Esc fecha e o foco
 *     volta para a frase;
 *   · 375: a folha baixa deixa a legenda à vista ACIMA dela, e uma frase acima dela continua tocável;
 *   · axe sem violação grave com o painel aberto, em 375, 768 e 1280.
 *
 * Fotos de conferência só com `FOTOS_DIR`.
 */

const FALAS = [
  'So what are you planning for the weekend?',
  'The weather is supposed to be great this weekend.',
  'We could go hiking in the mountains near the lake.',
  'I would love that, let me check my calendar first.',
]

async function foto(page: Page, nome: string) {
  const dir = process.env.FOTOS_DIR
  if (dir) await page.screenshot({ path: `${dir}/${nome}.png` })
}

async function capturaComFalas(page: Page) {
  await page.goto('/capturar')
  await expect(page.getByTestId('captura-do-prototipo')).toBeVisible({ timeout: 20_000 })
  await assentar(page)
  await page.waitForFunction(() => typeof (window as unknown as { __simFalas?: unknown }).__simFalas === 'function')
  await page.evaluate((t) => (window as unknown as { __simFalas: (t: string[]) => number }).__simFalas(t), FALAS)
  for (const f of FALAS) await expect(linha(page, f)).toBeVisible({ timeout: 10_000 })
  await fecharSobreposicoes(page)
}

const linha = (page: Page, texto: string) => page.locator('.q-linha-da-fala').filter({ hasText: texto })
const painel = (page: Page) => page.getByRole('complementary', { name: 'Frase escolhida' })

const caixa = async (l: Locator) => {
  const b = await l.boundingBox()
  if (!b) throw new Error('sem caixa')
  return b
}
const cruzam = (a: { x: number; y: number; width: number; height: number }, b: typeof a) =>
  a.x < b.x + b.width && b.x < a.x + a.width && a.y < b.y + b.height && b.y < a.y + a.height

test('1280: o painel abre à direita, a legenda segue inteira e clicável, Esc fecha e o foco volta', async ({
  page,
}) => {
  test.skip(test.info().project.name !== 'desktop-1280', 'a geometria do computador')
  test.slow()
  await capturaComFalas(page)

  await clicarRobusto(page, linha(page, 'supposed').locator('.q-fala'))
  const p = painel(page)
  await verSemSobreposicao(page, p)
  await expect(page.getByRole('dialog', { name: 'Ações', exact: true })).toHaveCount(0)
  await expect(p.locator('.folha-frase')).toHaveText(FALAS[1])
  await expect(linha(page, 'supposed').locator('.q-fala')).toHaveAttribute('aria-current', 'true')
  for (const nome of ['Ouvir', 'Ouvir devagar', 'Repetir eu', 'Copiar'])
    await expect(p.getByRole('button', { name: nome, exact: true })).toBeVisible()

  // O × inteiro dentro da janela, com alvo de pelo menos 44 px (medido depois da entrada de 260 ms).
  await page.evaluate(() => Promise.all(document.getAnimations().map((a) => a.finished.catch(() => undefined))))
  const x = await caixa(p.getByRole('button', { name: 'Fechar' }))
  expect(x.width).toBeGreaterThanOrEqual(44)
  expect(x.height).toBeGreaterThanOrEqual(44)
  expect(x.y).toBeGreaterThanOrEqual(0)
  expect(x.x + x.width).toBeLessThanOrEqual(1280)

  // À direita, encostado na borda da janela, e nada da legenda por baixo dele.
  const doPainel = await caixa(p)
  expect(doPainel.x + doPainel.width).toBeGreaterThanOrEqual(1279)
  expect(doPainel.width).toBeGreaterThanOrEqual(360)
  expect(doPainel.width).toBeLessThanOrEqual(420)
  const linhas = page.locator('.q-linha-da-fala')
  for (let i = 0; i < (await linhas.count()); i++) expect(cruzam(await caixa(linhas.nth(i)), doPainel)).toBe(false)
  await foto(page, 'painel-1280-captura')
  expect(await violacoesGraves(page)).toEqual([])

  // A legenda continua clicável: outra frase troca o conteúdo do MESMO painel.
  const antes = await p.elementHandle()
  await linha(page, 'hiking').locator('.q-fala').click()
  await expect(p.locator('.folha-frase')).toHaveText(FALAS[2])
  expect(await p.evaluate((el, a) => el === a, antes)).toBe(true)
  await expect(linha(page, 'hiking').locator('.q-fala')).toHaveAttribute('aria-current', 'true')
  await expect(linha(page, 'supposed').locator('.q-fala')).not.toHaveAttribute('aria-current', 'true')

  // Esc fecha (o foco está na frase tocada, fora de qualquer campo) e o foco fica na frase.
  await p.getByRole('button', { name: 'Ouvir devagar' }).focus()
  await page.keyboard.press('Escape')
  await expect(p).toHaveCount(0)
  await expect(linha(page, 'hiking').locator('.q-fala')).toBeFocused()
  // A legenda volta à largura toda.
  expect((await caixa(page.locator('.q-historico'))).width).toBeGreaterThan(1000)

  // Pelo teclado: Enter na frase abre o painel com o foco nele; × fecha e o foco volta.
  await linha(page, 'calendar').locator('.q-fala').focus()
  await page.keyboard.press('Enter')
  await expect(p).toBeFocused()
  await page.keyboard.press('Tab')
  await expect(p.getByRole('button', { name: 'Fechar' })).toBeFocused()
  await page.keyboard.press('Enter')
  await expect(p).toHaveCount(0)
  await expect(linha(page, 'calendar').locator('.q-fala')).toBeFocused()
})

test('375: a folha baixa deixa a legenda à vista acima dela, e outra frase continua tocável', async ({ page }) => {
  test.skip(test.info().project.name !== 'mobile-375', 'a folha baixa do celular')
  test.slow()
  await capturaComFalas(page)

  await clicarRobusto(page, linha(page, 'calendar').locator('.q-fala'))
  const p = painel(page)
  await verSemSobreposicao(page, p)
  await expect(page.getByRole('dialog', { name: 'Ações', exact: true })).toHaveCount(0)
  await page.evaluate(() => Promise.all(document.getAnimations().map((a) => a.finished.catch(() => undefined))))
  const folha = await caixa(p)
  // Folha baixa: a largura da barra (cartão com 12 px de margem), entre ~40% e ~50% da altura.
  expect(folha.width).toBeGreaterThanOrEqual(345)
  expect(folha.height).toBeGreaterThan(812 * 0.3)
  expect(folha.height).toBeLessThan(812 * 0.55)
  // A frase escolhida rola para cima da folha e fica à vista (a rolagem é suave: espera assentar).
  await expect
    .poll(async () => {
      const e = await caixa(linha(page, 'calendar').locator('.q-fala'))
      return e.y + e.height <= folha.y + 1 && e.y >= 0
    })
    .toBe(true)
  await foto(page, 'painel-375-captura')
  /* Só o painel: a faixa da captura pronta, atrás da barra do celular, já acusa `target-size` sem ele
     (anotado no relatório de 24/10/2026, fora deste escopo). */
  expect(await violacoesGraves(page, ['.painel-da-frase'])).toEqual([])

  /* A folha fica ACIMA da barra do app (o microfone do meio dela segue tocável) e rola até o fim sem nada
     coberto: a última ação e a última palavra aparecem inteiras acima da barra. */
  const barra = await caixa(page.locator('.q-trilho'))
  expect(folha.y + folha.height).toBeLessThanOrEqual(barra.y)
  const ultimaAcao = p.locator('.folha-acao').last()
  const ultimaPalavra = p.locator('.folha-palavras button').last()
  for (const alvo of [ultimaAcao, ultimaPalavra]) {
    await alvo.scrollIntoViewIfNeeded()
    const c = await caixa(alvo)
    expect(c.y).toBeGreaterThanOrEqual(folha.y)
    expect(c.y + c.height).toBeLessThanOrEqual(Math.min(barra.y, folha.y + folha.height))
    const noCentro = await page.evaluate(
      ([cx, cy]) => document.elementFromPoint(cx, cy)?.closest('.painel-da-frase') !== null,
      [c.x + c.width / 2, c.y + c.height / 2],
    )
    expect(noCentro, 'nada por cima do alvo').toBe(true)
  }
  const mic = await caixa(page.locator('.q-trilho .q-item').nth(2))
  expect(
    await page.evaluate(
      ([cx, cy]) => !!document.elementFromPoint(cx, cy)?.closest('.q-trilho'),
      [mic.x + mic.width / 2, mic.y + mic.height / 2],
    ),
    'o microfone da barra continua à mão',
  ).toBe(true)

  // "Ir para a fala atual", se aparecer, fica acima da folha.
  const irAoFim = page.getByRole('button', { name: 'Ir para a fala atual' })
  if (await irAoFim.isVisible())
    expect((await caixa(irAoFim)).y + (await caixa(irAoFim)).height).toBeLessThanOrEqual(folha.y)

  // Outra frase, acima da folha, continua tocável: troca o conteúdo.
  const outra = linha(page, 'hiking').locator('.q-fala')
  await outra.scrollIntoViewIfNeeded()
  expect((await caixa(outra)).y).toBeLessThan(folha.y)
  await outra.click()
  await expect(p.locator('.folha-frase')).toHaveText(FALAS[2])

  // A alça expande e recolhe; × fecha.
  await p.getByRole('button', { name: 'Expandir' }).click()
  await expect(p).toHaveAttribute('data-altura', 'cheia')
  await p.getByRole('button', { name: 'Recolher' }).click()
  await expect(p).toHaveAttribute('data-altura', 'meia')
  await p.getByRole('button', { name: 'Fechar' }).click()
  await expect(p).toHaveCount(0)
})

test('768: a folha baixa no tablet, sem violação grave', async ({ page }) => {
  test.skip(test.info().project.name !== 'tablet-768', 'o tablet em pé')
  test.slow()
  await capturaComFalas(page)
  await clicarRobusto(page, linha(page, 'supposed').locator('.q-fala'))
  const p = painel(page)
  await verSemSobreposicao(page, p)
  await expect(p).toHaveAttribute('data-modo', 'baixo')
  expect(await violacoesGraves(page)).toEqual([])
})
