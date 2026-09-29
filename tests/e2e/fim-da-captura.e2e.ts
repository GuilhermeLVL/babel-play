import { expect, type Page, test } from '@playwright/test'

import { clicarRobusto, fecharSobreposicoes } from './_helpers'

/**
 * O FIM DA CAPTURA COM O SERVIDOR DE VERDADE (relato do dono, 2026-09-28: "quando tento ENCERRAR
 * uma sessão demora, trava e eu fico preso na tela").
 *
 * Contra o Express (self-host, `npm run dev:local`), o que a edição estática não alcança:
 *  - uma captura com MAIS falas que um lote (600 > 500) sai em lotes — o POST com o primeiro e o
 *    resto em `POST /api/sessions/:id/utterances` — e chega inteira;
 *  - "Salvar e ficar aqui" solta a tela na hora, e sair depois não pergunta nem cria uma segunda
 *    sessão (a trava antiga salvava de novo).
 *
 * As falas entram por `window.__simFalas` (a bancada da tela, sem STT nem MT); a captura começa de
 * verdade, com a mídia falsa do Chromium. A sessão criada é apagada no fim.
 */
test.use({
  permissions: ['microphone'],
  launchOptions: {
    args: [
      '--use-fake-ui-for-media-stream',
      '--use-fake-device-for-media-stream',
      '--auto-select-desktop-capture-source=Entire screen',
    ],
  },
})

test.beforeEach(async ({ page }, info) => {
  test.skip(info.project.name === 'tablet-768', 'o fim da captura não depende de largura intermediária')
  // Nenhum modelo de fala/tradução é baixado: o que se mede é o fim da captura, não o reconhecimento.
  await page.route(/huggingface\.co|hf\.co|cdn-lfs/, (r) => r.abort())
})

async function idsDasSessoes(page: Page): Promise<string[]> {
  const r = await page.request.get('/api/sessions')
  return ((await r.json()) as Array<{ id: string }>).map((s) => s.id)
}

const doMenu = (page: Page, nome: RegExp) => page.getByRole('button', { name: nome }).locator('visible=true').first()

test('600 falas: Parar → "Salvar e ficar aqui" → sair — em lotes, sem trava e sem duplicar', async ({ page }) => {
  test.slow()
  const antes = await idsDasSessoes(page)
  await page.goto('/capturar')
  await expect(page.getByRole('main')).toBeVisible()
  await fecharSobreposicoes(page)

  // As comemorações de um banco novo entram animadas, uma por vez: o clique robusto as fecha.
  await clicarRobusto(page, page.getByRole('button', { name: /Iniciar captura|Iniciar a gravação de áudio|Começar a gravar/ }).first())
  const baixar = page.getByRole('button', { name: /Baixar e iniciar/ })
  if (await baixar.waitFor({ state: 'visible', timeout: 2500 }).then(() => true, () => false)) await baixar.click()
  await expect(page.getByRole('button', { name: /Parar/ }).first()).toBeVisible({ timeout: 15_000 })
  await page.evaluate(() =>
    (window as unknown as { __simFalas: (t: string[]) => number }).__simFalas(
      Array.from({ length: 600 }, (_, i) => `sentence number ${i} about the weather today`),
    ),
  )

  await clicarRobusto(page, page.getByRole('button', { name: /Parar/ }).first())
  const encerrar = page.getByRole('dialog', { name: /Encerrar a sessão/ })
  await expect(encerrar).toBeVisible()
  await encerrar.getByRole('button', { name: 'Salvar e ficar aqui' }).click()
  await expect(encerrar).toBeHidden({ timeout: 1500 })
  await expect(page.getByRole('button', { name: /Abrir a sessão salva/ })).toBeVisible({ timeout: 30_000 })

  const depois = await idsDasSessoes(page)
  const novas = depois.filter((id) => !antes.includes(id))
  expect(novas).toHaveLength(1)
  try {
    const r = await page.request.get(`/api/sessions/${novas[0]}`)
    const corpo = (await r.json()) as { utterances: unknown[] }
    expect(corpo.utterances, 'as 600 falas chegaram, em lotes').toHaveLength(600)

    // Sair: nenhuma trava, e nada é salvo de novo.
    await fecharSobreposicoes(page)
    await clicarRobusto(page, doMenu(page, /^Jogar$/))
    await expect(page).toHaveURL(/\/jogar/, { timeout: 10_000 })
    await expect(page.getByText(/não foram salvas|Você tem falas não salvas/)).toHaveCount(0)
    await page.waitForTimeout(1500)
    expect((await idsDasSessoes(page)).filter((id) => !antes.includes(id))).toHaveLength(1)
  } finally {
    for (const id of novas) await page.request.delete(`/api/sessions/${id}`)
  }
})
