import { createHash } from 'node:crypto'
import { readFileSync } from 'node:fs'
import path from 'node:path'

import { expect, type Frame, type Page, test } from '@playwright/test'

import { comFlags } from './_interprete'

/**
 * O DESTAQUE POR VOCABULÁRIO NO LEITOR (flag `leitor_destaque_vocab`; openspec `leitura-assistida`, Fatia C), de ponta a
 * ponta com o EPUB de domínio público dos testes: com a flag ligada e o interruptor aceso, o capítulo ganha grifos pela CSS
 * Custom Highlight API SEM mudar o DOM do livro; tocar numa palavra mostra a força em 1 toque; "Já sei" tira o grifo da
 * palavra em todo o capítulo. Com a flag desligada, nada disso existe.
 */
const FIXTURE = path.resolve('tests', 'fixtures', 'livros', 'fabulas-cc0.epub')
const LIVRO_ID = `arq:${createHash('sha256').update(readFileSync(FIXTURE)).digest('hex').slice(0, 32)}`

const leitorPronto = (page: Page) => page.locator('[data-testid=leitor][data-estado=pronto]')

async function quadroCom(page: Page, texto: string): Promise<Frame> {
  let achado: Frame | undefined
  await expect(async () => {
    for (const f of page.frames()) {
      if (!f.url().startsWith('blob:')) continue
      if (
        await f
          .getByText(texto, { exact: false })
          .count()
          .catch(() => 0)
      ) {
        achado = f
        return
      }
    }
    throw new Error(`nenhum capítulo com "${texto}" ainda`)
  }).toPass({ timeout: 15_000 })
  return achado!
}

/** Quantos ranges estão grifados no documento (soma dos grifos `frasy-v-*`). */
const grifados = (f: Frame) =>
  f.evaluate(() => {
    const h = (CSS as unknown as { highlights?: Map<string, { size: number }> }).highlights
    if (!h) return -1
    let n = 0
    for (const [nome, g] of h) if (nome.startsWith('frasy-v-')) n += g.size
    return n
  })

async function abrirLivro(page: Page) {
  /* A conquista "Ouvinte" (de outras suítes que usam o mesmo banco) cobre a tela: resgata e segue. */
  await page.addLocatorHandler(page.getByRole('button', { name: 'Resgatar e continuar' }), (b) => b.click())
  await page.goto('/leitor')
  await expect(page.getByTestId('estante')).toBeVisible({ timeout: 30_000 })
  await page.evaluate(() => {
    localStorage.removeItem('leitor:perfil')
    localStorage.removeItem('leitor:destaque-vocab')
  })
  await page.getByTestId('abrir-arquivo').setInputFiles(FIXTURE)
  await expect(page).toHaveURL(/\/leitor\/arq%3A[0-9a-f]{32}$/)
  expect(decodeURIComponent(page.url().split('/leitor/')[1])).toBe(LIVRO_ID)
  await expect(leitorPronto(page)).toBeVisible({ timeout: 30_000 })
}

test.describe('Leitor: destaque por vocabulário', () => {
  test('flag desligada: nenhum interruptor, nenhum grifo, cartão de sempre', async ({ page }) => {
    test.slow()
    await comFlags(page, { leitor_destaque_vocab: false })
    await abrirLivro(page)
    const fox = await quadroCom(page, 'hungry fox')
    await page.getByRole('button', { name: /Aparência/ }).click()
    await expect(page.getByTestId('painel-tipografia')).toBeVisible()
    await expect(page.getByTestId('legenda-do-destaque')).toHaveCount(0)
    expect(await grifados(fox)).toBeLessThanOrEqual(0)
    await page.getByRole('button', { name: 'Fechar o painel' }).click()
    await fox
      .getByText('orchard', { exact: false })
      .first()
      .click({ position: { x: 4, y: 6 } })
    await expect(page.getByTestId('folha-da-palavra')).toBeVisible({ timeout: 15_000 })
    await expect(page.getByRole('group', { name: 'Quanto você sabe esta palavra' })).toHaveCount(0)
  })

  test('flag ligada: grifa sem mexer no DOM, mostra a força em 1 toque e "Já sei" tira o grifo', async ({ page }) => {
    test.slow()
    await comFlags(page, { leitor_destaque_vocab: true })
    await abrirLivro(page)
    const fox = await quadroCom(page, 'hungry fox')
    const textoAntes = await fox.evaluate(() => document.body.innerHTML)

    await page.getByRole('button', { name: /Aparência/ }).click()
    const legenda = page.getByTestId('legenda-do-destaque')
    await expect(legenda).toBeVisible()
    // Nasce desligado, e a opção de marcar ao paginar nasce desligada também.
    const interruptor = legenda.getByRole('checkbox', { name: /Destacar as palavras pelo seu vocabulário/ })
    await expect(interruptor).not.toBeChecked()
    await interruptor.check({ force: true })
    await expect(legenda.getByRole('list', { name: 'Legenda do destaque' })).toBeVisible()
    await expect(legenda.getByRole('checkbox', { name: /Virar a página marca como conhecidas/ })).not.toBeChecked()

    // O capítulo ganha grifos (se o navegador tem a API) e o DOM do livro fica idêntico.
    await expect.poll(() => grifados(fox), { timeout: 20_000 }).not.toBe(0)
    const total = await grifados(fox)
    if (total < 0) test.skip(true, 'navegador sem CSS.highlights: sem grifo, sem erro (coberto no teste de unidade)')
    expect(total).toBeGreaterThan(5)
    expect(await fox.evaluate(() => document.body.innerHTML)).toBe(textoAntes)
    await expect(legenda.getByRole('meter', { name: 'Palavras novas neste capítulo' })).toBeVisible()
    await page.getByRole('button', { name: 'Fechar o painel' }).click()

    // Tocar numa palavra: a força em 1 toque, no lugar do "Salvar".
    await fox
      .getByText('orchard', { exact: false })
      .first()
      .click({ position: { x: 4, y: 6 } })
    const folha = page.getByTestId('folha-da-palavra')
    await expect(folha).toBeVisible({ timeout: 15_000 })
    const forca = folha.getByRole('group', { name: 'Quanto você sabe esta palavra' })
    await expect(forca.getByRole('button')).toHaveCount(4)

    // "Já sei": o grifo da palavra some em TODAS as ocorrências e volta ao desfazer.
    await folha.getByRole('button', { name: 'Já sei' }).click()
    await expect.poll(() => grifados(fox), { timeout: 5_000 }).toBeLessThan(total)
    await folha.getByRole('button', { name: 'Desfazer' }).click()
    await expect.poll(() => grifados(fox), { timeout: 5_000 }).toBe(total)
  })
})
