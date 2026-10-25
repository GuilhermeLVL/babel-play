/**
 * FASE B DA IA PAGA (item 1) — AS RECUSAS CERTAS NA TRADUÇÃO NUANCE DA FRASE, ponta a ponta, no celular.
 *
 * Roda com `playwright.publico.config.ts` num Pixel 7 emulado: login de verdade no Supabase falso, a conta
 * pintada como Premium e a IA SIMULADA na página (`_nuance.ts`), sem nenhum POST de IA de verdade. A tradução
 * no nível `nuance`, a que abre junto com a frase, responde conforme a frase:
 *
 *   1. 402 `quota_exceeded`: "Você usou a IA de nuvem deste mês; ela volta no dia…". NÃO aparece "faz parte da
 *      Tradução Nuance", que antes era dito a quem já tem a Nuance, e não aparece "Tentar de novo";
 *   2. 429 `uso_justo_do_dia`: "Você chegou ao limite de hoje. Volta amanhã." NÃO aparece "nuvem ocupada" nem
 *      "Tentar de novo";
 *   3. 429 `nuvem_ocupada`: "A nuvem está ocupada agora…" e "Tentar de novo", que refaz o pedido e mostra a
 *      Tradução Nuance.
 *
 *   npx playwright test -c playwright.publico.config.ts nuance-recusas
 */
import { devices, expect, type Page, test } from '@playwright/test'

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

const FRASES = ['The first sentence is here.', 'The second one comes later.', 'And the third closes it.']
const DA_NUANCE = 'E a terceira fecha tudo.'

/** Abre a folha da fala `i` e devolve a seção da Nuance. */
async function abrirNuance(page: Page, i: number) {
  const balao = page.locator('.q-linha-da-fala').filter({ hasText: FRASES[i] })
  await chegarEm(page, balao)
  await clicar(page, balao.locator('.q-fala'))
  const folha = page.getByRole('complementary', { name: 'Frase escolhida' })
  await expect(folha).toBeVisible()
  const nuance = folha.getByRole('region', { name: 'Tradução Nuance' })
  await expect(nuance).toBeVisible({ timeout: 15_000 })
  await autorizarNuvemSePedir(page, nuance)
  return { folha, nuance }
}

async function fechar(page: Page, folha: ReturnType<Page['locator']>) {
  await fecharSobreposicoes(page)
  await page.keyboard.press('Escape')
  await expect(folha).toBeHidden()
}

test('celular: cota do mês, uso justo do dia e nuvem ocupada têm cada um a sua frase; "Tentar de novo" só na ocupada', async ({
  page,
}) => {
  test.slow()
  const escapadas = await semIaDeVerdade(page)
  await entrar(page, { premium: true })

  /* A resposta da tradução `nuance` POR FRASE (a tela pode pedir a mesma frase mais de uma vez ao montar a folha):
     a 1ª frase, a cota do mês; a 2ª, o uso justo do dia; a 3ª, nuvem ocupada até o "Tentar de novo". A legenda ao
     vivo (sem `nivel`) responde normal. */
  const ok = { text: DA_NUANCE, engine: 'server-llm-mt', provenance: { kind: 'ai', origin: 'e2e' } }
  let tentouDeNovo = false
  const pedidosDaNuance: Array<Record<string, unknown>> = []
  await page.route('**/api/ai/mt', async (route) => {
    const corpo = route.request().postDataJSON() as Record<string, unknown>
    if (corpo.nivel !== 'nuance') {
      await route.fulfill({
        json: { text: `(${corpo.text})`, engine: 'server-llm-mt', provenance: { kind: 'ai', origin: 'e2e' } },
      })
      return
    }
    pedidosDaNuance.push(corpo)
    if (corpo.text === FRASES[0])
      await route.fulfill({ status: 402, json: { error: 'limite mensal', code: 'quota_exceeded' } })
    else if (corpo.text === FRASES[1])
      await route.fulfill({
        status: 429,
        json: { error: 'hoje', code: 'uso_justo_do_dia' },
        headers: { 'retry-after': '1' },
      })
    else if (tentouDeNovo) await route.fulfill({ json: ok })
    else
      await route.fulfill({
        status: 429,
        json: { error: 'ocupada', code: 'nuvem_ocupada' },
        headers: { 'retry-after': '1' },
      })
  })

  await page.goto('/capturar')
  await chegarEm(page, page.getByTestId('captura-do-prototipo'))
  await page.waitForFunction(() => typeof (window as unknown as { __simFalas?: unknown }).__simFalas === 'function')
  await page.evaluate(
    (falas) => (window as unknown as { __simFalas: (t: string[]) => number }).__simFalas(falas),
    FRASES,
  )

  // 1. Cota do mês: diz quando volta, sem convite e sem "Tentar de novo".
  let { folha, nuance } = await abrirNuance(page, 0)
  await expect(nuance).toContainText('Você usou a IA de nuvem deste mês; ela volta no dia', { timeout: 15_000 })
  await expect(nuance).toContainText('A legenda e as palavras seguem funcionando.')
  await expect(nuance).not.toContainText('faz parte da Tradução Nuance')
  await expect(nuance.getByRole('button', { name: /Tentar de novo/ })).toHaveCount(0)
  await fechar(page, folha)

  // 2. Uso justo do dia: volta amanhã; nem "ocupada" nem "Tentar de novo".
  ;({ folha, nuance } = await abrirNuance(page, 1))
  await expect(nuance).toContainText('Você chegou ao limite de hoje. Volta amanhã.', { timeout: 15_000 })
  await expect(nuance).not.toContainText('ocupada')
  await expect(nuance.getByRole('button', { name: /Tentar de novo/ })).toHaveCount(0)
  await fechar(page, folha)

  // 3. Nuvem ocupada: "Tentar de novo" refaz o pedido e a Nuance aparece.
  ;({ nuance } = await abrirNuance(page, 2))
  await expect(nuance).toContainText('A nuvem está ocupada agora', { timeout: 15_000 })
  const deNovo = nuance.getByRole('button', { name: /Tentar de novo/ })
  await expect(deNovo).toBeVisible()
  const antes = pedidosDaNuance.length
  tentouDeNovo = true
  await clicar(page, deNovo)
  await expect(nuance.getByRole('button', { name: DA_NUANCE })).toBeVisible({ timeout: 15_000 })
  expect(pedidosDaNuance.length).toBeGreaterThan(antes)
  expect(pedidosDaNuance.at(-1)).toMatchObject({ text: FRASES[2], nivel: 'nuance' })
  await expect(nuance.getByRole('button', { name: /Tentar de novo/ })).toHaveCount(0)
  // E o 👎 discreto aparece junto da Nuance que chegou.
  await expect(nuance.getByRole('button', { name: 'Não ajudou' })).toBeVisible()

  expect(postsDeIa(escapadas), 'nenhum pedido de IA pode sair sem simulação').toEqual([])
})
