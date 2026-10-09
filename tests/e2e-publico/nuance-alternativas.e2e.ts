/**
 * D7 (Fase D) — AS "OUTRAS FORMAS" E O FORMAL/INFORMAL NA FOLHA DA FRASE, NO CELULAR, ponta a ponta.
 *
 * Roda com `playwright.publico.config.ts` num Pixel 7 emulado: login de verdade no Supabase falso, a
 * conta pintada como Premium e a IA SIMULADA na página (`_nuance.ts`) — nenhum POST de IA sai. As falas
 * entram pelo gancho de teste da captura (`window.__simFalas`, o mesmo do e2e do fim da captura): o
 * objeto aqui é a folha da frase, não o reconhecimento de voz. O que se prova:
 *
 *   1. tocar numa fala da legenda abre a folha com a Tradução Nuance da frase (pedida no nível `nuance`);
 *   2. "Formal" pede a tradução com o registro formal e mostra a forma formal;
 *   3. "Outras formas" pede as alternativas com a tradução atual e mostra as três e a nota;
 *   4. escolher uma forma a põe NA FALA — na folha e na linha da legenda.
 *
 * O CAMINHO É O DO DESENHO NOVO (o único desde 09/10/2026): Capturar abre pronta
 * (`CapturaDoPrototipo`), a legenda é `HistoricoDoPrototipo` (cada fala é um botão `.q-fala`) e a
 * folha é `FolhasDoPrototipo` (um `<dialog>` chamado "Ações").
 *
 *   npx playwright test -c playwright.publico.config.ts nuance-alternativas
 */
import { devices, expect, test } from '@playwright/test'

import {
  autorizarNuvemSePedir,
  chegarEm,
  clicar,
  entrar,
  fecharSobreposicoes,
  postsDeIa,
  semIaDeVerdade,
} from './_nuance'

const { defaultBrowserType: _navegador, ...pixel7 } = devices['Pixel 7']
test.use({ ...pixel7 })

const FRASE = 'The weather is supposed to be great this weekend.'
const DA_NUANCE = 'O tempo deve ficar ótimo neste fim de semana.'
const FORMAL = 'A previsão indica um tempo excelente neste fim de semana, senhor.'
const OUTRAS = [
  'A previsão é de tempo ótimo no fim de semana.',
  'Vai fazer um tempão bom no fim de semana.',
  'O fim de semana promete tempo bom.',
]

test('celular: Formal/Informal e "Outras formas" na folha da frase, e a escolhida entra na fala', async ({ page }) => {
  test.slow()
  const escapadas = await semIaDeVerdade(page)
  await entrar(page, { premium: true })

  /* A IA simulada: a tradução no nível `nuance` (com ou sem registro) e as outras formas. */
  const traducoes: Array<Record<string, unknown>> = []
  await page.route('**/api/ai/mt', async (route) => {
    const corpo = route.request().postDataJSON() as Record<string, unknown>
    traducoes.push(corpo)
    const texto = corpo.registro === 'formal' ? FORMAL : corpo.nivel === 'nuance' ? DA_NUANCE : `(${corpo.text})`
    await route.fulfill({ json: { text: texto, engine: 'server-llm-mt', provenance: { kind: 'ai', origin: 'e2e' } } })
  })
  const alternativas: Array<Record<string, unknown>> = []
  await page.route('**/api/ai/mt/alternativas', async (route) => {
    alternativas.push(route.request().postDataJSON() as Record<string, unknown>)
    await route.fulfill({ json: { opcoes: OUTRAS, nota: 'A segunda é a mais informal.' } })
  })

  await page.goto('/capturar')
  await chegarEm(page, page.getByTestId('captura-do-prototipo'))
  await page.waitForFunction(() => typeof (window as unknown as { __simFalas?: unknown }).__simFalas === 'function')
  await page.evaluate(
    (falas) => (window as unknown as { __simFalas: (t: string[]) => number }).__simFalas(falas),
    ['So what are you planning for the weekend?', FRASE],
  )

  // 1. Tocar na fala abre a folha com a Tradução Nuance da frase.
  const balao = page.locator('.q-linha-da-fala').filter({ hasText: 'supposed' })
  await chegarEm(page, balao)
  /* A fala inteira é UM botão (`.q-fala`): as palavras só viram botões dentro da folha. */
  await clicar(page, balao.locator('.q-fala'))
  const folha = page.getByRole('dialog', { name: 'Ações', exact: true })
  await expect(folha).toBeVisible()
  const nuance = folha.getByRole('region', { name: 'Tradução Nuance' })
  await expect(nuance).toBeVisible({ timeout: 15_000 })
  await autorizarNuvemSePedir(page, nuance)
  await expect(nuance.getByRole('button', { name: DA_NUANCE })).toBeVisible({ timeout: 15_000 })
  expect(traducoes.at(-1)).toMatchObject({ text: FRASE, nivel: 'nuance', tgt: expect.stringMatching(/^pt/) })

  // 2. Formal: a tradução com o registro formal.
  await clicar(page, nuance.getByRole('button', { name: 'Formal', exact: true }))
  await expect(nuance.getByRole('button', { name: FORMAL })).toBeVisible({ timeout: 10_000 })
  expect(traducoes.at(-1)).toMatchObject({ text: FRASE, nivel: 'nuance', registro: 'formal' })
  await expect(nuance.getByRole('button', { name: 'Formal', exact: true })).toHaveAttribute('aria-pressed', 'true')

  // 3. Outras formas: as três e a nota, pedidas com a tradução atual.
  await clicar(page, nuance.getByRole('button', { name: /Outras formas/ }))
  const formas = nuance.getByTestId('outras-formas')
  await expect(formas).toBeVisible({ timeout: 10_000 })
  for (const o of OUTRAS) await expect(formas.getByRole('button', { name: o })).toBeVisible()
  await expect(formas).toContainText('A segunda é a mais informal.')
  expect(alternativas).toHaveLength(1)
  expect(alternativas[0]).toMatchObject({ text: FRASE, traducaoAtual: `(${FRASE})` })

  // 4. Escolher uma forma a põe na fala: na folha e, depois de fechá-la, na linha da legenda.
  await clicar(page, formas.getByRole('button', { name: OUTRAS[1] }))
  await expect(formas.getByRole('button', { name: OUTRAS[1] })).toHaveAttribute('aria-pressed', 'true')
  await expect(folha.locator('.folha-frase-trad')).toHaveText(OUTRAS[1])
  await fecharSobreposicoes(page)
  await page.keyboard.press('Escape')
  await expect(folha).toBeHidden()
  await expect(balao.locator('.q-t')).toHaveText(OUTRAS[1])

  expect(postsDeIa(escapadas), 'nenhum pedido de IA pode sair sem simulação').toEqual([])
})
