/**
 * A PORTA DE LOGIN NO PSEUDO-IDIOMA — o mesmo teste de `tests/e2e/pseudo-localizacao.e2e.ts`,
 * mas aqui, porque só aqui existe porta.
 *
 * A suíte comum roda em self-host (sem Supabase), e lá o `<Login/>` nem monta (ver
 * `tests/e2e/login.e2e.ts`). Varrer "a tela de login" naquela suíte daria verde sem tocar nela.
 * Com `playwright.publico.config.ts` o app sobe com `AUTH_REQUIRED=1` e a porta é a de verdade.
 *
 * Aqui o relato vira PORTÃO: a porta inteira passa por `t()` (Login, cadastro, "esqueci a senha"),
 * então uma frase em português limpo no meio do pseudo é regressão, não pendência de migração.
 * Também vale o outro lado do pseudo: nada pode cortar com o texto 40% mais longo.
 *
 *   npx playwright test -c playwright.publico.config.ts login-pseudo
 */
import { readFileSync } from 'node:fs'

import { expect, type Page, test } from '@playwright/test'

// O Playwright carrega este arquivo como módulo ES: sem `__dirname`, o caminho sai de `import.meta.url`.
const PSEUDO = JSON.parse(readFileSync(new URL('../../public/i18n/xx.json', import.meta.url), 'utf8')) as Record<
  string,
  string
>
const px = (frase: string) => PSEUDO[frase] ?? frase

/** Texto de interface que sobrou sem pseudo: nós de texto, `aria-label` e `placeholder`. */
async function frasesSemPseudo(page: Page) {
  return page.evaluate(() => {
    // O pseudo acentua toda vogal minúscula; vogal limpa = frase que não passou por `t()`.
    const VOGAL_LIMPA = /[aeiou]/
    const MARCA = new Set(['Babel Play'])
    const achadas = new Set<string>()
    const anda = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT)
    for (let n = anda.nextNode(); n; n = anda.nextNode()) {
      const el = n.parentElement
      if (!el || el.closest('code, script, style') || (el.checkVisibility && !el.checkVisibility())) continue
      const texto = (n.textContent ?? '').trim()
      if (texto && !MARCA.has(texto) && VOGAL_LIMPA.test(texto)) achadas.add(texto.slice(0, 80))
    }
    for (const el of document.querySelectorAll('[aria-label], [placeholder]')) {
      for (const atributo of ['aria-label', 'placeholder']) {
        const v = el.getAttribute(atributo)
        if (v && VOGAL_LIMPA.test(v)) achadas.add(`${atributo}="${v.slice(0, 70)}"`)
      }
    }
    return [...achadas]
  })
}

/** Mesmo critério de `elementosQueEstouram` da suíte comum: só texto de interface que corta. */
async function textoQueCorta(page: Page) {
  return page.evaluate(() => {
    const DO_PSEUDO = /[öñšžĴĜÁÉÍÖÜÇÑ·]/
    const fora: string[] = []
    for (const el of document.querySelectorAll<HTMLElement>('button, a, label, h1, h2, p, span')) {
      const texto = (el.textContent ?? '').trim()
      if (texto.length < 3 || !DO_PSEUDO.test(texto)) continue
      const estilo = getComputedStyle(el)
      if (estilo.overflow === 'visible' && estilo.textOverflow !== 'ellipsis') continue
      const sobra = el.scrollWidth - el.clientWidth
      if (sobra > 2) fora.push(`${sobra}px · "${texto.slice(0, 60)}"`)
    }
    return fora
  })
}

async function abrirLoginEmPseudo(page: Page) {
  await page.goto('/?ui=xx')
  /* "Sua conta" ainda não está em catálogo nenhum, então o pseudo não a acentua: `px` devolve o
     português enquanto isso, e o nome acentuado quando a frase ganhar tradução. */
  await page.getByRole('button', { name: px('Sua conta'), exact: true }).click({ timeout: 60_000 })
  await page.getByRole('menuitem', { name: px('Entrar ou criar conta') }).click()
  await expect(page.getByRole('heading', { name: px('Entrar') })).toBeVisible()
  expect(await page.evaluate(() => document.documentElement.lang), 'o pseudo-idioma não carregou').toBe('xx')
}

test('a porta de login inteira passa por t(): entrar, criar conta e esqueci a senha', async ({ page }) => {
  test.slow()
  await abrirLoginEmPseudo(page)
  expect(await frasesSemPseudo(page), 'entrar').toEqual([])
  expect(await textoQueCorta(page), 'entrar: texto 40% mais longo cortou').toEqual([])

  await page.getByRole('button', { name: px('Criar uma conta') }).click()
  await expect(page.getByRole('heading', { name: px('Criar conta') })).toBeVisible()
  expect(await frasesSemPseudo(page), 'criar conta').toEqual([])
  expect(await textoQueCorta(page), 'criar conta: texto 40% mais longo cortou').toEqual([])

  await page
    .getByRole('button', { name: px('Entrar'), exact: true })
    .last()
    .click()
  await page.getByRole('button', { name: px('Esqueci') }).click()
  await expect(page.getByRole('heading', { name: px('Recuperar senha') })).toBeVisible()
  expect(await frasesSemPseudo(page), 'esqueci a senha').toEqual([])
  expect(await textoQueCorta(page), 'esqueci a senha: texto 40% mais longo cortou').toEqual([])
})
