import { expect, type Locator, type Page } from '@playwright/test'

/**
 * ONDE A CAPTURA DIZ AS COISAS, no desenho novo (09/10/2026).
 *
 * A tela é UMA SÓ em todo aparelho (`CapturaDoPrototipo`, `data-testid="captura-do-prototipo"`): abre
 * pronta, sem título, com o topo, o miolo "Pronto para legendar" e a faixa de baixo com "Iniciar captura".
 *
 * TELA ENXUTA (10/10/2026, computador e celular). O topo é UMA fileira: o par de idiomas, o chip de
 * estado (`chip-de-estado`), o microfone e "Ajustes da captura". O selo "Modelo local · N MB" e a ajuda
 * saíram do topo: moram na folha "Como isto funciona" (`como-isto-funciona`), que o chip de estado abre.
 * No celular a folha não tem a linha do modelo (quem transcreve lá é um recurso do aparelho), e o
 * tamanho do modelo só é dito antes do primeiro byte — na folha "Como transcrever a sua voz?" (com o
 * microfone ligado) ou no aviso "Baixar os modelos desta captura?".
 */

/** A tela da captura, pronta para começar. Fecha a apresentação da primeira visita, se ela abrir. */
export async function capturaPronta(page: Page): Promise<Locator> {
  const iniciar = page.getByTestId('iniciar-captura')
  await expect(iniciar).toBeVisible({ timeout: 60_000 })
  const pular = page.getByRole('button', { name: 'Pular apresentação' })
  if (await pular.isVisible().catch(() => false)) await pular.click()
  return iniciar
}

/**
 * QUEM TRANSCREVE, como a tela diz: "Modelo local · N MB" ou "Reconhecimento do navegador". Na tela
 * enxuta é a linha "Neste aparelho" da folha "Como isto funciona", aberta pelo chip de estado do topo
 * (o toque na linha abre "Modelo no dispositivo"). Abre a folha, lê a linha e fecha. Devolve '' quando
 * a linha não existe (no celular).
 */
export async function modeloAnunciado(page: Page): Promise<string> {
  await page.getByTestId('chip-de-estado').click()
  const folha = page.getByTestId('como-isto-funciona')
  await expect(folha).toBeVisible()
  const linha = folha.locator('[data-ex-f="modelo"] b')
  const texto = (await linha.count()) ? ((await linha.textContent()) ?? '') : ''
  await page.keyboard.press('Escape')
  await expect(folha).toBeHidden()
  return texto
}

/**
 * Abre os ajustes de dispositivo da captura ("Dispositivos e modelos de IA": de onde vem o som, quem
 * transcreve), pelo botão "Ajustes da captura" do topo. (No headset o mesmo botão abre "Opções da
 * captura"; este auxiliar é do computador e do celular.)
 */
export async function abrirAjustesDaCaptura(page: Page): Promise<Locator> {
  await page.getByRole('button', { name: 'Ajustes da captura' }).click()
  const dialogo = page.getByRole('dialog', { name: 'Dispositivos e modelos de IA' })
  await expect(dialogo).toBeVisible()
  return dialogo
}

/**
 * Os controles que conduzem a captura, onde a regra do alvo mínimo vale: o topo (idiomas, o chip de
 * estado, microfone, ajustes) e a faixa de baixo (Iniciar e o que mais couber). Os botões dos avisos que a tela
 * mostra no meio (a oferta da nuvem, por exemplo) não entram: não conduzem a gravação.
 */
export function controlesDaCaptura(page: Page): Locator {
  return page.getByTestId('captura-do-prototipo').locator('.px-vivo-topo button:visible, .q-faixa button:visible')
}

/** O total anunciado ("cerca de N MB") num aviso ou numa folha de download. */
export async function megasAnunciados(onde: Locator): Promise<number> {
  await expect(onde).toContainText(/cerca de \d+ MB/)
  return Number(/cerca de (\d+) MB/.exec((await onde.textContent()) ?? '')?.[1])
}
