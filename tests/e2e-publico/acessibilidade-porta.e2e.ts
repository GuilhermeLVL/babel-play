/**
 * A PORTA DE LOGIN E CADASTRO SEM VIOLAÇÃO GRAVE DE ACESSIBILIDADE (WCAG 2.2 AA, impacto sério ou
 * crítico, pelo axe — a mesma varredura das telas do app, `tests/e2e/_acessibilidade.ts`).
 *
 * Mora no modo público porque só aqui a porta monta: na suíte comum `dev:local` desliga o login
 * (`tests/e2e/login.e2e.ts`). Os três modos da porta — Entrar, Criar conta e Recuperar senha — no
 * computador (o projeto desta config) e no celular (375 × 812, com toque).
 */
import { expect, type Page, test } from '@playwright/test'

import { violacoesGraves } from '../e2e/_acessibilidade'
import { abrirPortaDeLogin } from './_porta'

const porta = (page: Page) => page.getByTestId('login-do-quest')

async function modoCriarConta(page: Page) {
  await porta(page).getByRole('button', { name: 'Criar uma conta' }).click()
  await expect(page.getByRole('heading', { name: 'Criar conta', exact: true })).toBeVisible()
}

async function modoRecuperar(page: Page) {
  await porta(page).getByRole('button', { name: 'Esqueci' }).click()
  await expect(page.getByRole('heading', { name: 'Recuperar senha', exact: true })).toBeVisible()
}

const MODOS: Array<[string, (page: Page) => Promise<void>]> = [
  ['Entrar', async () => {}],
  ['Criar conta', modoCriarConta],
  ['Recuperar senha', modoRecuperar],
]

/**
 * O QUE VIOLA HOJE (medido em 15/10/2026): os SEIS casos, pela mesma causa — os links da porta
 * (`.qen-link` e os `<a>` dos Termos e da Privacidade) em `--accent-ink` #ae300e sobre o `--canvas`
 * #d9d5c8 de `questEntrada.css`, 4,42:1 (o AA pede 4,5:1). Ficam `fixme` com a violação como motivo;
 * a sugestão de correção está em `docs/auditoria/2026-10-15-acessibilidade.md`. Corrigida a cor, a
 * linha sai daqui e o caso passa a barrar a regressão.
 */
const LINK = '#ae300e sobre #d9d5c8 = 4.42 (pede 4.5)'
const VIOLAM_HOJE: Record<string, string> = {
  'Entrar (computador)': `color-contrast: .qen-rotulo > .qen-link ("Esqueci"), .qen-rodape > .qen-link ("Criar uma conta"), a[href$="termos.html"], a[href$="privacidade.html"]: ${LINK}`,
  'Criar conta (computador)': `color-contrast: .qen-link ("Entrar"): ${LINK}`,
  'Recuperar senha (computador)': `color-contrast: .qen-link ("← Voltar ao login"): ${LINK}`,
  'Entrar (celular)': `color-contrast: .qen-rotulo > .qen-link ("Esqueci"), .qen-rodape > .qen-link ("Criar uma conta"), a[href$="termos.html"], a[href$="privacidade.html"]: ${LINK}`,
  'Criar conta (celular)': `color-contrast: .qen-link ("Entrar"), a[href$="termos.html"], a[href$="privacidade.html"]: ${LINK}`,
  'Recuperar senha (celular)': `color-contrast: .qen-link ("← Voltar ao login"): ${LINK}`,
}

for (const [aparelho, uso] of [
  ['computador', {}],
  ['celular', { viewport: { width: 375, height: 812 }, isMobile: true, hasTouch: true }],
] as const) {
  test.describe(`porta de entrada no ${aparelho}`, () => {
    test.use(uso)
    for (const [modo, irPara] of MODOS) {
      const chave = `${modo} (${aparelho})`
      test(`${modo}: sem violação grave de acessibilidade`, async ({ page }) => {
        test.fixme(!!VIOLAM_HOJE[chave], VIOLAM_HOJE[chave])
        // O primeiro `goto` compila o app no Vite (modo dev): passa dos 30 s numa máquina fria.
        test.slow()
        await page.goto('/')
        await abrirPortaDeLogin(page)
        await irPara(page)
        expect(await violacoesGraves(page)).toEqual([])
      })
    }
  })
}
