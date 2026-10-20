/* TEMPORÁRIO (não commitar): mede, no navegador real, a importação do .apkg sintético de ~196 MB gerado por
   scripts/perf/anki-200mb.ts — critério de aceite da Fase 3 (≤ 60 s num notebook comum). */
import { expect, test } from '@playwright/test'

import { abrirMais, abrirTela, clicarRobusto } from './_helpers'

const ARQUIVO =
  '/private/tmp/claude-501/-Users-guilhermepinheirodeoliveira-dev-personal-babel-babel-play/898ab642-2ab5-4fc7-a965-c182337821d4/scratchpad/benchmark-200mb.apkg'

test('benchmark: .apkg de 196 MB lido no navegador', async ({ page }) => {
  test.setTimeout(10 * 60_000)
  await abrirTela(page, '/cartoes')
  await clicarRobusto(page, (await abrirMais(page)).getByRole('button', { name: /^Trazer e levar/ }))
  const trazer = page.getByRole('dialog', { name: 'Trazer e levar' })
  await expect(trazer).toBeVisible()

  const t0 = Date.now()
  await page.getByTestId('anki-arquivo').setInputFiles(ARQUIVO)
  const lido = page.getByTestId('anki-lido')
  await expect(lido).toBeVisible({ timeout: 5 * 60_000 })
  const leitura = (Date.now() - t0) / 1000
  const resumo = await lido.innerText()

  const fluxo = page.getByRole('dialog', { name: 'Trazer do Anki' })
  const ativar = fluxo.getByRole('button', { name: /^Ativar \d+$/ })
  const t1 = Date.now()
  const botao = (await ativar.isVisible().catch(() => false))
    ? ativar
    : fluxo.getByRole('button', { name: 'Deixar para depois' })
  await clicarRobusto(page, botao)
  const trazido = page.getByTestId('anki-trazido')
  await expect(trazido).toBeVisible({ timeout: 5 * 60_000 })
  const envio = (Date.now() - t1) / 1000
  const titulo = await trazido.getByRole('heading', { level: 2 }).innerText()

  console.log(
    `BENCHMARK leitura=${leitura.toFixed(1)}s envio+fechamento=${envio.toFixed(1)}s | ${titulo} | ${resumo.replace(/\s+/g, ' ').slice(0, 200)}`,
  )
  expect(leitura).toBeLessThanOrEqual(60)
})
