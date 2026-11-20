import { expect, type Page, test } from '@playwright/test'

import { botaoEncerrar, falar, iniciarCaptura } from './_captura'
import { abrirTela, clicarRobusto, fecharSobreposicoes } from './_helpers'

/**
 * A LEGENDA LONGA (26/10/2026): com 600 e 2.000 falas, a tela de legendar só monta os blocos perto da área visível
 * (`lib/captura/janelaDasFalas`), e nada do que a pessoa faz na legenda muda por isso:
 *
 *  - acompanhando ao vivo, a fala nova aparece à vista; o DOM guarda uma fração das linhas (o teto daqui é o
 *    guarda de regressão: sem a janela, 2.000 falas eram 2.000 linhas e ~70 mil elementos);
 *  - rolar para cima para de acompanhar ("Ir para a fala atual" aparece) e a fala que chega não puxa a lista;
 *  - no começo da sessão, tocar numa fala antiga abre a frase, e a palavra abre o cartão dela; Esc devolve o foco
 *    para a fala;
 *  - "Ir para a fala atual" volta ao fim; e o salvamento ("Encerrar" → "Salvar e ficar aqui") leva TODAS as falas,
 *    inclusive as que não estão no DOM (o salvamento lê o estado, não a tela).
 *
 * As falas entram pela bancada da tela (`window.__simFalas`); a captura começa de verdade, com a mídia falsa do
 * Chromium, como em `fim-da-captura.e2e.ts`. A sessão criada é apagada no fim.
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
  test.skip(info.project.name === 'tablet-768', 'a janela não depende de largura intermediária')
  await page.route(/huggingface\.co|hf\.co|cdn-lfs/, (r) => r.abort())
})

/** Teto de linhas no DOM: a área visível e a folga, em blocos de 20, mais o bloco ao vivo. */
const TETO_DE_LINHAS = 120

const linha = (page: Page, texto: string) => page.locator('.q-linha-da-fala').filter({ hasText: texto })
const irParaOFim = (page: Page) => page.getByRole('button', { name: 'Ir para a fala atual' })

async function idsDasSessoes(page: Page): Promise<string[]> {
  const r = await page.request.get('/api/sessions')
  return ((await r.json()) as Array<{ id: string }>).map((s) => s.id)
}

for (const n of [600, 2000]) {
  test(`${n} falas: acompanha ao vivo, rolar para cima para, a fala antiga abre a palavra, e salva todas`, async ({
    page,
  }) => {
    test.slow()
    const antes = await idsDasSessoes(page)
    await abrirTela(page, '/capturar')
    await iniciarCaptura(page)
    await falar(
      page,
      Array.from({ length: n }, (_, i) => `line ${i} the weather is nice today`),
    )

    // AO VIVO: a última fala à vista, e só uma fração das linhas no DOM.
    await expect(linha(page, `line ${n - 1} the`)).toBeInViewport({ timeout: 15_000 })
    expect(await page.locator('.q-linha-da-fala').count()).toBeLessThanOrEqual(TETO_DE_LINHAS)
    await falar(page, ['first extra sentence while following'])
    await expect(linha(page, 'first extra sentence')).toBeInViewport()
    await expect(irParaOFim(page)).toBeHidden()
    await fecharSobreposicoes(page)

    // ROLAR PARA CIMA: a roda do mouse sobe um pouco e a lista para de acompanhar.
    const lista = page.locator('.q-historico')
    await lista.hover()
    await page.mouse.wheel(0, -2500)
    await expect(irParaOFim(page)).toBeVisible()
    // E o começo da sessão, de uma vez: a janela monta os primeiros blocos.
    await lista.evaluate((el) => (el.scrollTop = 0))
    await expect(linha(page, 'line 1 the')).toBeInViewport()
    expect(await page.locator('.q-linha-da-fala').count()).toBeLessThanOrEqual(TETO_DE_LINHAS)

    // A fala que chega agora não puxa a lista: o começo continua à vista.
    await falar(page, ['second extra sentence while reading'])
    await expect(linha(page, 'second extra sentence')).toHaveCount(1)
    await page.waitForTimeout(600)
    await expect(linha(page, 'line 1 the')).toBeInViewport()
    await expect(linha(page, 'second extra sentence')).not.toBeInViewport()

    // A FALA ANTIGA: tocar abre a frase; a palavra abre o cartão dela; Esc devolve o foco para a fala.
    await clicarRobusto(page, linha(page, 'line 1 the').locator('.q-fala'))
    const frase = page.getByRole('complementary', { name: 'Frase escolhida' })
    await expect(frase).toBeVisible()
    await frase.getByRole('button', { name: 'weather', exact: true }).click()
    const palavra = page.getByRole('complementary', { name: 'Palavra: weather' })
    await expect(palavra).toBeVisible()
    await palavra.getByRole('button', { name: 'Voltar à frase' }).click()
    await expect(frase).toBeVisible()
    await page.keyboard.press('Escape')
    await expect(frase).toBeHidden()
    await expect(linha(page, 'line 1 the').locator('.q-fala')).toBeFocused()

    // VOLTAR AO FIM: a fala mais nova à vista de novo.
    await clicarRobusto(page, irParaOFim(page))
    await expect(linha(page, 'second extra sentence')).toBeInViewport()
    await expect(irParaOFim(page)).toBeHidden()

    // SALVAR: todas as falas chegam ao servidor, as que estão fora do DOM também.
    await clicarRobusto(page, botaoEncerrar(page))
    const encerrar = page.getByRole('dialog', { name: /Encerrar a sessão/ })
    await expect(encerrar).toBeVisible()
    await encerrar.getByRole('button', { name: 'Salvar e ficar aqui' }).click()
    await expect(encerrar).toBeHidden({ timeout: 1500 })
    const novasAgora = async () => (await idsDasSessoes(page)).filter((id) => !antes.includes(id))
    try {
      await expect.poll(async () => (await novasAgora()).length, { timeout: 30_000 }).toBe(1)
      const [id] = await novasAgora()
      await expect
        .poll(
          async () => {
            const r = await page.request.get(`/api/sessions/${id}`)
            return ((await r.json()) as { utterances?: unknown[] }).utterances?.length ?? 0
          },
          { timeout: 60_000, message: `as ${n} + 2 falas chegam` },
        )
        .toBe(n + 2)
    } finally {
      for (const id of await novasAgora()) await page.request.delete(`/api/sessions/${id}`)
    }
  })
}
