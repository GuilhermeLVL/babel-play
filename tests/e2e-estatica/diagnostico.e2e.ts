import { expect, test } from '@playwright/test'

import { DISPOSITIVOS, scriptDoAparelho } from './_dispositivos.mjs'

/**
 * O DIAGNÓSTICO DO APARELHO (`/diagnostico`) na edição estática.
 *
 * A página existe para o dono medir no Quest de verdade o que a emulação não mede (01/10/2026). Aqui
 * só o que dá para conferir sem aparelho: ela abre pelo endereço, lê os sinais do navegador, o JSON do
 * resultado os carrega, e nada é medido nem baixado sem um toque. No Quest emulado, o aviso da captura
 * leva até ela. As medidas em si (microfone, compartilhamento, modelos) têm teste de unidade nas
 * partes puras (`tests/diagnosticoDoAparelho.test.ts`) e ficam para o aparelho.
 */
const BYTES_DE_MODELO = /\.onnx(\?|$)|huggingface\.co\/.+\/resolve\//

test('abre pelo endereço, mostra os sinais e não mede nada sozinho', async ({ page }) => {
  const erros: string[] = []
  page.on('pageerror', (e) => erros.push(String(e)))
  page.on('console', (m) => m.type() === 'error' && erros.push(m.text()))
  const baixados: string[] = []
  page.on('request', (r) => BYTES_DE_MODELO.test(r.url()) && baixados.push(r.url()))

  await page.goto('/diagnostico')
  await expect(page.getByRole('heading', { name: 'Diagnóstico do aparelho', level: 1 })).toBeVisible({
    timeout: 60_000,
  })
  const sinais = page.getByTestId('diagnostico-sinais')
  await expect(sinais).toContainText('Núcleos que o navegador vê')
  await expect(page.getByTestId('diagnostico-perfil')).toContainText(/desktop|celular|quest/)

  const json = JSON.parse(await page.getByTestId('diagnostico-json').inputValue())
  expect(json.sinais.nucleos).toBeGreaterThan(0)
  expect(json.sinais.isolado).toBe(true) // COOP/COEP do Pages: sem isso o WASM roda em 1 thread
  expect(json.microfone).toBeNull()
  expect(json.modelos).toEqual([])

  for (const nome of ['Testar o microfone', 'Testar o compartilhamento', 'Medir no processador'])
    await expect(page.getByRole('button', { name: nome })).toBeVisible()
  await page.waitForTimeout(500)
  expect(baixados, 'baixou modelo ou áudio sem ninguém pedir').toEqual([])
  expect(erros).toEqual([])
})

test('Quest: o aviso da captura leva ao diagnóstico, que se reconhece como quest', async ({ browser }, info) => {
  test.skip(info.project.name !== 'desktop-1280', 'monta o próprio contexto do aparelho')
  const d = DISPOSITIVOS.quest
  const ctx = await browser.newContext({ ...d.contexto, baseURL: info.project.use.baseURL })
  const page = await ctx.newPage()
  await page.addInitScript({ content: scriptDoAparelho(d.sinais) })
  await page.addInitScript(() => {
    try {
      localStorage.setItem('babel_tour_blitz', '1')
    } catch {
      /* storage bloqueado */
    }
  })
  await page.goto('/capturar')
  await expect(page.getByRole('heading', { name: 'Capturar', level: 1 })).toBeVisible({ timeout: 60_000 })
  const pular = page.getByRole('button', { name: 'Pular apresentação' })
  if (await pular.isVisible().catch(() => false)) await pular.click()

  await page.getByTestId('abrir-diagnostico').click()
  await expect(page).toHaveURL(/\/diagnostico$/)
  await expect(page.getByTestId('diagnostico-perfil')).toContainText('quest')
  const json = JSON.parse(await page.getByTestId('diagnostico-json').inputValue())
  expect(json.sinais.navegador.modelo).toBe('Quest 3')
  expect(json.sinais.compartilharTela).toBe(true)
  expect(json.sinais.nucleos).toBe(6)
  await ctx.close()
})
