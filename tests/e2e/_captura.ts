import { expect, type Locator, type Page } from '@playwright/test'

import { clicarRobusto, fecharSobreposicoes } from './_helpers'

/**
 * ONDE A CAPTURA DIZ AS COISAS, no desenho novo (09/10/2026) — o que as suítes da captura dividem.
 *
 * A tela é UMA SÓ em todo aparelho (`CapturaDoPrototipo`, `data-testid="captura-do-prototipo"`): abre
 * pronta, com o topo (idiomas, selo do modelo, microfone, "Ajustes da captura", ajuda), o miolo
 * "Pronto para legendar" e a faixa de baixo com "Iniciar captura" (`iniciar-captura`). Gravando, o
 * botão vira "Encerrar" (`encerrar-captura`). No celular (sem captura de tela), com o microfone
 * ligado, o Iniciar pergunta antes "Como transcrever a sua voz?"; quando há modelo a baixar, o aviso
 * tem "Baixar e iniciar".
 */

export const botaoIniciar = (page: Page) => page.getByTestId('iniciar-captura')
export const botaoEncerrar = (page: Page) => page.getByTestId('encerrar-captura')

/** A tela da captura, pronta para começar. */
export async function capturaPronta(page: Page): Promise<Locator> {
  const iniciar = botaoIniciar(page)
  await expect(iniciar).toBeVisible({ timeout: 60_000 })
  await fecharSobreposicoes(page)
  return iniciar
}

/**
 * Começa a captura e espera ela estar gravando (o "Encerrar" à vista). Se a tela perguntar antes de
 * baixar os modelos, aceita ("Baixar e iniciar"): nas suítes os downloads estão cortados e as falas
 * vêm da bancada (`window.__simFalas`), então o modelo não é necessário.
 */
export async function iniciarCaptura(page: Page) {
  await clicarRobusto(page, await capturaPronta(page))
  const baixar = page.getByRole('button', { name: /Baixar e iniciar/ })
  const perguntou = await baixar
    .waitFor({ state: 'visible', timeout: 2500 })
    .then(() => true)
    .catch(() => false)
  if (perguntou) await baixar.click()
  await expect(botaoEncerrar(page)).toBeVisible({ timeout: 15_000 })
}

/**
 * Põe falas prontas na captura em curso, pela bancada da tela (sem STT nem MT). `lang` é o idioma
 * que a fala declara (o que o pipeline diria); sem ele, inglês.
 */
export const falar = (page: Page, falas: string[], lang?: string) =>
  page.evaluate(
    ([x, l]) =>
      (window as unknown as { __simFalas: (t: string[], fonte?: string, lang?: string) => number }).__simFalas(
        x,
        undefined,
        l,
      ),
    [falas, lang] as const,
  )
