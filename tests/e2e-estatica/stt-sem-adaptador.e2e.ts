import { expect, test } from '@playwright/test'

import { capturaPronta, megasAnunciados, seloDoModelo } from './_captura'

/**
 * `navigator.gpu` SEM ADAPTADOR → WHISPER BASE (auditoria de latência 2026-09-26, P0).
 *
 * O Chromium sem interface do Playwright tem a API WebGPU, mas `requestAdapter()` devolve `null`. Era
 * exatamente o caso em que o roteador escolhia o Whisper small para WebGPU e a captura nunca mostrava
 * legenda. Aqui a tela Capturar, no navegador de verdade, tem que anunciar o modelo que cabe sem GPU
 * (o base, 209 MB) e não o small (589 MB).
 *
 * DESENHO NOVO (09/10/2026). No computador o anúncio é o selo do topo ("Modelo local · 209 MB"). Na
 * tela estreita o selo não aparece e "Modelo no dispositivo" não tem porta: o tamanho é dito antes do
 * primeiro byte, no aviso "Baixar os modelos desta captura?", que soma a transcrição e o tradutor.
 *
 * A prova com áudio de verdade (a legenda chegando) é a rodada `mic-pt-en-padrao-headless` de
 * `scripts/perf/latencia-legenda/rodar-matriz.mjs` — precisa dos modelos em cache, então não roda aqui.
 */
test('headless com navigator.gpu e sem adaptador: a captura anuncia o Whisper base', async ({ page }) => {
  await page.addInitScript(() => {
    try {
      localStorage.setItem('babel_tour_blitz', '1')
    } catch {
      /* storage bloqueado */
    }
  })
  await page.goto('/capturar')
  const semAdaptador = await page.evaluate(async () => {
    const gpu = (navigator as Navigator & { gpu?: { requestAdapter(): Promise<unknown> } }).gpu
    return !!gpu && !(await gpu.requestAdapter().catch(() => null))
  })
  test.skip(!semAdaptador, 'este navegador tem adaptador WebGPU (ou não tem a API): o caso não se aplica')

  await capturaPronta(page)
  /* Perfil do aparelho (`lib/dispositivo/perfil.ts`): no projeto de toque (ponteiro grosso) a captura
     é de CELULAR, e o base vai em q8 (80 MB; mesma qualidade do híbrido na bancada pt). */
  const toque = await page.evaluate(() => matchMedia('(pointer: coarse)').matches && navigator.maxTouchPoints > 0)
  const selo = seloDoModelo(page)
  if (!toque) {
    await expect(selo).toContainText(/\b209 MB/, { timeout: 10_000 })
    await expect(selo).not.toContainText(/589 MB|880 MB/)
    return
  }
  await expect(selo, 'na tela estreita o selo do modelo não aparece').toBeHidden()
  await page.getByTestId('iniciar-captura').click()
  const aviso = page.getByTestId('aviso-de-download')
  await expect(aviso).toBeVisible({ timeout: 15_000 })
  /* O total é a transcrição mais o tradutor. Abaixo de 209 MB (o base híbrido sozinho) só fecha com o
     base q8 de 80 MB; o small (589 MB) nem se fala. */
  const total = await megasAnunciados(aviso)
  expect(total).toBeGreaterThanOrEqual(80)
  expect(total).toBeLessThan(209)
  await page.getByRole('button', { name: 'Agora não' }).click()
  await expect(aviso).toBeHidden()
})
