import path from 'node:path'

import { expect, type Page, test } from '@playwright/test'

/**
 * O LIVRO NUNCA EXECUTA NA ORIGEM DO APP (revisão de segurança de 26/10/2026, `src/lib/leitor/foliate/PATCHES.md`).
 *
 * `tests/fixtures/livros/malicioso.epub` traz um vetor por linha — `<script>` inline e por `src`, `onload`,
 * `onerror`, link `javascript:`, `<script>` em SVG inline e em arquivo SVG (imagem, `<object>`, `<iframe>`),
 * `<iframe srcdoc>`, e um capítulo XML com XSLT. Cada um tentaria escrever em `window.top.__pwned`. O teste
 * abre o livro, passa pelos dois capítulos, clica no link `javascript:` e confere que `__pwned` continua
 * `undefined` — na página e em todo frame. Em desenvolvimento a CSP é só relatório (`Report-Only`): o que
 * barra aqui é o sandbox sem `allow-scripts`, a lista de tipos do motor e a limpeza do HTML, e não a CSP.
 */

const HOSTIL = path.resolve('tests', 'fixtures', 'livros', 'malicioso.epub')

async function pwnedEmTodaParte(page: Page): Promise<unknown[]> {
  const valores: unknown[] = []
  for (const f of page.frames()) {
    valores.push(await f.evaluate(() => (window as unknown as { __pwned?: unknown }).__pwned).catch(() => undefined))
  }
  return valores.filter((v) => v !== undefined)
}

test.describe('Leitor — segurança do conteúdo do livro', () => {
  test('nenhum vetor do EPUB hostil executa (script, on*, javascript:, SVG, srcdoc, XSLT)', async ({ page }) => {
    test.slow()
    const popups: string[] = []
    page.context().on('page', (p) => popups.push(p.url()))
    await page.goto('/leitor')
    await expect(page.getByTestId('estante')).toBeVisible({ timeout: 30_000 })
    await page.getByTestId('abrir-arquivo').setInputFiles(HOSTIL)
    await expect(page.locator('[data-testid=leitor][data-estado=pronto]')).toBeVisible({ timeout: 30_000 })

    // O capítulo seguro abriu, sem `allow-scripts` no iframe.
    let capitulo = page.frames().find((f) => f.url().startsWith('blob:'))
    await expect(async () => {
      capitulo = page.frames().find((f) => f.url().startsWith('blob:'))
      expect(capitulo).toBeTruthy()
      await expect(capitulo!.getByText('safe text of the hostile book')).toBeVisible({ timeout: 1000 })
    }).toPass({ timeout: 15_000 })
    const sandbox = await capitulo!.frameElement().then((el) => el.getAttribute('sandbox'))
    expect(sandbox).toBe('allow-same-origin')

    // O link `javascript:` saiu do HTML; clicar onde ele estava não faz nada.
    const link = capitulo!.locator('#link-js')
    expect(await link.getAttribute('href')).toBeNull()
    await link.click()
    /* Sem `href`, o texto do link é texto: o toque abre a folha da palavra, que se fecha. */
    await page.waitForTimeout(500)
    await page.keyboard.press('Escape')
    await expect(page.getByTestId('folha-da-palavra')).toBeHidden()

    // O capítulo XML com XSLT (fora da lista de tipos): passar por ele não executa nada.
    await page.getByRole('button', { name: 'Próxima página' }).click()
    await page.getByRole('button', { name: 'Próxima página' }).click()
    await page.waitForTimeout(1500)

    expect(await pwnedEmTodaParte(page)).toEqual([])
    expect(popups).toEqual([])
  })
})
