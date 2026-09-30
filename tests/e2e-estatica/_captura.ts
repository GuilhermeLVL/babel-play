import { expect, type Locator, type Page } from '@playwright/test'

/**
 * ONDE A CAPTURA DIZ AS COISAS, em cada uma das duas telas dela.
 *
 * O computador (e o Quest, que usa a tela do computador) tem o cabeçalho com o selo do modelo, o
 * botão "Ajustes da captura" e o Espaço de gravação. O celular, desde a captura mobile-first
 * (29/09, `src/components/views/captura/celular/*`), tem outra tela: sem selo no cabeçalho, com UM
 * microfone grande na doca (é ele o "Iniciar captura") e o resto numa folha de baixo, "Opções da
 * captura". As garantias dos testes são as mesmas; o que muda é o caminho até a informação.
 */

/** A tela da captura é a do celular (`CapturaNoCelular`)? */
export async function naTelaDoCelular(page: Page): Promise<boolean> {
  return page.getByTestId('captura-no-celular').isVisible()
}

/**
 * O modelo de TRANSCRIÇÃO que a captura anuncia, com o tamanho. No computador, o selo do cabeçalho
 * ("modelo local · N MB"); no celular, a linha "Transcrição" de Opções da captura → Modelos no
 * aparelho — o mesmo diálogo "Modelo no dispositivo" que o selo abre. O localizador acompanha a tela
 * (o tamanho se corrige quando o `requestAdapter()` responde): dá para esperar nele. No celular o
 * diálogo fica aberto; `fecharModelos` o fecha.
 */
export async function modeloAnunciado(page: Page): Promise<Locator> {
  if (!(await naTelaDoCelular(page))) {
    const selo = page.getByRole('button', { name: /Modelo no dispositivo/ })
    await expect(selo).toBeVisible()
    return selo
  }
  await page.getByRole('button', { name: 'Opções da captura' }).click()
  await page
    .getByRole('dialog', { name: 'Opções da captura' })
    .getByRole('button', { name: /Modelos no aparelho/ })
    .click()
  const dialogo = page.getByRole('dialog', { name: 'Modelo no dispositivo' })
  await expect(dialogo).toBeVisible()
  return dialogo.locator('.op-linha').filter({ hasText: /^Transcrição/ })
}

/** Fecha o diálogo "Modelo no dispositivo", se `modeloAnunciado` o abriu (no celular). */
export async function fecharModelos(page: Page): Promise<void> {
  const dialogo = page.getByRole('dialog', { name: 'Modelo no dispositivo' })
  if (!(await dialogo.isVisible())) return
  await dialogo.getByRole('button', { name: 'Fechar', exact: true }).last().click()
  await expect(dialogo).toBeHidden()
}

/**
 * Abre os ajustes de dispositivo da captura ("Dispositivos e modelos de IA": de onde vem o som, quem
 * transcreve). No computador pelo botão "Ajustes da captura" do cabeçalho; no celular por Opções da
 * captura → Texto e tradução, a linha que leva ao mesmo diálogo.
 */
export async function abrirAjustesDaCaptura(page: Page): Promise<Locator> {
  if (await naTelaDoCelular(page)) {
    await page.getByRole('button', { name: 'Opções da captura' }).click()
    await page
      .getByRole('dialog', { name: 'Opções da captura' })
      .getByRole('button', { name: /Texto e tradução/ })
      .click()
  } else {
    await page.getByRole('button', { name: 'Ajustes da captura' }).click()
  }
  const dialogo = page.getByRole('dialog', { name: 'Dispositivos e modelos de IA' })
  await expect(dialogo).toBeVisible()
  return dialogo
}

/**
 * Os controles que a pessoa usa para começar e conduzir a captura, onde a regra do alvo mínimo vale:
 * no computador, os botões do Espaço de gravação; no celular, a doca ao alcance do polegar (Opções,
 * o microfone e Flutuante).
 */
export async function controlesDaGravacao(page: Page): Promise<Locator> {
  return (await naTelaDoCelular(page)) ? page.locator('.cel-doca button') : page.locator('.estudio .btn')
}
