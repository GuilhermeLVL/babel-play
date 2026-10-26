import path from 'node:path'

import { expect, type Page, test } from '@playwright/test'

import { fecharSobreposicoes } from './_helpers'

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
    await fecharSobreposicoes(page)

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

test.describe('Leitor — privacidade do conteúdo do livro', () => {
  /* `remoto.epub`: imagem, srcset, poster, vídeo, áudio, SVG <image>, <link>, @import, @font-face e background
     apontando para `rastreio.example`. Nenhum pedido pode sair da página para outro host. */
  test('nenhum recurso remoto do EPUB é pedido; o interno (capa.png) carrega', async ({ page, baseURL }) => {
    test.slow()
    const app = new URL(baseURL ?? 'http://localhost:3100').host
    const deFora: string[] = []
    page.context().on('request', (r) => {
      const u = new URL(r.url())
      if (/^https?:$/.test(u.protocol) && u.host !== app) deFora.push(r.url())
    })
    await page.goto('/leitor')
    await expect(page.getByTestId('estante')).toBeVisible({ timeout: 30_000 })
    /* Só conta o que vem DEPOIS de abrir o livro: o app em si pode buscar modelos e glosas. */
    deFora.length = 0
    await page.getByTestId('abrir-arquivo').setInputFiles(path.resolve('tests', 'fixtures', 'livros', 'remoto.epub'))
    await expect(page.locator('[data-testid=leitor][data-estado=pronto]')).toBeVisible({ timeout: 30_000 })
    await fecharSobreposicoes(page)
    let capitulo = page.frames().find((f) => f.url().startsWith('blob:'))
    await expect(async () => {
      capitulo = page.frames().find((f) => f.url().startsWith('blob:'))
      await expect(capitulo!.getByText('must not call anyone outside')).toBeVisible({ timeout: 1000 })
    }).toPass({ timeout: 15_000 })
    // O recurso do próprio livro carrega (a limpeza não quebrou o que é interno).
    await expect
      .poll(() =>
        capitulo!.evaluate(
          () => (document.querySelector('img[alt=capa]') as HTMLImageElement | null)?.naturalWidth ?? 0,
        ),
      )
      .toBe(1)
    await page.waitForTimeout(1500)
    expect(deFora.filter((u) => u.includes('rastreio.example'))).toEqual([])
    expect(deFora).toEqual([])
  })
})
