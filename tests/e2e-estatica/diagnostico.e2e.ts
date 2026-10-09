import { expect, test } from '@playwright/test'

import { DISPOSITIVOS, scriptDoAparelho } from './_dispositivos.mjs'

/**
 * O DIAGNÓSTICO DO APARELHO (`/diagnostico`) na edição estática.
 *
 * A página existe para o dono medir no Quest de verdade o que a emulação não mede (01/10/2026). Aqui
 * só o que dá para conferir sem aparelho: ela abre pelo endereço, lê os sinais do navegador, o JSON do
 * resultado os carrega, e nada é medido nem baixado sem um toque. No Quest emulado, o painel "Mais"
 * leva até ela. As medidas em si (microfone, compartilhamento, modelos) têm teste de unidade nas
 * partes puras (`tests/diagnosticoDoAparelho.test.ts`) e ficam para o aparelho.
 *
 * DESENHO NOVO (09/10/2026). A página é em abas (Aparelho, Som, Velocidade, Última captura,
 * Resultado): os sinais abrem na primeira, cada medida mora na aba dela e o JSON na última. A captura
 * do Quest não tem mais o atalho "abrir diagnóstico" nem a escolha da fonte na tela (`fonte-do-quest`):
 * o caminho do headset até o diagnóstico é o ladrilho do painel "Mais", que só o headset mostra.
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

  // Cada medida começa no próprio botão, na aba dela: abrir as abas não mede nada.
  const aba = (nome: string) => page.getByRole('tab', { name: nome, exact: true })
  await aba('Som').click()
  for (const nome of ['Testar o microfone', 'Testar o compartilhamento'])
    await expect(page.getByRole('button', { name: nome })).toBeVisible()
  await aba('Velocidade').click()
  await expect(page.getByRole('button', { name: 'Medir no processador' })).toBeVisible()
  await expect(page.getByTestId('diagnostico-andamento')).toContainText('Nada rodando')

  await aba('Resultado').click()
  const json = JSON.parse(await page.getByTestId('diagnostico-json').inputValue())
  expect(json.sinais.nucleos).toBeGreaterThan(0)
  expect(json.sinais.isolado).toBe(true) // COOP/COEP do Pages: sem isso o WASM roda em 1 thread
  expect(json.microfone).toBeNull()
  expect(json.modelos).toEqual([])
  await page.waitForTimeout(500)
  expect(baixados, 'baixou modelo ou áudio sem ninguém pedir').toEqual([])
  expect(erros).toEqual([])
})

test('Quest: o painel "Mais" leva ao diagnóstico, que se reconhece como quest', async ({ browser }, info) => {
  test.skip(info.project.name !== 'desktop-1280', 'monta o próprio contexto do aparelho')
  const d = DISPOSITIVOS.quest
  const ctx = await browser.newContext({ ...d.contexto, baseURL: info.project.use.baseURL })
  const page = await ctx.newPage()
  await page.addInitScript({ content: scriptDoAparelho(d.sinais) })
  await page.goto('/capturar')
  // A captura abre pronta (sem título): o que a identifica é o botão de começar.
  await expect(page.getByTestId('iniciar-captura')).toBeVisible({ timeout: 60_000 })
  const pular = page.getByRole('button', { name: 'Pular apresentação' })
  if (await pular.isVisible().catch(() => false)) await pular.click()
  await expect.poll(() => page.evaluate(() => document.documentElement.dataset.dispositivo)).toBe('quest')
  await page.screenshot({ path: 'test-results/quest-capturar.png' })

  // No headset o diagnóstico é um destino do "Mais" (no computador ele só abre pelo endereço).
  await page.locator('.q-trilho .q-mais-botao').click()
  const mais = page.getByRole('dialog', { name: 'Mais destinos' })
  await mais.getByRole('button', { name: 'Diagnóstico do aparelho' }).click()
  await expect(page).toHaveURL(/\/diagnostico$/)
  await expect(page.getByTestId('diagnostico-perfil')).toContainText('quest')
  await page.getByRole('tab', { name: 'Resultado', exact: true }).click()
  const json = JSON.parse(await page.getByTestId('diagnostico-json').inputValue())
  expect(json.sinais.navegador.modelo).toBe('Quest 3')
  expect(json.sinais.compartilharTela).toBe(true)
  expect(json.sinais.nucleos).toBe(6)
  await ctx.close()
})
