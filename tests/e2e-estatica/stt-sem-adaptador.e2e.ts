import { expect, test } from '@playwright/test'

import { modeloAnunciado, naTelaDoCelular } from './_captura'

/**
 * `navigator.gpu` SEM ADAPTADOR → WHISPER BASE (auditoria de latência 2026-09-26, P0).
 *
 * O Chromium sem interface do Playwright tem a API WebGPU, mas `requestAdapter()` devolve `null`. Era
 * exatamente o caso em que o roteador escolhia o Whisper small para WebGPU e a captura nunca mostrava
 * legenda. Aqui a tela Capturar, no navegador de verdade, tem que anunciar o modelo que cabe sem GPU
 * (o base, 209 MB) e não o small (589 MB). No celular o anúncio não é mais o selo do cabeçalho: mora
 * em Opções da captura → Modelos no aparelho (`_captura.ts`).
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

  await expect(page.getByRole('heading', { name: 'Capturar', level: 1 })).toBeVisible({ timeout: 30_000 })
  const pular = page.getByRole('button', { name: 'Pular apresentação' })
  if (await pular.isVisible().catch(() => false)) await pular.click()
  /* Perfil do aparelho (`lib/dispositivo/perfil.ts`): no projeto de toque (ponteiro grosso) a captura
     é de CELULAR — a tela dela é a do celular —, e o base vai em q8 (80 MB; mesma qualidade do
     híbrido na bancada pt). */
  const toque = await page.evaluate(() => matchMedia('(pointer: coarse)').matches && navigator.maxTouchPoints > 0)
  expect(await naTelaDoCelular(page)).toBe(toque)
  const modelo = await modeloAnunciado(page)
  await expect(modelo).toContainText(toque ? /\b80 MB/ : /\b209 MB/, { timeout: 10_000 })
  await expect(modelo).not.toContainText(/589 MB|880 MB/)
})
