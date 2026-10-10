import { expect, type Page, test } from '@playwright/test'

import { iniciarCaptura } from './_captura'
import { abrirTela, clicarRobusto, fecharSobreposicoes, irAoJogarPeloMenu } from './_helpers'

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
 *
 * NO DESENHO NOVO (09/10/2026) a captura abre pronta, com "Iniciar captura" na faixa de baixo
 * (`iniciar-captura`); gravando, o botão vira "Encerrar" (`encerrar-captura`). O botão "Abrir a
 * sessão salva" era do desenho de antes: quem diz que salvou é o servidor, e é a ele que se pergunta.
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

test('600 falas: Encerrar → "Salvar e ficar aqui" → sair — em lotes, sem trava e sem duplicar', async ({ page }) => {
  test.slow()
  const antes = await idsDasSessoes(page)
  await abrirTela(page, '/capturar')
  await iniciarCaptura(page)
  await page.evaluate(() =>
    (window as unknown as { __simFalas: (t: string[]) => number }).__simFalas(
      Array.from({ length: 600 }, (_, i) => `sentence number ${i} about the weather today`),
    ),
  )

  await clicarRobusto(page, page.getByTestId('encerrar-captura'))
  const encerrar = page.getByRole('dialog', { name: /Encerrar a sessão/ })
  await expect(encerrar).toBeVisible()
  await encerrar.getByRole('button', { name: 'Salvar e ficar aqui' }).click()
  // O diálogo sai e a captura para NA HORA — antes do áudio, da rede e do vocabulário.
  await expect(encerrar).toBeHidden({ timeout: 1500 })
  await expect(page.getByTestId('iniciar-captura')).toBeVisible({ timeout: 5000 })

  // O salvamento termina em segundo plano, com a tela já solta: UMA sessão nova no servidor.
  const novasAgora = async () => (await idsDasSessoes(page)).filter((id) => !antes.includes(id))
  await expect.poll(async () => (await novasAgora()).length, { timeout: 30_000 }).toBe(1)
  const novas = await novasAgora()
  try {
    await expect
      .poll(
        async () => {
          const r = await page.request.get(`/api/sessions/${novas[0]}`)
          return ((await r.json()) as { utterances?: unknown[] }).utterances?.length ?? 0
        },
        { timeout: 30_000, message: 'as 600 falas chegam, em lotes' },
      )
      .toBe(600)

    // Sair: nenhuma trava, e nada é salvo de novo.
    await fecharSobreposicoes(page)
    // No celular o Jogar mora atrás do "Praticar" da barra de cinco (navegação de 10/10/2026).
    await irAoJogarPeloMenu(page)
    await expect(page.getByText(/não foram salvas|Você tem falas não salvas/)).toHaveCount(0)
    await page.waitForTimeout(1500)
    expect(await novasAgora()).toHaveLength(1)
  } finally {
    for (const id of await novasAgora()) await page.request.delete(`/api/sessions/${id}`)
  }
})
